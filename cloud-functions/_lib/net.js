/**
 * 统一的 JSON 请求层。
 *
 * 为什么不用全局 fetch 直连：EdgeOne 云函数的运行时没有全局 fetch（线上实测报
 * "fetch is not defined"），但 Response/Request 是有的。这里优先用 fetch，
 * 拿不到就退回 node:https，保证主流程在任何 Node 16+ 环境里都能跑。
 */

async function viaFetch(method, url, body, headers, timeoutMs) {
  const resp = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, data };
}

async function viaHttps(method, url, body, headers, timeoutMs) {
  const { default: https } = await import('node:https');

  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        },
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

    if (body) req.write(body);
    req.end();
  });
}

export async function requestJson(method, url, payload, headers = {}, timeoutMs = 30000) {
  const body = payload === undefined || payload === null ? null : JSON.stringify(payload);
  const send = typeof fetch === 'function' ? viaFetch : viaHttps;
  return send(method, url, body, headers, timeoutMs);
}

export function postJson(url, payload, headers, timeoutMs) {
  return requestJson('POST', url, payload, headers, timeoutMs);
}

export function getJson(url, headers, timeoutMs) {
  return requestJson('GET', url, null, headers, timeoutMs);
}
