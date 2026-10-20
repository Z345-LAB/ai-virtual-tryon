/** 统一读取环境变量：优先云函数注入的 context.env，其次本地 process.env */
export function readEnv(env, key, fallback) {
  const fromContext = env && env[key] !== undefined ? env[key] : undefined;
  const value = fromContext !== undefined ? fromContext : globalThis.process?.env?.[key];
  return value === undefined || value === '' ? fallback : value;
}
