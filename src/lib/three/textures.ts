import * as THREE from "three";
import { css, type Palette } from "./theme";

// Breaks text into lines that fit `maxWidth` on a 2D canvas.
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function asTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A book cover made on a canvas for books without an image: the same idea as the page placeholder.
export function placeholderCover(title: string, subtitle: string, hash: number, palette: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  const accent = hash % 2 === 0 ? palette.brass : palette.copper;
  const top = palette.surfaceHi.clone().lerp(accent, (18 + (hash % 30)) / 100);
  const gradient = ctx.createLinearGradient(0, 0, 400, 600);
  gradient.addColorStop(0, css(top));
  gradient.addColorStop(0.75, css(palette.surface));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 600);

  ctx.strokeStyle = css(palette.brass.clone().lerp(palette.surface, 0.6));
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, 364, 564);

  ctx.fillStyle = css(palette.ink);
  ctx.textAlign = "center";
  ctx.font = `600 38px ${palette.fontBook}`;
  const lines = wrapLines(ctx, title, 320, 5);
  const start = 300 - (lines.length * 46) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 200, start + i * 46));

  ctx.fillStyle = css(palette.inkDim);
  ctx.font = `20px ${palette.fontBook}`;
  ctx.fillText(subtitle.slice(0, 32).toUpperCase(), 200, 548);
  ctx.fillStyle = css(palette.brass);
  ctx.fillText("✦", 200, 76);
  return asTexture(canvas);
}

// An engraved name plate for a shelf: the category and how many books it holds.
export function plateTexture(name: string, count: string, palette: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = css(palette.surface);
  ctx.fillRect(0, 0, 1024, 200);
  ctx.strokeStyle = css(palette.hexLine);
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 1008, 184);
  ctx.textAlign = "center";
  ctx.fillStyle = css(palette.brass);
  let size = 78;
  ctx.font = `600 ${size}px ${palette.fontBook}`;
  while (ctx.measureText(name).width > 900 && size > 36) {
    size -= 4;
    ctx.font = `600 ${size}px ${palette.fontBook}`;
  }
  ctx.fillText(name, 512, 100);
  ctx.fillStyle = css(palette.inkDim);
  ctx.font = `34px ${palette.fontBook}`;
  ctx.fillText(count, 512, 160);
  return asTexture(canvas);
}

// The spine of a book standing on a shelf: its colour, two gilt lines and the title written downwards.
export function spineTexture(title: string, base: THREE.Color, palette: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = css(palette.hexLine);
  for (const y of [16, 22, 234, 240]) ctx.fillRect(0, y, 64, 2);
  ctx.save();
  ctx.translate(32, 128);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = css(palette.ink);
  let size = 26;
  ctx.font = `600 ${size}px ${palette.fontBook}`;
  while (ctx.measureText(title).width > 188 && size > 12) {
    size -= 2;
    ctx.font = `600 ${size}px ${palette.fontBook}`;
  }
  ctx.fillText(title.length > 34 ? `${title.slice(0, 33)}…` : title, 0, size / 3);
  ctx.restore();
  return asTexture(canvas);
}

// A soft round glow used for the magic sparkles.
export function glowSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Loads a picture file as a texture and calls `done` when it is ready. A missing file is ignored (the placeholder stays).
export function loadImage(url: string, done: (texture: THREE.Texture) => void): void {
  new THREE.TextureLoader().load(
    url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      done(texture);
    },
    undefined,
    () => undefined,
  );
}
