import * as THREE from 'three';
import { AsteroidSize, getAsteroidSolid } from '../game/state';

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

export function createAsteroidSolidGeometry(size: AsteroidSize): THREE.BufferGeometry {
  switch (getAsteroidSolid(size)) {
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(1);
    case 'octahedron':
      return new THREE.OctahedronGeometry(1);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(1);
    case 'icosahedron':
    default:
      return new THREE.IcosahedronGeometry(1);
  }
}

export function createAsteroidLineGeometry(size: AsteroidSize): THREE.BufferGeometry {
  const base = createAsteroidSolidGeometry(size);
  const edges = new THREE.EdgesGeometry(base);
  base.dispose();
  return edges;
}
