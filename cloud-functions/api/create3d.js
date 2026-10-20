import { json, preflight, readJson } from '../_lib/http.js';
import { createModelTask } from '../_lib/three.js';

export function onRequestOptions() {
  return preflight();
}

export default async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ success: false, error: '请使用 POST 请求' }, 405);

  const body = await readJson(request);
  const imageUrl = String((body && body.image_url) || '').trim();
  if (!imageUrl) return json({ success: false, error: '缺少 image_url' }, 400);

  // 失败会降级成演示任务，不会抛错
  const result = await createModelTask({ imageUrl, env });

  return json({
    success: true,
    task_id: result.taskId,
    demo: Boolean(result.demo),
    message: result.demo
      ? `3D 服务不可用，已切换演示模型：${result.reason}`
      : '3D 任务已提交，正在进行图生 3D',
  });
}
