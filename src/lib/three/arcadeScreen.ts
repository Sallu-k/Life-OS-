import * as THREE from "three";
import { wrapLines } from "./textures";
import { css, type Palette } from "./theme";

// What a cabinet screen shows about one game.
export interface ScreenGame {
  slug: string;
  title: string;
  platform: string;
  poster: string | null; // public URL, or null for a drawn placeholder
}

const W = 1200;
const H = 1000;
const COLS = 4;
const ROWS = 2;
const PER_PAGE = COLS * ROWS;
const GAP = 30;
const HEAD = 70;
const TILE_W = (W - GAP * (COLS + 1)) / COLS;
const TILE_H = TILE_W * 1.5;

export interface CabinetScreen {
  texture: THREE.CanvasTexture;
  next(): void; // show the next page of posters
  gameAt(uv: THREE.Vector2): ScreenGame | null; // which poster is under a point on the screen
}

// Pictures are shared between screens and the page; each is loaded once.
const pictures = new Map<string, HTMLImageElement>();
function picture(url: string, ready: () => void): HTMLImageElement {
  let img = pictures.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    pictures.set(url, img);
  }
  if (!img.complete) img.addEventListener("load", ready, { once: true });
  return img;
}

// Draws a poster into a tile, cropped to fill it (like object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

// A CRT screen: a header line, a grid of posters (8 per page) and scanlines on top.
// `games` empty = attract mode ("INSERT COIN") for the decorative cabinets.
export function createScreen(name: string, games: ScreenGame[], accent: THREE.Color, p: Palette): CabinetScreen {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const pages = Math.max(1, Math.ceil(games.length / PER_PAGE));
  let page = 0;

  function draw() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, css(p.bg));
    bg.addColorStop(1, css(p.surface));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (games.length === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = css(accent);
      ctx.font = `700 120px ${p.fontBook}`;
      ctx.fillText("INSERT", W / 2, H / 2 - 30);
      ctx.fillText("COIN", W / 2, H / 2 + 110);
      ctx.fillStyle = css(p.inkDim);
      ctx.font = `36px ${p.fontLabel}`;
      ctx.fillText("PRESS START", W / 2, H - 120);
    } else {
      ctx.textAlign = "left";
      ctx.fillStyle = css(accent);
      ctx.font = `600 40px ${p.fontLabel}`;
      ctx.fillText(name.toUpperCase(), GAP, 52);
      ctx.textAlign = "right";
      ctx.fillStyle = css(p.inkDim);
      ctx.fillText(pages > 1 ? `${page + 1}/${pages}` : `${games.length}`, W - GAP, 52);

      games.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).forEach((game, i) => {
        const x = GAP + (i % COLS) * (TILE_W + GAP);
        const y = HEAD + GAP / 2 + Math.floor(i / COLS) * (TILE_H + GAP);
        const img = game.poster ? picture(game.poster, () => draw()) : null;
        if (img && img.complete && img.naturalWidth > 0) {
          drawCover(ctx, img, x, y, TILE_W, TILE_H);
        } else {
          ctx.fillStyle = css(p.surfaceHi);
          ctx.fillRect(x, y, TILE_W, TILE_H);
          ctx.fillStyle = css(p.ink);
          ctx.textAlign = "center";
          ctx.font = `600 30px ${p.fontBook}`;
          wrapLines(ctx, game.title.toUpperCase(), TILE_W - 30, 5).forEach((line, j) => ctx.fillText(line, x + TILE_W / 2, y + TILE_H / 2 - 40 + j * 38));
        }
        ctx.strokeStyle = css(accent);
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, TILE_W, TILE_H);
      });
    }

    // Scanlines and a soft dark edge, like an old tube screen.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 2);
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    texture.needsUpdate = true;
  }
  draw();

  return {
    texture,
    next() {
      if (pages < 2) return;
      page = (page + 1) % pages;
      draw();
    },
    gameAt(uv) {
      const px = uv.x * W;
      const py = (1 - uv.y) * H;
      for (let i = 0; i < PER_PAGE; i++) {
        const x = GAP + (i % COLS) * (TILE_W + GAP);
        const y = HEAD + GAP / 2 + Math.floor(i / COLS) * (TILE_H + GAP);
        if (px >= x && px <= x + TILE_W && py >= y && py <= y + TILE_H) return games[page * PER_PAGE + i] ?? null;
      }
      return null;
    },
  };
}

// A glowing marquee sign: the genre name and how many games it holds.
export function marqueeTexture(name: string, count: number, accent: THREE.Color, p: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 300;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, css(p.bg));
  g.addColorStop(0.5, css(accent.clone().lerp(p.bg, 0.65)));
  g.addColorStop(1, css(p.bg));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 300);
  ctx.textAlign = "center";
  ctx.shadowColor = css(accent);
  ctx.shadowBlur = 30;
  ctx.fillStyle = css(p.ink);
  let size = 120;
  ctx.font = `700 ${size}px ${p.fontBook}`;
  while (ctx.measureText(name.toUpperCase()).width > 940 && size > 50) {
    size -= 6;
    ctx.font = `700 ${size}px ${p.fontBook}`;
  }
  ctx.fillText(name.toUpperCase(), 512, 150);
  ctx.shadowBlur = 0;
  ctx.fillStyle = css(accent);
  ctx.font = `48px ${p.fontLabel}`;
  ctx.fillText(count > 0 ? `${count} ${count === 1 ? "GAME" : "GAMES"}` : "FREE PLAY", 512, 245);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
