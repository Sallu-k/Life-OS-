import * as THREE from "three";

// The page theme colours, read from the CSS variables in globals.css, so no colour is written in 3D code.
export interface Palette {
  bg: THREE.Color;
  surface: THREE.Color;
  surfaceHi: THREE.Color;
  brass: THREE.Color;
  copper: THREE.Color;
  glow: THREE.Color;
  ink: THREE.Color;
  inkDim: THREE.Color;
  hexLine: THREE.Color;
  fontBook: string;
  fontLabel: string;
}

function color(style: CSSStyleDeclaration, name: string): THREE.Color {
  const value = style.getPropertyValue(name).trim();
  try {
    return value ? new THREE.Color(value) : new THREE.Color(0.5, 0.5, 0.5);
  } catch {
    return new THREE.Color(0.5, 0.5, 0.5);
  }
}

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const brass = color(style, "--brass");
  return {
    bg: color(style, "--bg"),
    surface: color(style, "--surface"),
    surfaceHi: color(style, "--surface-hi"),
    brass,
    copper: color(style, "--copper"),
    glow: color(style, "--glow"),
    ink: color(style, "--ink"),
    inkDim: color(style, "--ink-dim"),
    hexLine: style.getPropertyValue("--hex-line").trim() ? color(style, "--hex-line") : brass,
    fontBook: style.getPropertyValue("--font-book").trim() || "serif",
    fontLabel: style.getPropertyValue("--font-label").trim() || "monospace",
  };
}

export const css = (c: THREE.Color): string => `#${c.getHexString()}`;
