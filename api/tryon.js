// api/tryon.js
// 二次元虚拟角色换装 · 通义万相 2.7 图生图代理
// 接收：{ image_base64, prompt }  →  返回：{ success, image_url }

module.exports.config = { maxDuration: 120 }; // wan2.7-image-pro 生成需 1-2 分钟，建议留足时间

module.exports = async function handler(req, res) {
  // ---------- CORS ----------
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // ---------- 读取 Key ----------
  const API_KEY = process.env.ALIYUN_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: '未配置 ALIYUN_API_KEY' });
  }

  // ---------- 解析入参 ----------
  const { image_base64, prompt } = req.body || {};
  if (!image_base64 || !prompt) {
    return res.status(400).json({ error: '缺少 image_base64 或 prompt' });
  }

  // 校验并规范化 Base64 格式
  let finalImageBase64 = image_base64;
  if (!/^data:image\/[a-z]+;base64,/i.test(image_base64)) {
    finalImageBase64 = `data:image/jpeg;base64,${image_base64}`;
  }

  // ---------- 后台拼接 Prompt ----------
  const systemContext =
    '保持图中二次元虚拟角色的面部特征、发型、瞳色和整体画风完全不变，' +
    '仅根据以下描述更换服装。输出高质量、细节丰富的二次元插画风格。';
  const finalPrompt = `${systemContext} 换装描述：${prompt.trim()}`;

  // ---------- 构造请求（wan2.7-image-pro 专用 messages 格式）----------
  const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
  const CREATE_URL = `${BASE_URL}/services/aigc/image-generation/generation/`;

  const requestBody = {
    model: 'wan2.7-image-pro',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            // 图片在前
            { image: finalImageBase64 },
            // 文本指令在后
            { text: finalPrompt },
          ],
        },
      ],
    },
    parameters: {
      n: 1,
      size: '2K', // 图生图场景最高 2K；文生图才支持 4K
      watermark: false,
    },
  };

  try {
    // ---------- 1. 创建异步任务 ----------
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
        error: '创建换装任务失败',
        detail: createData.message || createData,
      });
    }

    const taskId = createData.output && createData.output.task_id;
    if (!taskId) {
      return res.status(500).json({
        error: '阿里云未返回 task_id',
        detail: createData,
      });
    }

    // ---------- 2. 轮询任务（建议每 5-10 秒查询一次）----------
    const POLL_INTERVAL = 8000; // 8 秒
    const MAX_ATTEMPTS = 15;    // 最多 120 秒，配合 maxDuration: 120
    const TASK_URL = `${BASE_URL}/tasks/${taskId}`;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      let pollRes;
      try {
        pollRes = await fetch(TASK_URL, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
      } catch (e) {
        continue; // 网络抖动，继续下一轮
      }
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status = pollData.output && pollData.output.task_status;

      if (status === 'SUCCEEDED') {
        // 万相 2.7 的结果通常在 output.choices[0].message.content 中
        const choices = pollData.output && pollData.output.choices;
        let imageUrl = null;

        if (choices && choices.length > 0) {
          const content = choices[0].message && choices[0].message.content;
          if (Array.isArray(content)) {
            const imagePart = content.find((part) => part.image);
            if (imagePart) imageUrl = imagePart.image;
          }
        }

        // 兜底：兼容其他可能的返回结构
        if (!imageUrl) {
          imageUrl =
            (pollData.output && pollData.output.results && pollData.output.results[0] && pollData.output.results[0].url) ||
            (pollData.output && pollData.output.image_url);
        }

        if (!imageUrl) {
          return res.status(500).json({
            error: '任务成功但未找到图片 URL',
            detail: pollData.output,
          });
        }

        return res.status(200).json({
          success: true,
          task_id: taskId,
          image_url: imageUrl, // 有效期 24 小时，前端应及时展示或转存
        });
      }

      if (status === 'FAILED') {
        return res.status(500).json({
          error: '换装任务失败',
          task_id: taskId,
          detail: pollData.output,
        });
      }
      // PENDING / RUNNING → 继续轮询
    }

    return res.status(504).json({
      error: '任务超时（已等待约 120 秒）',
      task_id: taskId,
    });
  } catch (err) {
    return res.status(500).json({
      error: '调用阿里云时发生异常',
      message: err.message,
    });
  }
};