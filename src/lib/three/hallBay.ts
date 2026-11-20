import * as THREE from "three";
import { titleHash } from "@/components/Cover";
import { plateTexture, spineTexture } from "./textures";
import type { Palette } from "./theme";
import { woodMaterial } from "./wood";

export const BAY_W = 5.4;
export const BAY_H = 3.8;
const MAX_BOOKS = 26;

// What the hall needs to know about a book.
export interface HallBook {
  slug: string;
  title: string;
  author: string | null;
  shelf: string;
  cover: string | null; // public URL of the cover image, or null
}

export interface Bay {
  index: number;
  shelf: string | null; // null = a decorative bookcase, not a real shelf
  group: THREE.Group;
  picker: THREE.Mesh | null;
  books: THREE.Mesh[];
  glow: number; // 0..1, eased towards the wanted value
  setGlow(value: number): void;
}

// Materials shared by every bookcase: real-looking wood and brass.
export function makeMaterials(p: Palette) {
  const wood = p.copper.clone().lerp(p.surfaceHi, 0.35).multiplyScalar(0.72);
  return {
    wood: woodMaterial(wood, 11, [1, 1], false, 0.5),
    back: woodMaterial(wood.clone().multiplyScalar(0.55), 23, [2, 2], false, 0.8),
    brass: new THREE.MeshStandardMaterial({ color: p.brass, metalness: 1, roughness: 0.28 }),
    paper: new THREE.MeshStandardMaterial({ color: p.ink.clone().lerp(p.surface, 0.72), roughness: 0.95 }),
  };
}
export type Materials = ReturnType<typeof makeMaterials>;

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// One bookcase facing the room (its front is +z). Real shelves get their books (with titles on the spines),
// a brass name plate and a click target; decorative bookcases get dim filler books.
export function buildBay(index: number, shelf: string | null, books: HallBook[], p: Palette, m: Materials): Bay {
  const group = new THREE.Group();
  group.add(box(BAY_W, BAY_H, 0.15, m.back, 0, BAY_H / 2, -0.075));
  group.add(box(BAY_W + 0.1, 0.35, 1.1, m.wood, 0, 0.175, 0.5));
  for (const y of [0.4, 2.05, BAY_H - 0.05]) group.add(box(BAY_W, 0.1, 1.0, m.wood, 0, y - 0.05 + 0.05, 0.5));
  for (const x of [-(BAY_W / 2 - 0.07), BAY_W / 2 - 0.07]) group.add(box(0.14, BAY_H, 1.0, m.wood, x, BAY_H / 2, 0.5));
  group.add(box(BAY_W + 0.3, 0.22, 1.2, m.wood, 0, BAY_H + 0.11, 0.55));
  group.add(box(BAY_W + 0.46, 0.08, 1.32, m.wood, 0, BAY_H + 0.26, 0.55));
  for (const y of [0.45, 2.1]) group.add(box(BAY_W - 0.2, 0.025, 0.03, m.brass, 0, y, 1.0));
  group.add(box(BAY_W + 0.34, 0.03, 0.03, m.brass, 0, BAY_H + 0.01, 1.16));

  const bookMeshes: THREE.Mesh[] = [];
  const rowBase = [0.4, 2.1];
  const rowWidth = BAY_W - 0.5;
  const real = shelf !== null;
  const list = real ? books.slice(0, MAX_BOOKS) : [];
  let cursor = 0;

  for (let row = 0; row < 2; row++) {
    let x = -rowWidth / 2;
    const perRow = real ? Math.ceil(list.length / 2) : 99;
    let placed = 0;
    for (;;) {
      const book = real ? list[cursor] : undefined;
      if (real && (!book || placed >= perRow)) break;
      const seed = titleHash(book ? book.title : `${index}-${row}-${placed}`);
      const t = 0.2 + (seed % 6) * 0.045;
      const h = 1.0 + ((seed >> 4) % 6) * 0.07;
      const depth = 0.5 + ((seed >> 8) % 5) * 0.035;
      if (x + t > rowWidth / 2) break;

      const accent = seed % 2 === 0 ? p.brass : p.copper;
      let material: THREE.Material;
      if (book) {
        const color = p.surface.clone().lerp(accent, (0.35 + (seed % 35) / 100) * 0.8);
        material = new THREE.MeshStandardMaterial({ map: spineTexture(book.title, color, p), roughness: 0.55, metalness: 0.05 });
      } else {
        material = new THREE.MeshStandardMaterial({ color: p.surface.clone().lerp(accent, 0.14 + (seed % 12) / 100), roughness: 0.75 });
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, depth), [m.paper, m.paper, m.paper, m.paper, material, m.paper]);
      const front = 0.9 - ((seed >> 12) % 4) * 0.012;
      mesh.position.set(x + t / 2, rowBase[row] + h / 2, front - depth / 2);
      if (book) {
        mesh.userData = { type: "book", slug: book.slug, bay: index, title: book.title, author: book.author, z: mesh.position.z };
        bookMeshes.push(mesh);
        cursor++;
        placed++;
      }
      group.add(mesh);
      x += t + 0.015;
      if (!real) placed++;
    }
  }

  // The glow that shows when the bookcase is hovered or open: an outline and a soft wash.
  const frameMaterial = new THREE.MeshBasicMaterial({ color: p.glow, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const washMaterial = new THREE.MeshBasicMaterial({ color: p.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const frame = new THREE.Group();
  const fw = BAY_W + 0.5;
  const fh = BAY_H + 0.55;
  const fy = BAY_H / 2 + 0.12;
  frame.add(box(fw, 0.06, 0.06, frameMaterial, 0, fy + fh / 2, 1.24));
  frame.add(box(fw, 0.06, 0.06, frameMaterial, 0, fy - fh / 2, 1.24));
  frame.add(box(0.06, fh, 0.06, frameMaterial, -fw / 2, fy, 1.24));
  frame.add(box(0.06, fh, 0.06, frameMaterial, fw / 2, fy, 1.24));
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(BAY_W, BAY_H), washMaterial);
  wash.position.set(0, BAY_H / 2, 1.2);
  group.add(frame, wash);

  let picker: THREE.Mesh | null = null;
  if (real) {
    picker = new THREE.Mesh(new THREE.PlaneGeometry(BAY_W, BAY_H + 1.3), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    picker.position.set(0, (BAY_H + 1.3) / 2, 0.12);
    picker.userData = { type: "bay", index };
    group.add(picker);

    const label = plateTexture(shelf, `${books.length} ${books.length === 1 ? "book" : "books"}`, p);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(BAY_W - 0.7, 0.5),
      new THREE.MeshStandardMaterial({ map: label, emissiveMap: label, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.4 }),
    );
    plate.position.set(0, BAY_H + 0.78, 0.9);
    group.add(plate);
    for (const x of [-(BAY_W - 0.7) / 2 + 0.2, (BAY_W - 0.7) / 2 - 0.2]) group.add(box(0.025, 0.36, 0.025, m.brass, x, BAY_H + 0.56, 0.9));
  }

  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child !== picker && child !== wash) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  wash.castShadow = false;
  wash.receiveShadow = false;
  frame.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });

  const bay: Bay = {
    index,
    shelf,
    group,
    picker,
    books: bookMeshes,
    glow: 0,
    setGlow(value) {
      bay.glow = value;
      frameMaterial.opacity = value * 0.95;
      washMaterial.opacity = value * 0.05;
    },
  };
  return bay;
}
