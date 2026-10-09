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

  for (const geometry of ['euclidean', 'hyperbolic'] as const) {
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
