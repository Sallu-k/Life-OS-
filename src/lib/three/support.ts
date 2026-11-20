// Small checks that run before any 3D code is loaded. This file must NOT import "three".

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export const prefersReducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const hasMouse = (): boolean => matchMedia("(hover: hover)").matches;
