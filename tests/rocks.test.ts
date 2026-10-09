import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createAsteroidSolidGeometry} from '../src/render/geometries';
import {ROCK_VARIANTS} from '../src/game/state';
import {makeAsteroid,splitAsteroid} from '../src/game/spawn';
import {v3} from '../src/utils/math';
import * as H from '../src/geometry/hyperbolic';
import * as S from '../src/geometry/spherical';

// Concave rocks still need closed surfaces for reliable depth occlusion, and
// every visible vertex must remain inside the gameplay collision bound.
test('rock meshes are distinct, irregular, closed, and inside their collision radius',()=>{
  const shapes=new Set<string>();
  for(const variant of ROCK_VARIANTS) {
    const mesh=createAsteroidSolidGeometry(variant),positions=mesh.getAttribute('position'),indices=mesh.index!;
    const vertices=Array.from({length:positions.count},(_,i)=>new Vector3().fromBufferAttribute(positions,i));
    const radii=vertices.map(p=>p.length());
    assert.ok(Math.max(...radii)<=1+1e-6);assert.ok(Math.max(...radii)-Math.min(...radii)>.2);
    const edges=new Map<string,{count:number;direction:number}>();
    for(let i=0;i<indices.count;i+=3) {
      const triangle=[indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
      const [a,b,c]=triangle.map(j=>vertices[j]);
      const normal=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a));
      assert.ok(normal.length()>1e-5);assert.ok(normal.dot(a)>0);
      for(let j=0;j<3;j++) {
        const u=triangle[j],v=triangle[(j+1)%3],key=[Math.min(u,v),Math.max(u,v)].join(',');
        const edge=edges.get(key)??{count:0,direction:0};edge.count++;edge.direction+=u<v?1:-1;edges.set(key,edge);
      }
    }
    for(const edge of edges.values())assert.deepEqual(edge,{count:2,direction:0});
    shapes.add(JSON.stringify(Array.from(positions.array)));mesh.dispose();
  }
  assert.equal(shapes.size,ROCK_VARIANTS.length);
});

for(const [geometry,G] of [['hyperbolic',H],['spherical',S]] as const) {
  test(`${geometry} splitting near a domain corner keeps children inside and transports their motion`,()=>{
    const parent=makeAsteroid({geometry,id:1,size:'large',position:G.VERTICES[0],velocity:v3(7,-2,3)});
    for(let attempt=0;attempt<20;attempt++) {
      const children=splitAsteroid(parent,100,geometry);
      assert.equal(children.length,2);
      for(const child of children) {
        assert.ok(G.inside(child.position));assert.ok(Object.values(child.velocity).every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(child.rotation.x,child.rotation.y,child.rotation.z,child.rotation.w)-1)<1e-7);
        const distance=Math.min(...G.boundaryImages(child.position,10).map(g=>G.distance(G.lift(parent.position),G.apply(g,G.lift(child.position)))));
        assert.ok(Math.abs(distance-child.radius*1.05)<1e-4);
      }
    }
  });
}
