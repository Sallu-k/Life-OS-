import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type FrameFn = (time: number, dt: number) => void;

export interface StageOptions {
  fov?: number;
  shadows?: boolean;
  bloom?: { strength: number; radius: number; threshold: number };
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  onFrame(fn: FrameFn): void;
  dispose(): void;
}

// Frees the GPU memory of everything inside an object (geometry, materials and their textures).
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const item = child as THREE.Mesh;
    item.geometry?.dispose();
    const materials = Array.isArray(item.material) ? item.material : item.material ? [item.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

// A renderer inside `container` (with optional soft shadows and a glow pass), a draw loop that sleeps when the
// tab is hidden or the canvas is off-screen, and one dispose() that cleans everything up.
export function createStage(container: HTMLElement, options: StageOptions = {}): Stage {
  // With the glow pass, its own render target already smooths edges (samples: 4), so the canvas skips it.
  const renderer = new THREE.WebGLRenderer({ antialias: !options.bloom, powerPreference: "high-performance" });
  const maxRatio = Math.min(window.devicePixelRatio, options.bloom ? 1.5 : 2);
  let pixelRatio = maxRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  if (options.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // refreshed every other frame in the loop below
  }
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(options.fov ?? 40, 1, 0.1, 200);

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (options.bloom) {
    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), options.bloom.strength, options.bloom.radius, options.bloom.threshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const sizeWatcher = new ResizeObserver(resize);
  sizeWatcher.observe(container);

  let onScreen = true;
  const screenWatcher = new IntersectionObserver((entries) => {
    onScreen = entries[0]?.isIntersecting ?? true;
  });
  screenWatcher.observe(container);

  const frames: FrameFn[] = [];
  let raf = 0;
  let last = performance.now();
  let time = 0;
  let frame = 0;
  // If frames get slow (a weak GPU, a big screen), draw at a lower resolution; raise it again when there is room.
  let slowSum = 0;
  let slowCount = 0;
  function adapt(dt: number) {
    slowSum += dt;
    slowCount++;
    if (slowCount < 90) return;
    const avg = slowSum / slowCount;
    slowSum = 0;
    slowCount = 0;
    const next = avg > 0.024 ? Math.max(1, pixelRatio - 0.25) : avg < 0.014 ? Math.min(maxRatio, pixelRatio + 0.25) : pixelRatio;
    if (next !== pixelRatio) {
      pixelRatio = next;
      renderer.setPixelRatio(pixelRatio);
      composer?.setPixelRatio(pixelRatio);
      resize();
    }
  }
  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !onScreen) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    adapt(dt);
    if (options.shadows && frame++ % 2 === 0) renderer.shadowMap.needsUpdate = true;
    for (const fn of frames) fn(time, dt);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  return {
    renderer,
    scene,
    camera,
    canvas,
    onFrame: (fn) => frames.push(fn),
    dispose() {
      cancelAnimationFrame(raf);
      sizeWatcher.disconnect();
      screenWatcher.disconnect();
      disposeObject(scene);
      bloom?.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
