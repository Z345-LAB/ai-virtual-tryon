/**
 * 统一的 JSON POST 请求。
 *
 * 为什么不用全局 fetch 直连：EdgeOne 云函数的运行时如果被裁剪成低版本 Node，
 * 全局 fetch 不存在，会直接抛 "fetch is not defined"。这里优先用 fetch，
 * 拿不到就退回 node:https，保证主流程在任何 Node 16+ 环境里都能跑。
 */
export async function postJson(url, payload, headers = {}, timeoutMs = 30000) {
  const body = JSON.stringify(payload);
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };

  if (typeof fetch === 'function') {
    const resp = await fetch(url, {
      method: 'POST',
      headers: finalHeaders,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
  }

  const { default: https } = await import('node:https');

  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: { ...finalHeaders, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          clearTimeout(timer);
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch (_) {
            data = null;
          }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
        });
      },
    );

    const timer = setTimeout(() => {
      const err = new Error(`请求超时（${timeoutMs}ms）`);
      err.name = 'TimeoutError';
      req.destroy(err);
    }, timeoutMs);

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}
