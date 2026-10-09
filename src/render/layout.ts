export interface Viewport { x: number; y: number; width: number; height: number }
export function viewports(width: number, height: number): { external: Viewport; pov: Viewport } {
  const stacked = width < 700 && height > width;
  const split = Math.floor((stacked ? height : width) / 2);
  return stacked
    ? { external: { x: 0, y: 0, width, height: split }, pov: { x: 0, y: split, width, height: height - split } }
    : { external: { x: 0, y: 0, width: split, height }, pov: { x: split, y: 0, width: width - split, height } };
}
