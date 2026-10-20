import { readEnv } from './env.js';
import { postJson } from './net.js';

const DEFAULT_HOST = 'https://dashscope.aliyuncs.com';
// 同步调用路径（异步创建任务用的是 image-generation，两者不要混）
const SYNC_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

const SYSTEM_CONTEXT =
  '保持图中二次元虚拟角色的面部特征、发型、瞳色和整体画风完全不变，' +
  '仅根据以下描述更换服装。输出高质量、细节丰富的二次元插画风格。';

const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp|bmp)$/i;

export class AppError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.detail = detail;
  }
}

export function getConfig(env) {
  return {
    apiKey: readEnv(env, 'ALIYUN_API_KEY'),
    host: String(readEnv(env, 'DASHSCOPE_HOST', DEFAULT_HOST)).replace(/\/+$/, ''),
    model: readEnv(env, 'WAN_MODEL', 'wan2.7-image-pro'),
    size: readEnv(env, 'WAN_SIZE', '2K'),
    timeoutMs: Number(readEnv(env, 'WAN_TIMEOUT_MS', '55000')),
  };
}

/** 统一成 data URI，并校验 MIME（万相不接受带透明通道的 PNG） */
export function normalizeImage(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new AppError(400, '缺少图片数据');
  if (/^data:[^,]*,/i.test(raw)) {
    const mime = raw.slice(5, raw.indexOf(';')).toLowerCase();
    if (!ALLOWED_MIME.test(mime)) {
      throw new AppError(400, `不支持的图片格式：${mime}，请使用 JPG / PNG / WEBP`);
    }
    return raw;
  }
  return `data:image/jpeg;base64,${raw}`;
}

/**
 * 调用通义万相做换装，同步返回结果图地址。
 * 同步接口一次请求拿到图，耗时通常 10–20 秒，适合跑在云函数里（免去轮询）。
 */
export async function generateOutfit({ imageBase64, prompt, env }) {
  const cfg = getConfig(env);
  if (!cfg.apiKey) {
    throw new AppError(500, '服务端未配置 ALIYUN_API_KEY，请在环境变量里填写后重新部署');
  }

  const text = String(prompt || '').trim();
  if (!text) throw new AppError(400, '缺少换装描述');

  const payload = {
    model: cfg.model,
    input: {
      messages: [
        {
          role: 'user',
          content: [{ image: normalizeImage(imageBase64) }, { text: `${SYSTEM_CONTEXT} 换装描述：${text}` }],
        },
      ],
    },
    parameters: { n: 1, size: cfg.size, watermark: false },
  };

  const startedAt = Date.now();
  let resp;
  try {
    resp = await postJson(
      `${cfg.host}${SYNC_PATH}`,
      payload,
      { Authorization: `Bearer ${cfg.apiKey}` },
      cfg.timeoutMs,
    );
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    // 把底层原因带出来：fetch failed 单独看没有信息量，真正的原因在 err.cause.code
    const cause = err.cause && (err.cause.code || err.cause.message);
    const suffix = cause ? `（${cause}）` : '';
    throw new AppError(
      timedOut ? 504 : 502,
      timedOut ? '通义万相响应超时，请重试' : `调用通义万相失败：${err.message}${suffix}`,
    );
  }

  const data = resp.data;

  if (!resp.ok) {
    const msg = (data && (data.message || data.code)) || `HTTP ${resp.status}`;
    const status = resp.status === 401 ? 502 : 502;
    const hint = resp.status === 401 ? 'API Key 无效或已过期' : '通义万相返回错误';
    throw new AppError(status, `${hint}：${msg}`, data);
  }

  const content = data?.output?.choices?.[0]?.message?.content;
  const imageUrl = Array.isArray(content) ? content.find((part) => part && part.image)?.image : null;

  if (!imageUrl) throw new AppError(502, '通义万相未返回图片地址', data);

  return {
    imageUrl,
    requestId: data?.request_id || null,
    elapsedMs: Date.now() - startedAt,
    usage: data?.usage || null,
  };
}
