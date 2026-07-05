/* ════════════════════════════════════════════════════════════════════
   SHARED UI STYLE — the frosted panel look used by popovers, sheets,
   pills, and toolbars
   ════════════════════════════════════════════════════════════════════ */

import type React from "react";

export const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  backdropFilter: "blur(10px)",
  border: "1px solid var(--line)",
  boxShadow: "var(--shadow-rest)",
};
