import * as THREE from "three";
import { loadImage, wrapLines } from "./textures";
import { css, type Palette } from "./theme";

// What a frame needs to know about one certificate.
export interface FrameCert {
  slug: string;
  title: string;
  issuer: string;
  date: string;
  url: string | null; // public file URL (image or PDF), or null
  highlight: boolean;
}

export const FRAME_W = 1.7;
export const FRAME_H = 1.25;
const MOULDING = 0.13; // width of the gilt moulding
const MAT = 0.12; // width of the cream mat inside it

function rect(w: number, h: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.lineTo(-w / 2, -h / 2);
  return shape;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// For a PDF or a missing file: an ivory sheet with the title and issuer, like a printed certificate.
function documentTexture(cert: FrameCert, p: Palette): THREE.CanvasTexture {
  return canvasTexture(700, 500, (ctx) => {
    ctx.fillStyle = css(p.ink);
    ctx.fillRect(0, 0, 700, 500);
    ctx.strokeStyle = css(p.brass);
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 652, 452);
    ctx.lineWidth = 2;
    ctx.strokeRect(38, 38, 624, 424);
    ctx.textAlign = "center";
    ctx.fillStyle = css(p.bg);
    ctx.font = `600 22px ${p.fontLabel}`;
    ctx.fillText("CERTIFICATE", 350, 110);
    ctx.font = `600 38px ${p.fontBook}`;
    wrapLines(ctx, cert.title, 560, 3).forEach((line, i) => ctx.fillText(line, 350, 200 + i * 46));
    ctx.font = `24px ${p.fontBook}`;
    ctx.fillStyle = css(p.surfaceHi);
    ctx.fillText(cert.issuer.slice(0, 48), 350, 400);
  });
}

// The small museum label card under a frame: title, issuer and year.
function labelTexture(cert: FrameCert, p: Palette): THREE.CanvasTexture {
  return canvasTexture(640, 200, (ctx) => {
    ctx.fillStyle = css(p.ink);
    ctx.fillRect(0, 0, 640, 200);
    ctx.fillStyle = css(p.bg);
    ctx.font = `600 34px ${p.fontBook}`;
    wrapLines(ctx, cert.title, 590, 2).forEach((line, i) => ctx.fillText(line, 24, 56 + i * 40));
    ctx.fillStyle = css(p.surfaceHi);
    ctx.font = `24px ${p.fontLabel}`;
    ctx.fillText(`${cert.issuer.slice(0, 40)} · ${cert.date.slice(0, 4)}`, 24, 170);
  });
}

export interface Frame {
  group: THREE.Group; // hangs on the wall; its front faces +z
  picker: THREE.Mesh;
  lift: number; // 0..1, eased: the frame comes forward a little when pointed at
}

// A moulded gilt frame with a cream mat, the certificate itself (sized to fit, never stretched),
// a soft pool of light on the wall above it, and a label card underneath.
export function buildFrame(cert: FrameCert, index: number, p: Palette, gilt: THREE.Material, mat: THREE.Material): Frame {
  const group = new THREE.Group();

  const outline = rect(FRAME_W, FRAME_H);
  outline.holes.push(rect(FRAME_W - MOULDING * 2, FRAME_H - MOULDING * 2));
  const moulding = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4 }), gilt);
  moulding.castShadow = true;
  group.add(moulding);

  const innerW = FRAME_W - MOULDING * 2;
  const innerH = FRAME_H - MOULDING * 2;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), mat);
  back.position.z = 0.02;
  group.add(back);

  // The certificate picture, scaled to fit inside the mat.
  const spaceW = innerW - MAT * 2;
  const spaceH = innerH - MAT * 2;
  const isImage = cert.url !== null && !cert.url.toLowerCase().endsWith(".pdf");
  const material = new THREE.MeshStandardMaterial({ map: documentTexture(cert, p), roughness: 0.55 });
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  picture.position.z = 0.03;
  const fit = (aspect: number) => {
    const w = Math.min(spaceW, spaceH * aspect);
    picture.scale.set(w, w / aspect, 1);
  };
  fit(700 / 500);
  if (isImage) {
    loadImage(cert.url!, (texture) => {
      const img = texture.image as { width: number; height: number };
      material.map = texture;
      material.needsUpdate = true;
      fit(img.width / img.height);
    });
  }
  group.add(picture);

  const picker = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_W, FRAME_H), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  picker.position.z = 0.12;
  picker.userData = { type: "frame", index };
  group.add(picker);

  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshStandardMaterial({ map: labelTexture(cert, p), roughness: 0.8 }));
  label.position.set(FRAME_W / 2 - 0.45, -FRAME_H / 2 - 0.28, 0.01);
  group.add(label);

  return { group, picker, lift: 0 };
}

// A soft cone of light painted on the wall above a frame, like a picture light.
export function lightPool(p: Palette, strong: boolean): THREE.Mesh {
  const texture = canvasTexture(256, 512, (ctx) => {
    const g = ctx.createRadialGradient(128, 30, 4, 128, 220, 260);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.35, "rgba(255,255,255,0.32)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FRAME_W * 1.5, FRAME_H * 2.2),
    new THREE.MeshBasicMaterial({ map: texture, color: p.glow, transparent: true, opacity: strong ? 0.42 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  mesh.position.set(0, FRAME_H * 0.25, 0.005);
  return mesh;
}
