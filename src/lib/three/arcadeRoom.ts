import * as THREE from "three";
import { css, type Palette } from "./theme";

export const ROOM_W = 26; // x from -13 to 13
export const ROOM_D = 18; // z from -9 to 9
export const ROOM_H = 7.5;

import type { RoomWall } from "./walls";

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

// The big window on the back wall: a synthwave sunset with a striped sun, mountains and a grid running to the horizon.
function sunsetTexture(p: Palette): THREE.CanvasTexture {
  return canvasTexture(2048, 640, (ctx) => {
    const horizon = 400;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, css(p.bg));
    sky.addColorStop(0.55, css(p.copper.clone().lerp(p.bg, 0.55)));
    sky.addColorStop(1, css(p.brass.clone().lerp(p.copper, 0.3)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 2048, horizon);

    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * 2048, Math.random() * horizon * 0.6, 2, 2);
    }

    // The sun, cut by stripes that get wider towards the bottom.
    const sun = ctx.createLinearGradient(0, 110, 0, horizon);
    sun.addColorStop(0, css(p.brass.clone().lerp(p.ink, 0.35)));
    sun.addColorStop(1, css(p.copper));
    ctx.save();
    ctx.beginPath();
    ctx.arc(1024, horizon, 290, Math.PI, 0);
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.fillRect(734, 110, 580, horizon - 110);
    for (let k = 0, y = horizon - 150; y < horizon; k++, y += 22 + k * 2) {
      ctx.clearRect(700, y, 650, 4 + k * 2.2);
      ctx.fillStyle = css(p.copper.clone().lerp(p.bg, 0.5));
      ctx.fillRect(700, y, 650, 4 + k * 2.2);
    }
    ctx.restore();

    // Mountains: dark shapes with bright edges.
    for (const [base, rise, color] of [[0.6, 170, p.surface], [0.9, 110, p.bg]] as const) {
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= 2048; x += 64) {
        const peak = Math.abs(Math.sin(x * 0.004 * base + base * 7)) * rise + Math.abs(Math.sin(x * 0.013 + base)) * rise * 0.35;
        const keepClear = Math.max(0, 1 - Math.abs(x - 1024) / 360);
        ctx.lineTo(x, horizon - peak * (1 - keepClear * 0.85));
      }
      ctx.lineTo(2048, horizon);
      ctx.closePath();
      ctx.fillStyle = css(color);
      ctx.fill();
      ctx.strokeStyle = css(p.glow.clone().lerp(p.bg, 0.3));
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // The ground grid in perspective.
    ctx.fillStyle = css(p.bg);
    ctx.fillRect(0, horizon, 2048, 640 - horizon);
    ctx.strokeStyle = css(p.copper);
    ctx.lineWidth = 2;
    for (let i = -24; i <= 24; i++) {
      ctx.beginPath();
      ctx.moveTo(1024 + i * 18, horizon);
      ctx.lineTo(1024 + i * 220, 640);
      ctx.stroke();
    }
    for (let k = 1; k < 9; k++) {
      const y = horizon + Math.pow(k / 8, 2) * (640 - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(2048, y);
      ctx.stroke();
    }
  });
}

// Dark glossy floor tiles in a checker pattern.
function floorTexture(p: Palette): THREE.CanvasTexture {
  const texture = canvasTexture(512, 512, (ctx) => {
    const a = css(p.bg.clone().lerp(p.surface, 0.35));
    const b = css(p.surface.clone().lerp(p.surfaceHi, 0.3));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? a : b;
        ctx.fillRect(i * 128, j * 128, 128, 128);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 3;
        ctx.strokeRect(i * 128, j * 128, 128, 128);
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROOM_W / 4, ROOM_D / 4);
  return texture;
}

// Glowing grid lines set into the floor. Their texture slides slowly, so the floor seems to run towards the sunset.
function gridTexture(p: Palette): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.strokeStyle = css(p.glow);
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 256, 256);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROOM_W / 2, ROOM_D / 2);
  return texture;
}

// A neon sign: glowing words on a dark backing.
function neonSign(text: string, color: THREE.Color, p: Palette): THREE.Mesh {
  const texture = canvasTexture(1024, 256, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `italic 700 150px ${p.fontBook}`;
    ctx.shadowColor = css(color);
    ctx.shadowBlur = 40;
    ctx.strokeStyle = css(color);
    ctx.lineWidth = 8;
    ctx.strokeText(text, 512, 128);
    ctx.shadowBlur = 10;
    ctx.fillStyle = css(color.clone().lerp(p.ink, 0.6));
    ctx.fillText(text, 512, 128);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }));
}

function tube(length: number, color: THREE.Color): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.4), toneMapped: false }));
}

export interface Room {
  group: THREE.Group;
  walls: RoomWall[];
  grid: THREE.CanvasTexture;
}

// The arcade: a glossy tiled floor with neon grid lines, four walls (the back one with the sunset window),
// neon tubes along the top edges and two neon signs.
export function buildRoom(p: Palette): Room {
  const group = new THREE.Group();
  const halfW = ROOM_W / 2;
  const halfD = ROOM_D / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshStandardMaterial({ map: floorTexture(p), roughness: 0.22, metalness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const grid = gridTexture(p);
  const lines = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, ROOM_D),
    new THREE.MeshBasicMaterial({ map: grid, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.01;
  const base = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W + 0.6, 0.8, ROOM_D + 0.6), new THREE.MeshStandardMaterial({ color: p.bg, roughness: 0.6 }));
  base.position.y = -0.41;
  const edge = tube(ROOM_W + 0.6, p.copper);
  edge.position.set(0, -0.02, halfD + 0.3);
  group.add(floor, lines, base, edge);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: p.bg.clone().lerp(p.surface, 0.5), roughness: 0.75, side: THREE.DoubleSide });
  const walls: RoomWall[] = [];
  const specs: [THREE.Vector3, number, number, THREE.Color][] = [
    [new THREE.Vector3(0, 0, -1), halfD, ROOM_W, p.copper], // back
    [new THREE.Vector3(0, 0, 1), halfD, ROOM_W, p.copper], // front
    [new THREE.Vector3(-1, 0, 0), halfW, ROOM_D, p.glow], // left
    [new THREE.Vector3(1, 0, 0), halfW, ROOM_D, p.glow], // right
  ];
  for (const [normal, distance, length, color] of specs) {
    const section = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, ROOM_H), wallMaterial);
    wall.position.copy(normal).multiplyScalar(distance).setY(ROOM_H / 2);
    wall.lookAt(0, ROOM_H / 2, 0);
    wall.receiveShadow = true;
    const top = tube(length, color);
    top.position.copy(normal).multiplyScalar(distance - 0.1).setY(ROOM_H - 0.2);
    top.lookAt(0, ROOM_H - 0.2, 0);
    const low = tube(length, color.clone().multiplyScalar(0.6));
    low.position.copy(normal).multiplyScalar(distance - 0.1).setY(0.12);
    low.lookAt(0, 0.12, 0);
    section.add(wall, top, low);
    group.add(section);
    walls.push({ section, normal, distance, height: 1 });
  }

  // The sunset window on the back wall, in a neon frame.
  const back = walls[0].section;
  const window = new THREE.Mesh(new THREE.PlaneGeometry(17, 5.3), new THREE.MeshBasicMaterial({ map: sunsetTexture(p), toneMapped: false, color: new THREE.Color(0.9, 0.9, 0.9) }));
  window.position.set(0, 4.25, -halfD + 0.05);
  back.add(window);
  for (const [w, h, x, y] of [[17.3, 0.08, 0, 6.95], [17.3, 0.08, 0, 1.55], [0.08, 5.4, -8.65, 4.25], [0.08, 5.4, 8.65, 4.25]]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshBasicMaterial({ color: p.glow.clone().multiplyScalar(1.3), toneMapped: false }));
    frame.position.set(x, y, -halfD + 0.08);
    back.add(frame);
  }

  const leftSign = neonSign("ARCADE", p.copper, p);
  leftSign.position.set(-halfW + 0.06, 5.2, 0);
  leftSign.rotation.y = Math.PI / 2;
  walls[2].section.add(leftSign);
  const rightSign = neonSign("PLAYER ONE", p.glow, p);
  rightSign.position.set(halfW - 0.06, 5.2, 0);
  rightSign.rotation.y = -Math.PI / 2;
  walls[3].section.add(rightSign);

  return { group, walls, grid };
}

export { lowerWalls } from "./walls";
