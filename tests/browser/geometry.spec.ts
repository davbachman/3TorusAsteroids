import { test, expect } from "@playwright/test";
import { load, start, state, advance } from "./helpers";

const hyperLabel = "Hyperbolic (Seifert–Weber Dodecahedral)";

test("geometry choice previews, starts, flies, pauses, and returns to the Euclidean game", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /THREE|shader|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await load(page);
  await expect(
    page.getByRole("radio", { name: "Euclidean (3-Torus)", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: hyperLabel, exact: true }).check();
  expect((await state(page)).geometry).toBe("hyperbolic");
  await expect(page.getByText("HYPERBOLIC POV", { exact: true })).toBeVisible();
  await start(page);
  await page.locator("canvas").click({ position: { x: 40, y: 100 } });
  await page.keyboard.down("z");
  await advance(page, 5000);
  await page.keyboard.up("z");
  const flown = await state(page);
  expect(flown.mode).toBe("playing");
  expect(flown.ship.position.z).not.toBe(0);
  expect(
    Math.hypot(
      flown.ship.position.x,
      flown.ship.position.y,
      flown.ship.position.z,
    ),
  ).toBeLessThan(50);
  await page.keyboard.press("Space");
  await advance(page);
  expect((await state(page)).bullets.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await advance(page);
  await page
    .getByRole("button", { name: "Change geometry / new game", exact: true })
    .click();
  expect((await state(page)).mode).toBe("title");
  await page
    .getByRole("radio", { name: "Euclidean (3-Torus)", exact: true })
    .check();
  await start(page);
  expect((await state(page)).geometry).toBe("euclidean");
  await expect(page.getByText("TORUS POV", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile users can select and start the hyperbolic mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  await page.getByRole("radio", { name: hyperLabel, exact: true }).check();
  await start(page);
  expect((await state(page)).geometry).toBe("hyperbolic");
  await expect(
    page.getByRole("button", { name: "Thrust", exact: true }),
  ).toBeVisible();
});

for (const geometry of ["hyperbolic", "spherical"] as const) {
test(`${geometry} surfaces occlude and paired-face viewpoints agree`, async ({
  page,
}) => {
  await load(page);
  const result = await page.evaluate(async (geometry) => {
    const scenePath = "/src/render/scene.ts",
      statePath = "/src/game/state.ts",
      spawnPath = "/src/game/spawn.ts",
      hyperPath = `/src/geometry/${geometry}.ts`;
    const { SceneRenderer } = await import(scenePath),
      { createInitialGameState } = await import(statePath),
      { makeAsteroid } = await import(spawnPath),
      H = await import(hyperPath);
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0";
    document.body.append(root);
    const scene = new SceneRenderer(root),
      s = createInitialGameState(geometry);
    s.mode = "playing";
    s.ship.alive = false;
    s.asteroids = [
      {
        ...makeAsteroid({
          geometry,
          id: 1,
          size: "large",
          position: { x: 0, y: 0, z: 25 },
          velocity: { x: 0, y: 0, z: 0 },
        }),
        radius: 12,
      },
    ];
    const gl = scene.renderer.getContext(),
      width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const capture = () => {
      scene.render(s);
      const p = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return p;
    };
    const bright = (pixels: Uint8Array) => {
      let count = 0;
      for (
        let y = Math.floor(height / 2) - 60;
        y < Math.floor(height / 2) + 60;
        y++
      )
        for (
          let x = Math.floor(width * 0.75) - 60;
          x < Math.floor(width * 0.75) + 60;
          x++
        )
          if (pixels[(y * width + x) * 4] > 80) count++;
      return count;
    };
    const baseline = bright(capture());
    s.bullets = [
      {
        id: 2,
        position: { x: 0, y: 0, z: 35 },
        velocity: { x: 0, y: 0, z: 0 },
        ttl: 1,
      },
    ];
    const hidden = bright(capture());
    s.bullets[0].position.z = 10;
    const visible = bright(capture());
    s.bullets = [];
    const n = H.FACE_NORMALS[0];
    s.ship.position = {
      x: n.x * H.FACE_OFFSET * H.CURVATURE_RADIUS,
      y: n.y * H.FACE_OFFSET * H.CURVATURE_RADIUS,
      z: n.z * H.FACE_OFFSET * H.CURVATURE_RADIUS,
    };
    const before = capture(),
      g = H.GENERATORS[0],
      p = H.lift(s.ship.position),
      q = H.apply(g, p),
      next = H.project(q);
    const transported = H.multiply(
      H.inverse(H.frame(next)),
      H.multiply(g, H.frame(s.ship.position)),
    );
    // Recover the spatial rotation without importing a second Three.js module.
    const Quaternion = scene.shipCamera.quaternion.constructor,
      Matrix4 = scene.shipCamera.matrix.constructor;
    s.ship.position = next;
    s.ship.orientation = new Quaternion()
      .setFromRotationMatrix(new Matrix4().fromArray(transported))
      .normalize();
    const after = capture();
    let changed = 0,
      lit = 0;
    for (let y = 0; y < height; y++)
      for (let x = Math.floor(width / 2); x < width; x++) {
        const i = (y * width + x) * 4;
        if (Math.max(before[i], after[i]) > 80) lit++;
        if (Math.abs(before[i] - after[i]) > 80) changed++;
      }
    const copies = scene[geometry].cover.length;
    scene.destroy();
    root.remove();
    return { baseline, hidden, visible, changed, lit, copies };
  }, geometry);
  expect(result.hidden).toBe(result.baseline);
  expect(result.visible).toBeGreaterThan(result.baseline);
  expect(result.lit).toBeGreaterThan(100);
  expect(result.changed / Math.max(1, result.lit)).toBeLessThan(0.2);
  expect(result.copies).toBeGreaterThan(100);
});

}

test('spherical perspective sees beyond the equator and grows toward the antipode', async ({page}) => {
  await load(page);
  const widths = await page.evaluate(async () => {
    const scenePath='/src/render/scene.ts', statePath='/src/game/state.ts', spawnPath='/src/game/spawn.ts', spherePath='/src/geometry/spherical.ts';
    const {SceneRenderer}=await import(scenePath), {createInitialGameState}=await import(statePath), {makeAsteroid}=await import(spawnPath), S=await import(spherePath);
    const root=document.createElement('div');root.style.cssText='position:fixed;inset:0';document.body.append(root);
    const scene=new SceneRenderer(root), s=createInitialGameState('spherical');
    s.mode='playing';s.ship.alive=false;
    s.asteroids=[makeAsteroid({geometry:'spherical',id:1,size:'large',position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}})];
    scene.setPovDomainEdges(false);scene.render(s);
    const gl=scene.renderer.getContext(), width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    const results=[];
    // Isolate one lifted image to test perspective, independently of occlusion
    // by the other 119 images of the same asteroid.
    for (const angle of [0.4, Math.PI/2, Math.PI-0.4]) {
      let transform=S.boost({x:0,y:0,z:angle*S.CURVATURE_RADIUS});
      // Match the near-side silhouette (up to vertical reflection) when viewing
      // an asymmetric rock from the opposite side of the sphere.
      if(angle>Math.PI/2) transform=S.multiply(transform,S.rotation({x:1,y:0,z:0,w:0}));
      scene.spherical.cover=[transform];
      scene.render(s);
      const pixels=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let min=width,max=-1;
      for(let y=0;y<height;y++)for(let x=Math.floor(width/2);x<width;x++)
        if(pixels[(y*width+x)*4]>80) { min=Math.min(min,x);max=Math.max(max,x); }
      results.push(max-min+1);
    }
    scene.destroy();root.remove();return results;
  });
  expect(widths[1]).toBeGreaterThan(10);
  expect(widths[0]).toBeGreaterThan(widths[1]*2);
  expect(widths[2]).toBeGreaterThan(widths[1]*2);
  expect(Math.abs(widths[0]-widths[2])).toBeLessThan(5);
});

test('spherical choice is usable in phone portrait and landscape', async ({page}) => {
  await load(page);
  for (const size of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    await page.getByRole('radio',{name:'Spherical (Poincaré Dodecahedral)',exact:true}).check();
    await start(page);
    expect((await state(page)).geometry).toBe('spherical');
    await expect(page.getByText('SPHERICAL POV',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Pause',exact:true}).click();await advance(page);
    await page.getByRole('button',{name:'Change geometry / new game',exact:true}).click();
  }
});
