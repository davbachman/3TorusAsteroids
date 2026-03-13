export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const AXIS_X: Vec3 = { x: 1, y: 0, z: 0 };
export const AXIS_Y: Vec3 = { x: 0, y: 1, z: 0 };
export const AXIS_Z: Vec3 = { x: 0, y: 0, z: 1 };

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function addScaledVec3(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSqVec3(v: Vec3): number {
  return dotVec3(v, v);
}

export function lengthVec3(v: Vec3): number {
  return Math.sqrt(lengthSqVec3(v));
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = lengthVec3(v);
  if (len <= 1e-9) return { x: 0, y: 0, z: 0 };
  return scaleVec3(v, 1 / len);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len <= 1e-9) return quatIdentity();
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalizeVec3(axis);
  const half = angle * 0.5;
  const s = Math.sin(half);
  return quatNormalize({ x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) });
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
  const qv: Quat = { x: v.x, y: v.y, z: v.z, w: 0 };
  const r = quatMultiply(quatMultiply(q, qv), quatConjugate(q));
  return { x: r.x, y: r.y, z: r.z };
}

export function applyWorldAxisRotation(current: Quat, worldAxis: Vec3, angle: number): Quat {
  if (Math.abs(angle) <= 1e-9) return current;
  return quatNormalize(quatMultiply(quatFromAxisAngle(worldAxis, angle), current));
}

export function forwardFromQuat(q: Quat): Vec3 {
  return normalizeVec3(quatRotateVec3(q, AXIS_Z));
}

export function rightFromQuat(q: Quat): Vec3 {
  return normalizeVec3(quatRotateVec3(q, AXIS_X));
}

export function upFromQuat(q: Quat): Vec3 {
  return normalizeVec3(quatRotateVec3(q, AXIS_Y));
}

export function withJitter(v: Vec3, amount: number, rand: () => number): Vec3 {
  return {
    x: v.x + (rand() * 2 - 1) * amount,
    y: v.y + (rand() * 2 - 1) * amount,
    z: v.z + (rand() * 2 - 1) * amount,
  };
}
