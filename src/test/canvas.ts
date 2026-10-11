type Frame = (time: number) => void;

let pending: Frame | null = null;

export function installAnimationFrame() {
  pending = null;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    pending = null;
  };
}

export function flushFrames(count: number) {
  for (let frame = 0; frame < count; frame++) {
    const cb = pending;
    pending = null;
    cb?.(frame);
  }
}

export function installCanvasStub() {
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({} as CanvasRenderingContext2D, {
      get(_target, prop) {
        if (prop === 'createLinearGradient') return () => gradient;
        if (prop === 'canvas') return document.createElement('canvas');
        return () => undefined;
      },
      set() {
        return true;
      },
    });
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
