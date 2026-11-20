import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FRAME_H, FRAME_W, buildFrame, lightPool, type Frame, type FrameCert } from "./galleryFrame";
import { HALL_H, buildHall, plaque, type GalleryWall } from "./galleryRoom";
import { createOrbit, type View } from "./orbit";
import { createStage } from "./stage";
import { readPalette } from "./theme";
import { lowerWalls } from "./walls";

export type { FrameCert } from "./galleryFrame";

export interface GalleryStage {
  name: string; // e.g. "High school"
  certs: FrameCert[]; // oldest first
}

export interface GalleryOptions {
  container: HTMLElement;
  stages: GalleryStage[];
  still: boolean;
  onHover(info: { title: string; sub: string; x: number; y: number } | null): void;
  onFocus(stage: string | null): void;
  onOpenCert(slug: string): void;
}

const GAP_X = 0.5;
const ROW_H = FRAME_H + 0.62; // a frame, its label and some wall

const rowCount = (count: number) => (count <= 5 ? 1 : count <= 12 ? 2 : 3);

interface Hung {
  stage: number;
  wall: GalleryWall;
  width: number; // how wide the hang is
  centreY: number;
  frames: { frame: Frame; cert: FrameCert }[];
  picker: THREE.Mesh;
}

// Slots in a salon hang: rows and columns centred on the wall. Highlights take the middle slots,
// everything else follows in date order from top left.
function layout(count: number): { slots: THREE.Vector2[]; width: number; centreY: number } {
  const rows = rowCount(count);
  const cols = Math.ceil(count / rows);
  const width = cols * FRAME_W + (cols - 1) * GAP_X;
  const centreY = rows === 1 ? 2.4 : rows === 2 ? 2.6 : 3.0;
  const slots: THREE.Vector2[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, count - r * cols);
    const rowWidth = inRow * FRAME_W + (inRow - 1) * GAP_X;
    for (let c = 0; c < inRow; c++) {
      slots.push(new THREE.Vector2(-rowWidth / 2 + FRAME_W / 2 + c * (FRAME_W + GAP_X), centreY + ((rows - 1) / 2 - r) * ROW_H));
    }
  }
  return { slots, width, centreY };
}

function order(certs: FrameCert[], slots: THREE.Vector2[], centreY: number): FrameCert[] {
  const byCentre = slots.map((s, i) => ({ i, d: Math.abs(s.x) + Math.abs(s.y - centreY) * 1.5 })).sort((a, b) => a.d - b.d);
  const result: (FrameCert | undefined)[] = new Array(slots.length);
  const highlights = certs.filter((c) => c.highlight);
  highlights.forEach((cert, k) => (result[byCentre[k].i] = cert));
  const rest = certs.filter((c) => !c.highlight);
  let next = 0;
  for (let i = 0; i < result.length; i++) if (!result[i]) result[i] = rest[next++];
  return result as FrameCert[];
}

// The Certificates page as a museum hall: one wall per life stage, certificates in gilt frames under picture lights.
export function createCertificateGallery(opts: GalleryOptions): { focus(stage: string | null): void; dispose(): void } {
  const { container, stages, still } = opts;
  const p = readPalette();
  const stage = createStage(container, { fov: 36, shadows: true, bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 } });
  const { scene, camera, canvas, renderer } = stage;
  scene.background = p.bg;
  scene.fog = new THREE.Fog(p.bg, 45, 90);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.45;

  // Soft daylight from a skylight above, plus a warm fill.
  scene.add(new THREE.HemisphereLight(p.ink, p.surface, 0.45));
  const sky = new THREE.DirectionalLight(p.ink.clone().lerp(p.brass, 0.25), 1.1);
  sky.position.set(4, 22, 10);
  sky.castShadow = true;
  sky.shadow.mapSize.set(2048, 2048);
  Object.assign(sky.shadow.camera, { left: -17, right: 17, top: 12, bottom: -12, near: 5, far: 60 });
  sky.shadow.bias = -0.0004;
  sky.shadow.normalBias = 0.04;
  scene.add(sky);

  const hall = buildHall(p);
  scene.add(hall.group);

  // The biggest stage gets the long back wall; the others go to the left and right walls.
  const bySize = stages.map((s, i) => i).sort((a, b) => stages[b].certs.length - stages[a].certs.length);
  const wallFor = new Map<number, GalleryWall>();
  bySize.forEach((stageIndex, k) => wallFor.set(stageIndex, hall.walls[Math.min(k, 2)]));

  const gilt = new THREE.MeshPhysicalMaterial({ color: p.brass, metalness: 1, roughness: 0.3, clearcoat: 0.4 });
  const mat = new THREE.MeshStandardMaterial({ color: p.ink.clone().multiplyScalar(0.95), roughness: 0.9 });
  let frameIndex = 0;
  const allFrames: { frame: Frame; cert: FrameCert; hung: number }[] = [];
  const hangs: Hung[] = stages.map((s, stageIndex) => {
    const wall = wallFor.get(stageIndex)!;
    const { slots, width, centreY } = layout(s.certs.length);
    const placed = order(s.certs, slots, centreY);
    const frames = placed.map((cert, i) => {
      const frame = buildFrame(cert, frameIndex++, p, gilt, mat);
      frame.group.position.set(slots[i].x, slots[i].y, 0.04);
      frame.group.add(lightPool(p, cert.highlight));
      wall.anchor.add(frame.group);
      allFrames.push({ frame, cert, hung: stageIndex });
      if (cert.highlight) {
        const spot = new THREE.SpotLight(p.ink, 18, 6, 0.42, 0.6, 1.5);
        spot.position.set(slots[i].x, Math.min(HALL_H - 0.4, slots[i].y + 2.6), 1.6);
        spot.target.position.set(slots[i].x, slots[i].y, 0);
        wall.anchor.add(spot, spot.target);
      }
      return { frame, cert };
    });
    const rows = rowCount(s.certs.length);
    const sign = plaque(s.name, s.certs.length, p);
    sign.position.set(0, Math.min(HALL_H - 0.95, centreY + (rows * ROW_H) / 2 + 0.35), 0.03);
    wall.anchor.add(sign);
    const picker = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.8, rows * ROW_H + 0.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    picker.position.set(0, centreY, 0.2);
    picker.userData = { type: "wall", index: stageIndex };
    wall.anchor.add(picker);
    return { stage: stageIndex, wall, width, centreY, frames, picker };
  });

  // Aimed low enough that the far wall's top sits near the top of the view (no empty band above it).
  const home: View = { position: new THREE.Vector3(0, 10, 17), target: new THREE.Vector3(0, 0.6, -3.5), fov: 40 };
  const orbit = createOrbit(camera, canvas, home, still);
  let focused: number | null = null;
  let hoveredWall: number | null = null;
  let hoveredFrame: (typeof allFrames)[number] | null = null;

  // Stand back from the wall far enough to see the whole hang, shifted so it sits left of the side panel.
  function focusStage(index: number | null) {
    focused = index;
    if (index === null) {
      orbit.release();
      return;
    }
    const hang = hangs[index];
    hang.wall.anchor.updateWorldMatrix(true, false);
    const centre = hang.wall.anchor.localToWorld(new THREE.Vector3(0, hang.centreY, 0));
    const inward = new THREE.Vector3(0, 0, 1).transformDirection(hang.wall.anchor.matrixWorld);
    const along = new THREE.Vector3(1, 0, 0).transformDirection(hang.wall.anchor.matrixWorld);
    const shift = along.multiplyScalar(hang.width * 0.22);
    const distance = Math.max(6.5, hang.width * 0.95);
    orbit.glideTo({ position: centre.clone().addScaledVector(inward, distance).add(shift).add(new THREE.Vector3(0, 0.4, 0)), target: centre.clone().add(shift), fov: 40 });
  }

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
  function pick() {
    hoveredWall = null;
    hoveredFrame = null;
    if (!inside) return;
    raycaster.setFromCamera(pointer, camera);
    const targets: THREE.Object3D[] = [];
    for (const hang of hangs) {
      if (hang.wall.height < 0.95) continue;
      if (hang.stage === focused) targets.push(...hang.frames.map((f) => f.frame.picker));
      else targets.push(hang.picker);
    }
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;
    if (hit.object.userData.type === "frame") hoveredFrame = allFrames[hit.object.userData.index as number];
    else hoveredWall = hit.object.userData.index as number;
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
    if (hoveredFrame) opts.onOpenCert(hoveredFrame.cert.slug);
    else if (hoveredWall !== null) {
      focusStage(hoveredWall);
      opts.onFocus(stages[hoveredWall].name);
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

  stage.onFrame((_time, dt) => {
    pick();
    canvas.style.cursor = hoveredFrame || hoveredWall !== null ? "pointer" : "grab";
    if (hoveredFrame) {
      const c = hoveredFrame.cert;
      opts.onHover({ title: c.title, sub: `${c.issuer} · ${c.date.slice(0, 4)} · click to view`, x: clientX, y: clientY });
    } else if (hoveredWall !== null) {
      const n = stages[hoveredWall].certs.length;
      opts.onHover({ title: stages[hoveredWall].name, sub: `${n} ${n === 1 ? "certificate" : "certificates"} · click to visit`, x: clientX, y: clientY });
    } else if (inside) {
      opts.onHover(null);
    }
    orbit.update(dt);
    lowerWalls(hall.walls, camera, dt);
    // A frame you point at comes a little way off the wall.
    for (const item of allFrames) {
      const want = item === hoveredFrame ? 1 : 0;
      item.frame.lift += (want - item.frame.lift) * Math.min(1, dt * 10);
      item.frame.group.position.z = 0.04 + item.frame.lift * 0.18;
    }
  });

  return {
    focus(name) {
      const index = name === null ? -1 : stages.findIndex((s) => s.name === name);
      focusStage(index === -1 ? null : index);
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
