# 3TorusAsteroids

[Play the game on GitHub Pages](https://davbachman.github.io/3TorusAsteroids/)

`3TorusAsteroids` is a split-screen 3D reinterpretation of Asteroids set inside a wireframe cube whose opposite faces are identified as a 3-torus. The external view clips objects at the cube walls, with the remaining portions appearing at opposite walls. The first-person view repeats the world across identified faces; asteroids have opaque black faces with white outlines. On narrow portrait screens, the views stack vertically.

Created by David Bachman with GPT-5.4

To learn more about David Bachman and his work visit https://pzacad.pitzer.edu/~dbachman/ and subscribe to his AI substack *Entropy Bonus* at https://profbachman.substack.com

## How to Play

- Trackpad or mouse: move the pointer inside the POV view to turn and look. No click is needed; leaving and re-entering the view does not jump the camera.
- Touch: hold the direction buttons and Thrust, and tap Fire. Multiple fingers can steer and thrust together.
- `Left` / `Right`: turn left or right
- `Up` / `Down`: look up or down
- `Z`: thrust
- `Space`: fire
- `P`: pause
- `F`: toggle fullscreen
- `Enter` or `Space` on the title screen: start or restart


The game pauses when the window loses focus or the tab is hidden. Use **Resume** or `P` to continue. The toolbar also provides mute, fullscreen, and control instructions.

## Development and checks

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run build` includes strict TypeScript checking. Browser tests cover desktop and mobile input, pointer steering, focus loss, opaque occlusion, wall clipping, render batching, and the production preview. Run a build before browser tests so the preview matches the source. If using an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path.

`npm run preview` serves the production build at `/3TorusAsteroids/`, matching GitHub Pages. `npm run test:preview` builds and tests that route. CI runs the unit tests, build, and browser tests on pull requests and before deploying main.

Bullets register hits across the full asteroid, including near visible edges and corners. A small aiming allowance keeps grazing shots forgiving, while swept collision checks prevent fast shots from skipping through a target.

Game logic lives in `src/game`, controls in `src/input`, rendering and the accessible HUD in `src/render`, and procedural sound in `src/audio`. The renderer shares five asteroid geometry pairs, batches outlines and fragments, and instances opaque faces. Collision checks sweep the full path through the toroidal world, including moving targets and bullet expiry.
