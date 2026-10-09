import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAsteroidSolidGeometry} from '../src/render/geometries';
import {createInitialGameState, getAsteroidRadius, getAsteroidSolid, InputState} from '../src/game/state';
import {makeAsteroid} from '../src/game/spawn';
import {stepGame} from '../src/game/update';
import {v3} from '../src/utils/math';

const none:InputState={left:false,right:false,up:false,down:false,thrust:false,firePressed:false,startPressed:false,pausePressed:false,fullscreenPressed:false};

for(let seed=0;seed<5;seed++) {
  test(`large ${getAsteroidSolid(seed)}: visible face, edge, and corner hits work at normal bullet speed`,()=>{
    const geometry=createAsteroidSolidGeometry(seed);
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);
    const radius=getAsteroidRadius('large',seed);
    mesh.scale.setScalar(radius);
    try {
      for(const angle of [0,.6]) {
        mesh.quaternion.setFromEuler(new THREE.Euler(angle*.5,angle,angle*.3));mesh.updateMatrixWorld();
        const positions=geometry.getAttribute('position');
        const targets=new Map<string,THREE.Vector3>();
        targets.set('center',new THREE.Vector3());
        for(let i=0;i<positions.count;i++) {
          const point=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
          // Just inside the projected silhouette at each vertex. These rays hit
          // the actual visible surface, even at the far edges of the largest solid.
          point.multiplyScalar(.99);
          targets.set(`${point.x.toFixed(4)},${point.y.toFixed(4)}`,point);
        }
        for(const point of targets.values()) {
          const origin=new THREE.Vector3(point.x,point.y,-40);
          const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,0,1));
          assert.ok(ray.intersectObject(mesh).length>0,'target must intersect a visible polygon');
          const state=createInitialGameState();state.mode='playing';state.ship.position=v3(40,40,40);
          state.asteroids=[makeAsteroid({id:1,size:'large',seed,position:v3(),velocity:v3(),angularVelocity:v3(),rotation:mesh.quaternion})];
          state.bullets=[{id:2,position:{x:origin.x,y:origin.y,z:origin.z},velocity:v3(0,0,60),ttl:1}];state.nextEntityId=3;
          for(let frame=0;frame<60&&state.score===0;frame++)stepGame(state,none,1/60);
          assert.equal(state.score,20,`missed visible edge at ${point.x}, ${point.y}`);
        }
      }
    }finally{geometry.dispose();material.dispose();}
  });
}
