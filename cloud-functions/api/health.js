import { json } from '../_lib/http.js';
import { getConfig } from '../_lib/wan.js';

export default async function onRequest({ env }) {
  const cfg = getConfig(env);
  return json({
    ok: true,
    model: cfg.model,
    api_key_configured: Boolean(cfg.apiKey),
    runtime: 'edgeone-pages/cloud-functions',
    time: new Date().toISOString(),
  });
}
