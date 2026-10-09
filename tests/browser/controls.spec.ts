import {test,expect} from '@playwright/test';
import {load,start,state,advance} from './helpers';

test('keyboard, pointer steering, focus loss, mute, and restart',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page);await start(page);
  // Move outside the menu before exercising game keyboard controls.
  await page.locator('canvas').click({position:{x:30,y:100}});
  await page.keyboard.down('z');await advance(page,250);await page.keyboard.up('z');
  expect((await state(page)).ship.velocity.z).toBeGreaterThan(0);
  await page.keyboard.press('Space');await advance(page);expect((await state(page)).bullets.length).toBeGreaterThan(0);
  const field=(await page.locator('.playfield').boundingBox())!;
  const x=field.x+field.width*.75,y=field.y+field.height*.5;
  await page.mouse.move(x,y);const before=(await state(page)).ship.orientation;
  await page.mouse.move(x+60,y-30,{steps:4});await advance(page);
  const steered=(await state(page)).ship.orientation;expect(steered).not.toEqual(before);
  await advance(page,100);expect((await state(page)).ship.orientation).toEqual(steered);
  await page.mouse.move(field.x+100,y);await page.mouse.move(field.x+150,y+20);await advance(page);
  expect((await state(page)).ship.orientation).toEqual(steered);
  await page.mouse.move(x,y);await advance(page);expect((await state(page)).ship.orientation).toEqual(steered);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await advance(page);
  const paused=await state(page);expect(paused.mode).toBe('paused');await advance(page,1000);expect((await state(page)).time).toBe(paused.time);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();await advance(page);expect((await state(page)).mode).toBe('playing');
  await page.getByRole('button',{name:'Mute',exact:true}).click();await expect(page.getByRole('button',{name:'Unmute',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await page.evaluate(()=>document.exitFullscreen());
  expect(errors).toEqual([]);
});

test('phone portrait and landscape layouts support multi-touch and readable menus',async({page})=>{
  await page.setViewportSize({width:390,height:844});await load(page);
  await expect(page.getByRole('heading',{name:'3Torus Asteroids'})).toBeVisible();await start(page);
  const thrust=page.getByRole('button',{name:'Thrust',exact:true}),right=page.getByRole('button',{name:'Turn right',exact:true});
  const before=(await state(page)).ship;
  // Real captured pointers, including simultaneous thrust and turn.
  const cdp=await page.context().newCDPSession(page);
  const a=(await thrust.boundingBox())!,b=(await right.boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1},{x:b.x+b.width/2,y:b.y+b.height/2,id:2}]});
  await advance(page,250);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=(await state(page)).ship;expect(after.position).not.toEqual(before.position);expect(after.orientation).not.toEqual(before.orientation);
  await advance(page,100);expect((await state(page)).ship.orientation).toEqual(after.orientation);
  await page.getByRole('button',{name:'Fire',exact:true}).click();await advance(page);expect((await state(page)).bullets.length).toBeGreaterThan(0);
  for(const size of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    for(const selector of ['.stats','[data-hold="KeyZ"]','[data-fire]','.playfield']) {
      const rect=(await page.locator(selector).boundingBox())!;expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x+rect.width).toBeLessThanOrEqual(size.width);expect(rect.y+rect.height).toBeLessThanOrEqual(size.height);
    }
  }
});

test('hidden document pauses and clears queued controls',async({page})=>{
  await load(page);await start(page);
  await page.evaluate(()=>{
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await advance(page);expect((await state(page)).mode).toBe('paused');expect((await state(page)).bullets).toHaveLength(0);
});
