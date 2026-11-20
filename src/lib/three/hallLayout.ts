import * as THREE from "three";

// The shape of the hall: a hexagon of six walls. Walls between the camera and the middle lower themselves
// (like a doll's house), so the room can be turned and seen from any side.
export const SIDE = 12; // the length of one wall
export const APOTHEM = SIDE * Math.cos(Math.PI / 6); // from the middle of the room to the middle of a wall
export const TIER_H = 5.2; // the height of one floor of bookcases
export const WALLS = 6;
export const BAYS_PER_TIER = WALLS * 2;

// Wall k faces the middle; its outward direction (away from the room) is (-sin, 0, -cos) of k * 60 degrees.
export function wallAngle(k: number): number {
  return (k * Math.PI) / 3;
}

// Where bookcase number `index` stands. Two per wall, going round the room, then the next floor up.
export function bayPlace(index: number) {
  const wall = Math.floor(index / 2) % WALLS;
  const phi = wallAngle(wall);
  const lx = index % 2 === 0 ? -3 : 3;
  const tier = Math.floor(index / BAYS_PER_TIER);
  const position = new THREE.Vector3(-Math.sin(phi) * APOTHEM + Math.cos(phi) * lx, tier * TIER_H, -Math.cos(phi) * APOTHEM - Math.sin(phi) * lx);
  const inward = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)); // out of the bookcase, into the room
  const right = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)); // along the wall
  return { wall, phi, tier, position, inward, right };
}
