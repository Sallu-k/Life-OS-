import * as THREE from "three";
import { createScreen, marqueeTexture, type CabinetScreen, type ScreenGame } from "./arcadeScreen";
import type { Palette } from "./theme";

// An upright arcade cabinet, drawn from its side profile like a real one:
// base, control panel sticking out, a screen tilted back, and a marquee hood on top. Its front faces +z.
const WIDTH = 1.45;
const PROFILE: [number, number][] = [
  // [depth (z), height (y)], going round the side outline
  [0, 0], [0.95, 0], [0.95, 1.0], [1.18, 1.06], [1.18, 1.18], [0.74, 1.32], [0.68, 1.36], [0.5, 2.46], [0.88, 2.6], [0.88, 3.12], [0, 3.12],
];
const SCREEN_LOW = new THREE.Vector2(0.68, 1.36); // bottom edge of the screen face (z, y)
const SCREEN_HIGH = new THREE.Vector2(0.5, 2.46); // top edge of the screen face (z, y)

export interface Cabinet {
  group: THREE.Group;
  screen: CabinetScreen;
  screenMesh: THREE.Mesh;
  body: THREE.Mesh;
  glow: number;
  setGlow(value: number): void;
  screenCentre: THREE.Vector3; // in the cabinet's own space
  screenNormal: THREE.Vector3; // which way the screen faces, in the cabinet's own space
}

function sideShape(): THREE.Shape {
  const shape = new THREE.Shape();
  PROFILE.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  return shape;
}

// The neon tube that runs round the outline of one side.
function trimTube(x: number, material: THREE.Material): THREE.Mesh {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const points = [...PROFILE, PROFILE[0]].map(([z, y]) => new THREE.Vector3(x, y, z));
  for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  return new THREE.Mesh(new THREE.TubeGeometry(path, 240, 0.018, 6, false), material);
}

// `games` empty = a decorative cabinet in attract mode.
export function buildCabinet(name: string, games: ScreenGame[], accent: THREE.Color, p: Palette, index: number): Cabinet {
  const group = new THREE.Group();

  const bodyGeometry = new THREE.ExtrudeGeometry(sideShape(), { depth: WIDTH, bevelEnabled: false });
  bodyGeometry.rotateY(-Math.PI / 2);
  bodyGeometry.translate(WIDTH / 2, 0, 0);
  const body = new THREE.Mesh(bodyGeometry, new THREE.MeshPhysicalMaterial({ color: p.bg.clone().lerp(p.surface, 0.6), roughness: 0.35, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = { type: "cabinet", index };
  group.add(body);

  // Side art: a coloured stripe on each side panel.
  const art = new THREE.MeshStandardMaterial({ color: accent.clone().multiplyScalar(0.35), roughness: 0.5 });
  for (const x of [-WIDTH / 2 - 0.023, WIDTH / 2 + 0.023]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.1), art);
    stripe.position.set(x, 1.5, 0.42);
    stripe.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    stripe.rotation.z = 0.25;
    group.add(stripe);
  }

  const trimMaterial = new THREE.MeshBasicMaterial({ color: accent.clone(), toneMapped: false });
  group.add(trimTube(-WIDTH / 2 - 0.025, trimMaterial), trimTube(WIDTH / 2 + 0.025, trimMaterial));

  // The screen sits on the tilted face, just in front of it.
  const up = SCREEN_HIGH.clone().sub(SCREEN_LOW);
  const length = up.length();
  const tilt = Math.atan2(up.x, up.y); // leans the screen back by the same angle as the face
  const normal = new THREE.Vector3(0, -up.x, up.y).normalize(); // out of the screen, towards the player
  const centre = new THREE.Vector3(0, (SCREEN_LOW.y + SCREEN_HIGH.y) / 2, (SCREEN_LOW.x + SCREEN_HIGH.x) / 2).addScaledVector(normal, 0.012);
  const screen = createScreen(name, games, accent, p);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.24, length - 0.12), screenMaterial);
  screenMesh.position.copy(centre);
  screenMesh.rotation.x = tilt;
  screenMesh.userData = { type: "screen", index };
  group.add(screenMesh);

  // A glass bezel frame round the screen.
  const bezel = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH - 0.08, length + 0.02),
    new THREE.MeshPhysicalMaterial({ color: p.bg, roughness: 0.15, metalness: 0.4, clearcoat: 1 }),
  );
  bezel.position.copy(centre).addScaledVector(normal, -0.004);
  bezel.rotation.x = tilt;
  group.add(bezel);

  // The marquee: a lit sign on the hood.
  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH - 0.1, 0.46),
    new THREE.MeshBasicMaterial({ map: marqueeTexture(name, games.length, accent, p), toneMapped: false }),
  );
  marquee.position.set(0, 2.86, 0.885);
  group.add(marquee);

  // The control panel: a joystick and a row of buttons.
  const panelTilt = Math.atan2(1.32 - 1.18, 1.18 - 0.74);
  const panel = new THREE.Group();
  panel.position.set(0, 1.25, 0.96);
  panel.rotation.x = panelTilt;
  const black = new THREE.MeshStandardMaterial({ color: p.bg, roughness: 0.4 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), black);
  stick.position.set(-0.36, 0.1, 0);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 12), new THREE.MeshPhysicalMaterial({ color: p.copper, roughness: 0.2, clearcoat: 1 }));
  ball.position.set(-0.36, 0.21, 0);
  panel.add(stick, ball);
  [p.glow, p.copper, p.brass, p.glow].forEach((color, i) => {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3 }));
    button.position.set(0.02 + (i % 2) * 0.14 + Math.floor(i / 2) * 0.06, 0.02, -0.05 + Math.floor(i / 2) * 0.11 - 0.05);
    panel.add(button);
  });
  group.add(panel);

  // The light the screen throws in front of the cabinet.
  const light = new THREE.PointLight(accent, games.length > 0 ? 5 : 2, 6, 2);
  light.position.copy(centre).addScaledVector(normal, 0.8);
  group.add(light);

  const cabinet: Cabinet = {
    group,
    screen,
    screenMesh,
    body,
    glow: 0,
    screenCentre: centre,
    screenNormal: normal,
    setGlow(value) {
      cabinet.glow = value;
      trimMaterial.color.copy(accent).multiplyScalar(0.55 + value * 1.6);
      screenMaterial.color.setScalar(0.82 + value * 0.25);
      light.intensity = (games.length > 0 ? 5 : 2) + value * 6;
    },
  };
  cabinet.setGlow(0);
  return cabinet;
}
