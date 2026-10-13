// Pixel-grid checkmark for .checkbox. Square cells on a 7x7 grid with
// crispEdges so it stays hard-edged like the rest of the brand (no font glyph).
const CELLS: [number, number][] = [
  [6, 1],
  [5, 2],
  [4, 3],
  [0, 3],
  [1, 4],
  [3, 4],
  [2, 5],
];

export default function CheckMark() {
  return (
    <svg
      viewBox="0 0 7 7"
      width="70%"
      height="70%"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden
    >
      {CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}
