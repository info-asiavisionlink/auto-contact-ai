/**
 * 失敗時に最大 retries 回まで再試行する（初回 + retries = 合計 retries+1 回）
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 2,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    return retry(fn, retries - 1);
  }
}
