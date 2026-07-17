/** 扩展是否仍可用（重载/卸载后 content script 会失效） */
export function isExtContextValid(): boolean {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Content script 是否仍应继续跑。
 * 不要用 ctx.isInvalid / ctx.isValid：WXT 会读 browser.runtime.id，
 * 上下文失效时该访问会直接抛 “Extension context invalidated”
 *（见 https://github.com/wxt-dev/wxt/issues/371 同类环境问题）。
 */
export function isScriptAlive(ctx: { signal: AbortSignal }): boolean {
  return !ctx.signal.aborted && isExtContextValid();
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

/**
 * 替代 ctx.setTimeout：WXT 定时器回调里会读 isValid → runtime.id，失效时会抛错。
 */
export function safeSetTimeout(
  ctx: { onInvalidated: (cb: () => void) => () => void },
  fn: () => void,
  ms?: number,
): number {
  const id = window.setTimeout(() => {
    if (!isExtContextValid()) return;
    try {
      fn();
    } catch {
      /* Extension context invalidated */
    }
  }, ms);
  ctx.onInvalidated(() => clearTimeout(id));
  return id;
}

type Watchable<T> = {
  watch: (cb: (newValue: T, oldValue: T) => void) => () => void;
};

/** 安全注册 wxt/storage watch，避免失效上下文下 addListener / 回调抛错 */
export function safeWatchStorage<T>(
  item: Watchable<T>,
  cb: (newValue: T, oldValue: T) => void,
): () => void {
  if (!isExtContextValid()) return () => {};
  try {
    return item.watch((newValue, oldValue) => {
      if (!isExtContextValid()) return;
      try {
        cb(newValue, oldValue);
      } catch {
        /* Extension context invalidated */
      }
    });
  } catch {
    return () => {};
  }
}
