import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface View {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface Orbit {
  update(dt: number): void;
  glideTo(view: View): void; // a close-up; the mouse controls pause until release()
  release(): void; // glide back to where the visitor was, then hand the mouse back
  readonly target: THREE.Vector3;
  dispose(): void;
}

// Drag to turn the room, scroll to zoom. Limited so the camera never goes under the floor or too far away.
// The room turns slowly on its own until the visitor first touches it.
export function createOrbit(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, home: View, still: boolean): Orbit {
  camera.position.copy(home.position);
  camera.fov = home.fov;
  camera.updateProjectionMatrix();

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(home.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 12;
  controls.maxDistance = 44;
  controls.minPolarAngle = 0.3; // nearly from above
  controls.maxPolarAngle = 1.3; // a little above the floor
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.autoRotate = !still;
  controls.autoRotateSpeed = 0.35;
  const stopSpin = () => {
    controls.autoRotate = false;
  };
  controls.addEventListener("start", stopSpin);
  controls.update();

  let goal: View | null = null;
  let saved: View | null = null;
  let returning = false;

  return {
    update(dt) {
      const view = goal ?? (returning ? saved : null);
      if (!view) {
        controls.update();
        return;
      }
      const k = 1 - Math.exp(-dt * 3.4);
      camera.position.lerp(view.position, k);
      controls.target.lerp(view.target, k);
      camera.fov += (view.fov - camera.fov) * k;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      if (returning && camera.position.distanceTo(view.position) < 0.05) {
        returning = false;
        saved = null;
        controls.enabled = true;
      }
    },
    glideTo(view) {
      if (!goal && !returning) saved = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
      goal = view;
      returning = false;
      controls.enabled = false;
      controls.autoRotate = false;
    },
    release() {
      if (!goal) return;
      goal = null;
      returning = saved !== null;
      if (!returning) controls.enabled = true;
    },
    get target() {
      return controls.target;
    },
    dispose() {
      controls.removeEventListener("start", stopSpin);
      controls.dispose();
    },
  };
}
