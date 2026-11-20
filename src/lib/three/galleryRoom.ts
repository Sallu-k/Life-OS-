import * as THREE from "three";
import { css, type Palette } from "./theme";
import type { RoomWall } from "./walls";
import { woodMaterial } from "./wood";

export const HALL_W = 30; // x from -15 to 15
export const HALL_D = 16; // z from -8 to 8
export const HALL_H = 6.6;

export interface GalleryWall extends RoomWall {
  anchor: THREE.Group; // sits on the wall's inner face; +z points into the room, +x runs along the wall
  length: number;
}

// The four walls: back and front are long, left and right are short.
const SPECS = [
  { normal: new THREE.Vector3(0, 0, -1), distance: HALL_D / 2, length: HALL_W, turn: 0 }, // back
  { normal: new THREE.Vector3(-1, 0, 0), distance: HALL_W / 2, length: HALL_D, turn: Math.PI / 2 }, // left
  { normal: new THREE.Vector3(1, 0, 0), distance: HALL_W / 2, length: HALL_D, turn: -Math.PI / 2 }, // right
  { normal: new THREE.Vector3(0, 0, 1), distance: HALL_D / 2, length: HALL_W, turn: Math.PI }, // front
];

// A brass plaque with the stage's name and how many certificates hang there.
export function plaque(name: string, count: number, p: Palette): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 220;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 220);
  g.addColorStop(0, css(p.brass.clone().lerp(p.ink, 0.2)));
  g.addColorStop(1, css(p.brass.clone().multiplyScalar(0.7)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 220);
  ctx.strokeStyle = css(p.brass.clone().multiplyScalar(0.45));
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 996, 192);
  ctx.textAlign = "center";
  ctx.fillStyle = css(p.bg);
  ctx.font = `600 84px ${p.fontBook}`;
  ctx.fillText(name.toUpperCase(), 512, 112);
  ctx.font = `34px ${p.fontLabel}`;
  ctx.fillText(`${count} ${count === 1 ? "CERTIFICATE" : "CERTIFICATES"}`, 512, 172);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.69), new THREE.MeshStandardMaterial({ map: texture, metalness: 0.6, roughness: 0.35 }));
}

function bench(p: Palette, wood: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const leather = new THREE.MeshPhysicalMaterial({ color: p.surface.clone().lerp(p.copper, 0.25), roughness: 0.55, clearcoat: 0.3, sheen: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.9), leather);
  seat.position.y = 0.55;
  group.add(seat);
  for (const x of [-1.4, 1.4]) {
    for (const z of [-0.32, 0.32]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.1), wood);
      leg.position.set(x, 0.23, z);
      group.add(leg);
    }
  }
  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return group;
}

// The hall: an oak plank floor, painted walls with a pale skirting and cornice, and two benches in the middle.
export function buildHall(p: Palette): { group: THREE.Group; walls: GalleryWall[] } {
  const group = new THREE.Group();
  const oak = p.brass.clone().lerp(p.copper, 0.15).multiplyScalar(0.34);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_D), woodMaterial(oak, 71, [8, 4], true, 0.45));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const base = new THREE.Mesh(new THREE.BoxGeometry(HALL_W + 0.6, 0.8, HALL_D + 0.6), new THREE.MeshStandardMaterial({ color: p.bg, roughness: 0.7 }));
  base.position.y = -0.41;
  group.add(floor, base);

  const legWood = woodMaterial(oak.clone().multiplyScalar(0.7), 73, [1, 1], false, 0.5);
  for (const x of [-4.2, 4.2]) {
    const b = bench(p, legWood);
    b.position.x = x;
    group.add(b);
  }

  const paint = new THREE.MeshStandardMaterial({ color: p.copper.clone().lerp(p.bg, 0.35).multiplyScalar(0.36), roughness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: p.ink.clone().multiplyScalar(0.82), roughness: 0.6 });
  const walls: GalleryWall[] = SPECS.map((spec) => {
    const section = new THREE.Group();
    const anchor = new THREE.Group();
    anchor.position.copy(spec.normal).multiplyScalar(spec.distance - 0.02);
    anchor.rotation.y = spec.turn;
    section.add(anchor);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(spec.length, HALL_H), paint);
    wall.position.y = HALL_H / 2;
    wall.receiveShadow = true;
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(spec.length, 0.28, 0.06), trim);
    skirting.position.set(0, 0.14, 0.03);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(spec.length, 0.22, 0.14), trim);
    cornice.position.set(0, HALL_H - 0.11, 0.07);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(spec.length, 0.05, 0.05), trim);
    rail.position.set(0, HALL_H - 0.55, 0.03);
    anchor.add(wall, skirting, cornice, rail);
    group.add(section);
    return { section, normal: spec.normal, distance: spec.distance, height: 1, anchor, length: spec.length };
  });
  return { group, walls };
}
