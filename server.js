// 本地开发用的 Express 入口。
// 线上（EdgeOne Pages）走 cloud-functions/api/*，两边共用 cloud-functions/_lib 里的核心逻辑。
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOutfit, getConfig, AppError } from './cloud-functions/_lib/wan.js';
import { createTaskId, readTask, getDemoModelUrl } from './cloud-functions/_lib/three.js';

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
  res.json({
    ok: true,
    model: cfg.model,
    api_key_configured: Boolean(cfg.apiKey),
    runtime: 'local/express',
    port: PORT,
    time: new Date().toISOString(),
  });
});

/* ---------- AI 换装 ---------- */
// 第二个路径是旧版兼容，等前端缓存过期后可以删掉
app.post(['/api/tryon', '/functions/tryon'], async (req, res) => {
  const { image_base64: imageBase64, prompt } = req.body || {};
  if (!imageBase64) return res.status(400).json({ success: false, error: '缺少 image_base64' });
  if (!prompt) return res.status(400).json({ success: false, error: '缺少 prompt' });

  try {
    const result = await generateOutfit({ imageBase64, prompt });
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

/* ---------- 3D（演示实现，与线上逻辑一致） ---------- */
app.post(['/api/create3d', '/functions/create3d'], (req, res) => {
  const imageUrl = String((req.body && req.body.image_url) || '').trim();
  if (!imageUrl) return res.status(400).json({ success: false, error: '缺少 image_url' });
  res.json({
    success: true,
    task_id: createTaskId(),
    message: '3D 任务已提交（演示实现：约 6 秒后返回演示模型）',
  });
});

app.get(['/api/check3d', '/functions/check3d'], (req, res) => {
  const taskId = req.query.task_id;
  if (!taskId) return res.status(400).json({ success: false, error: '缺少 task_id' });

  const task = readTask(String(taskId));
  if (!task.ok) return res.status(404).json({ status: 'FAILED', message: task.reason });

  if (task.status === 'RUNNING') {
    return res.json({ status: 'RUNNING', message: '模型构建中…', elapsed_ms: task.elapsedMs });
  }
  return res.json({ status: 'SUCCEEDED', model_url: getDemoModelUrl(), elapsed_ms: task.elapsedMs });
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
