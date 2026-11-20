import * as THREE from "three";
import { glowSprite } from "./textures";
import type { Palette } from "./theme";

// The glowing core in the middle of the library, built like a real device:
// a bevelled stone plinth with brass inlays, a turned column, three brass claws that hold a cut crystal,
// two gimbal rings that keep it steady, a slowly turning rune ring, and a soft pool of light on the floor.

function hexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let j = 0; j <= 6; j++) {
    const a = (j * Math.PI) / 3;
    if (j === 0) shape.moveTo(radius * Math.cos(a), radius * Math.sin(a));
    else shape.lineTo(radius * Math.cos(a), radius * Math.sin(a));
  }
  return shape;
}

// A flat hexagonal band (outer edge minus inner edge), used for the brass inlays and the glowing engravings.
function hexBand(outer: number, inner: number, depth: number, material: THREE.Material): THREE.Mesh {
  const shape = hexShape(outer);
  shape.holes.push(hexShape(inner));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

// One step of the plinth with softly rounded (bevelled) edges.
function hexStep(radius: number, height: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(hexShape(radius - 0.06), {
    depth: height - 0.12,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.06, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A radial glow painted on the floor around the plinth: light spilling from the crystal.
function lightPool(p: Palette, radius: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), color: p.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}

const CORE_SCALE = 0.9; // the size of the whole device

export interface CoreDevice {
  group: THREE.Group;
  radius: number; // the plinth's outer radius, where the floor channels start
  update(time: number, still: boolean): void;
}

export function buildCoreDevice(p: Palette): CoreDevice {
  const group = new THREE.Group();

  const stone = new THREE.MeshStandardMaterial({ color: p.surface.clone().lerp(p.inkDim, 0.12), roughness: 0.62, metalness: 0.15 });
  const steel = new THREE.MeshPhysicalMaterial({ color: p.surface.clone().multiplyScalar(1.6), roughness: 0.32, metalness: 0.9, clearcoat: 0.4 });
  const brass = new THREE.MeshPhysicalMaterial({ color: p.brass, roughness: 0.22, metalness: 1, clearcoat: 0.35, clearcoatRoughness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color: p.glow.clone().multiplyScalar(1.6), toneMapped: false });
  const softGlow = new THREE.MeshBasicMaterial({ color: p.glow, toneMapped: false, transparent: true, opacity: 0.55 });

  // The plinth: three bevelled steps, each with a brass inlay at its edge.
  const steps: [number, number, THREE.Material][] = [
    [3.5, 0.3, stone],
    [2.75, 0.28, stone],
    [2.0, 0.32, steel],
  ];
  let y = 0;
  for (const [radius, height, material] of steps) {
    const step = hexStep(radius, height, material);
    step.position.y = y;
    const inlay = hexBand(radius - 0.1, radius - 0.22, 0.02, brass);
    inlay.position.y = y + height + 0.001;
    group.add(step, inlay);
    y += height;
  }
  const top = y;

  // Glowing engravings on the top step: a hexagon line and six rune marks pointing at the walls.
  const engraving = hexBand(1.55, 1.49, 0.012, glow);
  engraving.position.y = top + 0.002;
  group.add(engraving);
  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI) / 3 + Math.PI / 6;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.05), glow);
    mark.position.set(Math.cos(a) * 1.78, top + 0.008, -Math.sin(a) * 1.78);
    mark.rotation.y = a;
    group.add(mark);
  }

  // The turned column: a lathe profile (like wood turned on a lathe), in dark steel with brass rings.
  const profile = [
    [0.62, 0], [0.62, 0.1], [0.46, 0.18], [0.36, 0.34], [0.29, 0.7], [0.26, 1.2], [0.3, 1.42], [0.42, 1.55], [0.5, 1.64], [0.5, 1.72], [0, 1.72],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const column = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), steel);
  column.position.y = top;
  column.castShadow = true;
  group.add(column);
  for (const [h, r] of [[0.16, 0.5], [1.56, 0.46]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 12, 64), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = top + h;
    group.add(ring);
  }
  const cradle = top + 1.72;

  // Three brass claws rise from the column and curve in to hold the crystal.
  for (let j = 0; j < 3; j++) {
    const a = (j * 2 * Math.PI) / 3 + Math.PI / 2;
    const at = (r: number, h: number) => new THREE.Vector3(Math.cos(a) * r, cradle + h, Math.sin(a) * r);
    const curve = new THREE.CatmullRomCurve3([at(0.32, -0.02), at(0.82, 0.5), at(0.98, 1.3), at(0.84, 2.0), at(0.56, 2.3)]);
    const claw = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.034, 12, false), brass);
    claw.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), brass);
    tip.position.copy(at(0.56, 2.3));
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glow);
    pad.position.copy(at(0.98, 1.3));
    group.add(claw, tip, pad);
  }

  // The crystal: a cut hexagonal gem (clear, slightly rainbow) with a bright core, inside two gimbal rings.
  const heart = new THREE.Group();
  heart.position.y = cradle + 1.35;
  const gem = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(0, -1.05), new THREE.Vector2(0.46, -0.5), new THREE.Vector2(0.58, 0), new THREE.Vector2(0.46, 0.6), new THREE.Vector2(0, 1.25)], 6),
    new THREE.MeshPhysicalMaterial({
      color: p.glow,
      emissive: p.glow,
      emissiveIntensity: 0.28,
      transmission: 0.85,
      thickness: 1.4,
      ior: 1.55,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      iridescence: 0.6,
      iridescenceIOR: 1.3,
      attenuationColor: p.glow,
      attenuationDistance: 1.8,
      flatShading: true,
    }),
  );
  gem.scale.setScalar(0.72);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshBasicMaterial({ color: p.glow.clone().multiplyScalar(3.2), toneMapped: false }));

  // A real gimbal: the outer ring turns round the upright axis; the inner ring hangs on two pins and swings inside it.
  // Each ring is a fine double rim, with small studs on the outer one.
  const gimbal = new THREE.Group();
  for (const z of [-0.022, 0.022]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.011, 12, 160), brass);
    rim.position.z = z;
    gimbal.add(rim);
  }
  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI) / 3 + Math.PI / 6;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), brass);
    stud.position.set(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0);
    gimbal.add(stud);
  }
  const swing = new THREE.Group();
  for (const z of [-0.016, 0.016]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.009, 12, 160), brass);
    rim.position.z = z;
    swing.add(rim);
  }
  for (const side of [-1, 1]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12), brass);
    pin.rotation.z = Math.PI / 2;
    pin.position.x = side * 0.73;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), brass);
    cap.position.x = side * 0.81;
    gimbal.add(pin, cap);
  }
  gimbal.add(swing);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: p.glow, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.set(2.2, 2.2, 1);
  const light = new THREE.PointLight(p.glow, 12, 8, 2);
  heart.add(gem, core, gimbal, halo, light);
  group.add(heart);

  // A thin rune ring floating just above the plinth, turning slowly.
  const runes = new THREE.Group();
  runes.position.y = top + 0.4;
  const runeRing = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.34, 128), softGlow);
  runeRing.rotation.x = -Math.PI / 2;
  runes.add(runeRing);
  for (let j = 0; j < 24; j++) {
    const a = (j * Math.PI * 2) / 24;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(j % 4 === 0 ? 0.22 : 0.1, 0.01, 0.03), softGlow);
    tick.position.set(Math.cos(a) * 2.45, 0, Math.sin(a) * 2.45);
    tick.rotation.y = -a;
    runes.add(tick);
  }
  group.add(runes, lightPool(p, 6.5));

  group.scale.setScalar(CORE_SCALE);
  return {
    group,
    radius: 3.5 * CORE_SCALE,
    update(time, still) {
      if (still) return;
      gem.rotation.y = time * 0.35;
      heart.position.y = cradle + 1.35 + Math.sin(time * 0.9) * 0.07;
      core.scale.setScalar(1 + Math.sin(time * 2.4) * 0.08);
      gimbal.rotation.y = time * 0.35;
      swing.rotation.x = time * 0.6;
      runes.rotation.y = -time * 0.08;
    },
  };
}

export interface Conduits {
  group: THREE.Group;
  setLevel(index: number, level: number): void; // 0 = resting, 1 = hovered, 2 = open
  update(time: number, dt: number, still: boolean): void;
}

// Glowing channels set into the floor, running from the plinth to each real bookcase, with pulses of light
// travelling outwards: the core powers the shelves. A channel brightens when its shelf is pointed at or open.
export function buildConduits(p: Palette, from: number, ends: THREE.Vector3[]): Conduits {
  const group = new THREE.Group();
  const pulseGeometry = new THREE.SphereGeometry(0.07, 12, 8);
  const lines = ends.map((end, index) => {
    const dir = new THREE.Vector3(end.x, 0, end.z).normalize();
    const start = dir.clone().multiplyScalar(from + 0.1);
    const length = start.distanceTo(new THREE.Vector3(end.x, 0, end.z));
    const material = new THREE.MeshBasicMaterial({ color: p.glow, toneMapped: false, transparent: true, opacity: 0.22 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, length), material);
    line.position.set((start.x + end.x) / 2, 0.012, (start.z + end.z) / 2);
    line.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(line);
    const pulseMaterial = new THREE.MeshBasicMaterial({ color: p.glow.clone().multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.8 });
    const pulses = [0, 0.5].map((offset) => {
      const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
      group.add(pulse);
      return { pulse, offset: offset + (index % 3) * 0.13 };
    });
    return { material, pulseMaterial, start, end: new THREE.Vector3(end.x, 0.03, end.z), pulses, level: 0, shown: 0 };
  });

  return {
    group,
    setLevel(index, level) {
      if (lines[index]) lines[index].level = level;
    },
    update(time, dt, still) {
      for (const line of lines) {
        line.shown += (line.level - line.shown) * Math.min(1, dt * 6);
        line.material.opacity = 0.22 + line.shown * 0.3;
        line.pulseMaterial.opacity = 0.55 + line.shown * 0.2;
        for (const { pulse, offset } of line.pulses) {
          const t = still ? offset : (time * (0.18 + line.shown * 0.12) + offset) % 1;
          pulse.position.lerpVectors(line.start, line.end, t);
          pulse.position.y = 0.03;
          pulse.scale.setScalar(0.8 + line.shown * 0.5);
        }
      }
    },
  };
}
