import { json } from '../_lib/http.js';
import { getConfig } from '../_lib/wan.js';
import { getTripoConfig } from '../_lib/three.js';

export default async function onRequest({ env }) {
  const cfg = getConfig(env);
  const tripo = getTripoConfig(env);

  // 公开健康检查只暴露前端必需状态，不返回模型、服务商地址、密钥长度或运行时细节。
  return json({
    ok: true,
    api_key_configured: Boolean(cfg.apiKey),
    tripo_key_configured: Boolean(tripo.apiKey),
    time: new Date().toISOString(),
  });
}
