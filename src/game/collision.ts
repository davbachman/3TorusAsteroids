import { Vec3 } from '../utils/math';
import { toroidalDistanceSq } from './wrap';

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
