import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sweptSphereTime, wrappedSphereOverlap} from '../src/game/collision';
import {wrapPosition, ghostOffsets} from '../src/game/wrap';
import {v3} from '../src/utils/math';

const zero = v3();
test('fast paths hit between endpoints and choose first contact', () => {
  const hit = sweptSphereTime(v3(0,0,-5),v3(0,0,11),.8,zero,zero,3.25,100);
  assert.ok(hit !== null && Math.abs(hit - .95/11) < 1e-9);
});
test('moving targets use relative motion', () => {
  assert.notEqual(sweptSphereTime(v3(-10),v3(10),1,v3(10),v3(-10),1,100),null);
  assert.equal(sweptSphereTime(v3(-10),v3(10),1,v3(10),v3(10),1,100),null);
});
test('sweeps cross faces, corners, and more than a whole world', () => {
  assert.notEqual(sweptSphereTime(v3(49),v3(8),1,v3(-47),zero,1,100),null);
  assert.notEqual(sweptSphereTime(v3(49,49,49),v3(5,5,5),1,v3(-48,-48,-48),zero,1,100),null);
  assert.notEqual(sweptSphereTime(zero,v3(350),1,v3(-30),zero,1,100),null);
});
test('sweeps handle stationary overlap, tangency, and a near miss', () => {
  assert.equal(sweptSphereTime(zero,zero,1,v3(1),zero,1,100),0);
  assert.equal(sweptSphereTime(zero,zero,1,v3(3),zero,1,100),null);
  assert.equal(sweptSphereTime(v3(-5,2),v3(10),1,zero,zero,1,100),.5);
  assert.equal(sweptSphereTime(v3(-5,2.01),v3(10),1,zero,zero,1,100),null);
});
test('wrapping and boundary copies work on all three axes', () => {
  assert.deepEqual(wrapPosition(v3(251,-151,52),100),v3(-49,49,-48));
  assert.equal(ghostOffsets(v3(49,49,49),3,100).length,8);
  assert.ok(wrappedSphereOverlap(v3(49),2,v3(-49),2,100));
});
