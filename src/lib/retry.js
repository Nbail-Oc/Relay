/** @param {(string | undefined)[]} keys @param {(key: string) => Promise<any>} call */
export function isRetryableProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  return !status || [401, 403, 408, 425, 429].includes(status) || status >= 500;
}

export async function withOneBackup(keys, call) {
  const usable = keys.filter(Boolean).slice(0, 2);
  if (!usable.length) throw new Error("Provider API key is not configured.");
  try { return await call(usable[0]); }
  catch (firstError) { if (!usable[1] || !isRetryableProviderError(firstError)) throw firstError; return call(usable[1]); }
}
