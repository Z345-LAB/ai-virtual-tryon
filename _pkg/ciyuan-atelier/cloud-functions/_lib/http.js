const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

/** 返回 JSON 响应（Web 标准 Response，EdgeOne 云函数直接使用） */
export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** OPTIONS 预检 */
export function preflight() {
  return new Response(null, { status: 204, headers: BASE_HEADERS });
}

/** 安全读取 JSON 请求体，失败返回 null */
export async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}
