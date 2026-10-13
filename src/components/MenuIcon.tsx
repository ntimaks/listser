// Pixel-grid menu icon: three rows of a square bullet and a bar, on a 9x7 grid
// with crispEdges so it stays hard-edged like CheckMark and Pixl.
const ROWS = [0, 3, 6];

export default function MenuIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 9 7"
      width={size}
      height={(size * 7) / 9}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden
    >
      {ROWS.map((y) => (
        <g key={y}>
          <rect x={0} y={y} width={1} height={1} />
          <rect x={2} y={y} width={7} height={1} />
        </g>
      ))}
    </svg>
  );
}
