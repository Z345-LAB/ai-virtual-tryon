// 3D 部分当前是演示实现：任务状态完全由 task_id 里的时间戳推导，
// 不依赖内存状态，因此可以跑在无状态、分布式的云函数上。
// 接入 Tripo3D / Meshy 时，把 createTaskId / readTask 换成真实的任务创建与查询即可。

const BUILD_MS = 6000;
const DEFAULT_DEMO_MODEL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

export function getDemoModelUrl(env) {
  const fromContext = env && env.DEMO_MODEL_URL;
  const value = fromContext || globalThis.process?.env?.DEMO_MODEL_URL;
  return value || DEFAULT_DEMO_MODEL;
}

export function createTaskId(now = Date.now()) {
  return `t3d_${now.toString(36)}`;
}

/**
 * 解析任务状态
 * @returns {{ok: true, status: 'RUNNING'|'SUCCEEDED', elapsedMs: number, startedAt: number} | {ok: false, reason: string}}
 */
export function readTask(taskId, now = Date.now()) {
  const match = /^t3d_([0-9a-z]{1,12})$/i.exec(String(taskId || '').trim());
  if (!match) return { ok: false, reason: '任务 ID 格式不正确' };

  const startedAt = parseInt(match[1], 36);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return { ok: false, reason: '任务 ID 无法解析' };
  // 明显异常的时间戳（超过 10 分钟的未来）直接判为无效
  if (startedAt > now + 10 * 60 * 1000) return { ok: false, reason: '任务 ID 时间戳异常' };

  const elapsedMs = Math.max(0, now - startedAt);
  return {
    ok: true,
    status: elapsedMs >= BUILD_MS ? 'SUCCEEDED' : 'RUNNING',
    elapsedMs,
    startedAt,
  };
}

export { BUILD_MS };
