import { AsteroidSize, AsteroidState, WORLD_HALF, WORLD_SIZE, getAsteroidRadius } from './state';
import { Quat, Vec3, quatIdentity, v3 } from '../utils/math';
import { toroidalDistance } from './wrap';
import { randomSeed } from '../utils/random';

const SIZE_ORDER: AsteroidSize[] = ['large', 'medium', 'small'];

function rand(min: number, max: number): number {
  return min + (max - min) * Math.random();
}

function randomVelocityForSize(size: AsteroidSize): Vec3 {
  const speed =
    size === 'large' ? rand(5, 11) : size === 'medium' ? rand(8, 15) : rand(12, 20);

  let x = 0;
  let y = 0;
  let z = 0;
  do {
    x = rand(-1, 1);
    y = rand(-1, 1);
    z = rand(-1, 1);
  } while (x * x + y * y + z * z < 1e-4);

  const len = Math.hypot(x, y, z);
  return { x: (x / len) * speed, y: (y / len) * speed, z: (z / len) * speed };
}

function randomAngularVelocity(): Vec3 {
  return {
    x: rand(-1.2, 1.2),
    y: rand(-1.2, 1.2),
    z: rand(-1.2, 1.2),
  };
}

export function makeAsteroid(params: {
  id: number;
  size: AsteroidSize;
  position: Vec3;
  velocity?: Vec3;
  angularVelocity?: Vec3;
  seed?: number;
  rotation?: Quat;
}): AsteroidState {
  const { id, size, position } = params;
  const seed = params.seed ?? randomSeed();
  return {
    id,
    size,
    position: { ...position },
    velocity: params.velocity ? { ...params.velocity } : randomVelocityForSize(size),
    angularVelocity: params.angularVelocity ? { ...params.angularVelocity } : randomAngularVelocity(),
    rotation: params.rotation ? { ...params.rotation } : quatIdentity(),
    radius: getAsteroidRadius(size, seed),
    seed,
  };
}

function randomSpawnPosition(): Vec3 {
  return v3(rand(-WORLD_HALF, WORLD_HALF), rand(-WORLD_HALF, WORLD_HALF), rand(-WORLD_HALF, WORLD_HALF));
}

export function spawnLevelWave(level: number, shipPosition: Vec3, nextEntityId: number): {
  asteroids: AsteroidState[];
  nextEntityId: number;
} {
  const largeCount = Math.min(12, 4 + (level - 1));
  const asteroids: AsteroidState[] = [];
  let id = nextEntityId;
  let attempts = 0;

  while (asteroids.length < largeCount && attempts < largeCount * 100) {
    attempts += 1;
    const position = randomSpawnPosition();
    const candidateSeed = randomSeed();
    if (toroidalDistance(position, shipPosition, WORLD_SIZE) < 20) continue;
    const candidateRadius = getAsteroidRadius('large', candidateSeed);
    if (asteroids.some((a) => toroidalDistance(position, a.position, WORLD_SIZE) < a.radius + candidateRadius + 4)) {
      continue;
    }
    asteroids.push(makeAsteroid({ id: id++, size: 'large', position, seed: candidateSeed }));
  }

  while (asteroids.length < largeCount) {
    asteroids.push(
      makeAsteroid({
        id: id++,
        size: 'large',
        position: randomSpawnPosition(),
      }),
    );
  }

  return { asteroids, nextEntityId: id };
}

export function splitAsteroid(parent: AsteroidState, nextEntityId: number): {
  children: AsteroidState[];
  nextEntityId: number;
} {
  const idx = SIZE_ORDER.indexOf(parent.size);
  if (idx < 0 || idx === SIZE_ORDER.length - 1) {
    return { children: [], nextEntityId };
  }

  const childSize = SIZE_ORDER[idx + 1];
  let id = nextEntityId;
  const children: AsteroidState[] = [];

  for (let i = 0; i < 2; i += 1) {
    const offset = {
      x: rand(-1, 1),
      y: rand(-1, 1),
      z: rand(-1, 1),
    };
    const len = Math.max(0.001, Math.hypot(offset.x, offset.y, offset.z));
    const dir = { x: offset.x / len, y: offset.y / len, z: offset.z / len };
    const burst = rand(6, 12);
    const childVel = {
      x: parent.velocity.x + dir.x * burst,
      y: parent.velocity.y + dir.y * burst,
      z: parent.velocity.z + dir.z * burst,
    };
    const childSeed = randomSeed();
    const childRadius = getAsteroidRadius(childSize, childSeed);
    children.push(
      makeAsteroid({
        id: id++,
        size: childSize,
        seed: childSeed,
        position: {
          x: parent.position.x + dir.x * childRadius * 0.6,
          y: parent.position.y + dir.y * childRadius * 0.6,
          z: parent.position.z + dir.z * childRadius * 0.6,
        },
        velocity: childVel,
      }),
    );
  }

  return { children, nextEntityId: id };
}
