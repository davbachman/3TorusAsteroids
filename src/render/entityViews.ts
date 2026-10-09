import * as THREE from 'three';
import { GameState, AsteroidSolid, WORLD_SIZE, getAsteroidSolid } from '../game/state';
import { ghostOffsets, tileOffsets } from '../game/wrap';
import { Quat, Vec3 } from '../utils/math';

export interface AsteroidGeometry {
  edges: THREE.BufferGeometry;
  solid: THREE.BufferGeometry;
}

// One reusable vertex buffer replaces hundreds of separate line draw calls.
export class LineBatch {
  readonly geometry = new THREE.BufferGeometry();
  readonly object: THREE.LineSegments;
  private positions = new Float32Array(3072);
  private used = 0;
  private readonly vertex = new THREE.Vector3();

  constructor(scene: THREE.Scene, material: THREE.LineBasicMaterial) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.LineSegments(this.geometry, material);
    this.object.frustumCulled = false; // Individual objects are culled before batching.
    this.object.renderOrder = 1; // All opaque surfaces write depth before outlines.
    scene.add(this.object);
  }

  begin(): void { this.used = 0; }

  append(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    const source = geometry.getAttribute('position');
    const required = this.used + source.count * 3;
    if (required > this.positions.length) {
      const next = new Float32Array(Math.max(required, this.positions.length * 2));
      next.set(this.positions);
      this.positions = next;
      this.geometry.dispose();
      this.geometry.setAttribute('position', new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage));
    }
    for (let i = 0; i < source.count; i++) {
      this.vertex.fromBufferAttribute(source, i).applyMatrix4(matrix);
      this.positions[this.used++] = this.vertex.x;
      this.positions[this.used++] = this.vertex.y;
      this.positions[this.used++] = this.vertex.z;
    }
  }

  finish(): void {
    this.geometry.setDrawRange(0, this.used / 3);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.object.visible = this.used > 0;
  }

  dispose(): void { this.object.removeFromParent(); this.geometry.dispose(); }
}

class SolidBatch {
  private mesh: THREE.InstancedMesh;
  private count = 0;
  constructor(private scene: THREE.Scene, private geometry: THREE.BufferGeometry, private material: THREE.MeshBasicMaterial) {
    this.mesh = this.create(32);
  }
  private create(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }
  begin(): void { this.count = 0; }
  append(matrix: THREE.Matrix4): void {
    if (this.count === this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.create(old.instanceMatrix.count * 2);
      this.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
      old.removeFromParent(); old.dispose();
    }
    this.mesh.setMatrixAt(this.count++, matrix);
  }
  finish(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void { this.mesh.removeFromParent(); this.mesh.dispose(); }
}

export class EntityViewRenderer {
  private readonly lines: LineBatch;
  private readonly solids = new Map<AsteroidSolid, SolidBatch>();
  private readonly offsets = tileOffsets(1, WORLD_SIZE);
  private readonly frustum = new THREE.Frustum();
  private readonly sphere = new THREE.Sphere();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly fragmentRotation = new THREE.Quaternion();
  private readonly direction = new THREE.Vector3();
  private readonly xAxis = new THREE.Vector3(1, 0, 0);

  constructor(
    scene: THREE.Scene,
    material: THREE.LineBasicMaterial,
    private readonly shipGeometry: THREE.BufferGeometry,
    private readonly bulletGeometry: THREE.BufferGeometry,
    private readonly fragmentGeometry: THREE.BufferGeometry,
    private readonly getAsteroidGeometry: (seed: number) => AsteroidGeometry,
    private readonly toroidal: boolean,
    faceMaterial?: THREE.MeshBasicMaterial,
  ) {
    this.lines = new LineBatch(scene, material);
    if (faceMaterial) {
      for (let seed = 0; seed < 5; seed++) {
        this.solids.set(getAsteroidSolid(seed), new SolidBatch(scene, getAsteroidGeometry(seed).solid, faceMaterial));
      }
    }
  }

  private emit(geometry: THREE.BufferGeometry, position: Vec3, radius: number,
    quaternion?: Quat, scale: number | Vec3 = 1, solid?: SolidBatch, hideCenter = false): void {
    const offsets = this.toroidal ? this.offsets : ghostOffsets(position, radius, WORLD_SIZE);
    this.rotation.set(quaternion?.x ?? 0, quaternion?.y ?? 0, quaternion?.z ?? 0, quaternion?.w ?? 1);
    if (typeof scale === 'number') this.scale.setScalar(scale);
    else this.scale.set(scale.x, scale.y, scale.z);
    for (const offset of offsets) {
      if (hideCenter && offset.x === 0 && offset.y === 0 && offset.z === 0) continue;
      this.position.set(position.x + offset.x, position.y + offset.y, position.z + offset.z);
      this.sphere.center.copy(this.position); this.sphere.radius = radius;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.lines.append(geometry, this.matrix);
      solid?.append(this.matrix);
    }
  }

  render(state: GameState, camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.lines.begin();
    for (const solid of this.solids.values()) solid.begin();
    const showShip = state.ship.alive && state.mode !== 'title' &&
      (state.time >= state.ship.invulnerableUntil || Math.floor(state.time * 10) % 2 === 0);
    if (showShip) this.emit(this.shipGeometry, state.ship.position, 4, state.ship.orientation, 1, undefined, this.toroidal);
    for (const asteroid of state.asteroids) {
      this.emit(this.getAsteroidGeometry(asteroid.seed).edges, asteroid.position, asteroid.radius,
        asteroid.rotation, asteroid.radius, this.solids.get(getAsteroidSolid(asteroid.seed)));
    }
    for (const bullet of state.bullets) this.emit(this.bulletGeometry, bullet.position, 1);
    for (const fragment of state.fragments) {
      this.direction.set(fragment.velocity.x, fragment.velocity.y, fragment.velocity.z);
      if (this.direction.lengthSq() < 1e-6) this.fragmentRotation.identity();
      else this.fragmentRotation.setFromUnitVectors(this.xAxis, this.direction.normalize());
      this.emit(this.fragmentGeometry, fragment.position, fragment.length, this.fragmentRotation, {x: fragment.length, y: 1, z: 1});
    }
    this.lines.finish();
    for (const solid of this.solids.values()) solid.finish();
  }

  dispose(): void {
    this.lines.dispose();
    for (const solid of this.solids.values()) solid.dispose();
  }
}
