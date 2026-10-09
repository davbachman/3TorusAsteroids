import { CurvedScene } from './curvedScene';
import * as Spherical from '../geometry/spherical';
import { GeometryId } from '../geometry/types';
import { VERTICES, CIRCUMRADIUS, CURVATURE_RADIUS } from '../geometry/hyperbolic';
import { DEFAULT_HYPERBOLIC_MODEL, HyperbolicModel } from './externalModel';
import * as THREE from 'three';
import { AsteroidSize, AsteroidSolid, GameState, WORLD_SIZE, getAsteroidSolid } from '../game/state';
import { tileOffsets } from '../game/wrap';
import { forwardFromQuat, upFromQuat } from '../utils/math';
import { createAsteroidLineGeometry, createAsteroidSolidGeometry, createBulletLineGeometry, createCubeLineGeometry, createShipLineGeometry, createUnitFragmentGeometry } from './geometries';
import { AsteroidGeometry, EntityViewRenderer, LineBatch } from './entityViews';
import { HudActions, HudRenderer } from './hud';
import { Viewport, viewports } from './layout';

export class SceneRenderer {
  readonly wrapper = document.createElement('div');
  readonly viewport = document.createElement('div');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly externalScene = new THREE.Scene();
  private readonly torusScene = new THREE.Scene();
  private readonly externalCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  private readonly shipCamera = new THREE.PerspectiveCamera(68, 1, 0.05, 1000);
  private readonly lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, depthWrite: false });
  private readonly externalMaterial: THREE.LineBasicMaterial;
  private readonly faceMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000, side: THREE.DoubleSide, depthWrite: true,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  private readonly cubeGeometry = createCubeLineGeometry(WORLD_SIZE);
  private readonly shipGeometry = createShipLineGeometry();
  private readonly bulletGeometry = createBulletLineGeometry();
  private readonly fragmentGeometry = createUnitFragmentGeometry();
  private readonly cubes: LineBatch[] = [];
  private readonly povBoundary: LineBatch;
  private showPovDomainEdges = true;
  private externalModel: HyperbolicModel = DEFAULT_HYPERBOLIC_MODEL;
  private readonly externalEntityViews: EntityViewRenderer;
  private readonly torusEntityViews: EntityViewRenderer;
  private readonly hud: HudRenderer;
  private readonly asteroidGeometryCache = new Map<AsteroidSolid, AsteroidGeometry>();
  private readonly observer: ResizeObserver;
  private geometry:GeometryId='euclidean';
  private hyperbolic?:CurvedScene;
  private spherical?:CurvedScene;
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor(root: HTMLElement) {
    this.wrapper.className = 'game'; this.viewport.className = 'playfield';
    this.wrapper.append(this.viewport); root.append(this.wrapper);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'External fundamental domain and first-person geometry views');
    canvas.setAttribute('role', 'img');
    this.viewport.append(canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (error) {
      this.wrapper.remove();
      throw error;
    }
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;
    const half = WORLD_SIZE / 2;
    this.externalMaterial = this.lineMaterial.clone();
    this.externalMaterial.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), half), new THREE.Plane(new THREE.Vector3(-1, 0, 0), half),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), half), new THREE.Plane(new THREE.Vector3(0, -1, 0), half),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), half), new THREE.Plane(new THREE.Vector3(0, 0, -1), half),
    ];
    this.addCubes(this.externalScene, 0); this.povBoundary = this.addCubes(this.torusScene, 1);
    this.externalEntityViews = new EntityViewRenderer(this.externalScene, this.externalMaterial,
      this.shipGeometry, this.bulletGeometry, this.fragmentGeometry, size => this.getAsteroidGeometry(size), false);
    this.torusEntityViews = new EntityViewRenderer(this.torusScene, this.lineMaterial,
      this.shipGeometry, this.bulletGeometry, this.fragmentGeometry, size => this.getAsteroidGeometry(size), true, this.faceMaterial);
    this.hud = new HudRenderer(this.wrapper, this.viewport);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.viewport);
    this.resize();
  }

  bindControls(actions: HudActions): void { this.hud.bind(actions); }

  setPovDomainEdges(visible: boolean): void {
    this.showPovDomainEdges = visible;
    this.povBoundary.object.visible = visible;
    this.hud.setPovDomainEdges(visible);
  }

  togglePovDomainEdges(): void { this.setPovDomainEdges(!this.showPovDomainEdges); }

  setExternalModel(model: HyperbolicModel): void {
    this.externalModel = model;
    this.hyperbolic?.setExternalModel(model);
    this.resize();
  }

  private getAsteroidGeometry(size: AsteroidSize): AsteroidGeometry {
    const solid = getAsteroidSolid(size);
    let geometry = this.asteroidGeometryCache.get(solid);
    if (!geometry) {
      geometry = { edges: createAsteroidLineGeometry(size), solid: createAsteroidSolidGeometry(size) };
      this.asteroidGeometryCache.set(solid, geometry);
    }
    return geometry;
  }

  resize(): void {
    const rect = this.viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width)), height = Math.max(1, Math.floor(rect.height));
    this.viewportWidth = width; this.viewportHeight = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    const {external, pov} = viewports(width, height);
    this.externalCamera.aspect = external.width / external.height;
    // Fit the cube's bounding sphere to the narrower field of view.
    const vertical = THREE.MathUtils.degToRad(this.externalCamera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.externalCamera.aspect);
    const vertices=this.geometry==='spherical'?Spherical.VERTICES:VERTICES;
    let radius=this.geometry!=='euclidean'?Math.hypot(vertices[0].x,vertices[0].y,vertices[0].z):Math.sqrt(3)*WORLD_SIZE/2;
    if (this.geometry==='spherical') radius=Spherical.CURVATURE_RADIUS*Math.tan(Spherical.CIRCUMRADIUS/2);
    if (this.geometry==='hyperbolic' && this.externalModel==='poincare') radius=CURVATURE_RADIUS*Math.tanh(CIRCUMRADIUS/2);
    const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.06;
    this.externalCamera.position.set(260, 180, 110).normalize().multiplyScalar(distance);
    this.externalCamera.far = distance + WORLD_SIZE * 3;
    this.externalCamera.lookAt(0, 0, 0); this.externalCamera.updateProjectionMatrix();
    this.shipCamera.aspect = pov.width / pov.height; this.shipCamera.updateProjectionMatrix();
    this.hud.resize(external, pov);
  }

  render(state: GameState): void {
    if(this.geometry!==state.geometry){this.geometry=state.geometry;this.resize();}
    let externalScene=this.externalScene,povScene=this.torusScene;
    if(state.geometry!=='euclidean') {
      const curved = state.geometry==='spherical'
        ? this.spherical??=new CurvedScene(this.shipGeometry,this.bulletGeometry,this.fragmentGeometry,size=>this.getAsteroidGeometry(size),Spherical)
        : this.hyperbolic??=new CurvedScene(this.shipGeometry,this.bulletGeometry,this.fragmentGeometry,size=>this.getAsteroidGeometry(size));
      this.shipCamera.position.set(0,0,0);this.shipCamera.up.set(0,1,0);this.shipCamera.lookAt(0,0,1);
      curved.setExternalModel(this.externalModel);
      curved.update(state,this.shipCamera,this.showPovDomainEdges);
      externalScene=curved.external;povScene=curved.pov;
    } else {
      const forward = forwardFromQuat(state.ship.orientation), up = upFromQuat(state.ship.orientation);
      const eye = state.ship.position;
      this.shipCamera.position.set(eye.x, eye.y, eye.z);
      this.shipCamera.up.set(up.x, up.y, up.z);
      this.shipCamera.lookAt(eye.x + forward.x, eye.y + forward.y, eye.z + forward.z);
      this.externalEntityViews.render(state, this.externalCamera);
      this.torusEntityViews.render(state, this.shipCamera);
    }
    const { external, pov } = viewports(this.viewportWidth, this.viewportHeight);
    this.renderer.setScissorTest(false); this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    this.setViewport(external); this.renderer.render(externalScene, this.externalCamera);
    this.setViewport(pov); this.renderer.render(povScene, this.shipCamera);
    this.renderer.setScissorTest(false);
    this.hud.render(state);
  }

  private setViewport(rect: Viewport): void {
    const y = this.viewportHeight - rect.y - rect.height;
    this.renderer.setViewport(rect.x, y, rect.width, rect.height);
    this.renderer.setScissor(rect.x, y, rect.width, rect.height);
  }

  private addCubes(scene: THREE.Scene, range: number): LineBatch {
    const batch = new LineBatch(scene, this.lineMaterial);
    const matrix = new THREE.Matrix4();
    batch.begin();
    for (const offset of tileOffsets(range, WORLD_SIZE)) {
      batch.append(this.cubeGeometry, matrix.makeTranslation(offset.x, offset.y, offset.z));
    }
    batch.finish(); this.cubes.push(batch);
    return batch;
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        if (!this.wrapper.requestFullscreen) throw new Error('Fullscreen unavailable');
        await this.wrapper.requestFullscreen();
      } else if (document.fullscreenElement === this.wrapper) await document.exitFullscreen();
      this.resize();
    } catch {
      this.hud.notify('Fullscreen is unavailable in this browser or window.');
    }
  }

  destroy(): void {
    this.observer.disconnect(); this.hud.destroy(); this.hyperbolic?.destroy(); this.spherical?.destroy();
    this.externalEntityViews.dispose(); this.torusEntityViews.dispose();
    for (const geometry of this.asteroidGeometryCache.values()) { geometry.edges.dispose(); geometry.solid.dispose(); }
    this.asteroidGeometryCache.clear();
    for (const cube of this.cubes) cube.dispose();
    for (const geometry of [this.cubeGeometry, this.shipGeometry, this.bulletGeometry, this.fragmentGeometry]) geometry.dispose();
    this.lineMaterial.dispose(); this.externalMaterial.dispose(); this.faceMaterial.dispose();
    this.renderer.dispose(); this.wrapper.remove();
  }
}
