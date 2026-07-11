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

/** Desktop chrome (Miro-web-inspired): solid white, no blur, crisper
 *  shadow. Phone surfaces stay on panelStyle — frost matters when a sheet
 *  overlays the map; desktop cards float over flat canvas where solid
 *  reads cleaner. */
export const cardStyle: React.CSSProperties = {
  background: "var(--panel-solid)",
  border: "1px solid var(--line)",
  boxShadow: "var(--shadow-card)",
};
