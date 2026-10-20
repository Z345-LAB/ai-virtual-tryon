import { json, preflight } from '../_lib/http.js';
import { readTask, getDemoModelUrl } from '../_lib/three.js';

export function onRequestOptions() {
  return preflight();
}

export default async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const taskId = new URL(request.url).searchParams.get('task_id');
  if (!taskId) return json({ success: false, error: '缺少 task_id' }, 400);

  const task = readTask(taskId);
  if (!task.ok) return json({ status: 'FAILED', message: task.reason }, 404);

  if (task.status === 'RUNNING') {
    return json({ status: 'RUNNING', message: '模型构建中…', elapsed_ms: task.elapsedMs });
  }

  return json({
    status: 'SUCCEEDED',
    model_url: getDemoModelUrl(env),
    elapsed_ms: task.elapsedMs,
  });
}
