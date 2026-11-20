import * as THREE from "three";
import { css, type Palette } from "./theme";

export type SectionKey = "library" | "games" | "certificates" | "achievements" | "habits" | "balance";

const R = 1.55; // outer radius of a portal's hexagon

function hexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let j = 0; j <= 6; j++) {
    const a = (j * Math.PI) / 3 + Math.PI / 6; // flat top and bottom
    if (j === 0) shape.moveTo(radius * Math.cos(a), radius * Math.sin(a));
    else shape.lineTo(radius * Math.cos(a), radius * Math.sin(a));
  }
  return shape;
}

function hexRing(outer: number, inner: number, depth: number, bevel: boolean): THREE.ExtrudeGeometry {
  const shape = hexShape(outer);
  shape.holes.push(hexShape(inner));
  return new THREE.ExtrudeGeometry(shape, bevel ? { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 } : { depth, bevelEnabled: false });
}

function paint(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  draw(canvas.getContext("2d")!, s);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const dark = (c: THREE.Color, amount: number) => css(c.clone().multiplyScalar(amount));

// Each portal is a small window into its section's world, painted in that section's colour.
const PAINTERS: Record<SectionKey, (ctx: CanvasRenderingContext2D, s: number, c: THREE.Color, p: Palette) => void> = {
  library(ctx, s, c) {
    ctx.fillStyle = dark(c, 0.16);
    ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 3; row++) {
      const y = 110 + row * 130;
      ctx.fillStyle = dark(c, 0.45);
      ctx.fillRect(40, y + 100, s - 80, 14);
      for (let x = 60, k = row * 7; x < s - 70; k++) {
        const w = 16 + ((k * 37) % 5) * 5;
        const h = 70 + ((k * 53) % 4) * 8;
        ctx.fillStyle = dark(c, 0.35 + ((k * 29) % 5) * 0.12);
        ctx.fillRect(x, y + 100 - h, w, h);
        ctx.fillStyle = dark(c, 1.1);
        ctx.fillRect(x, y + 100 - h + 10, w, 3);
        x += w + 3;
      }
    }
  },
  games(ctx, s, c, p) {
    const sky = ctx.createLinearGradient(0, 0, 0, s * 0.6);
    sky.addColorStop(0, css(p.bg));
    sky.addColorStop(1, dark(c, 0.7));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = css(c.clone().lerp(p.brass, 0.5));
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.6, 120, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = dark(c, 0.5);
    for (let k = 0, y = s * 0.6 - 70; y < s * 0.6; k++, y += 16 + k * 2) ctx.fillRect(130, y, s - 260, 3 + k);
    ctx.fillStyle = css(p.bg);
    ctx.fillRect(0, s * 0.6, s, s * 0.4);
    ctx.strokeStyle = css(c);
    ctx.lineWidth = 2;
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(s / 2 + i * 8, s * 0.6);
      ctx.lineTo(s / 2 + i * 60, s);
      ctx.stroke();
    }
    for (let k = 1; k < 6; k++) {
      const y = s * 0.6 + Math.pow(k / 5, 2) * s * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
  },
  certificates(ctx, s, c, p) {
    ctx.fillStyle = dark(c, 0.22);
    ctx.fillRect(0, 0, s, s);
    const frames: [number, number, number, number][] = [[70, 120, 170, 120], [270, 100, 170, 150], [130, 290, 250, 140]];
    for (const [x, y, w, h] of frames) {
      ctx.fillStyle = css(p.brass);
      ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
      ctx.fillStyle = css(p.ink.clone().lerp(c, 0.15));
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = dark(c, 0.6);
      for (let l = 0; l < 3; l++) ctx.fillRect(x + 20, y + 30 + l * 22, w - 40, 6);
    }
  },
  achievements(ctx, s, c, p) {
    const g = ctx.createRadialGradient(s / 2, s * 0.35, 20, s / 2, s / 2, s * 0.7);
    g.addColorStop(0, dark(c, 0.55));
    g.addColorStop(1, dark(c, 0.12));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = css(p.brass);
    ctx.beginPath(); // the cup
    ctx.moveTo(176, 140);
    ctx.lineTo(336, 140);
    ctx.quadraticCurveTo(336, 280, 256, 300);
    ctx.quadraticCurveTo(176, 280, 176, 140);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = css(p.brass);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(256 + side * 92, 190, 34, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.stroke();
    }
    ctx.fillRect(244, 298, 24, 60);
    ctx.fillRect(196, 356, 120, 26);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,230,170,${0.2 + ((i * 37) % 10) / 14})`;
      ctx.fillRect((i * 97) % s, (i * 53) % s, 3, 3);
    }
  },
  habits(ctx, s, c, p) {
    ctx.fillStyle = css(p.ink.clone().lerp(c, 0.1));
    ctx.fillRect(0, 0, s, s);
    const size = 34;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 9; col++) {
        const x = 70 + col * (size + 8);
        const y = 110 + row * (size + 8);
        if ((row * 9 + col) * 7 % 10 < 6) {
          ctx.fillStyle = css(c);
          ctx.fillRect(x, y, size, size);
        } else {
          ctx.strokeStyle = dark(c, 0.8);
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, size, size);
        }
      }
    }
  },
  balance(ctx, s, c, p) {
    ctx.fillStyle = css(p.bg);
    ctx.fillRect(0, 0, s, s);
    const point = (i: number, r: number) => [s / 2 + r * Math.cos(-Math.PI / 2 + (i * Math.PI) / 3), s / 2 + r * Math.sin(-Math.PI / 2 + (i * Math.PI) / 3)];
    ctx.strokeStyle = dark(c, 0.6);
    ctx.lineWidth = 2;
    for (const r of [60, 110, 160, 210]) {
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const [x, y] = point(i, r);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const values = [0.8, 0.55, 0.9, 0.65, 0.45, 0.7];
    ctx.beginPath();
    values.forEach((v, i) => {
      const [x, y] = point(i, 210 * v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = css(c.clone().multiplyScalar(0.4));
    ctx.fill();
    ctx.strokeStyle = css(c);
    ctx.lineWidth = 5;
    ctx.stroke();
  },
};

// A name plate under the portal: the section's name and its count line.
function labelTexture(title: string, line: string, c: THREE.Color, p: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.fillStyle = css(p.ink);
  ctx.font = `600 96px ${p.fontBook}`;
  ctx.fillText(title, 512, 110);
  ctx.fillStyle = css(c);
  ctx.font = `46px ${p.fontLabel}`;
  ctx.fillText(line.toUpperCase(), 512, 200);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface Portal {
  group: THREE.Group; // turns to face the camera
  body: THREE.Group; // lifts on hover
  window: THREE.Mesh; // the clickable face
  glow: number;
  setGlow(value: number): void;
}

// A hexagonal portal: a brushed-metal frame with a neon inner edge in the section's colour, a painted window
// into the section's world, and a name plate below.
export function buildPortal(key: SectionKey, title: string, line: string, accent: THREE.Color, p: Palette, index: number): Portal {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const metal = new THREE.MeshPhysicalMaterial({ color: p.surfaceHi.clone().lerp(p.inkDim, 0.25), metalness: 0.9, roughness: 0.35, clearcoat: 0.4 });
  const frame = new THREE.Mesh(hexRing(R, R - 0.2, 0.18, true), metal);
  frame.position.z = -0.09;
  frame.castShadow = true;

  const edgeMaterial = new THREE.MeshBasicMaterial({ color: accent.clone(), toneMapped: false });
  const edge = new THREE.Mesh(hexRing(R - 0.2, R - 0.25, 0.02, false), edgeMaterial);
  edge.position.z = 0.1;

  const windowMaterial = new THREE.MeshBasicMaterial({ map: paint((ctx, s) => PAINTERS[key](ctx, s, accent, p)), toneMapped: false });
  const window = new THREE.Mesh(new THREE.ShapeGeometry(hexShape(R - 0.22)), windowMaterial);
  // ShapeGeometry has no 0..1 texture coordinates; map the hexagon's box onto the picture.
  const uv = window.geometry.attributes.uv;
  const pos = window.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (2 * (R - 0.22)) + 0.5, pos.getY(i) / (2 * (R - 0.22)) + 0.5);
  uv.needsUpdate = true;
  window.userData = { type: "portal", index };

  const back = new THREE.Mesh(new THREE.ShapeGeometry(hexShape(R - 0.05)), metal);
  back.rotation.y = Math.PI;
  back.position.z = -0.1;

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.9),
    // Drawn over everything (no depth test), so a portal in front never hides another portal's name.
    new THREE.MeshBasicMaterial({ map: labelTexture(title, line, accent, p), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }),
  );
  label.renderOrder = 10;
  label.position.y = -R - 0.6;

  const light = new THREE.PointLight(accent, 3, 5, 2);
  light.position.z = 1;
  body.add(frame, edge, window, back, label, light);

  const portal: Portal = {
    group,
    body,
    window,
    glow: 0,
    setGlow(value) {
      portal.glow = value;
      edgeMaterial.color.copy(accent).multiplyScalar(0.8 + value * 1.8);
      windowMaterial.color.setScalar(0.72 + value * 0.35);
      light.intensity = 3 + value * 8;
    },
  };
  portal.setGlow(0);
  return portal;
}
