import {test,expect} from '@playwright/test';
import {load,start,state,advance} from './helpers';

test('production assets load under the GitHub Pages base path',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page);await start(page);expect((await state(page)).mode).toBe('playing');
  await page.locator('canvas').click({position:{x:30,y:100}});
  await page.keyboard.press('Space');await advance(page);expect((await state(page)).bullets.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
