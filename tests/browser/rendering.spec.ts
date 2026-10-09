import {test,expect} from '@playwright/test';
import {load} from './helpers';

test('POV faces hide rear edges and objects; clipping removes exterior geometry; batches stay bounded',async({page})=>{
  await load(page);
  const result=await page.evaluate(async()=>{
    const scenePath='/src/render/scene.ts',statePath='/src/game/state.ts',spawnPath='/src/game/spawn.ts';
    const {SceneRenderer}=await import(scenePath);
    const {createInitialGameState,ROCK_VARIANTS}=await import(statePath);
    const {makeAsteroid}=await import(spawnPath);
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0';document.body.append(root);
    const scene=new SceneRenderer(root);
    const s=createInitialGameState();s.mode='playing';s.ship.alive=false;s.ship.position={x:0,y:0,z:0};
    const a=(id:number,position:{x:number;y:number;z:number},radius:number)=>({...makeAsteroid({id,size:'large',position,velocity:{x:0,y:0,z:0}}),radius});
    const gl=scene.renderer.getContext();
    const capture=()=>{
      scene.render(s);
      const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
      gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels;
    };
    const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    const count=(pixels:Uint8Array,x0:number,y0:number,w:number,h:number)=>{
      let n=0;for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)if(pixels[(y*width+x)*4]>80)n++;return n;
    };
    const cx=Math.floor(width*.75),cy=Math.floor(height*.5);
    s.asteroids=[a(1,{x:0,y:0,z:25},12)];
    const front=capture();const frontCenter=count(front,cx-80,cy-80,160,160);
    s.asteroids.push(a(2,{x:0,y:0,z:40},3));
    s.bullets=[{id:3,position:{x:0,y:0,z:40},velocity:{x:0,y:0,z:0},ttl:1}];
    const occludedCenter=count(capture(),cx-80,cy-80,160,160);
    s.bullets[0].position.z=10;const visibleCenter=count(capture(),cx-80,cy-80,160,160);
    // Disabling surfaces must expose the hidden rear edges of the front asteroid.
    s.bullets=[];s.asteroids=[s.asteroids[0]];
    const opaque=count(capture(),cx-160,cy-160,320,320);
    scene.faceMaterial.depthWrite=false;scene.faceMaterial.colorWrite=false;
    const wire=count(capture(),cx-160,cy-160,320,320);
    scene.faceMaterial.depthWrite=true;scene.faceMaterial.colorWrite=true;
    // Crossing two walls must produce four clipped pieces within the cube.
    s.asteroids=[a(1,{x:49,y:49,z:0},12)];s.fragments=[];
    const clipped=capture();scene.externalMaterial.clippingPlanes=[];
    const unclipped=capture();let differentExternalPixels=0;
    for(let y=0;y<height;y++)for(let x=0;x<width/2;x++){const i=(y*width+x)*4;if(Math.abs(clipped[i]-unclipped[i])>60)differentExternalPixels++;}
    for(let i=0;i<500;i++)scene.getAsteroidGeometry(ROCK_VARIANTS[i%ROCK_VARIANTS.length]);
    const cachedShapes=scene.asteroidGeometryCache.size;
    s.fragments=Array.from({length:56},(_,i)=>({id:10+i,position:{x:0,y:0,z:20},velocity:{x:1,y:1,z:1},ttl:1,length:2}));
    scene.renderer.info.autoReset=false;scene.renderer.info.reset();capture();
    const drawCalls=scene.renderer.info.render.calls;
    scene.destroy();root.remove();
    return {frontCenter,occludedCenter,visibleCenter,opaque,wire,differentExternalPixels,cachedShapes,drawCalls};
  });
  expect(result.occludedCenter).toBe(result.frontCenter);
  expect(result.visibleCenter).toBeGreaterThan(result.frontCenter);
  expect(result.wire).toBeGreaterThan(result.opaque);
  expect(result.differentExternalPixels).toBeGreaterThan(20);
  expect(result.cachedShapes).toBe(6);
  expect(result.drawCalls).toBeLessThanOrEqual(9);
});

for (const geometry of ['euclidean', 'hyperbolic', 'spherical'] as const) {
  test(`${geometry} POV boundary toggle preserves the external view and asteroid outlines`, async ({page}) => {
    await load(page);
    const result = await page.evaluate(async geometry => {
      const scenePath='/src/render/scene.ts', statePath='/src/game/state.ts', spawnPath='/src/game/spawn.ts';
      const {SceneRenderer}=await import(scenePath);
      const {createInitialGameState}=await import(statePath);
      const {makeAsteroid}=await import(spawnPath);
      const root=document.createElement('div');root.style.cssText='position:fixed;inset:0';document.body.append(root);
      const scene=new SceneRenderer(root);
      const s=createInitialGameState();s.geometry=geometry;s.mode='playing';s.ship.alive=false;
      s.asteroids=[];s.bullets=[];s.fragments=[];
      const gl=scene.renderer.getContext();
      const capture=()=>{
        scene.render(s);
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        const pixels=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const external:number[]=[],pov:number[]=[];
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)
          (x<Math.floor(width/2)?external:pov).push(pixels[(y*width+x)*4]);
        return {external,pov};
      };
      const on=capture();scene.setPovDomainEdges(false);const off=capture();
      scene.setPovDomainEdges(true);const restored=capture();scene.setPovDomainEdges(false);
      s.asteroids=[makeAsteroid({id:1,size:'large',position:{x:0,y:0,z:25},velocity:{x:0,y:0,z:0}})];
      const asteroid=capture();
      scene.destroy();root.remove();
      return {
        on:on.pov.filter(x=>x>0).length,off:off.pov.filter(x=>x>0).length,
        externalUnchanged:on.external.every((x,i)=>x===off.external[i]),
        restored:on.pov.every((x,i)=>x===restored.pov[i]),
        asteroid:asteroid.pov.filter(x=>x>0).length,
      };
    },geometry);
    expect(result.on).toBeGreaterThan(100);
    expect(result.off).toBe(0);
    expect(result.externalUnchanged).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.asteroid).toBeGreaterThan(20);
  });
}
