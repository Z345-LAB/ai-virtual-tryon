import { readEnv } from './env.js';

// 国内可直连的域名；国际站用 https://api.tripo3d.ai/v2/openapi（国内会被 DNS 污染）
const DEFAULT_HOST = 'https://api.tripo3d.com/v2/openapi';
const DEFAULT_DEMO_MODEL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
const DEMO_BUILD_MS = 6000;

export function getTripoConfig(env) {
  return {
    apiKey: readEnv(env, 'TRIPO_API_KEY'),
    host: String(readEnv(env, 'TRIPO_HOST', DEFAULT_HOST)).replace(/\/+$/, ''),
    modelVersion: readEnv(env, 'TRIPO_MODEL_VERSION'),
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

async function tripoRequest(cfg, path, init = {}) {
  const resp = await fetch(`${cfg.host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const data = await resp.json().catch(() => null);
  return { resp, data };
}

function pickImageType(contentType, url) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  const match = /\.(png|jpe?g|webp)(?:\?|$)/i.exec(String(url || ''));
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
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
    // 1. 取图（阿里云返回的临时链接，需要我们自己转存给 Tripo）
    const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!imgResp.ok) return degraded(`取图失败 HTTP ${imgResp.status}`);
    const buffer = await imgResp.arrayBuffer();
    if (!buffer.byteLength) return degraded('图片内容为空');

    const imageType = pickImageType(imgResp.headers.get('content-type'), imageUrl);

    // 2. 上传拿 image_token（Tripo 要求先上传，不能直接把外链丢给建任务接口）
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: `image/${imageType === 'jpg' ? 'jpeg' : imageType}` }), `input.${imageType}`);
    const upload = await tripoRequest(cfg, '/upload', { method: 'POST', body: form });
    const fileToken = upload.data?.data?.image_token || upload.data?.data?.file_token;
    if (!fileToken) {
      return degraded(upload.data?.message || `上传失败（HTTP ${upload.resp.status}）`);
    }

    // 3. 创建图生 3D 任务
    const payload = {
      type: 'image_to_model',
      file: { type: imageType, file_token: fileToken },
    };
    if (cfg.modelVersion) payload.model_version = cfg.modelVersion;

    const created = await tripoRequest(cfg, '/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const code = created.data?.code;
    if (code !== 0) {
      // 常见：2010 余额不足、2002 参数错误
      return degraded(created.data?.message || `创建任务失败（code ${code ?? created.resp.status}）`);
    }

    const taskId = created.data?.data?.task_id;
    if (!taskId) return degraded('Tripo 未返回 task_id');
    return { ok: true, taskId, demo: false, reason: null };
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return degraded(timedOut ? 'Tripo 请求超时' : `Tripo 请求失败：${err.message}`);
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
    const { resp, data } = await tripoRequest(cfg, `/task/${encodeURIComponent(id)}`);

    if (data?.code !== 0) {
      return { status: 'FAILED', message: data?.message || `查询失败（HTTP ${resp.status}）` };
    }

    const d = data.data || {};
    const status = String(d.status || '').toLowerCase();
    const output = d.output || {};

    if (status === 'success') {
      return {
        status: 'SUCCEEDED',
        progress: 100,
        // pbr_model 带贴图，优先；model 是基础模型
        modelUrl: output.pbr_model || output.model || null,
        previewUrl: output.rendered_image || null,
      };
    }
    if (status === 'queued' || status === 'running') {
      return { status: 'RUNNING', progress: Number(d.progress) || 0, message: '3D 模型生成中…' };
    }
    if (['failed', 'banned', 'expired', 'cancelled', 'unknown'].includes(status)) {
      const extra = d.error_code ? `（error_code ${d.error_code}）` : '';
      return { status: 'FAILED', message: `3D 任务${status}${extra}` };
    }
    return { status: 'RUNNING', progress: Number(d.progress) || 0, message: '3D 模型生成中…' };
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { status: 'FAILED', message: timedOut ? '查询 Tripo 超时' : `查询 Tripo 失败：${err.message}` };
  }
}
