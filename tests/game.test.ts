import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInitialGameState, InputState, SHIP_RADIUS} from '../src/game/state';
import {makeAsteroid, spawnLevelWave, splitAsteroid} from '../src/game/spawn';
import {startNewGame, stepGame} from '../src/game/update';
import {toroidalDistance} from '../src/game/wrap';
import {createRng} from '../src/utils/random';
import {v3} from '../src/utils/math';

const none: InputState = {left:false,right:false,up:false,down:false,thrust:false,firePressed:false,startPressed:false,pausePressed:false,fullscreenPressed:false};
function playing() {const s=createInitialGameState();s.mode='playing';s.ship.position=v3(30,30,30);s.nextEntityId=100;return s;}
function asteroid(id=1,z=0) {return makeAsteroid({id,size:'small',seed:0,position:v3(0,0,z),velocity:v3(),angularVelocity:v3()});}
function seeded<T>(fn:()=>T, seed=123456):T {const prev=Math.random;Math.random=createRng(seed);try{return fn();}finally{Math.random=prev;}}

test('waves leave a radius-aware safe margin at the center and across seams', () => seeded(() => {
  for(let i=0;i<300;i++) {
    const ship=i%2?v3(49,-49,49):v3();const wave=spawnLevelWave(i%12+1,ship,1);
    assert.equal(wave.asteroids.length,Math.min(12,4+i%12));
    for(const a of wave.asteroids) {
      assert.ok(toroidalDistance(a.position,ship,100)>=a.radius+SHIP_RADIUS+8);
      for(const b of wave.asteroids) if(a.id!==b.id) assert.ok(toroidalDistance(a.position,b.position,100)>=a.radius+b.radius+4);
    }
  }
}));
test('exhausted random placement retains safety in its grid fallback', () => {
  const previous=Math.random;Math.random=()=>.6;
  try {const wave=spawnLevelWave(9,v3(),1);assert.equal(wave.asteroids.length,12);for(const a of wave.asteroids) assert.ok(toroidalDistance(a.position,v3(),100)>=a.radius+SHIP_RADIUS+8);}
  finally {Math.random=previous;}
});
test('large asteroid spawn at distance 21 is rejected', () => seeded(() => {
  const rng=Math.random, sequence=[.71,.5,.5,4.5/0x7fffffff];Math.random=()=>sequence.length?sequence.shift()!:rng();
  const s=startNewGame(createInitialGameState());stepGame(s,none,1/60);assert.equal(s.lives,3);
}));
test('fast bullets hit and prioritize the nearer target, regardless of array order', () => {
  const s=playing();s.asteroids=[asteroid(2,15),asteroid(1,0)];
  s.bullets=[{id:3,position:v3(0,0,-8),velocity:v3(0,0,1800),ttl:1}];
  stepGame(s,none,1/60);assert.deepEqual(s.asteroids.map(a=>a.id),[2]);assert.equal(s.score,100);
});
test('bullets can hit during their final partial frame but not after expiry', () => {
  for(const target of [0,15]) {
    const s=playing();s.asteroids=[asteroid(1,target)];s.bullets=[{id:3,position:v3(0,0,-8),velocity:v3(0,0,1800),ttl:.006}];
    stepGame(s,none,1/60);assert.equal(s.score,target===0?100:0);assert.equal(s.bullets.length,0);
  }
});
test('fast ships collide between endpoints, including at a seam', () => {
  for(const start of [-6,44]) {
    const s=playing();s.ship.position=v3(0,0,start);s.ship.velocity=v3(0,0,720);s.asteroids=[asteroid(1,start===-6?0:-50)];
    stepGame(s,{...none,thrust:true},1/60);assert.equal(s.mode,'respawning');assert.equal(s.lives,2);
  }
});
test('split positions stay wrapped and award score and extra lives', () => seeded(() => {
  const parent=makeAsteroid({id:1,size:'large',seed:4,position:v3(49,49,49),velocity:v3()});
  const split=splitAsteroid(parent,2);assert.equal(split.children.length,2);
  for(const a of split.children) for(const coord of Object.values(a.position)) assert.ok(coord>=-50&&coord<=50);
  const s=playing();s.score=9990;s.asteroids=[{...parent,position:v3(),velocity:v3()}];s.bullets=[{id:5,position:v3(),velocity:v3(),ttl:1}];
  stepGame(s,none,1/60);assert.equal(s.score,10010);assert.equal(s.lives,4);assert.equal(s.asteroids.length,2);
}));
test('pause, respawn protection, game over, and restart retain their transitions', () => seeded(() => {
  const s=playing();s.ship.position=v3();s.asteroids=[asteroid()];stepGame(s,none,1/60);assert.equal(s.mode,'respawning');
  stepGame(s,{...none,pausePressed:true},1/60);const time=s.time;stepGame(s,none,1);assert.equal(s.time,time);
  s.asteroids[0].position=v3(30,30,30);stepGame(s,{...none,pausePressed:true},1/60);
  for(let i=0;i<100;i++)stepGame(s,none,1/60);assert.equal(s.mode,'playing');assert.ok(s.ship.invulnerableUntil>s.time);
  s.lives=1;s.ship.invulnerableUntil=0;s.asteroids[0].position={...s.ship.position};stepGame(s,none,1/60);assert.equal(s.mode,'gameOver');
  const restarted=stepGame(s,{...none,startPressed:true},1/60).state;assert.equal(restarted.mode,'playing');assert.equal(restarted.lives,3);assert.equal(restarted.score,0);
}));
test('clearing a wave advances the level once', () => seeded(() => {
  const s=playing();for(let i=0;i<75;i++)stepGame(s,none,1/60);assert.equal(s.level,2);assert.equal(s.asteroids.length,5);
}));
test('pointer displacement applies once and does not depend on simulation rate', () => {
  const a=playing(),b=playing();a.asteroids=[asteroid()];b.asteroids=[asteroid()];
  stepGame(a,{...none,lookYaw:.3,lookPitch:-.2},1/60);stepGame(b,{...none,lookYaw:.3,lookPitch:-.2},1/120);
  assert.deepEqual(a.ship.orientation,b.ship.orientation);const orientation={...a.ship.orientation};stepGame(a,none,1/60);assert.deepEqual(a.ship.orientation,orientation);
});
