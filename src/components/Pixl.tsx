import type { CSSProperties, ReactNode } from "react";

// PIXL — "the resident". The NIKOLASS brand mascot: an 11×12 pixel critter that
// inherits currentColor and stands exactly 12px (mono cap-height) so it sits
// inline with body text. Geometry + motion ported 1:1 from the design system
// (preview/brand-logo.html · assets/logo-critter.svg). All loops are steps(1),
// no easing or blur (brand rule) and stop under prefers-reduced-motion — the
// keyframes live in globals.css.

export type PixlMotion =
  | "idle"
  | "walk"
  | "wave"
  | "jump"
  | "sleep"
  | "dance"
  | "still";

type Rect = readonly [x: number, y: number, w: number, h: number];

// Base silhouette (idle / jump / dance / sleep / still).
const BODY: Rect[] = [
  // head — the gaps at cols 4 & 6 of row 2 are the open eyes
  [3, 0, 5, 2], [3, 2, 1, 1], [5, 2, 1, 1], [7, 2, 1, 1], [3, 3, 5, 1],
  // shoulders
  [2, 4, 7, 1],
  // arms + hands
  [1, 5, 2, 2], [8, 5, 2, 2], [2, 7, 1, 1], [8, 7, 1, 1],
  // torso
  [4, 5, 3, 4],
  // hips, splayed legs, flared feet
  [3, 9, 5, 1], [3, 10, 2, 1], [6, 10, 2, 1], [2, 11, 3, 1], [6, 11, 3, 1],
];

// Filling the eye gaps = closed eyes (blink overlay / sleep).
const EYES_SHUT: Rect[] = [
  [4, 2, 1, 1],
  [6, 2, 1, 1],
];

// WALK — narrow inner feet with an outer toe that alternates left/right.
const WALK_BODY: Rect[] = [
  [3, 0, 5, 2], [3, 2, 1, 1], [5, 2, 1, 1], [7, 2, 1, 1], [3, 3, 5, 1],
  [2, 4, 7, 1],
  [1, 5, 2, 2], [8, 5, 2, 2], [2, 7, 1, 1], [8, 7, 1, 1],
  [4, 5, 3, 4],
  [3, 9, 5, 1], [3, 10, 2, 1], [6, 10, 2, 1], [3, 11, 2, 1], [6, 11, 2, 1],
];
const WALK_FOOT_A: Rect = [2, 11, 1, 1];
const WALK_FOOT_B: Rect = [8, 11, 1, 1];

// WAVE — right arm raised (col 8, rows 1–3); a hand pixel toggles at the top.
const WAVE_BODY: Rect[] = [
  [3, 0, 5, 2], [3, 2, 1, 1], [5, 2, 1, 1], [7, 2, 1, 1], [3, 3, 5, 1],
  [2, 4, 7, 1],
  [1, 5, 2, 2], [2, 7, 1, 1],
  [8, 1, 1, 3],
  [4, 5, 3, 4],
  [3, 9, 5, 1], [3, 10, 2, 1], [6, 10, 2, 1], [2, 11, 3, 1], [6, 11, 3, 1],
];
const WAVE_HAND_A: Rect = [8, 0, 1, 1];
const WAVE_HAND_B: Rect = [9, 0, 1, 1];

function box([x, y, w, h]: Rect, key: string, className?: string) {
  return (
    <rect key={key} className={className} x={x} y={y} width={w} height={h} />
  );
}

function pixels(list: Rect[], prefix: string, className?: string) {
  return list.map((r, i) => box(r, `${prefix}-${i}`, className));
}

export default function Pixl({
  motion = "idle",
  size = 12,
  title,
  className = "",
}: {
  motion?: PixlMotion;
  /** Rendered height in px. The critter is 12 units tall, so 12 = 1:1 crisp. */
  size?: number;
  /** When set, the mascot is announced to screen readers; otherwise hidden. */
  title?: string;
  className?: string;
}) {
  const height = size;
  const width = Number(((size * 11) / 12).toFixed(2));

  const blinkEyes = pixels(EYES_SHUT, "blink", "pixl-blink");

  let figure: ReactNode;
  switch (motion) {
    case "walk":
      figure = (
        <>
          {pixels(WALK_BODY, "walk")}
          {box(WALK_FOOT_A, "foot-a", "pixl-foot-a")}
          {box(WALK_FOOT_B, "foot-b", "pixl-foot-b")}
          {blinkEyes}
        </>
      );
      break;
    case "wave":
      figure = (
        <>
          {pixels(WAVE_BODY, "wave")}
          {box(WAVE_HAND_A, "hand-a", "pixl-wave-a")}
          {box(WAVE_HAND_B, "hand-b", "pixl-wave-b")}
          {blinkEyes}
        </>
      );
      break;
    case "sleep":
      figure = (
        <>
          {pixels(BODY, "body")}
          {pixels(EYES_SHUT, "shut")}
        </>
      );
      break;
    case "still":
      figure = pixels(BODY, "body");
      break;
    default:
      // idle / jump / dance share the base figure; the svg-level class moves it.
      figure = (
        <>
          {pixels(BODY, "body")}
          {blinkEyes}
        </>
      );
  }

  const wrapSleep = motion === "sleep" && size >= 24;
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const };

  const svg = (
    <svg
      className={`pixl pixl-${motion}${wrapSleep ? "" : ` ${className}`}`}
      viewBox="0 0 11 12"
      width={width}
      height={height}
      shapeRendering="crispEdges"
      fill="currentColor"
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {figure}
    </svg>
  );

  // SLEEP at a readable size gets a rising "z"; tiny inline sleeps skip it so it
  // never collides with the line above.
  if (wrapSleep) {
    const zStyle: CSSProperties = { fontSize: Math.round(size * 0.5) };
    return (
      <span className={`pixl-wrap ${className}`} style={{ width, height }}>
        {svg}
        <span className="pixl-z" aria-hidden style={zStyle}>
          z
        </span>
      </span>
    );
  }

  return svg;
}
