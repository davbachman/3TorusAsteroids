import { Vec3 } from '../utils/math';
import { toroidalDistanceSq } from './wrap';

// Return the first contact along the actual, unwrapped paths. Testing every
// lattice image intersecting the swept bounds also handles multiple wraps.
export function sweptSphereTime(
  a: Vec3, motionA: Vec3, radiusA: number,
  b: Vec3, motionB: Vec3, radiusB: number, size: number,
): number | null {
  const start = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const motion = { x: motionA.x - motionB.x, y: motionA.y - motionB.y, z: motionA.z - motionB.z };
  const radius = radiusA + radiusB;
  const bounds = (s: number, d: number) => [
    Math.ceil((Math.min(s, s + d) - radius) / size),
    Math.floor((Math.max(s, s + d) + radius) / size),
  ];
  const [xmin, xmax] = bounds(start.x, motion.x);
  const [ymin, ymax] = bounds(start.y, motion.y);
  const [zmin, zmax] = bounds(start.z, motion.z);
  const speedSq = motion.x ** 2 + motion.y ** 2 + motion.z ** 2;
  let earliest: number | null = null;
  for (let x = xmin; x <= xmax; x++) {
    for (let y = ymin; y <= ymax; y++) {
      for (let z = zmin; z <= zmax; z++) {
        const dx = start.x - x * size, dy = start.y - y * size, dz = start.z - z * size;
        const c = dx * dx + dy * dy + dz * dz - radius * radius;
        if (c <= 0) return 0;
        if (speedSq === 0) continue;
        const dot = dx * motion.x + dy * motion.y + dz * motion.z;
        const discriminant = dot * dot - speedSq * c;
        if (discriminant < 0) continue;
        const t = (-dot - Math.sqrt(discriminant)) / speedSq;
        if (t >= 0 && t <= 1 && (earliest === null || t < earliest)) earliest = t;
      }
    }
  }
  return earliest;
}

export function wrappedSphereOverlap(
  aPos: Vec3,
  aRadius: number,
  bPos: Vec3,
  bRadius: number,
  worldSize: number,
): boolean {
  const r = aRadius + bRadius;
  return toroidalDistanceSq(aPos, bPos, worldSize) <= r * r;
}
