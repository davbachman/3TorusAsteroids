import { Vec3, v3 } from '../utils/math';

export function wrapCoord(coord: number, size: number): number {
  const half = size / 2;
  let c = coord;
  while (c > half) c -= size;
  while (c < -half) c += size;
  return c;
}

export function wrapPosition(position: Vec3, size: number): Vec3 {
  return v3(wrapCoord(position.x, size), wrapCoord(position.y, size), wrapCoord(position.z, size));
}

export function wrapDelta(delta: number, size: number): number {
  const half = size / 2;
  let d = delta;
  while (d > half) d -= size;
  while (d < -half) d += size;
  return d;
}

export function toroidalDelta(a: Vec3, b: Vec3, size: number): Vec3 {
  return v3(wrapDelta(a.x - b.x, size), wrapDelta(a.y - b.y, size), wrapDelta(a.z - b.z, size));
}

export function toroidalDistanceSq(a: Vec3, b: Vec3, size: number): number {
  const d = toroidalDelta(a, b, size);
  return d.x * d.x + d.y * d.y + d.z * d.z;
}

export function toroidalDistance(a: Vec3, b: Vec3, size: number): number {
  return Math.sqrt(toroidalDistanceSq(a, b, size));
}

export function ghostOffsets(position: Vec3, radius: number, size: number): Vec3[] {
  const half = size / 2;
  const xOffsets = [0];
  const yOffsets = [0];
  const zOffsets = [0];

  if (position.x > half - radius) xOffsets.push(-size);
  if (position.x < -half + radius) xOffsets.push(size);
  if (position.y > half - radius) yOffsets.push(-size);
  if (position.y < -half + radius) yOffsets.push(size);
  if (position.z > half - radius) zOffsets.push(-size);
  if (position.z < -half + radius) zOffsets.push(size);

  const results: Vec3[] = [];
  for (const x of xOffsets) {
    for (const y of yOffsets) {
      for (const z of zOffsets) {
        results.push({ x, y, z });
      }
    }
  }
  return results;
}

export function tileOffsets(range: number, size: number, includeOrigin = true): Vec3[] {
  const results: Vec3[] = [];
  for (let x = -range; x <= range; x += 1) {
    for (let y = -range; y <= range; y += 1) {
      for (let z = -range; z <= range; z += 1) {
        if (!includeOrigin && x === 0 && y === 0 && z === 0) {
          continue;
        }
        results.push(v3(x * size, y * size, z * size));
      }
    }
  }
  return results;
}
