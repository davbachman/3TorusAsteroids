import './style.css';
import { Game } from './game/Game';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root');
}

let game: Game | undefined;
try {
  game = new Game(root);
} catch {
  root.innerHTML = '<main style="padding:32px"><h1>Unable to start 3Torus Asteroids</h1><p>This game needs WebGL. Try enabling graphics acceleration or opening it in another browser.</p></main>';
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.destroy();
  });
}
