import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardInput} from '../src/input/keyboard';

test('repeat fire does not restart a game, and focus loss clears queued actions', () => {
  const target = new EventTarget();
  const input = new KeyboardInput(target as unknown as Window);
  input.attach();
  input.press('Space',false);
  const repeated = input.consumeStepInput();
  assert.ok(repeated.firePressed); assert.equal(repeated.startPressed,false);
  input.press('Space'); input.press('KeyP'); input.hold('KeyZ',1);
  target.dispatchEvent(new Event('blur'));
  const cleared = input.consumeStepInput();
  assert.equal(cleared.firePressed,false);assert.equal(cleared.pausePressed,false);assert.equal(cleared.thrust,false);
  input.destroy();
});
test('releasing one touch does not release another touch or other controls', () => {
  const input = new KeyboardInput(new EventTarget() as unknown as Window);
  input.hold('KeyZ',1);input.hold('KeyZ',2);input.hold('ArrowRight',3);input.release(1);
  assert.ok(input.consumeStepInput().thrust);input.release(2);
  const result=input.consumeStepInput();assert.equal(result.thrust,false);assert.ok(result.right);
});
