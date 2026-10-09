# 3TorusAsteroids

[Play the game on GitHub Pages](https://davbachman.github.io/3TorusAsteroids/)

`3TorusAsteroids` is a split-screen 3D reinterpretation of Asteroids in a choice of compact spaces:

- **Euclidean (3-Torus)** — a cube with opposite faces identified by translation.
- **Hyperbolic (Seifert–Weber Dodecahedral)** — a regular hyperbolic dodecahedron with opposite faces identified by a 108° twist.

Choose a geometry on the opening screen. The external view clips objects at the fundamental domain's walls, with the remaining portions appearing on paired faces. The POV view looks out from the ship into the repeating universe; asteroids have opaque black faces with white outlines. On narrow portrait screens, the views stack vertically. To choose again, pause and select **Change geometry / new game**.


Created by David Bachman with GPT-5.4

To learn more about David Bachman and his work visit https://pzacad.pitzer.edu/~dbachman/ and subscribe to his AI substack *Entropy Bonus* at https://profbachman.substack.com

## How to Play

Every asteroid starts as an icosahedron. Successive hits change it into a dodecahedron, then an octahedron, then a tetrahedron; the fourth hit destroys it. Each hit shrinks the same asteroid without changing its trajectory. This progression applies in both geometries.

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

Open **Controls** and uncheck **Show POV domain edges** to hide the cube or dodecahedron boundaries in the first-person view. External boundaries and asteroid outlines stay visible. The setting carries across new games and geometry changes until the page is reloaded.

## Development and checks

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

`npm run build` includes strict TypeScript checking. Browser tests cover desktop and mobile input, pointer steering, focus loss, opaque occlusion, wall clipping, render batching, and the production preview. Run a build before browser tests so the preview matches the source. If using an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path.

`npm run preview` serves the production build at `/3TorusAsteroids/`, matching GitHub Pages. `npm run test:preview` builds and tests that route. CI runs the unit tests, build, and Chromium browser tests on Linux, plus production startup tests in Playwright WebKit on macOS, on pull requests and before deploying main. WebKit covers both geometries with mouse, keyboard, touch, pause/resume, and unavailable audio. It uses Safari’s browser engine; it is not the installed Safari application. To run only this suite locally, use `npx playwright test --project=webkit` after building.

Bullets register hits across the full asteroid, including near visible edges and corners. A small aiming allowance keeps grazing shots forgiving, while swept collision checks prevent fast shots from skipping through a target.

Geometry and metric operations live in `src/geometry`, game logic in `src/game`, controls in `src/input`, rendering and the accessible HUD in `src/render`, and procedural sound in `src/audio`. The renderer shares five asteroid geometry pairs, batches outlines and fragments, and instances opaque faces. Collision checks sweep the full path through the toroidal world, including moving targets and bullet expiry.

## Hyperbolic geometry

This mode uses the Seifert–Weber space, rather than the spherical Poincaré dodecahedral space. The regular fundamental dodecahedron has 72° dihedral angles, five cells around each edge, and twenty at each vertex. Its curvature radius is 50 game units.

The simulation uses the hyperboloid model and Lorentz isometries for geodesic movement, parallel transport, and 108° face pairings. Entity positions are stored in Klein coordinates; velocity and orientation are measured in the canonical local orthonormal frame. Collision sweeps use hyperbolic distances and an adaptive speed bound, including images across paired faces. The external view uses the Klein model, where geodesic faces and edges are flat/straight. The first-person renderer moves the observer to the origin by a Lorentz isometry before projection, rather than copying objects with Euclidean translations.

For finite rendering cost, the repeating view fades out at 4.0 curvature radii (3.2 on devices with a coarse pointer), with fading confined to the final 0.55 radii. This is a draw distance, not a boundary of the space. The visible cover is enumerated around the observer and regenerated as they move. Browser tests compare equivalent views across a face pairing and verify opaque occlusion; unit tests check the metric, face inverses, edge/vertex cycles, transport, safe spawns, and collision sweeps.

Mathematical references and visual inspiration:

- [Jeff Weeks’ Curved Spaces](https://www.geometrygames.org/CurvedSpaces/) — an observer's view in multiply connected spaces.
- [Steve Trettel, Measurements of Regular Hyperbolic Dodecahedra](https://stevejtrettel.site/notes/2024/hyperbolic-dodecahedra/) — Seifert–Weber inradius, circumradius, and dihedral angles.

The implementation is original; no Curved Spaces source code is included.
