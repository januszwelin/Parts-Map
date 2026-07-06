/* Shared visual for every generated app icon (favicon, apple touch icon,
   PWA manifest icons) — echoes the canvas's own landing-dot + pulse-ring
   language (see components/lift-overlay.tsx and the `anchor-pulse`
   keyframe in globals.css): a sage dot with a white halo, ringed by a
   soft sage circle, on warm paper. Not a React component in the normal
   sense — this is JSX for Satori (next/og's ImageResponse renderer),
   which only understands a flexbox subset of CSS, so every element is
   an explicit `display: flex`.

   `maskable` insets the mark into the ~80% "safe zone" Android's
   maskable-icon spec asks for, since a maskable icon can be cropped to
   any shape (circle, squircle, …) by the OS. */
export function Mark({ size, maskable }: { size: number; maskable?: boolean }) {
  const dot = size * (maskable ? 0.22 : 0.34);
  const ring = size * (maskable ? 0.38 : 0.56);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f5f1",
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: 9999,
          border: `${Math.max(2, Math.round(size * 0.012))}px solid #7d8b74`,
          opacity: 0.45,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: dot,
            height: dot,
            borderRadius: 9999,
            background: "#7d8b74",
            boxShadow: `0 0 0 ${Math.max(3, Math.round(size * 0.02))}px rgba(255,255,255,0.85)`,
            display: "flex",
          }}
        />
      </div>
    </div>
  );
}
