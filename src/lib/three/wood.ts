import * as THREE from "three";
import { css } from "./theme";

// A small repeatable random number generator, so the same seed always draws the same wood.
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WoodMaps {
  map: THREE.CanvasTexture; // colour with grain
  bump: THREE.CanvasTexture; // the same grain as small bumps
}

// Draws wood on a canvas: tonal bands, flowing grain lines and fine pores. With `planks` it also draws floor boards.
export function woodMaps(base: THREE.Color, seed: number, planks = false): WoodMaps {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rnd = random(seed);
  const dark = base.clone().multiplyScalar(0.5);
  const light = base.clone().multiplyScalar(1.45);

  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = css(rnd() > 0.5 ? dark : light);
    ctx.globalAlpha = 0.05 + rnd() * 0.07;
    ctx.fillRect(rnd() * size, 0, 16 + rnd() * 90, size);
  }

  for (let i = 0; i < 300; i++) {
    const x0 = rnd() * size;
    const phase1 = rnd() * 6.28;
    const phase2 = rnd() * 6.28;
    const swing1 = 3 + rnd() * 9;
    const swing2 = 1 + rnd() * 4;
    ctx.strokeStyle = css(rnd() > 0.22 ? dark : light);
    ctx.globalAlpha = 0.06 + rnd() * 0.2;
    ctx.lineWidth = 0.7 + rnd() * 2.2;
    ctx.beginPath();
    for (let y = 0; y <= size; y += 10) {
      const x = x0 + Math.sin(y * 0.011 + phase1) * swing1 + Math.sin(y * 0.034 + phase2) * swing2;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.lineWidth = 1;
  for (let i = 0; i < 5000; i++) {
    ctx.strokeStyle = css(dark);
    ctx.globalAlpha = 0.04 + rnd() * 0.09;
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 2, y + 6 + rnd() * 26);
    ctx.stroke();
  }

  if (planks) {
    for (let x = 0; x < size; x += 128) {
      ctx.globalAlpha = 0.14 + rnd() * 0.2;
      ctx.fillStyle = css(rnd() > 0.5 ? dark : light);
      ctx.fillRect(x, 0, 128, size);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = css(dark.clone().multiplyScalar(0.3));
      ctx.fillRect(x, 0, 7, size);
      for (let y = Math.floor(rnd() * 256); y < size; y += 256 + Math.floor(rnd() * 256)) ctx.fillRect(x, y, 128, 6);
    }
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(canvas);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, bump };
}

// A realistic wood material from a base colour.
export function woodMaterial(base: THREE.Color, seed: number, repeat: [number, number] = [1, 1], planks = false, roughness = 0.55): THREE.MeshStandardMaterial {
  const { map, bump } = woodMaps(base, seed, planks);
  map.repeat.set(repeat[0], repeat[1]);
  bump.repeat.set(repeat[0], repeat[1]);
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.2, roughness, metalness: 0.02 });
}
