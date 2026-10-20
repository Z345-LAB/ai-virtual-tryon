import { json, preflight } from '../_lib/http.js';
import { getModelTask } from '../_lib/three.js';

export function onRequestOptions() {
  return preflight();
}

export default async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const taskId = new URL(request.url).searchParams.get('task_id');
  if (!taskId) return json({ success: false, error: '缺少 task_id' }, 400);

  const result = await getModelTask({ taskId, env });

  // 任务级失败也返回 200，让前端能立刻拿到原因，而不是一直轮询到超时
  return json({
    status: result.status,
    progress: result.progress ?? null,
    model_url: result.modelUrl || null,
    preview_url: result.previewUrl || null,
    demo: Boolean(result.demo),
    message: result.message || null,
  });
}
