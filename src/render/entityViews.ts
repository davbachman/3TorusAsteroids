import * as THREE from 'three';
import { GameState, WORLD_SIZE } from '../game/state';
import { ghostOffsets, tileOffsets } from '../game/wrap';
import { Quat, Vec3 } from '../utils/math';

interface InstanceDesc {
  geometry: THREE.BufferGeometry;
  position: Vec3;
  quaternion?: Quat;
  scale?: number | Vec3;
}

interface EntityViewRendererOptions {
  mode: 'boundaryGhosts' | 'toroidalGrid';
  cubeSize?: number;
  tileRange?: number;
  includeCenterShip?: boolean;
}

function applyTransform(object: THREE.LineSegments, desc: InstanceDesc): void {
  object.position.set(desc.position.x, desc.position.y, desc.position.z);
  if (desc.quaternion) {
    object.quaternion.set(desc.quaternion.x, desc.quaternion.y, desc.quaternion.z, desc.quaternion.w);
  } else {
    object.quaternion.identity();
  }

  if (typeof desc.scale === 'number') {
    object.scale.setScalar(desc.scale);
  } else if (desc.scale) {
    object.scale.set(desc.scale.x, desc.scale.y, desc.scale.z);
  } else {
    object.scale.setScalar(1);
  }
}

class LinePool {
  private readonly items: THREE.LineSegments[] = [];
  private activeCount = 0;
  private forceVisible: boolean | null = null;

  constructor(
    private readonly root: THREE.Group,
    private readonly material: THREE.LineBasicMaterial,
  ) {}

  sync(descriptors: InstanceDesc[]): void {
    this.activeCount = descriptors.length;
    while (this.items.length < descriptors.length) {
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
      line.frustumCulled = false;
      this.root.add(line);
      this.items.push(line);
    }

    for (let i = 0; i < this.items.length; i += 1) {
      const obj = this.items[i];
      const desc = descriptors[i];
      if (!desc) {
        obj.visible = false;
        continue;
      }
      obj.visible = this.forceVisible ?? true;
      if (obj.geometry !== desc.geometry) {
        obj.geometry = desc.geometry;
      }
      applyTransform(obj, desc);
    }
  }

  setForceVisibility(visible: boolean | null): void {
    this.forceVisible = visible;
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      if (i >= this.activeCount) {
        item.visible = false;
        continue;
      }
      item.visible = visible ?? true;
    }
  }

  dispose(): void {
    for (const item of this.items) {
      this.root.remove(item);
      item.geometry.dispose();
    }
    this.items.length = 0;
  }
}

function fragmentQuaternionFromVelocity(velocity: Vec3): Quat {
  const dir = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
  if (dir.lengthSq() < 1e-6) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function pushGhosted(descriptors: InstanceDesc[], base: InstanceDesc, radius: number, cubeSize: number): void {
  const offsets = ghostOffsets(base.position, radius, cubeSize);
  for (const offset of offsets) {
    descriptors.push({
      ...base,
      position: {
        x: base.position.x + offset.x,
        y: base.position.y + offset.y,
        z: base.position.z + offset.z,
      },
    });
  }
}

function pushTiled(
  descriptors: InstanceDesc[],
  base: InstanceDesc,
  cubeSize: number,
  tileRange: number,
  includeOrigin: boolean,
): void {
  const offsets = tileOffsets(tileRange, cubeSize, includeOrigin);
  for (const offset of offsets) {
    descriptors.push({
      ...base,
      position: {
        x: base.position.x + offset.x,
        y: base.position.y + offset.y,
        z: base.position.z + offset.z,
      },
    });
  }
}

export class EntityViewRenderer {
  private readonly root = new THREE.Group();
  private readonly shipPool: LinePool;
  private readonly asteroidPool: LinePool;
  private readonly bulletPool: LinePool;
  private readonly fragmentPool: LinePool;

  constructor(
    scene: THREE.Scene,
    private readonly lineMaterial: THREE.LineBasicMaterial,
    private readonly shipGeometry: THREE.BufferGeometry,
    private readonly bulletGeometry: THREE.BufferGeometry,
    private readonly fragmentGeometry: THREE.BufferGeometry,
    private readonly getAsteroidGeometry: (seed: number) => THREE.BufferGeometry,
    private readonly options: EntityViewRendererOptions = { mode: 'boundaryGhosts', cubeSize: WORLD_SIZE, tileRange: 1, includeCenterShip: true },
  ) {
    scene.add(this.root);
    this.shipPool = new LinePool(this.root, this.lineMaterial);
    this.asteroidPool = new LinePool(this.root, this.lineMaterial);
    this.bulletPool = new LinePool(this.root, this.lineMaterial);
    this.fragmentPool = new LinePool(this.root, this.lineMaterial);
  }

  render(state: GameState): void {
    const cubeSize = this.options.cubeSize ?? WORLD_SIZE;
    const tileRange = this.options.tileRange ?? 1;
    const isToroidalGrid = this.options.mode === 'toroidalGrid';
    const shipDescs: InstanceDesc[] = [];
    const showShip =
      state.ship.alive &&
      (state.time >= state.ship.invulnerableUntil || Math.floor(state.time * 10) % 2 === 0) &&
      state.mode !== 'title';

    if (showShip) {
      const base = {
        geometry: this.shipGeometry,
        position: state.ship.position,
        quaternion: state.ship.orientation,
      };
      if (isToroidalGrid) {
        pushTiled(shipDescs, base, cubeSize, tileRange, this.options.includeCenterShip ?? true);
      } else {
        pushGhosted(shipDescs, base, state.ship.radius + 2, cubeSize);
      }
    }
    this.shipPool.sync(shipDescs);

    const asteroidDescs: InstanceDesc[] = [];
    for (const asteroid of state.asteroids) {
      const base = {
        geometry: this.getAsteroidGeometry(asteroid.seed),
        position: asteroid.position,
        quaternion: asteroid.rotation,
        scale: asteroid.radius,
      };
      if (isToroidalGrid) {
        pushTiled(asteroidDescs, base, cubeSize, tileRange, true);
      } else {
        pushGhosted(asteroidDescs, base, asteroid.radius + 2, cubeSize);
      }
    }
    this.asteroidPool.sync(asteroidDescs);

    const bulletDescs: InstanceDesc[] = [];
    for (const bullet of state.bullets) {
      const base = {
        geometry: this.bulletGeometry,
        position: bullet.position,
      };
      if (isToroidalGrid) {
        pushTiled(bulletDescs, base, cubeSize, tileRange, true);
      } else {
        pushGhosted(bulletDescs, base, 2.25, cubeSize);
      }
    }
    this.bulletPool.sync(bulletDescs);

    const fragmentDescs: InstanceDesc[] = [];
    for (const fragment of state.fragments) {
      const base = {
        geometry: this.fragmentGeometry,
        position: fragment.position,
        quaternion: fragmentQuaternionFromVelocity(fragment.velocity),
        scale: {
          x: fragment.length,
          y: 1,
          z: 1,
        },
      };
      if (isToroidalGrid) {
        pushTiled(fragmentDescs, base, cubeSize, tileRange, true);
      } else {
        pushGhosted(fragmentDescs, base, fragment.length + 1, cubeSize);
      }
    }
    this.fragmentPool.sync(fragmentDescs);
  }

  setShipVisibilityForPass(visible: boolean | null): void {
    this.shipPool.setForceVisibility(visible);
  }

  dispose(): void {
    this.shipPool.dispose();
    this.asteroidPool.dispose();
    this.bulletPool.dispose();
    this.fragmentPool.dispose();
    this.root.removeFromParent();
  }
}
