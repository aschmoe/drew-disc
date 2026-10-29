// Coordinate frames.
//
// MAP frame (hole JSON, the hole editor, the design doc): meters, x = east, y = north, top-down.
// WORLD frame (simulation and rendering, Three.js convention): meters, x = east, y = up,
// z = south. So north is -z.
//
// Headings are degrees clockwise from north, like a compass: 0 = north, 90 = east.

import type { V3 } from './vec';

export type MapPoint = [number, number];

export function mapToWorld(p: MapPoint, height = 0): V3 {
  return { x: p[0], y: height, z: -p[1] };
}

export function worldToMap(p: V3): MapPoint {
  return [p.x, -p.z];
}

/** Horizontal unit vector in the world frame for a compass heading. */
export function headingToDir(deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), y: 0, z: -Math.cos(r) };
}

/** Compass heading of a horizontal world-frame direction. */
export function dirToHeading(d: V3): number {
  return (Math.atan2(d.x, -d.z) * 180) / Math.PI;
}

export function pointInPolygon(x: number, y: number, poly: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
