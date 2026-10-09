import {Page} from '@playwright/test';
import type {GameState} from '../../src/game/state';

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __gameDebug: {getState:()=>GameState;forceStart:()=>void;forceAsteroid:()=>void};
  }
}
export async function load(page:Page) {
  await page.goto('./');
  await page.waitForFunction(()=>typeof window.advanceTime==='function');
  await advance(page,17);
}
export async function advance(page:Page,ms=17) {await page.evaluate(ms=>window.advanceTime(ms),ms);}
export async function state(page:Page) {return page.evaluate(()=>window.__gameDebug.getState());}
export async function start(page:Page) {
  await page.getByRole('button',{name:'Start game',exact:true}).click();await advance(page);
  await page.evaluate(()=>{window.__gameDebug.getState().ship.invulnerableUntil=99999;});
}
