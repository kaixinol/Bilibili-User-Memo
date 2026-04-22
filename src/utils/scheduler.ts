export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export async function nextFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await nextFrame();
  }
}

export function whenIdle(timeout = 1000): Promise<void> {
  return new Promise((resolve) => {
    const requestIdleCallback =
      (window as Window & {
        requestIdleCallback?: (
          callback: () => void,
          options?: { timeout?: number },
        ) => number;
      }).requestIdleCallback;

    if (!requestIdleCallback) {
      window.setTimeout(resolve, 0);
      return;
    }

    requestIdleCallback(() => resolve(), { timeout });
  });
}

export async function afterFramesAndIdle(
  frameCount = 0,
  idleTimeout = 1000,
): Promise<void> {
  await nextFrames(frameCount);
  await whenIdle(idleTimeout);
}

export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  {
    intervalMs = 50,
    timeoutMs,
  }: {
    intervalMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const startTime = Date.now();

  while (true) {
    if (await predicate()) {
      return true;
    }

    if (timeoutMs !== undefined && Date.now() - startTime >= timeoutMs) {
      return false;
    }

    await delay(intervalMs);
  }
}

export function requestIdle(
  callback: (deadline: IdleDeadline) => void,
  timeout = 1000,
) {
  const requestIdleCallback =
    (window as Window & {
      requestIdleCallback?: (
        cb: (deadline: IdleDeadline) => void,
        options?: { timeout?: number },
      ) => number;
    }).requestIdleCallback;

  if (requestIdleCallback) {
    requestIdleCallback(callback, { timeout });
    return;
  }

  window.setTimeout(
    () => callback({ timeRemaining: () => 16 } as IdleDeadline),
    16,
  );
}
