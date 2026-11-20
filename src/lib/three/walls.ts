import * as THREE from "three";

// One straight wall of a rectangular room, with everything that hangs on it.
export interface RoomWall {
  section: THREE.Group; // lowered when the camera stands outside it
  normal: THREE.Vector3; // points out of the room
  distance: number; // from the middle of the room to the wall
  height: number; // 0..1, eased
}

// A wall goes down when the camera stands outside it, so the room stays open towards you.
export function lowerWalls(walls: RoomWall[], camera: THREE.Camera, dt: number): void {
  for (const wall of walls) {
    const outside = camera.position.dot(wall.normal) - wall.distance;
    const want = outside > 2 ? 0 : 1;
    wall.height += (want - wall.height) * Math.min(1, dt * 5);
    wall.section.scale.y = Math.max(wall.height, 0.001);
    wall.section.visible = wall.height > 0.02;
  }
}
