export type GeometryId = "euclidean" | "hyperbolic" | "spherical";
export const GEOMETRY_LABELS: Record<GeometryId, string> = {
  euclidean: "Euclidean (3-Torus)",
  spherical: "Spherical (Poincaré Dodecahedral)",
  hyperbolic: "Hyperbolic (Seifert–Weber Dodecahedral)",
};
