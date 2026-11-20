import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildBay, makeMaterials, type Bay, type HallBook } from "./hallBay";
import { APOTHEM, BAYS_PER_TIER, TIER_H, WALLS, bayPlace, wallAngle } from "./hallLayout";
import { buildFloaters, buildFloor, buildPillar, buildSparkles, buildWall, wallMaterials, type WallParts } from "./hallMagic";
import { buildConduits, buildCoreDevice } from "./coreDevice";
import { createOrbit, type View } from "./orbit";
import { createStage } from "./stage";
import { readPalette } from "./theme";

export type { HallBook } from "./hallBay";

export interface HallOptions {
  container: HTMLElement;
  books: HallBook[];
  shelves: string[];
  still: boolean; // reduced motion: nothing drifts, spins or sparkles
  onHover(info: { title: string; sub: string; x: number; y: number } | null): void;
  onFocus(shelf: string | null): void; // the visitor clicked a shelf
  onOpenBook(slug: string): void;
}

export interface HallHandle {
  focus(shelf: string | null): void;
  dispose(): void;
}

// The Library as a hexagonal hall you can turn around: a bookcase per shelf on six walls, a glowing core in the
// middle that powers them, books drifting through the air. Walls between you and the middle lower themselves.
export function createLibraryHall(opts: HallOptions): HallHandle {
  const { container, books, shelves, still } = opts;
  const palette = readPalette();
  const stage = createStage(container, { fov: 36, shadows: true, bloom: { strength: 0.5, radius: 0.65, threshold: 0.92 } });
  const { scene, camera, canvas, renderer } = stage;
  scene.background = palette.bg;
  scene.fog = new THREE.Fog(palette.bg, 45, 90);

  // Reflections for the brass and polished wood come from a built-in studio (no image file needed).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.3;

  const realTiers = Math.max(1, Math.ceil(shelves.length / BAYS_PER_TIER));
  const totalTiers = realTiers + 1; // plus one decorative floor on top
  const wallHeight = totalTiers * TIER_H + 0.2;

  // Light: a warm key light that casts soft shadows, a cool fill from the other side, and the core's own glow.
  scene.add(new THREE.HemisphereLight(palette.ink, palette.surface, 0.42));
  const key = new THREE.DirectionalLight(palette.brass.clone().lerp(palette.ink, 0.6), 1.6);
  key.position.set(6, 24, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 5, far: 70 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  scene.add(key);
  const fill = new THREE.DirectionalLight(palette.glow.clone().lerp(palette.ink, 0.7), 0.45);
  fill.position.set(-14, 16, -12);
  scene.add(fill);

  scene.add(buildFloor(palette));

  // Six walls, each a group holding its bookcases, and six corner pillars.
  const materials = makeMaterials(palette);
  const wallMats = wallMaterials(palette);
  const walls: (WallParts & { height: number })[] = [];
  const pillars: THREE.Group[] = [];
  for (let k = 0; k < WALLS; k++) {
    const parts = buildWall(k, wallHeight, wallMats.panel, wallMats.cap);
    scene.add(parts.section, parts.skirting);
    walls.push({ ...parts, height: 1 });
    const pillar = buildPillar(k, wallHeight, palette, wallMats.pillar);
    scene.add(pillar);
    pillars.push(pillar);
  }

  const bays: Bay[] = [];
  const bayWall: number[] = [];
  for (let i = 0; i < totalTiers * BAYS_PER_TIER; i++) {
    const shelf = i < shelves.length ? shelves[i] : null;
    const bay = buildBay(i, shelf, shelf ? books.filter((b) => b.shelf === shelf) : [], palette, materials);
    const place = bayPlace(i);
    bay.group.position.copy(place.position);
    bay.group.rotation.y = place.phi;
    walls[place.wall].section.add(bay.group);
    bays.push(bay);
    bayWall.push(place.wall);
  }

  // The glowing core and the glowing channels that run from it to every real shelf.
  const core = buildCoreDevice(palette);
  scene.add(core.group);
  const conduits = buildConduits(
    palette,
    core.radius,
    shelves.map((_, i) => {
      const place = bayPlace(i);
      return place.position.clone().addScaledVector(place.inward, 1.35).setY(0);
    }),
  );
  scene.add(conduits.group);

  const floaters = buildFloaters(books, palette);
  scene.add(floaters.group);
  const sparkles = buildSparkles(palette, wallHeight - 1);
  scene.add(sparkles.points);

  const home: View = { position: new THREE.Vector3(0, 19, 28), target: new THREE.Vector3(0, 3, 0), fov: 36 };
  const orbit = createOrbit(camera, canvas, home, still);
  let focused: number | null = null;
  let hoveredBay: number | null = null;
  let hoveredBook: THREE.Mesh | null = null;

  // A close-up in front of one bookcase, nudged so it sits on the left (the side panel opens on the right).
  function focusBay(index: number | null) {
    focused = index;
    if (index === null) {
      orbit.release();
      return;
    }
    const place = bayPlace(index);
    const centre = place.position.clone().add(new THREE.Vector3(0, 1.9, 0)).addScaledVector(place.right, 2.2);
    orbit.glideTo({ position: centre.clone().addScaledVector(place.inward, 9).add(new THREE.Vector3(0, 0.3, 0)), target: centre, fov: 42 });
  }

  // Pointer: hover and click. Dragging belongs to the orbit controls; a click is a press that barely moved.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let inside = false;
  let down = { x: 0, y: 0 };
  let clientX = 0;
  let clientY = 0;

  function track(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
    track(e);
  };
  const onMove = (e: PointerEvent) => {
    inside = true;
    track(e);
  };
  const onUp = (e: PointerEvent) => {
    if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) return;
    inside = true;
    track(e);
    pick();
    if (focused !== null && hoveredBook) {
      opts.onOpenBook(hoveredBook.userData.slug as string);
    } else if (hoveredBay !== null && hoveredBay !== focused) {
      focusBay(hoveredBay);
      opts.onFocus(bays[hoveredBay].shelf);
    }
  };
  const onLeave = () => {
    inside = false;
    opts.onHover(null);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  // Only bookcases on standing walls can be pointed at.
  function pick() {
    hoveredBay = null;
    hoveredBook = null;
    if (!inside) return;
    const targets: THREE.Object3D[] = [];
    for (const bay of bays) if (bay.picker && walls[bayWall[bay.index]].height > 0.95) targets.push(bay.picker, ...bay.books);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit?.object.userData.type === "book") {
      hoveredBay = hit.object.userData.bay as number;
      if (focused === hoveredBay) hoveredBook = hit.object as THREE.Mesh;
    } else if (hit?.object.userData.type === "bay") {
      hoveredBay = hit.object.userData.index as number;
    }
  }

  function showHover() {
    canvas.style.cursor = hoveredBook || (hoveredBay !== null && hoveredBay !== focused) ? "pointer" : "grab";
    if (hoveredBook) {
      opts.onHover({ title: hoveredBook.userData.title as string, sub: (hoveredBook.userData.author as string | null) ?? "", x: clientX, y: clientY });
    } else if (hoveredBay !== null && hoveredBay !== focused) {
      const shelf = bays[hoveredBay].shelf;
      const count = books.filter((b) => b.shelf === shelf).length;
      opts.onHover({ title: shelf ?? "", sub: `${count} ${count === 1 ? "book" : "books"} · click to open`, x: clientX, y: clientY });
    } else if (inside) {
      opts.onHover(null);
    }
  }

  // A wall goes down (leaving a low skirting) when the camera stands outside it, so the room is open towards you.
  // Inside the room, for a close-up, every wall stays up.
  function lowerWalls(dt: number) {
    walls.forEach((wall, k) => {
      const phi = wallAngle(k);
      const outside = -Math.sin(phi) * camera.position.x - Math.cos(phi) * camera.position.z - APOTHEM;
      const want = outside > 2 ? 0 : 1;
      wall.height += (want - wall.height) * Math.min(1, dt * 5);
      wall.section.scale.y = Math.max(wall.height, 0.001);
      wall.section.visible = wall.height > 0.02;
    });
    pillars.forEach((pillar, k) => {
      const h = Math.max(walls[k].height, walls[(k + 1) % WALLS].height);
      pillar.scale.y = Math.max(h, 0.06);
    });
  }

  stage.onFrame((time, dt) => {
    pick();
    showHover();
    orbit.update(dt);
    lowerWalls(dt);
    for (const bay of bays) {
      if (!bay.picker) continue;
      const want = bay.index === focused ? 0.45 : bay.index === hoveredBay ? 1 : 0;
      bay.setGlow(bay.glow + (want - bay.glow) * Math.min(1, dt * 8));
      conduits.setLevel(bay.index, bay.index === focused ? 1.5 : bay.index === hoveredBay ? 1 : 0);
      // A book you point at slides out of its shelf a little.
      for (const book of bay.books) {
        const z = (book.userData.z as number) + (book === hoveredBook ? 0.28 : 0);
        book.position.z += (z - book.position.z) * Math.min(1, dt * 10);
      }
    }
    core.update(time, still);
    conduits.update(time, dt, still);
    // While a shelf is open, the flying books rise out of the way of the close-up.
    const lift = focused === null ? 0 : 9;
    floaters.group.position.y += (lift - floaters.group.position.y) * Math.min(1, dt * 2.5);
    floaters.update(time, still, camera.position);
    sparkles.update(time, dt, still);
  });

  return {
    focus(shelf) {
      const index = shelf === null ? -1 : shelves.indexOf(shelf);
      focusBay(index === -1 ? null : index);
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      orbit.dispose();
      pmrem.dispose();
      environment.dispose();
      stage.dispose();
    },
  };
}
