require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, '..'); // 仓库根目录（index.html 在这里）

/* =========================================================
   基础配置
========================================================= */
const API_KEY = process.env.ALIYUN_API_KEY;
const DASHSCOPE_HOST = (process.env.DASHSCOPE_HOST || 'https://dashscope.aliyuncs.com').replace(/\/+$/, '');
const WAN_MODEL = process.env.WAN_MODEL || 'wan2.7-image-pro';
const DEMO_MODEL_URL = process.env.DEMO_MODEL_URL || 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

// 异步调用路径（注意：同步调用是 multimodal-generation，异步创建任务才是 image-generation）
const CREATE_URL = `${DASHSCOPE_HOST}/api/v1/services/aigc/image-generation/generation`;
const TASK_URL = (taskId) => `${DASHSCOPE_HOST}/api/v1/tasks/${taskId}`;

if (!API_KEY) {
  console.warn('⚠️ 未配置 ALIYUN_API_KEY，/functions/tryon 会直接返回错误。请在 .env 中填写后重启。');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return null;
  }
}

/* =========================================================
   中间件
========================================================= */
// 允许跨域：origin: true 会回显请求来源，file:// 页面（Origin: null）也能通
app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'] }));
// Base64 图片较大，放宽请求体限制（阿里云单图上限 20MB）
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// 静态资源：素材放 public/（先注册，避免被根路由吃掉）
app.use(express.static(path.join(ROOT, 'public')));

// 前端页面：index.html 在仓库根目录，直接访问 / 即可打开
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

/* =========================================================
   健康检查：前端用它判断"服务是否真的在线"
========================================================= */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    model: WAN_MODEL,
    api_key_configured: Boolean(API_KEY),
    port: PORT,
    time: new Date().toISOString(),
  });
});

/* =========================================================
   接口 1：AI 换装 (通义万相 2.7)
   前端请求: POST /functions/tryon
========================================================= */
app.post('/functions/tryon', async (req, res) => {
  // 用 res 的 close 判断客户端断开；req.on('close') 在 Node 16+ 会在请求体收完时立刻触发，不能用
  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;
  });

  const send = (code, payload) => {
    if (res.writableEnded) return;
    aborted = false;
    res.status(code).json(payload);
  };

  try {
    const { image_base64, prompt } = req.body || {};
    if (!image_base64 || !prompt) {
      return send(400, { success: false, error: '缺少 image_base64 或 prompt' });
    }
    if (!API_KEY) {
      return send(500, {
        success: false,
        error: '服务端未配置 ALIYUN_API_KEY，请在项目根目录 .env 中填写并重启服务',
      });
    }

    // 规范化 Base64（统一补 data URI 前缀，并校验 MIME）
    let imagePayload = String(image_base64).trim();
    if (/^data:[^,]*,/i.test(imagePayload)) {
      const mime = imagePayload.slice(5, imagePayload.indexOf(';')).toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp|bmp)$/.test(mime)) {
        return send(400, { success: false, error: `不支持的图片格式: ${mime}，请使用 JPG/PNG/WEBP` });
      }
    } else {
      imagePayload = `data:image/jpeg;base64,${imagePayload}`;
    }

    const systemContext =
      '保持图中二次元虚拟角色的面部特征、发型、瞳色和整体画风完全不变，' +
      '仅根据以下描述更换服装。输出高质量、细节丰富的二次元插画风格。';
    const finalPrompt = `${systemContext} 换装描述：${String(prompt).trim()}`;

    const requestBody = {
      model: WAN_MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ image: imagePayload }, { text: finalPrompt }],
          },
        ],
      },
      parameters: {
        n: 1,
        size: '2K', // 有图片输入时最高只支持 2K，4K 仅文生图可用
        watermark: false,
      },
    };

    console.log(`[换装] 提交任务 model=${WAN_MODEL}`);
    const createRes = await fetch(CREATE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    const createData = await safeJson(createRes);
    if (!createRes.ok) {
      const detailMsg = (createData && (createData.message || createData.code)) || `HTTP ${createRes.status}`;
      console.error('[换装] 创建任务失败:', detailMsg);
      return send(createRes.status, {
        success: false,
        error: `创建换装任务失败：${detailMsg}`,
        detail: createData,
      });
    }

    const taskId = createData && createData.output && createData.output.task_id;
    if (!taskId) {
      return send(502, { success: false, error: '阿里云未返回 task_id', detail: createData });
    }
    console.log(`[换装] task_id=${taskId}`);

    const POLL_INTERVAL = 3000;
    const MAX_ATTEMPTS = 50; // 约 150 秒；前端超时设为 180 秒，保证后端先给出明确结论

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (aborted) {
        console.log(`[换装] 客户端已断开，停止轮询: ${taskId}`);
        return;
      }
      await sleep(POLL_INTERVAL);

      let pollRes;
      try {
        pollRes = await fetch(TASK_URL(taskId), {
          headers: { Authorization: `Bearer ${API_KEY}` },
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        console.warn(`[换装] 轮询网络异常（第 ${i + 1} 次）: ${e.message}`);
        continue;
      }
      if (!pollRes.ok) {
        const errData = await safeJson(pollRes);
        console.warn(`[换装] 轮询 HTTP ${pollRes.status}`, errData && errData.message);
        continue;
      }

      const pollData = await safeJson(pollRes);
      const output = (pollData && pollData.output) || {};
      const status = output.task_status;

      if (status === 'SUCCEEDED') {
        let imageUrl = null;

        // 万相 2.7 返回格式：output.choices[0].message.content[].image
        if (Array.isArray(output.choices) && output.choices.length) {
          const content = output.choices[0].message && output.choices[0].message.content;
          if (Array.isArray(content)) {
            const imagePart = content.find((part) => part && part.image);
            if (imagePart) imageUrl = imagePart.image;
          }
        }
        // 兜底：老格式 output.results[0].url
        if (!imageUrl && Array.isArray(output.results) && output.results[0]) {
          imageUrl = output.results[0].url;
        }

        if (!imageUrl) {
          return send(502, { success: false, error: '任务成功但未解析到图片 URL', detail: output });
        }

        console.log(`[换装] 成功: ${taskId}`);
        return send(200, { success: true, task_id: taskId, image_url: imageUrl });
      }

      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        const reason = output.message || output.code || status;
        return send(502, {
          success: false,
          error: `换装任务失败（${status}）：${reason}`,
          task_id: taskId,
          detail: output,
        });
      }
      // PENDING / RUNNING 继续轮询
    }

    return send(504, {
      success: false,
      error: '换装任务超时（约 150 秒），请稍后重试',
      task_id: taskId,
    });
  } catch (err) {
    console.error('[tryon] error:', err);
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return send(isTimeout ? 504 : 500, {
      success: false,
      error: isTimeout ? '请求阿里云超时，请重试' : `服务器异常：${err.message}`,
    });
  }
});

/* =========================================================
   接口 2：3D 生成（当前为可复现的模拟实现）
   前端请求: POST /functions/create3d
========================================================= */
const threeDJobs = new Map();

app.post('/functions/create3d', (req, res) => {
  const { image_url } = req.body || {};
  if (!image_url) return res.status(400).json({ success: false, error: '缺少 image_url' });

  const taskId = `task_3d_${Date.now().toString(36)}`;
  threeDJobs.set(taskId, { createdAt: Date.now(), imageUrl: image_url });
  console.log(`[3D] 创建任务: ${taskId}`);

  res.json({
    success: true,
    task_id: taskId,
    message: '3D 任务已提交（演示实现：约 6 秒后返回演示模型）',
  });
});

/* =========================================================
   接口 3：查询 3D 状态（当前为可复现的模拟实现）
   前端请求: GET /functions/check3d?task_id=xxx
========================================================= */
app.get('/functions/check3d', (req, res) => {
  const { task_id } = req.query;
  if (!task_id) return res.status(400).json({ success: false, error: '缺少 task_id' });

  const job = threeDJobs.get(task_id);
  if (!job) {
    return res.status(404).json({ status: 'FAILED', message: '任务不存在或已过期，请重新生成' });
  }

  if (Date.now() - job.createdAt < 6000) {
    return res.json({ status: 'RUNNING', message: '模型构建中…' });
  }

  // TODO: 接入 Tripo3D / Meshy 后，这里改成读取真实任务状态与模型 URL
  return res.json({ status: 'SUCCEEDED', model_url: DEMO_MODEL_URL });
});

/* =========================================================
   兜底
========================================================= */
app.use('/functions', (req, res) => {
  res.status(404).json({
    success: false,
    error: `接口不存在: ${req.method} /functions${req.path}`,
    hint: '可用接口：POST /functions/tryon、POST /functions/create3d、GET /functions/check3d、GET /api/health',
  });
});

app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

// 启动服务
app.listen(PORT, () => {
  console.log(`✅ 服务已启动: http://localhost:${PORT}`);
  console.log(`   模型: ${WAN_MODEL} | API Key: ${API_KEY ? '已配置' : '未配置'}`);
});
