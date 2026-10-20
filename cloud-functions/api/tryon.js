import { json, preflight, readJson } from '../_lib/http.js';
import { generateOutfit, AppError } from '../_lib/wan.js';

export function onRequestOptions() {
  return preflight();
}

export default async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ success: false, error: '请使用 POST 请求' }, 405);

  const body = await readJson(request);
  if (!body) return json({ success: false, error: '请求体不是合法 JSON' }, 400);
  if (!body.image_base64) return json({ success: false, error: '缺少 image_base64' }, 400);
  if (!body.prompt) return json({ success: false, error: '缺少 prompt' }, 400);

  try {
    const result = await generateOutfit({ imageBase64: body.image_base64, prompt: body.prompt, env });
    return json({
      success: true,
      image_url: result.imageUrl,
      request_id: result.requestId,
      elapsed_ms: result.elapsedMs,
      usage: result.usage,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return json({ success: false, error: err.message, detail: err.detail }, err.status);
    }
    return json({ success: false, error: `服务异常：${err.message}` }, 500);
  }
}
