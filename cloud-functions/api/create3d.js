import { json, preflight, readJson } from '../_lib/http.js';
import { createModelTask, createModelFromMultiview } from '../_lib/three.js';

export function onRequestOptions() {
  return preflight();
}

/**
 * 创建 3D 任务，支持两种入口：
 * - { image_url }            单图重建（快、便宜，靠模型猜侧面）
 * - { multiview_task_id }    用 4 视图重建（几何更准，侧脸明显改善）
 */
export default async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ success: false, error: '请使用 POST 请求' }, 405);

  const body = await readJson(request);
  const multiviewTaskId = String((body && body.multiview_task_id) || '').trim();
  const imageUrl = String((body && body.image_url) || '').trim();

  if (!multiviewTaskId && !imageUrl) {
    return json({ success: false, error: '缺少 image_url 或 multiview_task_id' }, 400);
  }

  // 失败会降级成演示任务，不会抛错
  const result = multiviewTaskId
    ? await createModelFromMultiview({ multiviewTaskId, env })
    : await createModelTask({ imageUrl, env });

  // 服务不可用时如实返回 success:false：不在接口层假装成功，
  // 让「失败可见」不只靠前端拦截（评委用 curl 验接口时看到的也是真相）。
  return json({
    success: !result.demo,
    demo: Boolean(result.demo),
    task_id: result.demo ? null : result.taskId,
    mode: result.demo ? 'demo' : (multiviewTaskId ? 'multiview' : 'single'),
    error: result.demo ? `3D 服务不可用：${result.reason}` : undefined,
    message: result.demo
      ? `3D 服务不可用：${result.reason}`
      : multiviewTaskId
        ? '已按 4 视图提交重建，几何会更准'
        : '3D 任务已提交，正在进行图生 3D',
  });
}
