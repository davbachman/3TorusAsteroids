import {
  ASTEROID_SCORE,
  ASTEROID_BULLET_HIT_PADDING,
  BULLET_SPEED,
  BULLET_TTL,
  EXTRA_LIFE_SCORE_STEP,
  FIRE_COOLDOWN,
  GameState,
  InputState,
  MAX_BULLETS,
  RESPAWN_DELAY,
  RESPAWN_INVULN,
  SHIP_PITCH_RATE,
  SHIP_ROLL_RATE,
  SHIP_COAST_DRAG,
  SHIP_THRUST_ACCEL,
  WORLD_SIZE,
  AsteroidSize,
  FragmentState,
  createShipState,
} from './state';
import { sweptSphereTime, wrappedSphereOverlap } from './collision';
import { makeAsteroid, spawnLevelWave, splitAsteroid } from './spawn';
import { wrapPosition, toroidalDistance } from './wrap';
import {
  addScaledVec3,
  applyWorldAxisRotation,
  forwardFromQuat,
  quatIdentity,
  rightFromQuat,
  upFromQuat,
  scaleVec3,
  v3,
  Vec3,
} from '../utils/math';
import { randomSeed } from '../utils/random';

export interface StepEvents {
  startedGame: boolean;
  toggledPause: boolean;
  toggledFullscreen: boolean;
  fireCount: number;
  asteroidExplosions: AsteroidSize[];
  shipExploded: boolean;
  thrustActive: boolean;
  uiChirp: boolean;
}

function emptyEvents(): StepEvents {
  return {
    startedGame: false,
    toggledPause: false,
    toggledFullscreen: false,
    fireCount: 0,
    asteroidExplosions: [],
    shipExploded: false,
    thrustActive: false,
    uiChirp: false,
  };
}

function rand(min: number, max: number): number {
  return min + (max - min) * Math.random();
}

function addFragments(
  state: GameState,
  position: { x: number; y: number; z: number },
  count: number,
  speedMin: number,
  speedMax: number,
  lengthMin: number,
  lengthMax: number,
  ttlMin: number,
  ttlMax: number,
  inherit?: { x: number; y: number; z: number },
): void {
  for (let i = 0; i < count; i += 1) {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    do {
      dx = rand(-1, 1);
      dy = rand(-1, 1);
      dz = rand(-1, 1);
    } while (dx * dx + dy * dy + dz * dz < 1e-4);
    const len = Math.hypot(dx, dy, dz);
    const s = rand(speedMin, speedMax);
    const frag: FragmentState = {
      id: state.nextEntityId++,
      position: { ...position },
      velocity: {
        x: dx / len * s + (inherit?.x ?? 0),
        y: dy / len * s + (inherit?.y ?? 0),
        z: dz / len * s + (inherit?.z ?? 0),
      },
      ttl: rand(ttlMin, ttlMax),
      length: rand(lengthMin, lengthMax),
    };
    state.fragments.push(frag);
  }
}

function resetShipAtCenter(state: GameState): void {
  state.ship = createShipState();
  state.ship.invulnerableUntil = state.time + RESPAWN_INVULN;
}

function isRespawnSafe(state: GameState): boolean {
  const center = v3(0, 0, 0);
  for (const asteroid of state.asteroids) {
    if (toroidalDistance(center, asteroid.position, WORLD_SIZE) < asteroid.radius + 6) {
      return false;
    }
  }
  return true;
}

function spawnWaveForCurrentLevel(state: GameState): void {
  const wave = spawnLevelWave(state.level, state.ship.position, state.nextEntityId);
  state.asteroids = wave.asteroids;
  state.nextEntityId = wave.nextEntityId;
  state.levelClearAt = null;
  state.levelMessageUntil = state.time + 1.25;
}

export function startNewGame(state: GameState): GameState {
  const next: GameState = {
    ...state,
    mode: 'playing',
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
    levelMessageUntil: 1.25,
  };
  const wave = spawnLevelWave(1, next.ship.position, next.nextEntityId);
  next.asteroids = wave.asteroids;
  next.nextEntityId = wave.nextEntityId;
  return next;
}

function handleShipDeath(state: GameState, events: StepEvents): void {
  if (!state.ship.alive) return;
  state.ship.alive = false;
  state.ship.velocity = v3(0, 0, 0);
  state.bullets = [];
  addFragments(state, state.ship.position, 18, 8, 24, 1.2, 3.2, 0.4, 0.9);
  events.shipExploded = true;

  state.lives -= 1;
  if (state.lives <= 0) {
    state.lives = 0;
    state.mode = 'gameOver';
    state.respawnAt = null;
    return;
  }

  state.mode = 'respawning';
  state.respawnAt = state.time + RESPAWN_DELAY;
}

function maybeAwardExtraLives(state: GameState): void {
  while (state.score >= state.nextExtraLifeScore) {
    state.lives += 1;
    state.nextExtraLifeScore += EXTRA_LIFE_SCORE_STEP;
  }
}

function updateFragments(state: GameState, dt: number): void {
  if (state.fragments.length === 0) return;
  const next: FragmentState[] = [];
  for (const fragment of state.fragments) {
    fragment.ttl -= dt;
    if (fragment.ttl <= 0) continue;
    fragment.position = wrapPosition(addScaledVec3(fragment.position, fragment.velocity, dt), WORLD_SIZE);
    next.push(fragment);
  }
  state.fragments = next;
}

function updateAsteroids(state: GameState, dt: number): void {
  for (const asteroid of state.asteroids) {
    asteroid.position = wrapPosition(addScaledVec3(asteroid.position, asteroid.velocity, dt), WORLD_SIZE);
    asteroid.rotation = applyWorldAxisRotation(asteroid.rotation, { x: 1, y: 0, z: 0 }, asteroid.angularVelocity.x * dt);
    asteroid.rotation = applyWorldAxisRotation(asteroid.rotation, { x: 0, y: 1, z: 0 }, asteroid.angularVelocity.y * dt);
    asteroid.rotation = applyWorldAxisRotation(asteroid.rotation, { x: 0, y: 0, z: 1 }, asteroid.angularVelocity.z * dt);
  }
}

function updateBullets(state: GameState, dt: number): void {
  if (state.bullets.length === 0) return;
  const next = [];
  for (const bullet of state.bullets) {
    const travelTime = Math.min(dt, bullet.ttl);
    bullet.ttl -= dt;
    bullet.position = wrapPosition(addScaledVec3(bullet.position, bullet.velocity, travelTime), WORLD_SIZE);
    next.push(bullet);
  }
  state.bullets = next;
}

function tryFireBullet(state: GameState, events: StepEvents): void {
  if (!state.ship.alive) return;
  if (state.fireCooldownRemaining > 0) return;
  if (state.bullets.length >= MAX_BULLETS) return;

  const forward = forwardFromQuat(state.ship.orientation);
  const noseOffset = 3.4;
  const bullet = {
    id: state.nextEntityId++,
    position: wrapPosition(addScaledVec3(state.ship.position, forward, noseOffset), WORLD_SIZE),
    velocity: {
      x: state.ship.velocity.x + forward.x * BULLET_SPEED,
      y: state.ship.velocity.y + forward.y * BULLET_SPEED,
      z: state.ship.velocity.z + forward.z * BULLET_SPEED,
    },
    ttl: BULLET_TTL,
  };
  state.bullets.push(bullet);
  state.fireCooldownRemaining = FIRE_COOLDOWN;
  events.fireCount += 1;
}

function resolveBulletAsteroidHits(
  state: GameState, events: StepEvents, dt: number,
  asteroidStarts: Map<number, Vec3>, bulletStarts: Map<number, { position: Vec3; ttl: number }>,
): void {
  if (state.bullets.length === 0 || state.asteroids.length === 0) return;

  const hitBulletIds = new Set<number>();
  const hitAsteroidIds = new Set<number>();

  for (const bullet of state.bullets) {
    const previous = bulletStarts.get(bullet.id);
    const travelTime = previous ? Math.min(dt, previous.ttl) : 0;
    let nearest: { id: number; time: number } | null = null;
    for (const asteroid of state.asteroids) {
      if (hitAsteroidIds.has(asteroid.id)) continue;
      const time = sweptSphereTime(
        previous?.position ?? bullet.position, scaleVec3(bullet.velocity, travelTime), 0.8,
        previous ? asteroidStarts.get(asteroid.id)! : asteroid.position,
        scaleVec3(asteroid.velocity, travelTime), asteroid.radius + ASTEROID_BULLET_HIT_PADDING, WORLD_SIZE,
      );
      if (time !== null && (nearest === null || time < nearest.time)) nearest = { id: asteroid.id, time };
    }
    if (nearest) {
      hitBulletIds.add(bullet.id);
      hitAsteroidIds.add(nearest.id);
    }
  }

  if (hitBulletIds.size === 0) return;

  state.bullets = state.bullets.filter((b) => !hitBulletIds.has(b.id));

  const nextAsteroids = [];
  for (const asteroid of state.asteroids) {
    if (!hitAsteroidIds.has(asteroid.id)) {
      nextAsteroids.push(asteroid);
      continue;
    }

    state.score += ASTEROID_SCORE[asteroid.size];
    maybeAwardExtraLives(state);
    events.asteroidExplosions.push(asteroid.size);
    addFragments(
      state,
      asteroid.position,
      asteroid.size === 'large' ? 14 : asteroid.size === 'medium' ? 10 : 6,
      5,
      asteroid.size === 'large' ? 18 : 24,
      0.8,
      2.6,
      0.35,
      0.8,
      asteroid.velocity,
    );

    const split = splitAsteroid(asteroid, state.nextEntityId);
    state.nextEntityId = split.nextEntityId;
    nextAsteroids.push(...split.children);
  }

  state.asteroids = nextAsteroids;
}

function updateShip(state: GameState, input: InputState, dt: number): void {
  const ship = state.ship;
  if (!ship.alive) return;

  const yawDir = (input.left ? 1 : 0) + (input.right ? -1 : 0);
  const pitchDir = (input.up ? -1 : 0) + (input.down ? 1 : 0);

  const yaw = yawDir * SHIP_ROLL_RATE * dt + (input.lookYaw ?? 0);
  const pitch = pitchDir * SHIP_PITCH_RATE * dt + (input.lookPitch ?? 0);
  if (yaw !== 0) {
    const upAxis = upFromQuat(ship.orientation);
    ship.orientation = applyWorldAxisRotation(ship.orientation, upAxis, yaw);
  }

  if (pitch !== 0) {
    const rightAxis = rightFromQuat(ship.orientation);
    ship.orientation = applyWorldAxisRotation(ship.orientation, rightAxis, pitch);
  }

  if (input.thrust) {
    const forward = forwardFromQuat(ship.orientation);
    ship.velocity = addScaledVec3(ship.velocity, forward, SHIP_THRUST_ACCEL * dt);
  } else {
    const dragFactor = Math.exp(-SHIP_COAST_DRAG * dt);
    ship.velocity = scaleVec3(ship.velocity, dragFactor);
  }

  ship.position = wrapPosition(addScaledVec3(ship.position, ship.velocity, dt), WORLD_SIZE);
}

function resolveShipAsteroidCollision(
  state: GameState, events: StepEvents, dt: number, shipStart: Vec3, asteroidStarts: Map<number, Vec3>,
): void {
  if (!state.ship.alive) return;
  if (state.time < state.ship.invulnerableUntil) return;

  for (const asteroid of state.asteroids) {
    const start = asteroidStarts.get(asteroid.id);
    const hit = start
      ? sweptSphereTime(shipStart, scaleVec3(state.ship.velocity, dt), state.ship.radius,
          start, scaleVec3(asteroid.velocity, dt), asteroid.radius, WORLD_SIZE) !== null
      : wrappedSphereOverlap(state.ship.position, state.ship.radius, asteroid.position, asteroid.radius, WORLD_SIZE);
    if (hit) {
      handleShipDeath(state, events);
      return;
    }
  }
}

function tryRespawn(state: GameState): void {
  if (state.mode !== 'respawning') return;
  if (state.respawnAt == null || state.time < state.respawnAt) return;
  if (!isRespawnSafe(state)) return;
  resetShipAtCenter(state);
  state.mode = 'playing';
  state.respawnAt = null;
}

function maybeAdvanceLevel(state: GameState): void {
  if (state.mode === 'title' || state.mode === 'gameOver') return;
  if (state.asteroids.length > 0) {
    state.levelClearAt = null;
    return;
  }

  if (state.levelClearAt == null) {
    state.levelClearAt = state.time + 1.2;
    return;
  }

  if (state.time < state.levelClearAt) return;

  state.level += 1;
  if (!state.ship.alive) {
    state.ship = {
      ...state.ship,
      position: v3(0, 0, 0),
      velocity: v3(0, 0, 0),
      orientation: quatIdentity(),
    };
  }
  spawnWaveForCurrentLevel(state);
}

export function stepGame(state: GameState, input: InputState, dt: number): { state: GameState; events: StepEvents } {
  const events = emptyEvents();
  if (input.fullscreenPressed) {
    events.toggledFullscreen = true;
  }

  if (input.startPressed && (state.mode === 'title' || state.mode === 'gameOver')) {
    const next = startNewGame(state);
    events.startedGame = true;
    events.uiChirp = true;
    return { state: next, events };
  }

  if (input.pausePressed && (state.mode === 'playing' || state.mode === 'respawning' || state.mode === 'paused')) {
    if (state.mode === 'paused') {
      state.mode = state.ship.alive ? 'playing' : 'respawning';
    } else {
      state.mode = 'paused';
    }
    events.toggledPause = true;
    events.uiChirp = true;
  }

  if (state.mode === 'title' || state.mode === 'gameOver' || state.mode === 'paused') {
    events.thrustActive = false;
    return { state, events };
  }

  state.time += dt;
  state.fireCooldownRemaining = Math.max(0, state.fireCooldownRemaining - dt);

  const asteroidStarts = new Map(state.asteroids.map(a => [a.id, a.position]));
  const bulletStarts = new Map(state.bullets.map(b => [b.id, { position: b.position, ttl: b.ttl }]));
  const shipStart = state.ship.position;
  updateAsteroids(state, dt);
  updateBullets(state, dt);
  updateFragments(state, dt);

  if (state.ship.alive) {
    updateShip(state, input, dt);
    events.thrustActive = input.thrust;
    if (input.firePressed) {
      tryFireBullet(state, events);
    }
  } else {
    events.thrustActive = false;
  }

  resolveBulletAsteroidHits(state, events, dt, asteroidStarts, bulletStarts);
  state.bullets = state.bullets.filter(b => b.ttl > 0);
  resolveShipAsteroidCollision(state, events, dt, shipStart, asteroidStarts);
  tryRespawn(state);
  maybeAdvanceLevel(state);

  return { state, events };
}

export function seedTitleScene(state: GameState): GameState {
  const next = startNewGame(state);
  next.mode = 'title';
  next.ship.position = v3(0, 0, 0);
  next.ship.velocity = v3(0, 0, 0);
  next.ship.orientation = quatIdentity();
  next.ship.alive = true;
  next.ship.invulnerableUntil = 9999;
  next.bullets = [];
  next.fragments = [];
  next.score = 0;
  next.lives = 3;
  next.level = 1;
  return next;
}

export function forceAsteroidForTesting(state: GameState, size: AsteroidSize, position = v3(0, 0, 20)): void {
  state.asteroids = [
    makeAsteroid({
      id: state.nextEntityId++,
      size,
      position,
      velocity: v3(0, 0, 0),
      angularVelocity: v3(0.4, 0.6, 0.2),
      seed: randomSeed(),
    }),
  ];
}
