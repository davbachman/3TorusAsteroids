import * as THREE from 'three';

export type HyperbolicModel = 'klein' | 'poincare';
export const DEFAULT_HYPERBOLIC_MODEL: HyperbolicModel = 'poincare';

// Endpoints stay in tangent coordinates so instance scale is applied before
// lifting. The shader interpolates their hyperboloid lifts along the geodesic.
export function subdivideGeodesicEdges(base: THREE.BufferGeometry, segments = 32): THREE.BufferGeometry {
  const source = base.getAttribute('position');
  const positions: number[] = [], ends: number[] = [], fractions: number[] = [];
  const count = base.index ? base.index.count : source.count;
  for (let edge = 0; edge < count; edge += 2) {
    const a = base.index ? base.index.getX(edge) : edge;
    const b = base.index ? base.index.getX(edge + 1) : edge + 1;
    for (let segment = 0; segment < segments; segment++) for (const t of [segment / segments, (segment + 1) / segments]) {
      positions.push(source.getX(a), source.getY(a), source.getZ(a));
      ends.push(source.getX(b), source.getY(b), source.getZ(b));
      fractions.push(t);
    }
  }
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute('edgeEnd', new THREE.Float32BufferAttribute(ends, 3))
    .setAttribute('edgeT', new THREE.Float32BufferAttribute(fractions, 1));
}
