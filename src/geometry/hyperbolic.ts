import { Matrix4, Quaternion, Vector3 } from "three";
import {
  Quat,
  Vec3,
  lengthVec3,
  quatMultiply,
  quatNormalize,
  quatRotateVec3,
  scaleVec3,
  v3,
} from "../utils/math";

// Hyperboloid signature (+,+,+,-). Matrices are column-major, as in WebGL.
export type HPoint = [number, number, number, number];
export type Isometry = number[];
export const CURVATURE_RADIUS = 50;
export const PHI = (1 + Math.sqrt(5)) / 2;
export const INRADIUS = Math.acosh(Math.sqrt((PHI ** 3 * Math.sqrt(5)) / 4));
export const FACE_OFFSET = Math.tanh(INRADIUS);
export const FACE_TWIST = (3 * Math.PI) / 5;
export const IDENTITY: Isometry = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];
export const ORIGIN: HPoint = [0, 0, 0, 1];
export const inner = (a: HPoint, b: HPoint): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
export const center = (m: Isometry): HPoint => [m[12], m[13], m[14], m[15]];
export function multiply(a: Isometry, b: Isometry): Isometry {
  const c = new Array<number>(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      c[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
  return c;
}
export function apply(m: Isometry, p: HPoint): HPoint {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * p[3],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * p[3],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * p[3],
    m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * p[3],
  ];
}
export function inverse(m: Isometry): Isometry {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      out[col * 4 + row] =
        m[row * 4 + col] * ((col === 3) === (row === 3) ? 1 : -1);
  return out;
}
export function lift(p: Vec3): HPoint {
  const x = p.x / CURVATURE_RADIUS,
    y = p.y / CURVATURE_RADIUS,
    z = p.z / CURVATURE_RADIUS;
  const t = 1 / Math.sqrt(Math.max(1e-14, 1 - x * x - y * y - z * z));
  return [x * t, y * t, z * t, t];
}
export function project(p: HPoint): Vec3 {
  return v3(
    (p[0] / p[3]) * CURVATURE_RADIUS,
    (p[1] / p[3]) * CURVATURE_RADIUS,
    (p[2] / p[3]) * CURVATURE_RADIUS,
  );
}
export function boostTo(p: HPoint): Isometry {
  const m = IDENTITY.slice();
  for (let col = 0; col < 3; col++)
    for (let row = 0; row < 3; row++)
      m[col * 4 + row] += (p[col] * p[row]) / (p[3] + 1);
  for (let i = 0; i < 3; i++) {
    m[12 + i] = p[i];
    m[i * 4 + 3] = p[i];
  }
  m[15] = p[3];
  return m;
}
export function boost(displacement: Vec3): Isometry {
  const d = lengthVec3(displacement) / CURVATURE_RADIUS;
  if (d < 1e-14) return IDENTITY.slice();
  const s = Math.sinh(d) / lengthVec3(displacement);
  return boostTo([
    displacement.x * s,
    displacement.y * s,
    displacement.z * s,
    Math.cosh(d),
  ]);
}
export function rotation(q: Quat): Isometry {
  return new Matrix4()
    .makeRotationFromQuaternion(new Quaternion(q.x, q.y, q.z, q.w))
    .toArray();
}
export function frame(position: Vec3, q?: Quat): Isometry {
  const b = boostTo(lift(position));
  return q ? multiply(b, rotation(q)) : b;
}

export const FACE_NORMALS: Vec3[] = [];
for (const a of [-1, 1])
  for (const b of [-1, 1]) {
    const d = Math.hypot(PHI, 1);
    FACE_NORMALS.push(
      v3(0, (a * PHI) / d, b / d),
      v3(b / d, 0, (a * PHI) / d),
      v3((a * PHI) / d, b / d, 0),
    );
  }
export const FACE_PLANES: HPoint[] = FACE_NORMALS.map((n) => [
  n.x * Math.cosh(INRADIUS),
  n.y * Math.cosh(INRADIUS),
  n.z * Math.cosh(INRADIUS),
  Math.sinh(INRADIUS),
]);
export const GENERATORS: Isometry[] = FACE_NORMALS.map((n) => {
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(n.x, n.y, n.z),
    FACE_TWIST,
  );
  return multiply(
    boost(scaleVec3(n, -2 * INRADIUS * CURVATURE_RADIUS)),
    rotation(q),
  );
});
const raw: Vec3[] = [];
for (const x of [-1, 1])
  for (const y of [-1, 1]) for (const z of [-1, 1]) raw.push(v3(x, y, z));
for (const a of [-1, 1])
  for (const b of [-1, 1])
    raw.push(
      v3(0, a / PHI, b * PHI),
      v3(a / PHI, b * PHI, 0),
      v3(a * PHI, 0, b / PHI),
    );
const vertexScale = FACE_OFFSET / ((PHI * PHI) / Math.hypot(PHI, 1));
export const VERTICES: Vec3[] = raw.map((p) =>
  scaleVec3(p, vertexScale * CURVATURE_RADIUS),
);
export const CIRCUMRADIUS = Math.atanh(
  lengthVec3(VERTICES[0]) / CURVATURE_RADIUS,
);
export const EDGES: Array<[number, number]> = [];
for (let a = 0; a < raw.length; a++)
  for (let b = a + 1; b < raw.length; b++)
    if (
      Math.abs(
        Math.hypot(
          raw[a].x - raw[b].x,
          raw[a].y - raw[b].y,
          raw[a].z - raw[b].z,
        ) -
          2 / PHI,
      ) < 1e-8
    )
      EDGES.push([a, b]);

export function inside(position: Vec3, tolerance = 1e-9): boolean {
  return FACE_NORMALS.every(
    (n) =>
      (n.x * position.x + n.y * position.y + n.z * position.z) /
        CURVATURE_RADIUS <=
      FACE_OFFSET + tolerance,
  );
}
export function reduce(point: HPoint): {
  point: HPoint;
  map: Isometry;
  crossings: number;
} {
  let p = point,
    map = IDENTITY.slice(),
    crossings = 0;
  for (; crossings < 256; crossings++) {
    let face = -1,
      violation = 1e-9;
    for (let i = 0; i < 12; i++) {
      const d = inner(p, FACE_PLANES[i]);
      if (d > violation) {
        face = i;
        violation = d;
      }
    }
    if (face < 0) return { point: p, map, crossings };
    p = apply(GENERATORS[face], p);
    map = multiply(GENERATORS[face], map);
  }
  throw new Error("Hyperbolic face reduction failed to converge");
}
export function move(position: Vec3, velocity: Vec3, dt: number, q?: Quat) {
  const path = multiply(frame(position), boost(scaleVec3(velocity, dt)));
  const reduced = reduce(center(path));
  const next = project(reduced.point);
  const transported = multiply(
    inverse(frame(next)),
    multiply(reduced.map, path),
  );
  const turn = new Quaternion()
    .setFromRotationMatrix(new Matrix4().fromArray(transported))
    .normalize();
  return {
    position: next,
    velocity: quatRotateVec3(turn, velocity),
    orientation: q ? quatNormalize(quatMultiply(turn, q)) : undefined,
    turn: { x: turn.x, y: turn.y, z: turn.z, w: turn.w },
    crossings: reduced.crossings,
  };
}
export function distance(a: HPoint, b: HPoint): number {
  return Math.acosh(Math.max(1, -inner(a, b))) * CURVATURE_RADIUS;
}
const pointKey = (p: HPoint) => p.map((x) => Math.round(x * 1e6)).join(",");

// Images of a ball meeting the fundamental domain, including edge/corner copies.
export function boundaryImages(position: Vec3, radius: number): Isometry[] {
  const p = lift(position),
    limit = Math.sinh(radius / CURVATURE_RADIUS) + 1e-8;
  const result = [IDENTITY.slice()],
    points = [p],
    seen = new Set([pointKey(p)]);
  for (let head = 0; head < result.length; head++)
    for (let f = 0; f < 12; f++) {
      if (inner(points[head], FACE_PLANES[f]) < -limit) continue;
      const candidate = apply(GENERATORS[f], points[head]);
      if (FACE_PLANES.some((n) => inner(candidate, n) > limit)) continue;
      const key = pointKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(candidate);
      result.push(multiply(GENERATORS[f], result[head]));
    }
  return result;
}
export function overlaps(a: Vec3, ra: number, b: Vec3, rb: number): boolean {
  const pa = lift(a),
    pb = lift(b),
    bound = Math.cosh((ra + rb) / CURVATURE_RADIUS);
  return boundaryImages(b, ra + rb).some(
    (g) => -inner(pa, apply(g, pb)) <= bound + 1e-10,
  );
}

// Enumerate a ball of cells around the observer. Cell centers, rather than word
// length, bound the cover; this keeps the view consistent across a face pairing.
export function tiles(observer: Vec3, centerRadius: number): Isometry[] {
  const p = lift(observer),
    limit = Math.cosh(centerRadius);
  const out = [IDENTITY.slice()],
    seen = new Set([pointKey(ORIGIN)]);
  for (let head = 0; head < out.length; head++)
    for (const generator of GENERATORS) {
      const next = multiply(out[head], generator),
        c = center(next);
      if (-inner(p, c) > limit + 1e-8) continue;
      const key = pointKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
  return out;
}

export interface HyperPath {
  position: Vec3;
  displacement: Vec3;
}
export function geodesic(path: HyperPath): (t: number) => HPoint {
  const base = frame(path.position),
    length = lengthVec3(path.displacement) / CURVATURE_RADIUS;
  const direction =
    length > 1e-14
      ? scaleVec3(path.displacement, 1 / (length * CURVATURE_RADIUS))
      : v3();
  const tangent = apply(base, [direction.x, direction.y, direction.z, 0]),
    p = center(base);
  return (t) => {
    const c = Math.cosh(length * t),
      s = Math.sinh(length * t);
    return [
      c * p[0] + s * tangent[0],
      c * p[1] + s * tangent[1],
      c * p[2] + s * tangent[2],
      c * p[3] + s * tangent[3],
    ];
  };
}

// Adaptive interval search with a speed-based Lipschitz bound: intervals that
// cannot reach the target are discarded, so fast/grazing shots cannot tunnel.
export function sweptHit(
  a: HyperPath,
  ra: number,
  b: HyperPath,
  rb: number,
): number | null {
  const travel = lengthVec3(a.displacement) + lengthVec3(b.displacement),
    radius = ra + rb;
  const at = geodesic(a),
    bt = geodesic(b),
    a0 = at(0),
    b0 = bt(0);
  let earliest: number | null = null;
  for (const image of boundaryImages(b.position, radius + travel)) {
    if (distance(a0, apply(image, b0)) > radius + travel + 1e-7) continue;
    const d = (t: number) => distance(at(t), apply(image, bt(t)));
    const search = (
      lo: number,
      hi: number,
      dlo: number,
      dhi: number,
      depth: number,
    ): number | null => {
      if (dlo <= radius + 1e-7) return lo;
      if (Math.min(dlo, dhi) - (travel * (hi - lo)) / 2 > radius + 1e-7)
        return null;
      if (depth >= 24 || travel * (hi - lo) < 1e-5)
        return Math.min(dlo, dhi) <= radius + 1e-5 ? lo : null;
      const mid = (lo + hi) / 2,
        dm = d(mid);
      return (
        search(lo, mid, dlo, dm, depth + 1) ??
        search(mid, hi, dm, dhi, depth + 1)
      );
    };
    const hit = search(0, earliest ?? 1, d(0), d(earliest ?? 1), 0);
    if (hit !== null && (earliest === null || hit < earliest)) earliest = hit;
  }
  return earliest;
}
