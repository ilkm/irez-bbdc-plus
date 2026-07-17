/** 扩展是否仍可用（重载/卸载后 content script 会失效） */
export function isExtContextValid(): boolean {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}

/** 安全调用 runtime.sendMessage，忽略失效上下文 */
export function safeSendMessage(message: unknown): void {
  if (!isExtContextValid()) return;
  try {
    void browser.runtime.sendMessage(message).catch(() => {});
  } catch {
    /* Extension context invalidated */
  }
}

/** 安全 getURL；上下文失效时返回空串 */
export function safeGetURL(path: `/${string}`): string {
  if (!isExtContextValid()) return '';
  try {
    return browser.runtime.getURL(path as '/lookup.html');
  } catch {
    return '';
  }
}

/** 包装可能因上下文失效而抛错的 Promise */
export async function safeExtCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isExtContextValid()) return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
