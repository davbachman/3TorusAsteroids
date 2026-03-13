import { normalizeVec3, Vec3 } from './math';

export function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function randomRange(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

export function randomInt(rand: () => number, minInclusive: number, maxInclusive: number): number {
  return Math.floor(randomRange(rand, minInclusive, maxInclusive + 1));
}

export function randomUnitVec3(rand: () => number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  do {
    x = rand() * 2 - 1;
    y = rand() * 2 - 1;
    z = rand() * 2 - 1;
  } while (x * x + y * y + z * z < 1e-5);
  return normalizeVec3({ x, y, z });
}

export function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}
