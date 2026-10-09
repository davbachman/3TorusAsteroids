import * as THREE from 'three';
import { ROCK_VARIANTS } from '../game/state';
import { createRng } from '../utils/random';

function lineSegmentsFromPairs(pairs: Array<[number, number, number, number, number, number]>): THREE.BufferGeometry {
  const positions = new Float32Array(pairs.length * 6);
  let i = 0;
  for (const pair of pairs) {
    for (let j = 0; j < 6; j += 1) {
      positions[i++] = pair[j];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function createCubeLineGeometry(size: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(size, size, size);
  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  return edges;
}

export function createShipLineGeometry(): THREE.BufferGeometry {
  // Local forward axis is +Z.
  const pairs: Array<[number, number, number, number, number, number]> = [
    [0, 0, 3.2, -1.9, 0, -2.2],
    [0, 0, 3.2, 1.9, 0, -2.2],
    [0, 0, 3.2, 0, 1.1, -1.4],
    [0, 0, 3.2, 0, -1.1, -1.4],
    [-1.9, 0, -2.2, 0, 1.1, -1.4],
    [1.9, 0, -2.2, 0, 1.1, -1.4],
    [-1.9, 0, -2.2, 0, -1.1, -1.4],
    [1.9, 0, -2.2, 0, -1.1, -1.4],
    [-1.9, 0, -2.2, 1.9, 0, -2.2],
    [0, 1.1, -1.4, 0, -1.1, -1.4],
  ];
  return lineSegmentsFromPairs(pairs);
}

export function createBulletLineGeometry(): THREE.BufferGeometry {
  const pairs: Array<[number, number, number, number, number, number]> = [
    [0, 0, -0.7, 0, 0, 0.7],
    [-0.35, 0, 0, 0.35, 0, 0],
    [0, -0.35, 0, 0, 0.35, 0],
  ];
  return lineSegmentsFromPairs(pairs);
}

export function createUnitFragmentGeometry(): THREE.BufferGeometry {
  return lineSegmentsFromPairs([[0, 0, 0, 1, 0, 0]]);
}

export function createAsteroidSolidGeometry(variant: number): THREE.BufferGeometry {
  const rng = createRng(0x51a7 + ROCK_VARIANTS[variant % ROCK_VARIANTS.length] * 7919);
  // Use a welded triangulation only as a starting surface. Broad lobes and
  // hollows give each rock its silhouette; smaller offsets create craggy facets.
  const base = new THREE.IcosahedronGeometry(1, 3);
  const source = base.getAttribute('position');
  const vertices: THREE.Vector3[] = [];
  const indices: number[] = [];
  const welded = new Map<string, number>();
  for (let i = 0; i < source.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(source, i);
    const key = point.toArray().map(n => n.toFixed(5)).join(',');
    let index = welded.get(key);
    if (index === undefined) {
      index = vertices.length;
      welded.set(key, index);
      vertices.push(point);
    }
    indices.push(index);
  }
  base.dispose();
  const features = Array.from({length: 18}, (_, i) => {
    const z = 2 * rng() - 1, angle = 2 * Math.PI * rng();
    const radius = Math.sqrt(1 - z * z);
    return {
      direction: new THREE.Vector3(radius * Math.cos(angle), z, radius * Math.sin(angle)),
      width: .045 + rng() * .12,
      height: (i % 3 === 0 ? -1 : 1) * (.2 + rng() * .35),
    };
  });
  const stretch = new THREE.Vector3(.85 + rng() * .3, .8 + rng() * .3, .85 + rng() * .3);
  for (const vertex of vertices) {
    vertex.add(new THREE.Vector3(rng() - .5, rng() - .5, rng() - .5).multiplyScalar(.065)).normalize();
    let radius = .72 + (rng() - .5) * .15;
    for (const feature of features) {
      const distance = 1 - vertex.dot(feature.direction);
      radius += feature.height * Math.exp(-distance / feature.width);
    }
    vertex.multiplyScalar(Math.max(.38, radius)).multiply(stretch);
  }
  // The shared collision sphere encloses every facet, including the ridges.
  const maxRadius = Math.max(...vertices.map(p => p.length()));
  for (const vertex of vertices) vertex.divideScalar(maxRadius);
  const geometry = new THREE.BufferGeometry()
    .setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(p=>p.toArray()),3))
    .setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createAsteroidLineGeometry(variant: number): THREE.BufferGeometry {
  const base = createAsteroidSolidGeometry(variant);
  const edges = new THREE.EdgesGeometry(base);
  base.dispose();
  return edges;
}
