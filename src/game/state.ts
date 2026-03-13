import { Quat, Vec3, quatIdentity, v3 } from '../utils/math';

export const WORLD_SIZE = 100;
export const WORLD_HALF = WORLD_SIZE / 2;

export const SHIP_RADIUS = 2.8;
export const SHIP_ROLL_RATE = 1.2;
export const SHIP_PITCH_RATE = 1.0;
export const SHIP_THRUST_ACCEL = 28;
export const SHIP_COAST_DRAG = 0.55;
export const FIRE_COOLDOWN = 0.14;
export const BULLET_SPEED = 60;
export const BULLET_TTL = 1.0;
export const MAX_BULLETS = 4;
export const RESPAWN_DELAY = 1.5;
export const RESPAWN_INVULN = 2.0;
export const EXTRA_LIFE_SCORE_STEP = 10000;
export const ASTEROID_BULLET_HIT_PADDING = 1.75;

export type AsteroidSize = 'large' | 'medium' | 'small';
export type GameMode = 'title' | 'playing' | 'paused' | 'respawning' | 'gameOver';
export type AsteroidSolid = 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron';

export interface ShipState {
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  alive: boolean;
  invulnerableUntil: number;
  radius: number;
}

export interface AsteroidState {
  id: number;
  size: AsteroidSize;
  position: Vec3;
  velocity: Vec3;
  angularVelocity: Vec3;
  rotation: Quat;
  radius: number;
  seed: number;
}

export interface BulletState {
  id: number;
  position: Vec3;
  velocity: Vec3;
  ttl: number;
}

export interface FragmentState {
  id: number;
  position: Vec3;
  velocity: Vec3;
  ttl: number;
  length: number;
}

export interface GameState {
  mode: GameMode;
  time: number;
  score: number;
  lives: number;
  level: number;
  nextExtraLifeScore: number;
  ship: ShipState;
  asteroids: AsteroidState[];
  bullets: BulletState[];
  fragments: FragmentState[];
  nextEntityId: number;
  fireCooldownRemaining: number;
  respawnAt: number | null;
  levelClearAt: number | null;
  levelMessageUntil: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  thrust: boolean;
  firePressed: boolean;
  startPressed: boolean;
  pausePressed: boolean;
  fullscreenPressed: boolean;
}

export const ASTEROID_BASE_RADII: Record<AsteroidSize, number> = {
  large: 8,
  medium: 5,
  small: 3,
};

export const ASTEROID_SCORE: Record<AsteroidSize, number> = {
  large: 20,
  medium: 50,
  small: 100,
};

const ASTEROID_SOLID_SEQUENCE: AsteroidSolid[] = [
  'tetrahedron',
  'cube',
  'octahedron',
  'dodecahedron',
  'icosahedron',
];

const ASTEROID_FACE_COUNTS: Record<AsteroidSolid, number> = {
  tetrahedron: 4,
  cube: 6,
  octahedron: 8,
  dodecahedron: 12,
  icosahedron: 20,
};

const ASTEROID_REFERENCE_FACE_COUNT = 8;

export function getAsteroidSolid(seed: number): AsteroidSolid {
  return ASTEROID_SOLID_SEQUENCE[Math.abs(seed) % ASTEROID_SOLID_SEQUENCE.length];
}

export function getAsteroidFaceCount(seed: number): number {
  return ASTEROID_FACE_COUNTS[getAsteroidSolid(seed)];
}

export function getAsteroidRadius(size: AsteroidSize, seed: number): number {
  return ASTEROID_BASE_RADII[size] * (getAsteroidFaceCount(seed) / ASTEROID_REFERENCE_FACE_COUNT);
}

export function createShipState(): ShipState {
  return {
    position: v3(0, 0, 0),
    velocity: v3(0, 0, 0),
    orientation: quatIdentity(),
    alive: true,
    invulnerableUntil: 0,
    radius: SHIP_RADIUS,
  };
}

export function createInitialGameState(): GameState {
  return {
    mode: 'title',
    time: 0,
    score: 0,
    lives: 3,
    level: 1,
    nextExtraLifeScore: EXTRA_LIFE_SCORE_STEP,
    ship: createShipState(),
    asteroids: [],
    bullets: [],
    fragments: [],
    nextEntityId: 1,
    fireCooldownRemaining: 0,
    respawnAt: null,
    levelClearAt: null,
    levelMessageUntil: 0,
  };
}

export function cloneShipResetForRespawn(ship: ShipState): ShipState {
  return {
    ...ship,
    position: v3(0, 0, 0),
    velocity: v3(0, 0, 0),
    orientation: quatIdentity(),
    alive: true,
  };
}
