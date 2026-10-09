import { Quat, Vec3, addScaledVec3, quatIdentity } from "../utils/math";
import { wrapPosition } from "../game/wrap";
import { sweptSphereTime, wrappedSphereOverlap } from "../game/collision";
import { GeometryId } from "./types";
import * as hyper from "./hyperbolic";
import * as sphere from "./spherical";

const curved = (geometry: GeometryId) => geometry === "spherical" ? sphere : hyper;

export function moveBody(
  geometry: GeometryId,
  position: Vec3,
  velocity: Vec3,
  dt: number,
  orientation?: Quat,
) {
  return geometry !== "euclidean"
    ? curved(geometry).move(position, velocity, dt, orientation)
    : {
        position: wrapPosition(addScaledVec3(position, velocity, dt), 100),
        velocity,
        orientation,
        turn: quatIdentity(),
        crossings: 0,
      };
}
export function canonicalPosition(geometry: GeometryId, position: Vec3): Vec3 {
  return geometry !== "euclidean"
    ? curved(geometry).project(curved(geometry).reduce(curved(geometry).lift(position)).point)
    : wrapPosition(position, 100);
}
export function insideDomain(geometry: GeometryId, position: Vec3): boolean {
  return geometry === "euclidean" || curved(geometry).inside(position);
}
export function overlap(
  geometry: GeometryId,
  a: Vec3,
  ra: number,
  b: Vec3,
  rb: number,
): boolean {
  return geometry !== "euclidean"
    ? curved(geometry).overlaps(a, ra, b, rb)
    : wrappedSphereOverlap(a, ra, b, rb, 100);
}
export function sweep(
  geometry: GeometryId,
  a: Vec3,
  da: Vec3,
  ra: number,
  b: Vec3,
  db: Vec3,
  rb: number,
): number | null {
  return geometry !== "euclidean"
    ? curved(geometry).sweptHit(
        { position: a, displacement: da },
        ra,
        { position: b, displacement: db },
        rb,
      )
    : sweptSphereTime(a, da, ra, b, db, rb, 100);
}
