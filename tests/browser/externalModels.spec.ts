import {test,expect} from '@playwright/test';
import {load} from './helpers';

for (const geometry of ['hyperbolic','spherical'] as const) {
  test(`${geometry} external edges follow curved geodesics and wrapped asteroids clip to the cell`,async({page})=>{
    await load(page);
    const result=await page.evaluate(async geometry=>{
      const scenePath='/src/render/scene.ts',statePath='/src/game/state.ts',spawnPath='/src/game/spawn.ts',mathPath=`/src/geometry/${geometry}.ts`;
      const {SceneRenderer}=await import(scenePath),{createInitialGameState}=await import(statePath),{makeAsteroid}=await import(spawnPath),G=await import(mathPath);
      const root=document.createElement('div');root.style.cssText='position:fixed;inset:0';document.body.append(root);
      const scene=new SceneRenderer(root),s=createInitialGameState(geometry);
      s.mode='playing';s.ship.alive=false;s.asteroids=[];s.bullets=[];s.fragments=[];
      scene.render(s);
      const curved=scene[geometry],gl=scene.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
      const capture=()=>{
        scene.render(s);const pixels=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
      };
      const Vector3=scene.externalCamera.position.constructor;
      const project=(p:number[])=>{
        const v=new Vector3(...p.slice(0,3).map(x=>G.CURVATURE_RADIUS*x/(p[3]+1))).project(scene.externalCamera);
        return {x:(v.x+1)*Math.floor(width/2)/2,y:(v.y+1)*height/2};
      };
      let best={bend:0,edge:0,mid:{x:0,y:0}};
      G.EDGES.forEach(([a,b]:number[],edge:number)=>{
        const p=G.lift(G.VERTICES[a]),q=G.lift(G.VERTICES[b]);
        const m=p.map((x:number,i:number)=>(x+q[i])/2),norm=Math.sqrt(Math.abs(G.inner(m,m)));
        const A=project(p),B=project(q),M=project(m.map((x:number)=>x/norm));
        const bend=Math.abs((B.x-A.x)*(A.y-M.y)-(A.x-M.x)*(B.y-A.y))/Math.hypot(B.x-A.x,B.y-A.y);
        if(bend>best.bend)best={bend,edge,mid:M};
      });
      // Draw only the most visibly curved edge and check its analytic midpoint.
      curved.exteriorCell.geometry.setDrawRange(best.edge*64,64);
      const edgePixels=capture();let midpointPixels=0;
      for(let y=Math.round(best.mid.y)-1;y<=Math.round(best.mid.y)+1;y++)
        for(let x=Math.round(best.mid.x)-1;x<=Math.round(best.mid.x)+1;x++)
          if(edgePixels[(y*width+x)*4]>60)midpointPixels++;
      curved.exteriorCell.geometry.setDrawRange(0,Infinity);
      const n=G.FACE_NORMALS[0],scale=G.FACE_OFFSET*G.CURVATURE_RADIUS-.2;
      s.asteroids=[makeAsteroid({geometry,id:1,size:'large',position:{x:n.x*scale,y:n.y*scale,z:n.z*scale},velocity:{x:0,y:0,z:0}})];
      const clipped=capture();const copies=curved.externalBatches.get(`rock-${s.asteroids[0].variant}`).geometry.instanceCount;
      curved.externalMaterial.uniforms.clipDomain.value=false;const unclipped=capture();
      let clippingChanges=0;
      for(let y=0;y<height;y++)for(let x=0;x<width/2;x++) {
        const i=(y*width+x)*4;if(Math.abs(clipped[i]-unclipped[i])>60)clippingChanges++;
      }
      scene.destroy();root.remove();return {bend:best.bend,midpointPixels,copies,clippingChanges};
    },geometry);
    expect(result.bend).toBeGreaterThan(geometry==='hyperbolic'?8:.4);
    expect(result.midpointPixels).toBeGreaterThan(0);
    expect(result.copies).toBeGreaterThan(1);
    expect(result.clippingChanges).toBeGreaterThan(20);
  });
}

test('switching the hyperbolic external model changes only the external pixels',async({page})=>{
  await load(page);
  const result=await page.evaluate(async()=>{
    const scenePath='/src/render/scene.ts',statePath='/src/game/state.ts',spawnPath='/src/game/spawn.ts';
    const {SceneRenderer}=await import(scenePath),{createInitialGameState}=await import(statePath),{makeAsteroid}=await import(spawnPath);
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0';document.body.append(root);
    const scene=new SceneRenderer(root),s=createInitialGameState('hyperbolic');s.mode='playing';s.ship.alive=false;
    s.asteroids=[makeAsteroid({geometry:'hyperbolic',id:1,size:'large',position:{x:0,y:0,z:25},velocity:{x:0,y:0,z:0}})];
    const gl=scene.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    const capture=()=>{scene.render(s);const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const beforeState=JSON.stringify(s),ball=capture();scene.setExternalModel('klein');const klein=capture();
    scene.setExternalModel('poincare');const restored=capture();
    let external=0,pov=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const i=(y*width+x)*4;if(ball[i]!==klein[i]) {if(x<width/2)external++;else pov++;}
    }
    const stateUnchanged=beforeState===JSON.stringify(s),restores=ball.every((x,i)=>x===restored[i]);
    scene.destroy();root.remove();return {external,pov,stateUnchanged,restores};
  });
  expect(result.external).toBeGreaterThan(100);
  expect(result.pov).toBe(0);
  expect(result.stateUnchanged).toBe(true);
  expect(result.restores).toBe(true);
});
