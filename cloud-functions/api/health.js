import { json } from '../_lib/http.js';
import { getConfig } from '../_lib/wan.js';

export default async function onRequest({ env }) {
  const cfg = getConfig(env);
  return json({
    ok: true,
    model: cfg.model,
    api_key_configured: Boolean(cfg.apiKey),
    api_key_length: cfg.apiKey ? String(cfg.apiKey).length : 0,
    dashscope_host: cfg.host,
    runtime: 'edgeone-pages/cloud-functions',
    // 运行时自检：Node 16 及以下没有全局 fetch，会表现为「调用通义万相失败：fetch is not defined」
    node: globalThis.process?.version || 'unknown',
    has_fetch: typeof fetch === 'function',
    has_abort_signal_timeout: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function',
    has_form_data: typeof FormData === 'function',
    time: new Date().toISOString(),
  });
}
