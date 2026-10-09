import * as THREE from "three";
import * as Hyper from "../geometry/hyperbolic";
import * as Spherical from "../geometry/spherical";
import { ASTEROID_STAGES, AsteroidSize, GameState, getAsteroidSolid } from "../game/state";
import { Quat, Vec3, lengthVec3, quatIdentity, v3 } from "../utils/math";
import { AsteroidGeometry } from "./entityViews";
import { HyperbolicModel, subdivideGeodesicEdges } from "./externalModel";

type CurvedSpace = typeof Hyper | typeof Spherical;

const VERTEX_SHADER = `
attribute vec4 h0; attribute vec4 h1; attribute vec4 h2; attribute vec4 h3;
attribute vec4 sizeInk;
uniform float curvatureRadius;
uniform bool spherical; uniform bool pov;
uniform bool conformalModel;
#ifdef CURVED_EXTERNAL
attribute vec3 edgeEnd; attribute float edgeT;
#endif
varying vec4 spherePoint;
varying float distanceH; varying float ink;
#include <clipping_planes_pars_vertex>
void main() {
  vec3 tangent=position*sizeInk.xyz/curvatureRadius;
  float r=length(tangent);
  float sh=spherical?sin(r):(exp(r)-exp(-r))*0.5;
  float ch=spherical?cos(r):(exp(r)+exp(-r))*0.5;
  vec4 local=vec4(tangent*(r>0.00001?sh/r:1.0),ch);
  #ifdef CURVED_EXTERNAL
    vec3 endTangent=edgeEnd*sizeInk.xyz/curvatureRadius;
    float endR=length(endTangent);
    float endSh=spherical?sin(endR):(exp(endR)-exp(-endR))*0.5;
    float endCh=spherical?cos(endR):(exp(endR)+exp(-endR))*0.5;
    vec4 endLocal=vec4(endTangent*(endR>0.00001?endSh/endR:1.0),endCh);
    local=mix(local,endLocal,edgeT);
    local/=sqrt(max(0.0000001,local.w*local.w+(spherical?1.0:-1.0)*dot(local.xyz,local.xyz)));
  #endif
  vec4 point=mat4(h0,h1,h2,h3)*local;
  spherePoint=point;
  distanceH=log(max(1.0,point.w)+sqrt(max(0.0,point.w*point.w-1.0)));
  ink=sizeInk.w;
  vec3 projected=curvatureRadius*point.xyz/point.w;
  if(conformalModel) projected=curvatureRadius*point.xyz/(point.w+1.0);
  if(spherical && pov) projected=point.xyz;
  vec4 mvPosition=modelViewMatrix*vec4(projected,1.0);
  gl_Position=projectionMatrix*mvPosition;
  // Depth is angular distance, written per fragment. Keep homogeneous XY/W
  // so the back hemisphere projects in its correct viewing direction.
  if(spherical && pov) gl_Position.z=0.0;
  #include <clipping_planes_vertex>
}`;
const FRAGMENT_SHADER = `
uniform float horizon; uniform float surface;
#ifdef CURVED_EXTERNAL
uniform bool clipDomain;
uniform vec3 faceNormals[12]; uniform float faceOffset;
#endif
varying vec4 spherePoint;
varying float distanceH; varying float ink;
#include <clipping_planes_pars_fragment>
void main() {
  #ifdef CURVED_EXTERNAL
    // Test the original homogeneous half-spaces before model projection.
    // This clips against the curved conformal faces as well as flat Klein faces.
    if(clipDomain) for(int i=0;i<12;i++) {
      if(dot(faceNormals[i],spherePoint.xyz)>faceOffset*spherePoint.w) discard;
    }
  #else
    #include <clipping_planes_fragment>
  #endif
  #ifdef SPHERICAL_POV
    float angle=acos(clamp(normalize(spherePoint).w,-1.0,1.0));
    if(angle<0.0004) discard;
    // A small surface bias keeps the white edges on their opaque faces.
    gl_FragDepth=clamp(angle/3.141592653589793 + surface*0.000002,0.0,1.0);
    gl_FragColor=vec4(vec3((1.0-surface)*ink),1.0);
  #else
  float fade=horizon>0.0?1.0-smoothstep(horizon-0.55,horizon,distanceH):1.0;
  if(horizon>0.0 && distanceH>horizon) discard;
  gl_FragColor=vec4(vec3((1.0-surface)*ink*fade),1.0);
  #endif
}`;

// Each instance carries a four-dimensional isometry of the covering space.
class CurvedBatch {
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly object: THREE.Mesh | THREE.LineSegments;
  private readonly transforms = new THREE.InstancedInterleavedBuffer(
    new Float32Array(16 * 64),
    16,
  );
  private sizes = new THREE.InstancedBufferAttribute(
    new Float32Array(4 * 64),
    4,
  );
  private matrices = this.transforms;
  private used = 0;
  constructor(
    scene: THREE.Scene,
    base: THREE.BufferGeometry,
    material: THREE.ShaderMaterial,
    faces = false,
  ) {
    for (const name of Object.keys(base.attributes))
      this.geometry.setAttribute(name, base.getAttribute(name).clone());
    if (base.index) this.geometry.setIndex(base.index.clone());
    this.bind();
    this.object = faces
      ? new THREE.Mesh(this.geometry, material)
      : new THREE.LineSegments(this.geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = faces ? 0 : 1;
    scene.add(this.object);
  }
  private bind(): void {
    this.matrices.setUsage(THREE.DynamicDrawUsage);
    this.sizes.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 4; i++)
      this.geometry.setAttribute(
        `h${i}`,
        new THREE.InterleavedBufferAttribute(this.matrices, 4, 4 * i),
      );
    this.geometry.setAttribute("sizeInk", this.sizes);
  }
  begin(): void {
    this.used = 0;
  }
  append(matrix: Hyper.Isometry, size: number | Vec3 = 1, ink = 1): void {
    if (this.used === this.matrices.count) {
      const m = new THREE.InstancedInterleavedBuffer(
        new Float32Array(this.matrices.array.length * 2),
        16,
      );
      m.array.set(this.matrices.array);
      this.matrices = m;
      const sizes = new THREE.InstancedBufferAttribute(
        new Float32Array(this.sizes.array.length * 2),
        4,
      );
      sizes.array.set(this.sizes.array);
      this.sizes = sizes;
      // Release old GPU attributes before replacing them; base vertices are shared.
      this.geometry.dispose();
      this.bind();
    }
    this.matrices.array.set(matrix, this.used * 16);
    this.sizes.setXYZW(
      this.used,
      typeof size === "number" ? size : size.x,
      typeof size === "number" ? size : size.y,
      typeof size === "number" ? size : size.z,
      ink,
    );
    this.used++;
  }
  finish(): void {
    this.geometry.instanceCount = this.used;
    this.object.visible = this.used > 0;
    this.matrices.needsUpdate = true;
    this.sizes.needsUpdate = true;
  }
  dispose(): void {
    this.object.removeFromParent();
    this.geometry.dispose();
  }
}

function material(
  surface: boolean,
  horizon: number,
  planes: THREE.Plane[] = [],
  spherical = false,
  pov = false,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: spherical && pov ? { SPHERICAL_POV: 1 } : !pov ? { CURVED_EXTERNAL: 1 } : {},
    uniforms: {
      curvatureRadius: { value: spherical ? Spherical.CURVATURE_RADIUS : Hyper.CURVATURE_RADIUS },
      spherical: { value: spherical },
      pov: { value: pov },
      conformalModel: { value: spherical && !pov },
      clipDomain: { value: planes.length > 0 },
      faceNormals: { value: Hyper.FACE_NORMALS.map(n => new THREE.Vector3(n.x,n.y,n.z)) },
      faceOffset: { value: spherical ? Spherical.FACE_OFFSET : Hyper.FACE_OFFSET },
      horizon: { value: horizon },
      surface: { value: surface ? 1 : 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    clipping: true,
    clippingPlanes: [],
    side: THREE.DoubleSide,
    depthWrite: surface,
    polygonOffset: surface,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}
function cellEdges(H: CurvedSpace): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const edge of H.EDGES)
    for (const i of edge) {
      const p = H.VERTICES[i],
        scale = (H.CIRCUMRADIUS * H.CURVATURE_RADIUS) / lengthVec3(p);
      positions.push(p.x * scale, p.y * scale, p.z * scale);
    }
  return new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
}

export class CurvedScene {
  readonly external = new THREE.Scene();
  readonly pov = new THREE.Scene();
  private readonly edges: THREE.BufferGeometry;
  private readonly externalMaterial: THREE.ShaderMaterial;
  private readonly boundaryMaterial: THREE.ShaderMaterial;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly faceMaterial: THREE.ShaderMaterial;
  private readonly externalBatches = new Map<string, CurvedBatch>();
  private readonly povBatches = new Map<
    string,
    { lines: CurvedBatch; faces?: CurvedBatch }
  >();
  private readonly exteriorCell: CurvedBatch;
  private readonly cells: CurvedBatch;
  private cover: Hyper.Isometry[] = [];
  private coverPosition: Vec3 | null = null;
  private readonly horizon: number;

  constructor(
    ship: THREE.BufferGeometry,
    bullet: THREE.BufferGeometry,
    fragment: THREE.BufferGeometry,
    getAsteroid: (size: AsteroidSize) => AsteroidGeometry,
    private readonly space: CurvedSpace = Hyper,
  ) {
    const H = this.space, spherical = H === Spherical;
    this.edges = cellEdges(H);
    // Keep more of the repeating structure visible; touch devices use a
    // smaller cover because hyperbolic cell counts grow exponentially.
    this.horizon = spherical ? Math.PI : matchMedia("(pointer:coarse)").matches ? 3.2 : 4.0;
    const planes = H.FACE_NORMALS.map(
      (n) =>
        new THREE.Plane(
          new THREE.Vector3(-n.x, -n.y, -n.z),
          H.FACE_OFFSET * H.CURVATURE_RADIUS,
        ),
    );
    this.boundaryMaterial = material(false, 0, [], spherical);
    this.externalMaterial = material(false, 0, planes, spherical);
    this.lineMaterial = material(false, this.horizon, [], spherical, true);
    this.faceMaterial = material(true, this.horizon, [], spherical, true);
    const exteriorEdges = subdivideGeodesicEdges(this.edges);
    this.exteriorCell = new CurvedBatch(
      this.external,
      exteriorEdges,
      this.boundaryMaterial,
    );
    exteriorEdges.dispose();
    this.exteriorCell.begin();
    this.exteriorCell.append(H.IDENTITY, 1, 0.7);
    this.exteriorCell.finish();
    this.cells = new CurvedBatch(this.pov, this.edges, this.lineMaterial);
    const add = (
      key: string,
      edges: THREE.BufferGeometry,
      solid?: THREE.BufferGeometry,
    ) => {
      const exterior = subdivideGeodesicEdges(edges);
      this.externalBatches.set(key, new CurvedBatch(this.external, exterior, this.externalMaterial));
      exterior.dispose();
      this.povBatches.set(key, {
        lines: new CurvedBatch(this.pov, edges, this.lineMaterial),
        faces: solid
          ? new CurvedBatch(this.pov, solid, this.faceMaterial, true)
          : undefined,
      });
    };
    add("ship", ship);
    add("bullet", bullet);
    add("fragment", fragment);
    for (const size of ASTEROID_STAGES) {
      const g = getAsteroid(size);
      add(getAsteroidSolid(size), g.edges, g.solid);
    }
  }

  setExternalModel(model: HyperbolicModel): void {
    if (this.space !== Hyper) return;
    this.externalMaterial.uniforms.conformalModel.value = model === 'poincare';
    this.boundaryMaterial.uniforms.conformalModel.value = model === 'poincare';
  }

  update(state: GameState, camera: THREE.PerspectiveCamera, showDomainEdges = true): void {
    const H = this.space;
    const observer = H.inverse(
      H.frame(state.ship.position, state.ship.orientation),
    );
    // The extra margin amortizes cover generation as the observer moves.
    if (
      !this.coverPosition ||
      H.distance(H.lift(state.ship.position), H.lift(this.coverPosition)) > 10
    ) {
      this.cover = H.tiles(
        state.ship.position,
        this.horizon + H.CIRCUMRADIUS + 0.25,
      );
      this.coverPosition = { ...state.ship.position };
    }
    const viewTiles = this.cover.map((tile) => H.multiply(observer, tile));
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
      tanH = tanV * camera.aspect;
    const visible = (p: Hyper.HPoint, radius: number) => {
      // Spherical images beyond the equator are still in front of the eye;
      // the finite 120-cell cover is small enough to submit without culling.
      if (H === Spherical) return true;
      const d = Math.acosh(Math.max(1, p[3])),
        r = radius / H.CURVATURE_RADIUS;
      if (d - r > this.horizon) return false;
      if (d <= r) return true;
      const norm = Math.hypot(p[0], p[1], p[2]);
      const angularPadding = Math.sinh(r) / Math.sinh(d);
      return (
        p[2] / norm >= -angularPadding &&
        (Math.abs(p[0]) - p[2] * tanH) / norm <=
          angularPadding * Math.hypot(1, tanH) &&
        (Math.abs(p[1]) - p[2] * tanV) / norm <=
          angularPadding * Math.hypot(1, tanV)
      );
    };
    this.cells.begin();
    if (showDomainEdges) {
      for (const tile of viewTiles)
        if (visible(H.center(tile), H.CIRCUMRADIUS * H.CURVATURE_RADIUS))
          this.cells.append(tile, 1, 0.38);
    }
    this.cells.finish();
    for (const batch of this.externalBatches.values()) batch.begin();
    for (const batch of this.povBatches.values()) {
      batch.lines.begin();
      batch.faces?.begin();
    }
    const emit = (
      key: string,
      position: Vec3,
      radius: number,
      q: Quat = quatIdentity(),
      size: number | Vec3 = 1,
      hideOrigin = false,
    ) => {
      const base = H.frame(position, q),
        p = H.center(base);
      const outside = this.externalBatches.get(key)!,
        inside = this.povBatches.get(key)!;
      for (const tile of H.boundaryImages(position, radius))
        outside.append(H.multiply(tile, base), size);
      for (let i = 0; i < viewTiles.length; i++) {
        if (hideOrigin && i === 0) continue;
        if (!visible(H.apply(viewTiles[i], p), radius)) continue;
        const transformed = H.multiply(viewTiles[i], base);
        inside.lines.append(transformed, size);
        inside.faces?.append(transformed, size);
      }
    };
    if (
      state.ship.alive &&
      state.mode !== "title" &&
      (state.time >= state.ship.invulnerableUntil ||
        Math.floor(state.time * 10) % 2 === 0)
    )
      emit("ship", state.ship.position, 4, state.ship.orientation, 1, true);
    for (const asteroid of state.asteroids)
      emit(
        getAsteroidSolid(asteroid.size),
        asteroid.position,
        asteroid.radius,
        asteroid.rotation,
        asteroid.radius,
      );
    for (const bullet of state.bullets) emit("bullet", bullet.position, 1);
    const axis = new THREE.Vector3(1, 0, 0),
      direction = new THREE.Vector3(),
      q = new THREE.Quaternion();
    for (const fragment of state.fragments) {
      direction.set(
        fragment.velocity.x,
        fragment.velocity.y,
        fragment.velocity.z,
      );
      if (direction.lengthSq() > 1e-8)
        q.setFromUnitVectors(axis, direction.normalize());
      else q.identity();
      emit(
        "fragment",
        fragment.position,
        fragment.length,
        q,
        v3(fragment.length, 1, 1),
      );
    }
    for (const batch of this.externalBatches.values()) batch.finish();
    for (const batch of this.povBatches.values()) {
      batch.lines.finish();
      batch.faces?.finish();
    }
  }

  destroy(): void {
    for (const batch of this.externalBatches.values()) batch.dispose();
    for (const batch of this.povBatches.values()) {
      batch.lines.dispose();
      batch.faces?.dispose();
    }
    this.exteriorCell.dispose();
    this.cells.dispose();
    this.edges.dispose();
    this.externalMaterial.dispose();
    this.boundaryMaterial.dispose();
    this.lineMaterial.dispose();
    this.faceMaterial.dispose();
  }
}
