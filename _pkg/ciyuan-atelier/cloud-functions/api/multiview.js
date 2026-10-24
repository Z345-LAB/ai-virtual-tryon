import { json, preflight, readJson } from '../_lib/http.js';
import { createMultiviewTask, getTripoConfig } from '../_lib/three.js';
import { readEnv } from '../_lib/env.js';

export function onRequestOptions() {
  return preflight();
}

/**
 * 第 1 步：把一张 2D 图扩成 4 视图（正/侧/背）。
 * 前端拿到 task_id 后轮询 /api/check3d，成功后用同一个 task_id 调 /api/create3d。
 */
export default async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ success: false, error: '请使用 POST 请求' }, 405);

  // 可随时用环境变量关掉，前端会自动回退到单图重建
  const enabled = String(readEnv(env, 'TRIPO_MULTIVIEW', 'on')).toLowerCase() !== 'off';
  if (!enabled) {
    return json({ success: false, disabled: true, error: '多视图链路已关闭' }, 200);
  }

  const cfg = getTripoConfig(env);
  if (!cfg.apiKey) {
    return json({ success: false, disabled: true, error: '未配置 TRIPO_API_KEY' }, 200);
  }

  const body = await readJson(request);
  const imageUrl = String((body && body.image_url) || '').trim();
  if (!imageUrl) return json({ success: false, error: '缺少 image_url' }, 400);

  const result = await createMultiviewTask({ imageUrl, env });
  if (!result.ok) {
    // 多视图失败不是致命错误，前端会退回单图重建
    return json({ success: false, error: result.reason || '多视图任务创建失败' }, 200);
  }

  return json({ success: true, task_id: result.taskId });
}
