import { json, preflight, readJson } from '../_lib/http.js';
import { createTaskId } from '../_lib/three.js';

export function onRequestOptions() {
  return preflight();
}

export default async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ success: false, error: '请使用 POST 请求' }, 405);

  const body = await readJson(request);
  const imageUrl = String((body && body.image_url) || '').trim();
  if (!imageUrl) return json({ success: false, error: '缺少 image_url' }, 400);

  const taskId = createTaskId();
  return json({
    success: true,
    task_id: taskId,
    message: '3D 任务已提交（演示实现：约 6 秒后返回演示模型）',
  });
}
