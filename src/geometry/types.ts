export type GeometryId = "euclidean" | "hyperbolic";
export const GEOMETRY_LABELS: Record<GeometryId, string> = {
  euclidean: "Euclidean (3-Torus)",
  hyperbolic: "Hyperbolic (Seifert–Weber Dodecahedral)",
};
