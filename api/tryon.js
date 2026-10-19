// api/tryon.js
// Vercel Serverless Function：AI 试衣代理
// 职责：接收两张图片的公网 URL → 调用阿里云 AI 试衣 → 轮询 → 返回最终图片 URL

export default async function handler(req, res) {
  // ========== 1. CORS 跨域头 ==========
  // 允许你的前端域名调用这个接口。生产环境建议把 * 换成你的实际域名，
  // 例如：https://your-app.vercel.app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ========== 2. 处理浏览器预检请求 ==========
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // ========== 3. 读取服务器环境变量中的 Key ==========
  const API_KEY = process.env.ALIYUN_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({
      error: '服务器未配置 ALIYUN_API_KEY，请在 Vercel 环境变量中设置。',
    });
  }

  // ========== 4. 解析前端传来的图片 URL ==========
  // 前端应发送 JSON：
  // {
  //   "person_image_url": "https://.../model.jpg",
  //   "garment_image_url": "https://.../clothes.jpg",
  //   "garment_type": "top"   // 可选：top | bottom | dress，默认 top
  // }
  const {
    person_image_url,
    garment_image_url,
    garment_type = 'top', // 默认上装；连衣裙也使用 top_garment_url 字段
  } = req.body || {};

  if (!person_image_url || !garment_image_url) {
    return res.status(400).json({
      error: '缺少 person_image_url 或 garment_image_url。' +
        '请注意：阿里云接口需要的是公网可访问的图片链接，不是本地文件。',
    });
  }

  // 简单校验是否为 http/https
  if (
    !/^https?:\/\//i.test(person_image_url) ||
    !/^https?:\/\//i.test(garment_image_url)
  ) {
    return res.status(400).json({
      error: '图片地址必须是公网可访问的 HTTP/HTTPS 链接。',
    });
  }

  // ========== 5. 构造阿里云请求体 ==========
  const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
  const CREATE_TASK_URL = `${BASE_URL}/services/aigc/image2image/image-synthesis/`;

  // 根据 garment_type 选择字段
  const input = {
    person_image_url,
  };

  if (garment_type === 'bottom') {
    input.bottom_garment_url = garment_image_url;
  } else {
    // top 和 dress 都使用 top_garment_url 字段
    // 连衣裙/连体衣时，bottom_garment_url 留空即可[reference:0]
    input.top_garment_url = garment_image_url;
  }

  const requestBody = {
    // 使用 aitryon-plus 效果更好（清晰度、纹理、Logo 还原更优），
    // 如果追求速度可以改成 'aitryon'
    model: 'aitryon-plus',
    input,
    parameters: {
      // -1 表示输出尺寸与原图一致；如果后续还要调用“图片精修”，必须用 -1
      resolution: -1,
      // 保留模特原图人脸，生成随机人脸可改为 false
      restore_face: true,
    },
  };

  try {
    // ========== 6. 第一步：创建异步任务 ==========
    const createRes = await fetch(CREATE_TASK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        // 告诉阿里云这是异步调用
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      return res.status(createRes.status).json({
        error: '创建试衣任务失败',
        detail: createData.message || createData,
      });
    }

    const taskId = createData.output?.task_id;
    if (!taskId) {
      return res.status(500).json({
        error: '阿里云未返回 task_id',
        detail: createData,
      });
    }

    // ========== 7. 第二步：轮询任务状态 ==========
    // AI 试衣通常需要 15～30 秒，建议每 3 秒查询一次[reference:1]
    const POLL_INTERVAL = 3000;
    const MAX_ATTEMPTS = 20; // 最多约 60 秒
    const TASK_URL = `${BASE_URL}/tasks/${taskId}`;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // 等待一段时间再查询
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      const pollRes = await fetch(TASK_URL, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      });

      // 查询接口偶发网络抖动，不立即失败，继续下一轮
      if (!pollRes.ok) {
        continue;
      }

      const pollData = await pollRes.json();
      const status = pollData.output?.task_status;

      // 成功：提取图片链接并返回
      if (status === 'SUCCEEDED') {
        // 基础版和 Plus 版的返回字段略有不同，兼容两种：
        // output.image_url 或 output.results.image_url
        const imageUrl =
          pollData.output?.image_url ||
          pollData.output?.results?.image_url;

        if (!imageUrl) {
          return res.status(500).json({
            error: '任务成功但未找到 image_url',
            detail: pollData.output,
          });
        }

        // 把最终图片链接交还给网页
        return res.status(200).json({
          success: true,
          task_id: taskId,
          image_url: imageUrl,
          // 提醒前端：链接有效期 24 小时，建议及时保存或转存[reference:2]
          expires_in: '24h',
        });
      }

      // 明确失败：直接返回错误
      if (status === 'FAILED') {
        return res.status(500).json({
          error: '试衣任务失败',
          task_id: taskId,
          detail: pollData.output,
        });
      }

      // PENDING / RUNNING / PRE-PROCESSING / POST-PROCESSING
      // 继续下一轮轮询
    }

    // ========== 8. 轮询超时 ==========
    return res.status(504).json({
      error: '试衣任务超时（已等待约 60 秒）',
      task_id: taskId,
      suggestion: '任务可能仍在处理中，可以稍后用 task_id 继续查询，或重试。',
    });
  } catch (err) {
    // 网络异常、JSON 解析失败等
    return res.status(500).json({
      error: '调用阿里云接口时发生异常',
      message: err.message,
    });
  }
}