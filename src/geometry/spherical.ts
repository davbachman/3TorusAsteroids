import { Matrix4, Quaternion } from 'three';
import { Quat, Vec3, lengthVec3, quatMultiply, quatNormalize, quatRotateVec3, scaleVec3, v3 } from '../utils/math';
import * as H from './hyperbolic';

// Unit S^3 in R^4, with physical distances scaled by CURVATURE_RADIUS.
// Stored positions use the gnomonic chart of the central dodecahedron.
export type HPoint = H.HPoint;
export type Isometry = H.Isometry;
export const { IDENTITY, ORIGIN, multiply, apply, center, rotation, FACE_NORMALS, EDGES } = H;
export const CURVATURE_RADIUS = 120;
export const INRADIUS = Math.PI / 10;
export const FACE_TWIST = Math.PI / 5;
export const FACE_OFFSET = Math.tan(INRADIUS);
export const inner = (a: HPoint, b: HPoint) => a.reduce((sum, x, i) => sum + x * b[i], 0);
export const inverse = (m: Isometry): Isometry => m.map((_, i) => m[(i % 4) * 4 + Math.floor(i / 4)]);
export const VERTICES = H.VERTICES.map(p => scaleVec3(p, FACE_OFFSET * CURVATURE_RADIUS / (H.FACE_OFFSET * H.CURVATURE_RADIUS)));
export const CIRCUMRADIUS = Math.atan(lengthVec3(VERTICES[0]) / CURVATURE_RADIUS);
export const FACE_PLANES: HPoint[] = FACE_NORMALS.map(n => [n.x * Math.cos(INRADIUS), n.y * Math.cos(INRADIUS), n.z * Math.cos(INRADIUS), -Math.sin(INRADIUS)]);
export function lift(p: Vec3): HPoint {
  const norm = Math.hypot(p.x, p.y, p.z, CURVATURE_RADIUS);
  return [p.x / norm, p.y / norm, p.z / norm, CURVATURE_RADIUS / norm];
}
export function project(p: HPoint): Vec3 {
  return v3(p[0] / p[3] * CURVATURE_RADIUS, p[1] / p[3] * CURVATURE_RADIUS, p[2] / p[3] * CURVATURE_RADIUS);
}
export function boostTo(p: HPoint): Isometry {
  const m = IDENTITY.slice();
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++)
    m[col * 4 + row] -= p[col] * p[row] / (1 + p[3]);
  for (let i = 0; i < 3; i++) { m[12 + i] = p[i]; m[i * 4 + 3] = -p[i]; }
  m[15] = p[3];
  return m;
}
export function boost(displacement: Vec3): Isometry {
  const length = lengthVec3(displacement), angle = length / CURVATURE_RADIUS;
  if (length < 1e-14) return IDENTITY.slice();
  const n = [displacement.x / length, displacement.y / length, displacement.z / length];
  const m = IDENTITY.slice(), c = Math.cos(angle), s = Math.sin(angle);
  // This form remains defined at the antipode and after complete circuits.
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++)
    m[col * 4 + row] += (c - 1) * n[col] * n[row];
  for (let i = 0; i < 3; i++) { m[12 + i] = s * n[i]; m[i * 4 + 3] = -s * n[i]; }
  m[15] = c;
  return m;
}
export function frame(position: Vec3, q?: Quat): Isometry {
  const b = boostTo(lift(position));
  return q ? multiply(b, rotation(q)) : b;
}
// These isoclinic rotations generate one handedness of I*, acting freely on S^3.
export const GENERATORS = FACE_NORMALS.map(n => multiply(
  boost(scaleVec3(n, -2 * INRADIUS * CURVATURE_RADIUS)),
  rotation({x:n.x * Math.sin(FACE_TWIST / 2), y:n.y * Math.sin(FACE_TWIST / 2), z:n.z * Math.sin(FACE_TWIST / 2), w:Math.cos(FACE_TWIST / 2)}),
));
const key = (p: HPoint) => p.map(x => Math.round(x * 1e8)).join(',');
export const GROUP: Isometry[] = [IDENTITY.slice()];
const seen = new Set([key(ORIGIN)]);
for (let head = 0; head < GROUP.length; head++) for (const generator of GENERATORS) {
  const candidate = multiply(GROUP[head], generator), k = key(center(candidate));
  if (seen.has(k)) continue;
  seen.add(k); GROUP.push(candidate);
  if (GROUP.length > 120) throw new Error('Spherical face pairings failed to close');
}
if (GROUP.length !== 120) throw new Error('Poincaré space requires 120 deck transformations');
export function inside(position: Vec3, tolerance = 1e-9): boolean {
  return FACE_NORMALS.every(n => (n.x * position.x + n.y * position.y + n.z * position.z) / CURVATURE_RADIUS <= FACE_OFFSET + tolerance);
}
export function reduce(point: HPoint): {point:HPoint; map:Isometry; crossings:number} {
  // Nearest cell center gives the Dirichlet domain, even for a long step.
  let map = GROUP[0], p = point;
  for (const candidate of GROUP) {
    const q = apply(candidate, point);
    if (q[3] > p[3] + 1e-12) { p = q; map = candidate; }
  }
  return {point:p, map, crossings:map === GROUP[0] ? 0 : 1};
}
export function move(position: Vec3, velocity: Vec3, dt: number, q?: Quat) {
  const path = multiply(frame(position), boost(scaleVec3(velocity, dt)));
  const reduced = reduce(center(path)), next = project(reduced.point);
  const transported = multiply(inverse(frame(next)), multiply(reduced.map, path));
  const turn = new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(transported)).normalize();
  return {position:next, velocity:quatRotateVec3(turn, velocity), orientation:q ? quatNormalize(quatMultiply(turn, q)) : undefined,
    turn:{x:turn.x,y:turn.y,z:turn.z,w:turn.w}, crossings:reduced.crossings};
}
export function distance(a: HPoint, b: HPoint): number {
  // atan2 is stable for coincident and antipodal points.
  const dot = inner(a, b), residual = a.map((x, i) => x - dot * b[i]);
  return Math.atan2(Math.hypot(...residual), dot) * CURVATURE_RADIUS;
}
export function boundaryImages(position: Vec3, radius: number): Isometry[] {
  if (radius >= Math.PI * CURVATURE_RADIUS / 2) return GROUP;
  const p = lift(position), limit = Math.sin(radius / CURVATURE_RADIUS) + 1e-8;
  return GROUP.filter(g => {
    const q = apply(g, p);
    return FACE_PLANES.every(n => inner(q, n) <= limit);
  });
}
export function overlaps(a: Vec3, ra: number, b: Vec3, rb: number): boolean {
  const pa = lift(a), pb = lift(b), radius = ra + rb;
  return GROUP.some(g => distance(pa, apply(g, pb)) <= radius + 1e-8);
}
export function tiles(_observer: Vec3, _centerRadius: number): Isometry[] { return GROUP; }
export interface SphericalPath {position:Vec3; displacement:Vec3}
export function geodesic(path: SphericalPath): (t:number) => HPoint {
  const base = frame(path.position);
  return t => center(multiply(base, boost(scaleVec3(path.displacement, t))));
}
// Speed bounds make this a swept test, including face crossings and grazing hits.
export function sweptHit(a:SphericalPath, ra:number, b:SphericalPath, rb:number): number | null {
  const travel = lengthVec3(a.displacement) + lengthVec3(b.displacement), radius = ra + rb;
  const at = geodesic(a), bt = geodesic(b), a0 = at(0), b0 = bt(0);
  let earliest: number | null = null;
  for (const image of GROUP) {
    if (distance(a0, apply(image, b0)) > radius + travel + 1e-7) continue;
    const d = (t:number) => distance(at(t), apply(image, bt(t)));
    const search = (lo:number, hi:number, dlo:number, dhi:number, depth:number):number|null => {
      if (dlo <= radius + 1e-7) return lo;
      if (Math.min(dlo, dhi) - travel * (hi-lo) / 2 > radius + 1e-7) return null;
      if (depth >= 24 || travel * (hi-lo) < 1e-5) return Math.min(dlo,dhi) <= radius + 1e-5 ? lo : null;
      const mid=(lo+hi)/2, dm=d(mid);
      return search(lo,mid,dlo,dm,depth+1) ?? search(mid,hi,dm,dhi,depth+1);
    };
    const hit=search(0,earliest ?? 1,d(0),d(earliest ?? 1),0);
    if (hit !== null && (earliest === null || hit < earliest)) earliest=hit;
  }
  return earliest;
}
