// 本地开发用的 Express 入口。
// 线上（EdgeOne Pages）走 cloud-functions/api/*，两边共用 cloud-functions/_lib 里的核心逻辑。
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOutfit, getConfig, AppError } from './cloud-functions/_lib/wan.js';
import { createModelTask, createModelFromMultiview, createMultiviewTask, getModelTask, getTripoConfig } from './cloud-functions/_lib/three.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const app = express();

app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
// 静态产物就是 public/ 目录，与线上 EdgeOne Pages 的输出目录保持一致
app.use(express.static(path.join(ROOT, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

/* ---------- 健康检查 ---------- */
app.get('/api/health', (req, res) => {
  const cfg = getConfig();
  const tripo = getTripoConfig();
  // 与线上 cloud-functions/api/health.js 保持一致：只暴露四项，不泄露模型名与密钥长度
  res.json({
    ok: true,
    api_key_configured: Boolean(cfg.apiKey),
    tripo_key_configured: Boolean(tripo.apiKey),
    time: new Date().toISOString(),
  });
});

/* ---------- AI 换装 ---------- */
// 第二个路径是旧版兼容，等前端缓存过期后可以删掉
app.post(['/api/tryon', '/functions/tryon'], async (req, res) => {
  const { image_base64: imageBase64, prompt } = req.body || {};
  if (!imageBase64) return res.status(400).json({ success: false, error: '缺少 image_base64' });
  if (!prompt) return res.status(400).json({ success: false, error: '缺少 prompt' });
  if (typeof imageBase64 !== 'string' || imageBase64.length > 24_000_000) {
    return res.status(413).json({ success: false, error: '图片数据无效或超过大小限制' });
  }
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length > 1000) {
    return res.status(400).json({ success: false, error: '换装描述需为 1–1000 个字符' });
  }

  try {
    const result = await generateOutfit({ imageBase64, prompt: prompt.trim() });
    console.log(`[换装] 成功 ${result.elapsedMs}ms`);
    return res.json({
      success: true,
      image_url: result.imageUrl,
      request_id: result.requestId,
      elapsed_ms: result.elapsedMs,
      usage: result.usage,
    });
  } catch (err) {
    if (err instanceof AppError) {
      console.error(`[换装] 失败(${err.status}): ${err.message}`);
      return res.status(err.status).json({ success: false, error: err.message, detail: err.detail });
    }
    console.error('[换装] 异常:', err);
    return res.status(500).json({ success: false, error: `服务异常：${err.message}` });
  }
});

/* ---------- 3D（Tripo 图生 3D，失败自动降级演示模型） ---------- */
/* ---------- 多视图（第 1 步）---------- */
app.post('/api/multiview', async (req, res) => {
  const enabled = String(process.env.TRIPO_MULTIVIEW || 'on').toLowerCase() !== 'off';
  if (!enabled) return res.json({ success: false, disabled: true, error: '多视图链路已关闭' });

  const imageUrl = String((req.body && req.body.image_url) || '').trim();
  if (!imageUrl) return res.status(400).json({ success: false, error: '缺少 image_url' });

  const result = await createMultiviewTask({ imageUrl });
  console.log(`[多视图] ${result.ok ? '任务 ' + result.taskId : '失败：' + result.reason}`);
  if (!result.ok) return res.json({ success: false, error: result.reason });
  res.json({ success: true, task_id: result.taskId });
});

app.post(['/api/create3d', '/functions/create3d'], async (req, res) => {
  const imageUrl = String((req.body && req.body.image_url) || '').trim();
  const multiviewTaskId = String((req.body && req.body.multiview_task_id) || '').trim();
  if (!imageUrl && !multiviewTaskId) {
    return res.status(400).json({ success: false, error: '缺少 image_url 或 multiview_task_id' });
  }

  const result = multiviewTaskId
    ? await createModelFromMultiview({ multiviewTaskId })
    : await createModelTask({ imageUrl });
  console.log(`[3D] 任务 ${result.taskId}${result.demo ? `（降级：${result.reason}）` : ''}`);
  res.json({
    success: true,
    task_id: result.taskId,
    demo: Boolean(result.demo),
    message: result.demo
      ? `3D 服务不可用，已切换演示模型：${result.reason}`
      : '3D 任务已提交，正在进行图生 3D',
  });
});

app.get(['/api/check3d', '/functions/check3d'], async (req, res) => {
  const taskId = req.query.task_id;
  if (!taskId) return res.status(400).json({ success: false, error: '缺少 task_id' });

  const result = await getModelTask({ taskId: String(taskId) });
  res.json({
    status: result.status,
    progress: result.progress ?? null,
    model_url: result.modelUrl || null,
    preview_url: result.previewUrl || null,
    demo: Boolean(result.demo),
    message: result.message || null,
  });
});

/* ---------- 兜底 ---------- */
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `接口不存在：${req.method} /api${req.path}`,
    hint: '可用接口：GET /api/health、POST /api/tryon、POST /api/create3d、GET /api/check3d',
  });
});

app.use((req, res) => res.status(404).send('404 Not Found'));

app.listen(PORT, () => {
  const cfg = getConfig();
  console.log(`✅ 本地服务已启动: http://localhost:${PORT}`);
  console.log(`   模型: ${cfg.model} | API Key: ${cfg.apiKey ? '已配置' : '未配置（请检查 .env）'}`);
});
