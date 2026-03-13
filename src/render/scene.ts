import * as THREE from 'three';
import { GameState, WORLD_SIZE } from '../game/state';
import { tileOffsets } from '../game/wrap';
import { forwardFromQuat, upFromQuat } from '../utils/math';
import { createAsteroidLineGeometry, createBulletLineGeometry, createCubeLineGeometry, createShipLineGeometry, createUnitFragmentGeometry } from './geometries';
import { EntityViewRenderer } from './entityViews';
import { HudRenderer } from './hud';

export class SceneRenderer {
  private readonly wrapper: HTMLDivElement;
  private readonly hudCanvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly externalScene: THREE.Scene;
  private readonly torusScene: THREE.Scene;
  private readonly externalCamera: THREE.PerspectiveCamera;
  private readonly shipCamera: THREE.PerspectiveCamera;
  private readonly lineMaterial: THREE.LineBasicMaterial;
  private readonly cubeGeometry: THREE.BufferGeometry;
  private readonly externalEntityViews: EntityViewRenderer;
  private readonly torusEntityViews: EntityViewRenderer;
  private readonly hud: HudRenderer;
  private readonly asteroidGeometryCache = new Map<number, THREE.BufferGeometry>();
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor(private readonly root: HTMLElement) {
    this.wrapper = document.createElement('div');
    this.wrapper.style.position = 'relative';
    this.wrapper.style.width = '100%';
    this.wrapper.style.height = '100%';
    this.wrapper.style.background = '#000';
    this.wrapper.style.overflow = 'hidden';
    root.appendChild(this.wrapper);

    const webglCanvas = document.createElement('canvas');
    webglCanvas.style.position = 'absolute';
    webglCanvas.style.inset = '0';
    webglCanvas.style.width = '100%';
    webglCanvas.style.height = '100%';
    this.wrapper.appendChild(webglCanvas);

    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.style.position = 'absolute';
    this.hudCanvas.style.inset = '0';
    this.hudCanvas.style.pointerEvents = 'none';
    this.wrapper.appendChild(this.hudCanvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.externalScene = new THREE.Scene();
    this.torusScene = new THREE.Scene();
    this.externalCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 1200);
    this.externalCamera.position.set(260, 180, 110);
    this.externalCamera.lookAt(0, 0, 0);

    this.shipCamera = new THREE.PerspectiveCamera(68, 1, 0.05, 1000);
    this.shipCamera.position.set(0, 0, 0);
    this.shipCamera.lookAt(0, 0, 1);

    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.cubeGeometry = createCubeLineGeometry(WORLD_SIZE);
    this.addCubeInstances(this.externalScene, 0);
    this.addCubeInstances(this.torusScene, 1);

    const shipGeometry = createShipLineGeometry();
    const bulletGeometry = createBulletLineGeometry();
    const fragmentGeometry = createUnitFragmentGeometry();

    this.externalEntityViews = new EntityViewRenderer(
      this.externalScene,
      this.lineMaterial,
      shipGeometry,
      bulletGeometry,
      fragmentGeometry,
      (seed) => this.getAsteroidGeometry(seed),
      { mode: 'boundaryGhosts', cubeSize: WORLD_SIZE, tileRange: 1, includeCenterShip: true },
    );

    this.torusEntityViews = new EntityViewRenderer(
      this.torusScene,
      this.lineMaterial,
      shipGeometry,
      bulletGeometry,
      fragmentGeometry,
      (seed) => this.getAsteroidGeometry(seed),
      { mode: 'toroidalGrid', cubeSize: WORLD_SIZE, tileRange: 1, includeCenterShip: false },
    );

    this.hud = new HudRenderer(this.hudCanvas);
    this.resize();
  }

  private getAsteroidGeometry(seed: number): THREE.BufferGeometry {
    const cached = this.asteroidGeometryCache.get(seed);
    if (cached) return cached;
    const geometry = createAsteroidLineGeometry(seed);
    this.asteroidGeometryCache.set(seed, geometry);
    return geometry;
  }

  resize(): void {
    const rect = this.wrapper.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.updateCameraAspects();
    this.hud.resize(width, height, dpr);
  }

  render(state: GameState): void {
    this.updateShipCamera(state);
    this.externalEntityViews.render(state);
    this.torusEntityViews.render(state);

    const leftWidth = Math.max(1, Math.floor(this.viewportWidth * 0.5));
    const rightWidth = Math.max(1, this.viewportWidth - leftWidth);
    const height = Math.max(1, this.viewportHeight);

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
    this.renderer.setScissor(0, 0, this.viewportWidth, this.viewportHeight);
    this.renderer.clear(true, true, true);

    this.renderer.setViewport(0, 0, leftWidth, height);
    this.renderer.setScissor(0, 0, leftWidth, height);
    this.renderer.render(this.externalScene, this.externalCamera);

    this.renderer.setViewport(leftWidth, 0, rightWidth, height);
    this.renderer.setScissor(leftWidth, 0, rightWidth, height);
    this.renderer.render(this.torusScene, this.shipCamera);
    this.renderer.setScissorTest(false);

    this.hud.render(state);
  }

  private updateCameraAspects(): void {
    const leftWidth = Math.max(1, Math.floor(this.viewportWidth * 0.5));
    const rightWidth = Math.max(1, this.viewportWidth - leftWidth);
    const height = Math.max(1, this.viewportHeight);

    this.externalCamera.aspect = leftWidth / height;
    this.externalCamera.updateProjectionMatrix();
    this.shipCamera.aspect = rightWidth / height;
    this.shipCamera.updateProjectionMatrix();
  }

  private updateShipCamera(state: GameState): void {
    const forward = forwardFromQuat(state.ship.orientation);
    const up = upFromQuat(state.ship.orientation);
    // Anchor the POV camera at the ship's rotation origin so yaw/pitch feels like in-place head movement.
    const eyeOffset = 0;
    const eyeX = state.ship.position.x + forward.x * eyeOffset;
    const eyeY = state.ship.position.y + forward.y * eyeOffset;
    const eyeZ = state.ship.position.z + forward.z * eyeOffset;

    this.shipCamera.position.set(eyeX, eyeY, eyeZ);
    this.shipCamera.up.set(up.x, up.y, up.z);
    this.shipCamera.lookAt(eyeX + forward.x * 50, eyeY + forward.y * 50, eyeZ + forward.z * 50);
  }

  private addCubeInstances(scene: THREE.Scene, tileRange: number): void {
    const offsets = tileOffsets(tileRange, WORLD_SIZE, true);
    for (const offset of offsets) {
      const cube = new THREE.LineSegments(this.cubeGeometry, this.lineMaterial);
      cube.frustumCulled = false;
      cube.position.set(offset.x, offset.y, offset.z);
      scene.add(cube);
    }
  }

  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      await this.wrapper.requestFullscreen?.();
    } else if (document.fullscreenElement === this.wrapper) {
      await document.exitFullscreen();
    }
    this.resize();
  }

  destroy(): void {
    this.externalEntityViews.dispose();
    this.torusEntityViews.dispose();
    for (const geometry of this.asteroidGeometryCache.values()) {
      geometry.dispose();
    }
    this.asteroidGeometryCache.clear();
    this.cubeGeometry.dispose();
    this.lineMaterial.dispose();
    this.renderer.dispose();
    this.wrapper.remove();
  }
}
