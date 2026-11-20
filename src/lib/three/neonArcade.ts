import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCabinet, type Cabinet } from "./arcadeCabinet";
import { ROOM_D, ROOM_H, ROOM_W, buildRoom, lowerWalls } from "./arcadeRoom";
import type { ScreenGame } from "./arcadeScreen";
import { buildFloaters, buildSparkles } from "./hallMagic";
import { createOrbit, type View } from "./orbit";
import { createStage } from "./stage";
import { readPalette } from "./theme";

export interface ArcadeGroup {
  name: string; // the main genre
  games: ScreenGame[];
}

export interface ArcadeOptions {
  container: HTMLElement;
  groups: ArcadeGroup[];
  still: boolean;
  onHover(info: { title: string; sub: string; x: number; y: number } | null): void;
  onFocus(group: string | null): void;
  onOpenGame(slug: string): void;
}

export interface ArcadeHandle {
  focus(group: string | null): void;
  dispose(): void;
}

const SPACING = 4; // between real cabinets in the middle row
const ROW_Z = -3.6;
const CABINET_SCALE = 1.3; // a little larger than life, so the screens read from across the room

// The Games page as a neon arcade: one cabinet per main genre, its screen cycling through that genre's posters.
// Decorative cabinets stand along the walls; a synthwave sunset glows through the back window.
export function createNeonArcade(opts: ArcadeOptions): ArcadeHandle {
  const { container, groups, still } = opts;
  const palette = readPalette();
  const stage = createStage(container, { fov: 36, shadows: true, bloom: { strength: 0.75, radius: 0.6, threshold: 0.85 } });
  const { scene, camera, canvas, renderer } = stage;
  scene.background = palette.bg;
  scene.fog = new THREE.Fog(palette.bg, 40, 80);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.18;

  // Light: dim cool fill, a pink key light for shadows, and every screen's own glow.
  scene.add(new THREE.HemisphereLight(palette.glow.clone().lerp(palette.ink, 0.5), palette.bg, 0.35));
  const key = new THREE.DirectionalLight(palette.copper.clone().lerp(palette.ink, 0.5), 1.1);
  key.position.set(-8, 20, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 5, far: 60 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  scene.add(key);

  const room = buildRoom(palette);
  scene.add(room.group);

  const accents = [palette.copper, palette.glow, palette.brass];
  // The real cabinets, one per genre, in a row facing the camera.
  const cabinets: Cabinet[] = groups.map((group, i) => {
    const cabinet = buildCabinet(group.name, group.games, accents[i % accents.length], palette, i);
    cabinet.group.position.set((i - (groups.length - 1) / 2) * SPACING, 0, ROW_Z);
    cabinet.group.scale.setScalar(CABINET_SCALE);
    scene.add(cabinet.group);
    return cabinet;
  });

  // Decorative cabinets along the side and front walls (they lower with their wall).
  const decor: Cabinet[] = [];
  const place = (wall: number, x: number, z: number, turn: number, k: number) => {
    const cabinet = buildCabinet("Free play", [], accents[k % accents.length], palette, -1);
    cabinet.group.position.set(x, 0, z);
    cabinet.group.rotation.y = turn;
    cabinet.group.scale.setScalar(CABINET_SCALE);
    room.walls[wall].section.add(cabinet.group);
    decor.push(cabinet);
  };
  [-4.5, 0, 4.5].forEach((z, k) => {
    place(2, -ROOM_W / 2 + 0.2, z, Math.PI / 2, k);
    place(3, ROOM_W / 2 - 0.2, z, -Math.PI / 2, k + 1);
  });
  [-6, 0, 6].forEach((x, k) => place(1, x, ROOM_D / 2 - 0.2, Math.PI, k + 2));

  // Posters drifting through the air above the cabinets (they reuse the Library's flying books).
  const floaters = buildFloaters(
    groups.flatMap((g) => g.games.map((game) => ({ slug: game.slug, title: game.title, author: game.platform, shelf: g.name, cover: game.poster }))),
    palette,
  );
  floaters.group.position.y = 2.3;
  scene.add(floaters.group);
  const sparkles = buildSparkles(palette, ROOM_H - 0.5, 260);
  scene.add(sparkles.points);

  const home: View = { position: new THREE.Vector3(0, 13, 21), target: new THREE.Vector3(0, 1.8, -1.5), fov: 36 };
  const orbit = createOrbit(camera, canvas, home, still);
  let focused: number | null = null;
  let hovered: number | null = null;
  let hoveredGame: ScreenGame | null = null;

  // Close-up in front of a cabinet's screen, shifted so the cabinet sits on the left of the side panel.
  function focusCabinet(index: number | null) {
    focused = index;
    if (index === null) {
      orbit.release();
      return;
    }
    const cabinet = cabinets[index];
    const centre = cabinet.group.localToWorld(cabinet.screenCentre.clone());
    const normal = cabinet.screenNormal.clone().transformDirection(cabinet.group.matrixWorld);
    const side = new THREE.Vector3(1, 0, 0).multiplyScalar(1.15);
    orbit.glideTo({ position: centre.clone().addScaledVector(normal, 5.2).add(side).add(new THREE.Vector3(0, 0.25, 0)), target: centre.clone().add(side), fov: 40 });
  }

  // Pointer: hover and click; dragging belongs to the orbit controls.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let inside = false;
  let down = { x: 0, y: 0 };
  let clientX = 0;
  let clientY = 0;
  const targets: THREE.Object3D[] = cabinets.flatMap((c) => [c.body, c.screenMesh]);

  function track(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    clientX = e.clientX;
    clientY = e.clientY;
  }
  function pick() {
    hovered = null;
    hoveredGame = null;
    if (!inside) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;
    hovered = hit.object.userData.index as number;
    if (hit.object.userData.type === "screen" && focused === hovered && hit.uv) hoveredGame = cabinets[hovered].screen.gameAt(hit.uv);
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
    if (hoveredGame) opts.onOpenGame(hoveredGame.slug);
    else if (hovered !== null && hovered !== focused) {
      focusCabinet(hovered);
      opts.onFocus(groups[hovered].name);
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

  function showHover() {
    canvas.style.cursor = hoveredGame || (hovered !== null && hovered !== focused) ? "pointer" : "grab";
    if (hoveredGame) {
      opts.onHover({ title: hoveredGame.title, sub: `${hoveredGame.platform} · click to open`, x: clientX, y: clientY });
    } else if (hovered !== null && hovered !== focused) {
      const n = groups[hovered].games.length;
      opts.onHover({ title: groups[hovered].name, sub: `${n} ${n === 1 ? "game" : "games"} · click to play`, x: clientX, y: clientY });
    } else if (inside) {
      opts.onHover(null);
    }
  }

  let nextPage = 5;
  stage.onFrame((time, dt) => {
    pick();
    showHover();
    orbit.update(dt);
    lowerWalls(room.walls, camera, dt);
    cabinets.forEach((cabinet, i) => {
      const want = i === focused ? 0.5 : i === hovered ? 1 : 0;
      cabinet.setGlow(cabinet.glow + (want - cabinet.glow) * Math.min(1, dt * 8));
    });
    // Screens show their next page every few seconds, except the one being looked at up close.
    if (!still && time > nextPage) {
      nextPage = time + 5;
      cabinets.forEach((cabinet, i) => i !== focused && cabinet.screen.next());
    }
    if (!still) room.grid.offset.y = (room.grid.offset.y + dt * 0.25) % 1;
    const lift = focused === null ? 2.3 : 8;
    floaters.group.position.y += (lift - floaters.group.position.y) * Math.min(1, dt * 2.5);
    floaters.update(time, still, camera.position);
    sparkles.update(time, dt, still);
  });

  return {
    focus(group) {
      const index = group === null ? -1 : groups.findIndex((g) => g.name === group);
      focusCabinet(index === -1 ? null : index);
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
