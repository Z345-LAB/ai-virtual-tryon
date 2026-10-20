require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 允许跨域，并调大请求体限制（Base64 图片较大）
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// 托管前端静态文件（把 index.html 放到 public 目录下）
app.use(express.static(path.join(__dirname, 'public')));

// 获取阿里云 API Key
const API_KEY = process.env.ALIYUN_API_KEY;
if (!API_KEY) {
  console.warn('⚠️ 警告: 未配置 ALIYUN_API_KEY 环境变量，换装功能将不可用。');
}

/* =========================================================
   接口 1：AI 换装 (通义万相 2.7)
   前端请求: POST /functions/tryon
========================================================= */
app.post('/functions/tryon', async (req, res) => {
  try {
    const { image_base64, prompt } = req.body || {};
    if (!image_base64 || !prompt) {
      return res.status(400).json({ success: false, error: '缺少 image_base64 或 prompt' });
    }

    // 校验并规范化 Base64 格式
    let finalImageBase64 = image_base64;
    if (!/^data:image\/(jpeg|png|webp|jpg);base64,/i.test(image_base64)) {
      finalImageBase64 = `data:image/jpeg;base64,${image_base64}`;
    }

    const systemContext =
      '保持图中二次元虚拟角色的面部特征、发型、瞳色和整体画风完全不变，' +
      '仅根据以下描述更换服装。输出高质量、细节丰富的二次元插画风格。';
    const finalPrompt = `${systemContext} 换装描述：${prompt.trim()}`;

    const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
    const CREATE_URL = `${BASE_URL}/services/aigc/image-generation/generation/`;

    const requestBody = {
      model: 'wan2.7-image-pro',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: finalImageBase64 },
              { text: finalPrompt },
            ],
          },
        ],
      },
      parameters: {
        n: 1,
        size: '2K',
        watermark: false,
      },
    };

    console.log(`[换装] 提交阿里云任务...`);
    const createRes = await fetch(CREATE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      return res.status(createRes.status).json({
        success: false,
        error: '创建换装任务失败',
        detail: createData.message || createData,
      });
    }

    const taskId = createData.output && createData.output.task_id;
    if (!taskId) {
      return res.status(500).json({ success: false, error: '阿里云未返回 task_id', detail: createData });
    }

    // 轮询任务
    const POLL_INTERVAL = 5000; // 5秒查一次
    const MAX_ATTEMPTS = 24;    // 最多等待 120 秒
    const TASK_URL = `${BASE_URL}/tasks/${taskId}`;

    // 监听客户端断开连接，如果前端关了页面，就停止轮询节省服务器资源
    let isClientConnected = true;
    req.on('close', () => {
      isClientConnected = false;
      console.log(`[换装] 客户端已断开，停止轮询任务: ${taskId}`);
    });

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (!isClientConnected) return; // 客户端断开，直接终止
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      let pollRes;
      try {
        pollRes = await fetch(TASK_URL, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
      } catch (e) {
        continue; // 网络波动，跳过
      }
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status = pollData.output && pollData.output.task_status;

      if (status === 'SUCCEEDED') {
        const output = pollData.output || {};
        let imageUrl = null;

        // 解析万相 2.7 的返回格式
        if (output.choices && output.choices.length > 0) {
          const content = output.choices[0].message && output.choices[0].message.content;
          if (Array.isArray(content)) {
            const imagePart = content.find((part) => part.image);
            if (imagePart) imageUrl = imagePart.image;
          }
        }

        // 兜底解析老格式
        if (!imageUrl && output.results && output.results[0]) {
          imageUrl = output.results[0].url;
        }

        if (!imageUrl) {
          return res.status(500).json({ success: false, error: '任务成功但未找到图片 URL', detail: output });
        }

        console.log(`[换装] 任务成功: ${taskId}`);
        return res.status(200).json({
          success: true,
          task_id: taskId,
          image_url: imageUrl,
        });
      }

      if (status === 'FAILED') {
        return res.status(500).json({
          success: false,
          error: '换装任务在阿里云端执行失败',
          task_id: taskId,
          detail: pollData.output,
        });
      }
      // PENDING / RUNNING 继续循环
    }

    return res.status(504).json({ success: false, error: '换装任务超时', task_id: taskId });

  } catch (err) {
    console.error('[tryon] error:', err);
    res.status(500).json({ success: false, error: '服务器异常', message: err.message });
  }
});


/* =========================================================
   接口 2：3D 生成（预留/模拟）
   前端请求: POST /functions/create3d
========================================================= */
app.post('/functions/create3d', (req, res) => {
  const { image_url } = req.body || {};
  if (!image_url) return res.status(400).json({ success: false, error: '缺少 image_url' });

  // 模拟返回 task_id（未来可接入 Tripo3D 或 Meshy）
  const taskId = 'task_3d_' + Date.now();
  console.log(`[3D] 创建任务: ${taskId}`);
  
  res.json({
    success: true,
    task_id: taskId,
    message: '3D 任务已提交',
  });
});


/* =========================================================
   接口 3：查询 3D 状态（预留/模拟）
   前端请求: GET /functions/check3d
========================================================= */
app.get('/functions/check3d', (req, res) => {
  const { task_id } = req.query;
  if (!task_id) return res.status(400).json({ success: false, error: '缺少 task_id' });

  // 为了让前端演示通过，每次请求有 30% 概率返回成功
  const isSuccess = Math.random() > 0.7;

  if (isSuccess) {
    res.json({
      status: 'SUCCEEDED',
      model_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
    });
  } else {
    res.json({
      status: 'RUNNING',
      message: '模型构建中...',
    });
  }
});

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ 服务器已启动，监听端口: ${PORT}`);
});