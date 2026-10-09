import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../src/geometry/spherical";
import { lengthVec3, quatIdentity, scaleVec3, v3 } from "../src/utils/math";
import { createInitialGameState, InputState } from "../src/game/state";
import { makeAsteroid, spawnLevelWave } from "../src/game/spawn";
import { startNewGame, stepGame } from "../src/game/update";
import { createRng } from "../src/utils/random";

const close = (a: number, b: number, tol = 1e-7) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const matrixClose = (a: number[], b: number[], tol = 1e-7) =>
  a.forEach((x, i) => close(x, b[i], tol));
const none: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  thrust: false,
  firePressed: false,
  startPressed: false,
  pausePressed: false,
  fullscreenPressed: false,
};

test("Poincaré domain has twelve pentagons, thirty edges, and 120 degree dihedral angles", () => {
  assert.equal(H.FACE_NORMALS.length, 12);
  assert.equal(H.VERTICES.length, 20);
  assert.equal(H.EDGES.length, 30);
  close(H.INRADIUS, Math.PI / 10);
  close(H.CIRCUMRADIUS, 0.3881395153701887);
  for (let i = 0; i < 12; i++) {
    close(H.inner(H.FACE_PLANES[i], H.FACE_PLANES[i]), 1);
    const face = H.VERTICES.filter(
      (p) => Math.abs(H.inner(H.lift(p), H.FACE_PLANES[i])) < 1e-7,
    );
    assert.equal(face.length, 5);
    for (const p of face) {
      const image = H.apply(H.GENERATORS[i], H.lift(p));
      assert.ok(H.VERTICES.some((q) => H.distance(image, H.lift(q)) < 1e-5));
    }
    for (let j = i + 1; j < 12; j++)
      if (
        Math.abs(
          H.FACE_NORMALS[i].x * H.FACE_NORMALS[j].x +
            H.FACE_NORMALS[i].y * H.FACE_NORMALS[j].y +
            H.FACE_NORMALS[i].z * H.FACE_NORMALS[j].z -
            1 / Math.sqrt(5),
        ) < 1e-7
      )
        close(
          Math.acos(-H.inner(H.FACE_PLANES[i], H.FACE_PLANES[j])),
          (2 * Math.PI) / 3,
        );
  }
});
test("face pairings preserve the metric and have exact opposite-face inverses", () => {
  for (const g of H.GENERATORS) {
    matrixClose(H.multiply(g, H.inverse(g)), H.IDENTITY);
    const p = H.lift(v3(5, 10, 15)),
      q = H.lift(v3(-5, 7, -10));
    close(H.distance(H.apply(g, p), H.apply(g, q)), H.distance(p, q));
    assert.ok(
      H.GENERATORS.some((h) =>
        H.multiply(g, h).every((x, i) => Math.abs(x - H.IDENTITY[i]) < 1e-7),
      ),
    );
  }
});
test("the tiling closes with three cells around an edge and four at a vertex", () => {
  const tiles = H.tiles(v3(), 4),
    [i, j] = H.EDGES[0],
    a = H.VERTICES[i],
    b = H.VERTICES[j];
  const contains = (p: H.HPoint) =>
    tiles.filter((g) => {
      const q = H.apply(H.inverse(g), p);
      return H.FACE_PLANES.every((n) => H.inner(q, n) < 1e-7);
    }).length;
  assert.equal(
    contains(H.lift(v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2))),
    3,
  );
  assert.equal(contains(H.lift(H.VERTICES[0])), 4);
});
test("parallel transport preserves speed and agrees across different timesteps and face crossings", () => {
  const velocity = v3(120, 70, -50),
    one = H.move(v3(), velocity, 2, quatIdentity());
  let p = v3(),
    v = velocity,
    q = quatIdentity(),
    crossings = 0;
  for (let i = 0; i < 240; i++) {
    const moved = H.move(p, v, 1 / 120, q);
    p = moved.position;
    v = moved.velocity;
    q = moved.orientation!;
    crossings += moved.crossings;
    assert.ok(H.inside(p));
  }
  close(H.distance(H.lift(p), H.lift(one.position)), 0, 1e-4);
  close(lengthVec3(v), lengthVec3(velocity));
  matrixClose(H.rotation(q), H.rotation(one.orientation!), 1e-6);
  assert.ok(crossings > 0);
});
test("spherical collision sweeps catch fast shots and opposite-face targets", () => {
  assert.notEqual(
    H.sweptHit(
      { position: v3(0, 0, -10), displacement: v3(0, 0, 30) },
      0.8,
      { position: v3(), displacement: v3() },
      2,
    ),
    null,
  );
  assert.equal(
    H.sweptHit(
      { position: v3(10, 0, -10), displacement: v3(0, 0, 30) },
      0.8,
      { position: v3(), displacement: v3() },
      2,
    ),
    null,
  );
  const n = H.FACE_NORMALS[0],
    start = scaleVec3(n, H.FACE_OFFSET * H.CURVATURE_RADIUS - 0.3),
    target = H.move(start, scaleVec3(n, 8), 1).position;
  assert.notEqual(
    H.sweptHit(
      { position: start, displacement: scaleVec3(n, 12) },
      0.8,
      { position: target, displacement: v3() },
      2,
    ),
    null,
  );
});
test("spherical spawns remain safe and gameplay survives sustained flight", () => {
  const original = Math.random;
  Math.random = createRng(7919);
  try {
    for (const level of [1, 5, 9]) {
      const wave = spawnLevelWave(level, v3(), 1, "spherical");
      assert.equal(wave.asteroids.length, Math.min(12, 3 + level));
      for (const a of wave.asteroids) {
        assert.ok(H.inside(a.position));
        assert.equal(H.overlaps(v3(), 10.8, a.position, a.radius), false);
      }
    }
    const s = startNewGame(createInitialGameState("spherical"));
    s.ship.invulnerableUntil = 9999;
    for (let i = 0; i < 1200; i++)
      stepGame(
        s,
        {
          ...none,
          thrust: true,
          right: i % 120 < 30,
          firePressed: i % 12 === 0,
        },
        1 / 60,
      );
    assert.ok(H.inside(s.ship.position));
    assert.ok(Number.isFinite(lengthVec3(s.ship.velocity)));
    assert.equal(s.geometry, "spherical");
    for (const a of s.asteroids) assert.ok(H.inside(a.position));
  } finally {
    Math.random = original;
  }
});
test("spherical shots hit large asteroid edges rather than only the center", () => {
  const s = createInitialGameState("spherical");
  s.mode = "playing";
  s.ship.position = v3(0, 0, -25);
  s.ship.invulnerableUntil = 99;
  s.asteroids = [
    makeAsteroid({
      geometry: "spherical",
      id: 1,
      size: "large",
      position: v3(),
      velocity: v3(),
      angularVelocity: v3(),
    }),
  ];
  // Start a geodesic at a lateral offset almost as large as the collision radius.
  s.bullets = [
    { id: 2, position: v3(s.asteroids[0].radius * 0.85, 0, -10), velocity: v3(0, 0, 120), ttl: 1 },
  ];
  s.nextEntityId = 3;
  for (let i = 0; i < 60 && s.score === 0; i++) stepGame(s, none, 1 / 60);
  assert.equal(s.score, 20);
  assert.equal(s.asteroids.length, 1);
});


test("the deck group has 120 free isometries and the universal spherical geodesics close", () => {
  assert.equal(H.GROUP.length, 120);
  const p = H.lift(v3(7, -9, 12));
  for (const g of H.GROUP) {
    matrixClose(H.multiply(H.inverse(g), g), H.IDENTITY);
    if (g !== H.GROUP[0]) assert.ok(H.distance(p, H.apply(g, p)) > 1);
    for (const h of H.GENERATORS) {
      const product = H.multiply(g, h);
      assert.ok(H.GROUP.some(k => k.every((x, i) => Math.abs(x-product[i]) < 1e-7)));
    }
  }
  const path = H.geodesic({position:v3(), displacement:v3(0,0,2*Math.PI*H.CURVATURE_RADIUS)});
  close(H.distance(path(0), path(1)), 0);
  close(H.distance(path(0), path(0.5)), Math.PI*H.CURVATURE_RADIUS);
  const moved=H.move(v3(),v3(0,0,2*Math.PI*H.CURVATURE_RADIUS),1,quatIdentity());
  close(lengthVec3(moved.position),0);
  matrixClose(H.rotation(moved.orientation!), H.IDENTITY);
});
