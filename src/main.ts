import { Game } from './game/Game';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app root');
}

const game = new Game(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy();
  });
}
