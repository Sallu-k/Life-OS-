import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildSparkles } from "./hallMagic";
import { buildPortal, type Portal, type SectionKey } from "./hubPortal";
import { createOrbit, type View } from "./orbit";
import { createStage } from "./stage";
import { readPalette } from "./theme";

export interface HubEntry {
  key: SectionKey;
  title: string;
  href: string;
  line: string; // the count line, e.g. "80 books"
}

export interface HubOptions {
  container: HTMLElement;
  entries: HubEntry[];
  still: boolean;
  onHover(info: { title: string; sub: string; x: number; y: number } | null): void;
  onEnter(href: string): void;
}

const RING = 6.2; // how far the portals stand from the middle
const HEIGHT = 2.6;

// Each section's colour comes from the home theme's --home-* variables in globals.css.
function sectionColour(key: SectionKey): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--home-${key}`).trim();
  try {
    return new THREE.Color(value || "white");
  } catch {
    return new THREE.Color(1, 1, 1);
  }
}

// The Home page hub: six hexagonal portals floating round a small crystal core, each a window into a section.
// Pointing at a portal lifts it; clicking flies the camera into it and then opens that page.
export function createPortalHub(opts: HubOptions): { dispose(): void } {
  const { container, entries, still } = opts;
  const p = readPalette();
  const stage = createStage(container, { fov: 38, shadows: false, bloom: { strength: 0.7, radius: 0.6, threshold: 0.82 } });
  const { scene, camera, canvas, renderer } = stage;
  scene.background = p.bg;
  scene.fog = new THREE.Fog(p.bg, 22, 46);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(p.ink, p.bg, 0.5));

  // A dark glossy hexagonal platform with faint rings, under everything.
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.8, 0.4, 6), new THREE.MeshStandardMaterial({ color: p.surface.clone().multiplyScalar(0.8), metalness: 0.3, roughness: 0.55 }));
  platform.position.y = -0.2;
  scene.add(platform);
  for (const r of [2.2, 4.2, 6.2, 8.4]) {
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, (_, j) => new THREE.Vector3(r * Math.cos((j * Math.PI) / 3), 0.02, r * Math.sin((j * Math.PI) / 3)))),
      new THREE.LineBasicMaterial({ color: p.inkDim, transparent: true, opacity: r === RING ? 0.45 : 0.15 }),
    );
    scene.add(ring);
  }

  // The core: a small faceted crystal inside two thin rings.
  const core = new THREE.Group();
  core.position.y = HEIGHT;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshPhysicalMaterial({ color: p.ink, emissive: p.glow, emissiveIntensity: 0.35, transmission: 0.7, thickness: 1, roughness: 0.05, clearcoat: 1, flatShading: true }),
  );
  crystal.scale.y = 1.6;
  const rings = [0.95, 1.15].map((r) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.015, 10, 128), new THREE.MeshPhysicalMaterial({ color: p.brass, metalness: 1, roughness: 0.25 }));
    core.add(ring);
    return ring;
  });
  core.add(crystal, new THREE.PointLight(p.ink, 6, 12, 2));
  scene.add(core);

  // The six portals on a ring, each with a faint beam back to the core.
  const portals: Portal[] = entries.map((entry, i) => {
    const colour = sectionColour(entry.key);
    const portal = buildPortal(entry.key, entry.title, entry.line, colour, p, i);
    const a = (i / entries.length) * Math.PI * 2 + Math.PI / 2;
    portal.group.position.set(Math.cos(a) * RING, HEIGHT, Math.sin(a) * RING);
    scene.add(portal.group);
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, HEIGHT, 0), portal.group.position.clone()]),
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.35, toneMapped: false }),
    );
    scene.add(beam);
    return portal;
  });

  const dust = buildSparkles(p, 7, 180);
  scene.add(dust.points);

  const home: View = { position: new THREE.Vector3(0, 8.5, 19.5), target: new THREE.Vector3(0, 2.2, 0), fov: 38 };
  const orbit = createOrbit(camera, canvas, home, still);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let inside = false;
  let hovered: number | null = null;
  let entering: number | null = null;
  let down = { x: 0, y: 0 };
  let clientX = 0;
  let clientY = 0;
  let timer = 0;
  const windows = portals.map((portal) => portal.window);

  function track(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    clientX = e.clientX;
    clientY = e.clientY;
  }
  function pick() {
    hovered = null;
    if (!inside || entering !== null) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(windows, false)[0];
    if (hit) hovered = hit.object.userData.index as number;
  }
  // Fly into the portal, then open its page.
  function enter(index: number) {
    entering = index;
    opts.onHover(null);
    const target = portals[index].window.getWorldPosition(new THREE.Vector3());
    const towards = camera.position.clone().sub(target).setY(0).normalize();
    orbit.glideTo({ position: target.clone().addScaledVector(towards, 1.2), target, fov: 30 });
    timer = window.setTimeout(() => opts.onEnter(entries[index].href), still ? 0 : 750);
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
    if (hovered !== null) enter(hovered);
  };
  const onLeave = () => {
    inside = false;
    opts.onHover(null);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  const look = new THREE.Vector3();
  stage.onFrame((time, dt) => {
    pick();
    canvas.style.cursor = hovered !== null ? "pointer" : "grab";
    if (hovered !== null) {
      const entry = entries[hovered];
      opts.onHover({ title: entry.title, sub: `${entry.line} · click to enter`, x: clientX, y: clientY });
    } else if (inside && entering === null) {
      opts.onHover(null);
    }
    orbit.update(dt);
    portals.forEach((portal, i) => {
      // Each portal turns (around the upright axis only) to face the camera, bobs gently, and lifts when pointed at.
      look.set(camera.position.x, portal.group.position.y, camera.position.z);
      portal.group.lookAt(look);
      const want = i === hovered || i === entering ? 1 : 0;
      portal.setGlow(portal.glow + (want - portal.glow) * Math.min(1, dt * 8));
      portal.body.position.y = (still ? 0 : Math.sin(time * 0.8 + i) * 0.12) + portal.glow * 0.35;
      portal.body.scale.setScalar(1 + portal.glow * 0.06);
    });
    if (!still) {
      crystal.rotation.y = time * 0.5;
      rings[0].rotation.set(time * 0.4, time * 0.2, 0);
      rings[1].rotation.set(0, time * 0.3, time * 0.45);
    }
    dust.update(time, dt, still);
  });

  return {
    dispose() {
      window.clearTimeout(timer);
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
