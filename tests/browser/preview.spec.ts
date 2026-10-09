import {test,expect} from '@playwright/test';
import {load,start,state,advance} from './helpers';

test('production assets load under the GitHub Pages base path',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page);await start(page);expect((await state(page)).mode).toBe('playing');
  await page.locator('canvas').click({position:{x:30,y:100}});
  await page.keyboard.press('Space');await advance(page);expect((await state(page)).bullets.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});


test('hyperbolic mode loads in the production bundle',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page);await page.getByRole('radio',{name:'Hyperbolic (Seifert–Weber Dodecahedral)',exact:true}).check();
  await start(page);expect((await state(page)).geometry).toBe('hyperbolic');
  await expect(page.getByText('HYPERBOLIC POV',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});

// Do not call load()/advanceTime() here: these exercise the real animation loop
// and actual browser activation, as used on the published site.
test.describe('real-time startup', () => {
  test.use({hasTouch:true});

  for (const geometry of ['euclidean', 'hyperbolic', 'spherical'] as const) {
    for (const activation of ['mouse', 'keyboard', 'touch'] as const) {
      test(`${geometry} starts with ${activation} and resumes after pause`, async ({page}) => {
        const errors:string[]=[];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('./');
        await page.locator(`input[value="${geometry}"]`).check();
        const startButton = page.getByRole('button', {name:'Start game', exact:true});
        if (activation === 'mouse') await startButton.click({delay:200});
        else if (activation === 'touch') await startButton.tap();
        else { await startButton.focus(); await page.keyboard.press('Enter'); }
        await expect(page.getByRole('region', {name:'Game menu'})).toBeHidden();
        await expect.poll(async () => (await state(page)).time).toBeGreaterThan(0.1);
        expect((await state(page)).geometry).toBe(geometry);
        await page.getByRole('button', {name:'Pause', exact:true}).click();
        await expect(page.getByRole('button', {name:'Resume game', exact:true})).toBeVisible();
        await page.getByRole('button', {name:'Resume game', exact:true}).click({delay:200});
        await expect(page.getByRole('region', {name:'Game menu'})).toBeHidden();
        expect(errors).toEqual([]);
      });
    }
  }

  for (const failure of ['context', 'buffer'] as const) {
    test(`audio ${failure} failure does not block Start or the game loop`, async ({page}) => {
      await page.addInitScript(failure => {
        if (failure === 'context') {
          window.AudioContext = class {
            constructor() { throw new DOMException('Audio device unavailable', 'NotSupportedError'); }
          } as unknown as typeof AudioContext;
        } else {
          AudioContext.prototype.createBuffer = () => { throw new DOMException('Audio buffer unavailable', 'NotSupportedError'); };
        }
      }, failure);
      const errors:string[]=[];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.getByRole('button', {name:'Start game', exact:true}).click();
      await expect(page.getByRole('region', {name:'Game menu'})).toBeHidden();
      await expect.poll(async () => (await state(page)).time).toBeGreaterThan(0.1);
      await page.getByRole('button', {name:'Pause', exact:true}).click();
      await page.getByRole('button', {name:'Resume game', exact:true}).click();
      await expect(page.getByRole('region', {name:'Game menu'})).toBeHidden();
      expect(errors).toEqual([]);
    });
  }
});

for (const geometry of ['euclidean', 'hyperbolic', 'spherical'] as const) {
  test(`${geometry} renders every asteroid damage stage in the production bundle`, async ({page}) => {
    const errors:string[]=[];
    page.on('pageerror', error => errors.push(error.message));
    await load(page);
    await page.locator(`input[value="${geometry}"]`).check();
    await start(page);
    const shapes = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).asteroids.map((a:{shape:string}) => a.shape));
    expect(await shapes()).toEqual(Array(4).fill('icosahedron'));
    await page.evaluate(() => window.__gameDebug.forceAsteroid());
    for (const next of ['dodecahedron', 'octahedron', 'tetrahedron', null]) {
      await page.evaluate(() => {
        const s = window.__gameDebug.getState();
        s.asteroids[0].velocity = {x:0,y:0,z:0};
        s.bullets = [{id:s.nextEntityId++, position:{...s.asteroids[0].position}, velocity:{x:0,y:0,z:0}, ttl:1}];
      });
      await advance(page);
      expect(await shapes()).toEqual(next ? [next] : []);
    }
    expect(errors).toEqual([]);
  });
}

test('POV edge checkbox works with keyboard and persists through a new game and geometry change', async ({page}) => {
  await load(page);
  await page.getByText('Controls', {exact:true}).click();
  const edges=page.getByRole('checkbox', {name:'Show POV domain edges'});
  await expect(edges).toBeChecked();
  await edges.focus();await page.keyboard.press('Space');await advance(page);
  await expect(edges).not.toBeChecked();
  expect((await state(page)).mode).toBe('title');
  await page.getByText('Controls', {exact:true}).click();
  await start(page);
  await page.getByRole('button', {name:'Pause',exact:true}).click();await advance(page);
  await page.getByRole('button', {name:'Change geometry / new game'}).click();
  await page.locator('input[value="hyperbolic"]').check();await start(page);
  await page.getByText('Controls', {exact:true}).click();
  await expect(edges).not.toBeChecked();
  await edges.check();await advance(page);await expect(edges).toBeChecked();
  await page.setViewportSize({width:844,height:390});
  const bounds=await edges.boundingBox();
  expect(bounds!.y).toBeGreaterThan(0);
  expect(bounds!.y+bounds!.height).toBeLessThan(390);
});

for (const geometry of ['euclidean', 'hyperbolic', 'spherical'] as const) {
  test(`${geometry} fires with Space after pointer use of toolbar controls`, async ({page}) => {
    await load(page);
    await page.locator(`input[value="${geometry}"]`).check();await start(page);
    const controls=page.getByText('Controls', {exact:true});
    const help=page.locator('details.help');
    await controls.click();
    await page.getByRole('checkbox', {name:'Show POV domain edges'}).uncheck();
    await controls.click();
    await page.keyboard.press('Space');await advance(page);
    expect((await state(page)).bullets.length).toBeGreaterThan(0);
    await expect(help).not.toHaveAttribute('open');
    await page.getByRole('button', {name:'Mute',exact:true}).click();
    await advance(page,300);
    const before=(await state(page)).nextEntityId;
    await page.keyboard.press('Space');await advance(page);
    expect((await state(page)).nextEntityId).toBeGreaterThan(before);
    await expect(page.getByRole('button', {name:'Unmute',exact:true})).toBeVisible();
    // Explicit keyboard focus must still allow native summary activation.
    await controls.focus();await page.keyboard.press('Space');
    await expect(help).toHaveAttribute('open');
  });
}

test('external model selector works on desktop and mobile without consuming fire after pointer selection',async({page})=>{
  await load(page);
  const model=page.getByRole('combobox',{name:'External hyperbolic model'});
  await expect(model).toBeHidden();
  await page.locator('input[value="hyperbolic"]').check();await start(page);
  await expect(model).toHaveValue('poincare');
  for(const size of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    // ResizeObserver updates the pane overlay on the next rendering turn.
    await expect.poll(async()=>{
      const rect=(await model.boundingBox())!;
      return rect.x>=0 && rect.y>=0 && rect.x+rect.width<=size.width && rect.y+rect.height<=size.height;
    }).toBe(true);
    await model.focus();
    await model.dispatchEvent('pointerdown',{pointerType:'mouse'});
    await model.selectOption('klein');
    await expect(model).not.toBeFocused();
    await page.keyboard.press('Space');await advance(page);
    expect((await state(page)).bullets.length).toBeGreaterThan(0);
    await model.selectOption('poincare');await advance(page,300);
  }
  await page.getByRole('button',{name:'Pause',exact:true}).click();await advance(page);
  await page.getByRole('button',{name:'Change geometry / new game',exact:true}).click();
  await page.locator('input[value="spherical"]').check();await expect(model).toBeHidden();
  await page.locator('input[value="hyperbolic"]').check();await expect(model).toHaveValue('poincare');
});

for (const geometry of ['euclidean','hyperbolic','spherical'] as const) {
  test(`${geometry} E toggles POV edges once per press and stays synchronized with the checkbox`,async({page})=>{
    await load(page);await page.locator(`input[value="${geometry}"]`).check();
    const edges=page.getByRole('checkbox',{name:'Show POV domain edges',includeHidden:true});
    // It works on the title screen without advancing the simulation.
    await page.locator('canvas').click({position:{x:20,y:60}});
    await page.keyboard.press('e');await expect(edges).not.toBeChecked();
    await start(page);
    await page.keyboard.down('e');await expect(edges).toBeChecked();
    await page.keyboard.down('e');await expect(edges).toBeChecked();
    await page.keyboard.up('e');
    await page.getByText('Controls',{exact:true}).click();
    await edges.uncheck();
    await page.keyboard.press('e');await expect(edges).toBeChecked();
    await page.getByText('Controls',{exact:true}).click();
    await page.getByRole('button',{name:'Pause',exact:true}).click();await advance(page);
    await page.keyboard.press('e');await expect(edges).not.toBeChecked();
    await page.keyboard.press('Control+e');await expect(edges).not.toBeChecked();
    expect((await state(page)).mode).toBe('paused');
  });
}

test('focused model selection returns steering, thrust, fire, E, and pause to the game',async({page,browserName})=>{
  await load(page);await page.locator('input[value="hyperbolic"]').check();await start(page);
  const model=page.getByRole('combobox',{name:'External hyperbolic model'});
  for(const [key,value] of [['ArrowUp','klein'],['ArrowDown','poincare']]) {
    await model.focus();
    if(browserName==='webkit') {
      // The macOS native popup is outside Playwright's keyboard control.
      // Commit through its select API without a pointer event: the old focus
      // bug fails here because the select keeps consuming subsequent keys.
      await model.selectOption(value);
    } else {
      await page.keyboard.press('Space');await page.keyboard.press(key);await page.keyboard.press('Enter');
    }
    await expect(model).toHaveValue(value);await expect(model).not.toBeFocused();
  }
  await page.keyboard.down('z');await advance(page,200);await page.keyboard.up('z');
  const before=await state(page);expect(Math.hypot(before.ship.velocity.x,before.ship.velocity.y,before.ship.velocity.z)).toBeGreaterThan(0);
  await page.keyboard.down('ArrowRight');await advance(page,200);await page.keyboard.up('ArrowRight');
  expect((await state(page)).ship.orientation).not.toEqual(before.ship.orientation);
  await page.keyboard.press('Space');await advance(page);expect((await state(page)).bullets.length).toBeGreaterThan(0);
  await page.keyboard.press('e');
  await expect(page.getByRole('checkbox',{name:'Show POV domain edges',includeHidden:true})).not.toBeChecked();
  await page.keyboard.press('p');await advance(page);expect((await state(page)).mode).toBe('paused');
  await model.focus();await page.keyboard.press('Escape');await expect(model).not.toBeFocused();
});
