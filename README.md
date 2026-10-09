# 3D Topology Asteroids

[Play the game on GitHub Pages](https://davbachman.github.io/3TorusAsteroids/)

**3D Topology Asteroids** is a split-screen 3D reinterpretation of Asteroids in a choice of compact spaces:

- **Euclidean (3-Torus)** — a cube with opposite faces identified by translation.
- **Hyperbolic (Seifert–Weber Dodecahedral)** — a regular hyperbolic dodecahedron with opposite faces identified by a 108° twist.
- **Spherical (Poincaré Dodecahedral)** — a regular spherical dodecahedron with opposite faces identified by a 36° twist.

Choose a geometry on the opening screen. The external view clips objects at the fundamental domain's walls, with the remaining portions appearing on paired faces. The POV view looks out from the ship into the repeating universe; asteroids have opaque black faces with white outlines. On narrow portrait screens, the views stack vertically. To choose again, pause and select **Change geometry / new game**.


Created by David Bachman with GPT-5.4

To learn more about David Bachman and his work visit https://pzacad.pitzer.edu/~dbachman/ and subscribe to his AI substack *Entropy Bonus* at https://profbachman.substack.com

## How to Play

Asteroids are irregular, jagged 3D rocks with opaque black faces and white outlines in the POV view. A large rock splits into two medium rocks; each medium rock splits into two small rocks. Small rocks break into debris. Pieces inherit the parent’s motion and spin, then fly apart. This classic three-size progression applies in all three geometries, including splits across paired faces. Large, medium, and small rocks award 20, 50, and 100 points respectively.

- Trackpad or mouse: move the pointer inside the POV view to turn and look. No click is needed; leaving and re-entering the view does not jump the camera.
- Touch: hold the direction buttons and Thrust, and tap Fire. Multiple fingers can steer and thrust together.
- `Left` / `Right`: turn left or right
- `Up` / `Down`: look up or down
- `Z`: thrust
- `Space`: fire
- `P`: pause
- `F`: toggle fullscreen
- `E`: toggle fundamental domain edges in the POV view
- `Enter` or `Space` on the title screen: start or restart


The game pauses when the window loses focus or the tab is hidden. Use **Resume** or `P` to continue. The toolbar also provides mute, fullscreen, and control instructions.

In hyperbolic mode, the **Model** dropdown at the bottom of the external pane switches between **Poincaré ball** (the default, with curved geodesics) and **Klein** (straight geodesics). This changes only the external display. The choice carries across new games and geometry changes until reload. Spherical mode displays a single curved dodecahedral cell using stereographic projection.

Press **E**, or open **Controls** and uncheck **Show POV domain edges**, to hide the cube or dodecahedron boundaries in the first-person view. The shortcut and checkbox stay synchronized. External boundaries and asteroid outlines stay visible. The setting carries across new games and geometry changes until the page is reloaded.

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

`npm run preview` serves the production build at `/3TorusAsteroids/`, matching GitHub Pages. `npm run test:preview` builds and tests that route. CI runs the unit tests, build, and Chromium browser tests on Linux, plus production startup tests in Playwright WebKit on macOS, on pull requests and before deploying main. WebKit covers all three geometries with mouse, keyboard, touch, pause/resume, and unavailable audio. It uses Safari’s browser engine; it is not the installed Safari application. To run only this suite locally, use `npx playwright test --project=webkit` after building.

Bullets register hits across the full asteroid, including near visible edges and corners. A small aiming allowance keeps grazing shots forgiving, while swept collision checks prevent fast shots from skipping through a target.

Geometry and metric operations live in `src/geometry`, game logic in `src/game`, controls in `src/input`, rendering and the accessible HUD in `src/render`, and procedural sound in `src/audio`. The renderer shares six irregular rock geometry pairs, batches outlines and fragments, and instances opaque faces. Collision checks sweep the full path through the toroidal world, including moving targets and bullet expiry.

## Hyperbolic geometry

This mode uses the Seifert–Weber space, rather than the spherical Poincaré dodecahedral space. The regular fundamental dodecahedron has 72° dihedral angles, five cells around each edge, and twenty at each vertex. Its curvature radius is 50 game units.

The simulation uses the hyperboloid model and Lorentz isometries for geodesic movement, parallel transport, and 108° face pairings. Entity positions are stored in Klein coordinates; velocity and orientation are measured in the canonical local orthonormal frame. Collision sweeps use hyperbolic distances and an adaptive speed bound, including images across paired faces. The external view offers the Poincaré ball and Klein models. Its line geometry samples true geodesics before projection, so edges curve in the Poincaré ball and stay straight in Klein. Asteroid pieces are clipped against the original hyperbolic face half-spaces before display, so wrapping also follows the curved faces. The first-person renderer moves the observer to the origin by a Lorentz isometry before projection, rather than copying objects with Euclidean translations.

For finite rendering cost, the repeating view fades out at 4.0 curvature radii (3.2 on devices with a coarse pointer), with fading confined to the final 0.55 radii. This is a draw distance, not a boundary of the space. The visible cover is enumerated around the observer and regenerated as they move. Browser tests compare equivalent views across a face pairing and verify opaque occlusion; unit tests check the metric, face inverses, edge/vertex cycles, transport, safe spawns, and collision sweeps.

Mathematical references and visual inspiration:

- [Jeff Weeks’ Curved Spaces](https://www.geometrygames.org/CurvedSpaces/) — an observer's view in multiply connected spaces.
- [Steve Trettel, Measurements of Regular Hyperbolic Dodecahedra](https://stevejtrettel.site/notes/2024/hyperbolic-dodecahedra/) — Seifert–Weber inradius, circumradius, and dihedral angles.

The implementation is original; no Curved Spaces source code is included.


## Spherical geometry

The Poincaré homology sphere is the quotient of the round 3-sphere by the binary icosahedral group. Its 120-cell universal cover is generated by the actual face-pairing isometries. The dodecahedron has 120° dihedral angles, three cells around each edge, and four at each vertex. A curvature radius of 120 game units gives a fundamental domain comparable in size to the other modes.

Positions use a gnomonic chart of the central domain; movement follows great circles in four dimensions, with parallel transport of velocity and orientation. The same identifications apply to ships, asteroids, bullets, fragments, and swept collision checks. The external view shows one spherical dodecahedron in stereographic coordinates, with outward-curving geodesic edges. Wrapped pieces are clipped against the spherical face half-spaces. This display projection does not change the simulation’s stored gnomonic coordinates.

The POV transforms the entire 120-cell cover into the observer's orthonormal frame and projects light directions onto the screen. It includes both hemispheres of the covering sphere, up to geodesic distance π times the curvature radius. Per-fragment angular depth makes nearer opaque surfaces occlude farther images. Positive curvature makes objects shrink toward the equator and grow again toward the antipodal focusing point. The renderer uses the shortest paths in the covering sphere; additional light circuits beyond the antipode are not drawn. There is no distance fade in this mode. Bullet lifetime remains the same as in the other modes.

Tests verify group closure, face pairings, edge/vertex incidence, closed great circles, parallel transport, safe spawns, collision sweeps, the full rock-splitting progression, opaque occlusion, and continuity across paired faces. The POV edge toggle and keyboard, pointer, and touch controls apply to all three geometries.
