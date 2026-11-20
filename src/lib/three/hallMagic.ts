import * as THREE from "three";
import { titleHash } from "@/components/Cover";
import { APOTHEM, SIDE, wallAngle } from "./hallLayout";
import type { HallBook } from "./hallBay";
import { glowSprite, loadImage, placeholderCover } from "./textures";
import type { Palette } from "./theme";
import { woodMaterial } from "./wood";

function shadowed<T extends THREE.Object3D>(object: T, cast = true, receive = true): T {
  object.traverse((child) => {
    child.castShadow = cast;
    child.receiveShadow = receive;
  });
  return object;
}

const woodBase = (p: Palette) => p.copper.clone().lerp(p.surfaceHi, 0.4).multiplyScalar(0.6);

// The ground of the room: a wood plank floor on a thick base with a brass band round its edge.
export function buildFloor(p: Palette): THREE.Group {
  const shell = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(SIDE, 6), woodMaterial(woodBase(p).multiplyScalar(0.45), 41, [4, 4], true, 0.9));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  shell.add(floor);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(SIDE + 0.35, SIDE + 0.35, 1.1, 6), woodMaterial(woodBase(p).multiplyScalar(0.55), 47, [3, 1], false, 0.6));
  base.rotation.y = Math.PI / 6;
  base.position.y = -0.56;
  shell.add(shadowed(base, false, true));
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(SIDE + 0.42, SIDE + 0.42, 0.08, 6),
    new THREE.MeshStandardMaterial({ color: p.brass, metalness: 1, roughness: 0.3 }),
  );
  trim.rotation.y = Math.PI / 6;
  trim.position.y = -0.07; // just under the floor, so only its outer edge shows as a brass band
  shell.add(trim);
  return shell;
}

export interface WallParts {
  section: THREE.Group; // the wall and everything on it; lowered when it stands between the camera and the room
  skirting: THREE.Mesh; // a low strip that stays when the wall is lowered, so the room keeps its outline
}

// One wall: a panelled back with a moulded cap. Its bookcases are added to `section` by the caller.
export function buildWall(k: number, height: number, panel: THREE.Material, cap: THREE.Material): WallParts {
  const phi = wallAngle(k);
  const section = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(SIDE + 0.1, height), panel);
  wall.position.set(-Math.sin(phi) * (APOTHEM + 0.2), height / 2, -Math.cos(phi) * (APOTHEM + 0.2));
  wall.rotation.y = phi;
  wall.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(SIDE + 0.1, height), panel);
  back.position.set(-Math.sin(phi) * (APOTHEM + 0.5), height / 2, -Math.cos(phi) * (APOTHEM + 0.5));
  back.rotation.y = phi + Math.PI;
  const top = new THREE.Mesh(new THREE.BoxGeometry(SIDE + 0.2, 0.3, 0.75), cap);
  top.position.set(-Math.sin(phi) * (APOTHEM + 0.25), height + 0.1, -Math.cos(phi) * (APOTHEM + 0.25));
  top.rotation.y = phi;
  section.add(wall, back, shadowed(top));

  const skirting = new THREE.Mesh(new THREE.BoxGeometry(SIDE - 0.2, 0.5, 0.45), cap);
  skirting.position.set(-Math.sin(phi) * (APOTHEM + 0.25), 0.25, -Math.cos(phi) * (APOTHEM + 0.25));
  skirting.rotation.y = phi;
  shadowed(skirting);
  return { section, skirting };
}

// A corner pillar between wall k and wall k+1. Its group starts at the floor so it can be lowered too.
export function buildPillar(k: number, height: number, p: Palette, wood: THREE.Material): THREE.Group {
  const corner = wallAngle(k) + Math.PI / 6;
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, height, 0.55), wood);
  pillar.position.set(-Math.sin(corner) * SIDE, height / 2, -Math.cos(corner) * SIDE);
  pillar.rotation.y = corner;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.72), new THREE.MeshPhysicalMaterial({ color: p.brass, metalness: 1, roughness: 0.25, clearcoat: 0.3 }));
  top.position.set(pillar.position.x, height + 0.1, pillar.position.z);
  top.rotation.y = corner;
  group.add(shadowed(pillar), shadowed(top));
  return group;
}

export function wallMaterials(p: Palette) {
  return {
    panel: woodMaterial(woodBase(p).multiplyScalar(0.5), 53, [3, 2], false, 0.85),
    cap: woodMaterial(woodBase(p).multiplyScalar(1.1), 61, [3, 1], false, 0.45),
    pillar: woodMaterial(woodBase(p).multiplyScalar(0.9), 59, [1, 4], false, 0.5),
  };
}

interface Floater {
  mesh: THREE.Mesh;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
}

// Books that drift around the core like magic. Each shows its real cover (or a made-up one) and turns towards the viewer.
export function buildFloaters(books: HallBook[], p: Palette): { group: THREE.Group; update(time: number, still: boolean, viewer: THREE.Vector3): void } {
  const group = new THREE.Group();
  const chosen = [...books.filter((b) => b.cover), ...books.filter((b) => !b.cover)].slice(0, 12);
  const paper = new THREE.MeshStandardMaterial({ color: p.ink.clone().lerp(p.surface, 0.35), roughness: 0.9 });
  const back = new THREE.MeshStandardMaterial({ color: p.surface.clone().lerp(p.brass, 0.4), roughness: 0.6 });

  const floaters: Floater[] = chosen.map((book, i) => {
    const hash = titleHash(book.title);
    const cover = new THREE.MeshStandardMaterial({ map: placeholderCover(book.title, book.author ?? book.shelf, hash, p), roughness: 0.5, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.14 });
    cover.emissiveMap = cover.map;
    if (book.cover) {
      loadImage(book.cover, (texture) => {
        cover.map = texture;
        cover.emissiveMap = texture;
        cover.needsUpdate = true;
      });
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.12, 0.12), [paper, paper, paper, paper, cover, back]);
    mesh.castShadow = true;
    group.add(mesh);
    return {
      mesh,
      angle: (i / chosen.length) * Math.PI * 2,
      radius: 4.6 + (i % 3) * 1.25,
      height: 2.8 + (i % 4) * 0.85,
      speed: 0.1 + (i % 3) * 0.03,
      phase: i * 1.7,
    };
  });

  const look = new THREE.Vector3();
  function place(time: number, still: boolean, viewer: THREE.Vector3) {
    for (const f of floaters) {
      const a = f.angle + (still ? 0 : time * f.speed);
      const bob = still ? 0 : Math.sin(time * 0.9 + f.phase) * 0.35;
      f.mesh.position.set(Math.cos(a) * f.radius, f.height + bob, Math.sin(a) * f.radius);
      f.mesh.lookAt(look.copy(viewer).sub(group.position));
      f.mesh.rotateZ(still ? 0 : Math.sin(time * 0.8 + f.phase) * 0.14);
      f.mesh.rotateY(still ? 0 : Math.sin(time * 0.6 + f.phase) * 0.35);
    }
  }
  return { group, update: place };
}

// Sparkles that rise and swirl through the room.
export function buildSparkles(p: Palette, height: number, count = 320): { points: THREE.Points; update(time: number, dt: number, still: boolean): void } {
  const positions = new Float32Array(count * 3);
  const seeds = Array.from({ length: count }, (_, i) => ({
    angle: Math.random() * Math.PI * 2,
    radius: 0.8 + Math.random() * 8,
    y: Math.random() * height,
    rise: 0.15 + Math.random() * 0.4,
    spin: 0.05 + Math.random() * 0.18,
    i,
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.2, map: glowSprite(), color: p.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, toneMapped: false }),
  );
  points.frustumCulled = false;

  function write() {
    for (const s of seeds) {
      positions[s.i * 3] = Math.cos(s.angle) * s.radius;
      positions[s.i * 3 + 1] = s.y;
      positions[s.i * 3 + 2] = Math.sin(s.angle) * s.radius;
    }
    geometry.attributes.position.needsUpdate = true;
  }
  write();
  return {
    points,
    update(_time, dt, still) {
      if (still) return;
      for (const s of seeds) {
        s.angle += s.spin * dt;
        s.y += s.rise * dt;
        if (s.y > height) s.y = 0.3;
      }
      write();
    },
  };
}
