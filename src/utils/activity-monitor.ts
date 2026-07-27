const IDLE_TIMEOUT_MS = 10_000;

let idle = false;
let idleTimer: number | null = null;

function resetIdleTimer(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    idle = true;
  }, IDLE_TIMEOUT_MS);
}

function markActive(): void {
  idle = false;
  resetIdleTimer();
}

document.addEventListener("pointerdown", markActive, {
  capture: true,
  passive: true,
});
document.addEventListener("wheel", markActive, {
  capture: true,
  passive: true,
});

resetIdleTimer();

export const activityMonitor = {
  isIdle: () => idle,
  markActive,
};
