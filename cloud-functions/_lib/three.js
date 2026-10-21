import { readEnv } from './env.js';
import { postJson, getJson } from './net.js';

// Tripo v3 接口（国内站）。国际站是 https://openapi.tripo3d.ai/v3，国内被 DNS 污染。
// v3 的图片作为公网 URL 直接传入，不需要先上传拿 token。
const DEFAULT_HOST = 'https://openapi.tripo3d.com/v3';
const DEFAULT_MODEL = 'v3.1-20260211';
const DEFAULT_DEMO_MODEL = '/models/robot.glb';
// 演示任务直接命中前端第一次轮询（间隔 3 秒），一键演示时不用干等
const DEMO_BUILD_MS = 2000;

export function getTripoConfig(env) {
  const faceLimit = Number(readEnv(env, 'TRIPO_FACE_LIMIT', '0'));
  return {
    apiKey: readEnv(env, 'TRIPO_API_KEY'),
    host: String(readEnv(env, 'TRIPO_HOST', DEFAULT_HOST)).replace(/\/+$/, ''),
    model: readEnv(env, 'TRIPO_MODEL_VERSION', DEFAULT_MODEL),
    faceLimit: Number.isFinite(faceLimit) && faceLimit > 0 ? faceLimit : null,
    textureQuality: readEnv(env, 'TRIPO_TEXTURE_QUALITY'), // standard / detailed
    smartLowPoly: String(readEnv(env, 'TRIPO_SMART_LOW_POLY', '')).toLowerCase() === 'true',
    timeoutMs: Number(readEnv(env, 'TRIPO_TIMEOUT_MS', '25000')),
  };
}

export function getDemoModelUrl(env) {
  return readEnv(env, 'DEMO_MODEL_URL', DEFAULT_DEMO_MODEL);
}

/** 演示任务：没有 Key、或 Tripo 调用失败时使用，保证界面永远有东西可看 */
export function createDemoTaskId(now = Date.now()) {
  return `t3d_${now.toString(36)}`;
}

export function isDemoTask(taskId) {
  return /^t3d_[0-9a-z]+$/i.test(String(taskId || '').trim());
}

function readDemoTask(taskId, now = Date.now()) {
  const startedAt = parseInt(String(taskId).slice(4), 36);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  if (startedAt > now + 10 * 60 * 1000) return null;
  const elapsedMs = Math.max(0, now - startedAt);
  return {
    status: elapsedMs >= DEMO_BUILD_MS ? 'SUCCEEDED' : 'RUNNING',
    progress: Math.min(99, Math.round((elapsedMs / DEMO_BUILD_MS) * 100)),
    elapsedMs,
  };
}

/** 查一次 API 账户余额（不计费），用于把失败原因说清楚 */
export async function getBalance(env) {
  const cfg = getTripoConfig(env);
  if (!cfg.apiKey) return null;
  try {
    const { data } = await getJson(`${cfg.host}/account/balance`, { Authorization: `Bearer ${cfg.apiKey}` }, 8000);
    return data && data.code === 0 ? Number(data?.data?.balance) : null;
  } catch (_) {
    return null;
  }
}

/**
 * 用一张图创建 3D 任务。
 * 返回 { ok, taskId, demo, reason }：失败不抛错，降级成演示任务，保证前端流程不中断。
 */
export async function createModelTask({ imageUrl, env }) {
  const cfg = getTripoConfig(env);
  const degraded = (reason) => ({ ok: true, taskId: createDemoTaskId(), demo: true, reason });

  if (!cfg.apiKey) return degraded('未配置 TRIPO_API_KEY');
  if (!imageUrl) return degraded('缺少图片地址');

  try {
    // 只传确定合法的参数：model 必填；其余按需附加，避免服务端报 1004
    const payload = { input: imageUrl, model: cfg.model };
    if (cfg.faceLimit) payload.face_limit = cfg.faceLimit;
    if (cfg.textureQuality) payload.texture_quality = cfg.textureQuality;
    if (cfg.smartLowPoly) payload.smart_low_poly = true;

    const resp = await postJson(
      `${cfg.host}/generation/image-to-model`,
      payload,
      { Authorization: `Bearer ${cfg.apiKey}` },
      cfg.timeoutMs,
    );

    const code = resp.data?.code;
    if (code !== 0) {
      const raw = resp.data?.message || `创建任务失败（HTTP ${resp.status}）`;
      if (code === 2010) {
        const balance = await getBalance(env);
        const tip = balance === null ? '' : `（当前余额 ${balance}）`;
        return degraded(`Tripo API 额度不足${tip}，需要在 API 计费页单独充值，与 Studio 订阅不通用`);
      }
      return degraded(raw);
    }

    const taskId = resp.data?.data?.task_id;
    if (!taskId) return degraded('Tripo 未返回 task_id');
    return { ok: true, taskId, demo: false, reason: null };
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    const cause = err.cause && (err.cause.code || err.cause.message);
    const suffix = cause ? `（${cause}）` : '';
    return degraded(timedOut ? 'Tripo 请求超时' : `Tripo 请求失败：${err.message}${suffix}`);
  }
}

/**
 * 查询 3D 任务。
 * 返回统一状态：RUNNING / SUCCEEDED / FAILED，附带 progress / modelUrl / previewUrl。
 */
export async function getModelTask({ taskId, env }) {
  const id = String(taskId || '').trim();
  if (!id) return { status: 'FAILED', message: '缺少 task_id' };

  if (isDemoTask(id)) {
    const demo = readDemoTask(id);
    if (!demo) return { status: 'FAILED', message: '任务 ID 无法解析' };
    if (demo.status === 'RUNNING') {
      return { status: 'RUNNING', progress: demo.progress, demo: true, message: '演示模型构建中…' };
    }
    return { status: 'SUCCEEDED', progress: 100, modelUrl: getDemoModelUrl(env), demo: true };
  }

  const cfg = getTripoConfig(env);
  if (!cfg.apiKey) return { status: 'FAILED', message: '未配置 TRIPO_API_KEY' };

  try {
    const { status: httpStatus, data } = await getJson(
      `${cfg.host}/tasks/${encodeURIComponent(id)}`,
      { Authorization: `Bearer ${cfg.apiKey}` },
      cfg.timeoutMs,
    );

    if (data?.code !== 0) {
      return { status: 'FAILED', message: data?.message || `查询失败（HTTP ${httpStatus}）` };
    }

    const d = data.data || {};
    const status = String(d.status || '').toLowerCase();
    const output = d.output || {};

    if (status === 'success') {
      return {
        status: 'SUCCEEDED',
        progress: 100,
        // v3 输出用 model_url；pbr_model / model 兼容旧命名
        modelUrl: output.model_url || output.pbr_model || output.model || null,
        previewUrl: output.rendered_image || output.preview_url || null,
      };
    }
    if (['failed', 'cancelled', 'expired', 'banned'].includes(status)) {
      const reason = d.error_message || d.error || d.message || status;
      return { status: 'FAILED', message: `3D 任务失败：${reason}` };
    }
    // queued / running
    return { status: 'RUNNING', progress: Number(d.progress) || 0, message: '3D 模型生成中…' };
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { status: 'FAILED', message: timedOut ? '查询 Tripo 超时' : `查询 Tripo 失败：${err.message}` };
  }
}
