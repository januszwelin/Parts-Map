"use client";

/**
 * Parts Map — a spatial canvas for IFS parts work.
 *
 * Single-file prototype, organized into swappable sections:
 *   1. Constants & region config (data, editable — no logic)
 *   2. Types
 *   3. Persistence seam (JSON save/load — swap for a backend later)
 *   4. Location matcher (the AI seam — swap for a model call later)
 *   5. Geometry & easing
 *   6. Body outline SVG
 *   6b. Sound (synthesized UI audio — no assets)
 *   7. Node / edge / lift-overlay components
 *   8. UI panels (toolbar, list, popovers, import)
 *   9. Main app
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  NodeToolbar,
  NodeResizer,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  ConnectionMode,
  getBezierPath,
  useReactFlow,
  useConnection,
  useInternalNode,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
  type EdgeProps,
  type ConnectionLineComponentProps,
  type XYPosition,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BODY_H,
  BODY_W,
  SCENE_W,
  STICK_RIVAL,
  STICK_RELEASE,
  AIM_ENTER_SPD,
  AIM_EXIT_SPD,
  SPD_EMA_TAU_MS,
  CENTER_TRAVEL_PX,
  CENTER_BLEND_MS,
  SPOT_R_FRAC,
  FOLLOW_ENTER_PAD,
  FOLLOW_EXIT_PAD,
  FOLLOW_GAP_PX,
  FOLLOW_MIN,
  FOLLOW_MAX,
  FOLLOW_MAX_PHONE,
  CENTER_BAND_FRAC,
  CENTER_TAU_MS,
  GLIDE_TAU_MS,
  TOUCH_STEER_OFFSET,
  MIN_SCALE,
  MAX_SCALE,
  PALETTE,
  ARROW_COLORS,
} from "@/lib/tuning";
import { REGIONS, REGION_BY_KEY } from "@/lib/regions";
import { newId, type Depth, type Part, type Arrow } from "@/lib/types";
import {
  figureCenterX,
  anchorToFlow,
  offBodySuggestion,
  SNAP_SETS,
  nearestTarget,
  MIN_ANCHOR_GAP,
  figureUnder,
  resolveMagnet,
  nearestOffZone,
  easeOutBack,
  easeInOutCubic,
  easeOutCubic,
  rectEdgePoint,
} from "@/lib/geometry";
import {
  matchRegion,
  interpretLocations,
  parseImportText,
} from "@/lib/matcher";
import { downloadMap, loadMapFile } from "@/lib/persistence";
import { sndPlay, sndSetMuted, magnetTick } from "@/lib/sound";
import {
  regionLabel,
  partIsBack,
  partSurface,
  FONT_PX,
  SHAPE_RADIUS,
  locationDisplay,
} from "@/lib/part-utils";
import { panelStyle } from "@/lib/ui";
import {
  copyText,
  relationshipsText,
  downloadFlowchartPng,
} from "@/lib/exports";
import { AppApiContext, useAppApi, type AppApi } from "@/hooks/use-app-api";
import { useIsPhone, useReducedMotion } from "@/hooks/use-media";

/* ════════════════════════════════════════════════════════════════════
   6. BODY OUTLINE SVG
   ════════════════════════════════════════════════════════════════════
   Drawn in the same 460×1000 normalized space as the region anchors, so
   nudging the config and the drawing stay aligned.

   The figure is traced from the client-supplied silhouette
   (Human_silhoutte.svg — a raster layer inside an SVG shell; its alpha
   contour was traced, simplified, smoothed to cubic Beziers, and scaled
   uniformly so the figure spans y 10–994 centered on x 230). One closed
   loop drawn as a thin calm stroke — a coordinate space, not an
   illustration. Hand/finger/groin anchors were re-tuned to this figure;
   re-tune anchors again if the drawing is ever replaced.

   Front and back render side by side as two labeled figures (front on
   the viewer's left). The back figure is the mirrored silhouette (seen
   from behind) plus a spine line and shoulder-blade hints, enough to
   read instantly as "back." */

const BODY_PATHS = [
  // full figure, one closed loop (traced; see section comment)
  "M226.0 10.0 C222.5 10.6 216.4 11.8 212.5 13.4 C208.5 15.1 205.4 16.9 202.1 19.9 C198.9 22.9 195.3 27.3 193.0 31.5 C190.7 35.6 189.3 41.1 188.3 44.9 C187.4 48.7 187.2 50.0 187.1 54.4 C187.0 58.8 188.4 68.0 187.7 71.0 C187.1 74.1 184.1 71.3 183.3 72.7 C182.4 74.0 182.4 76.7 182.5 79.1 C182.6 81.6 183.2 84.6 183.9 87.3 C184.6 89.9 185.6 92.7 186.7 94.8 C187.8 96.8 189.2 98.3 190.4 99.4 C191.5 100.5 192.3 97.7 193.8 101.2 C195.3 104.8 198.3 114.8 199.5 120.7 C200.6 126.7 200.6 132.9 200.7 136.9 C200.8 140.9 200.3 142.8 199.9 144.8 C199.5 146.8 199.8 147.2 198.3 148.9 C196.7 150.5 195.1 152.2 190.8 154.8 C186.4 157.3 183.9 159.1 172.1 164.1 C160.4 169.1 130.7 179.7 120.2 184.6 C109.7 189.4 112.2 189.6 109.1 193.3 C105.9 197.0 103.1 201.6 101.1 206.7 C99.2 211.7 98.0 214.0 97.3 223.5 C96.6 233.0 98.2 250.1 96.9 263.7 C95.6 277.2 91.0 293.5 89.6 305.0 C88.2 316.5 90.0 325.8 88.6 332.8 C87.2 339.8 83.2 341.8 81.1 347.2 C78.9 352.6 78.1 350.8 75.8 365.2 C73.5 379.6 69.9 415.6 67.3 433.6 C64.7 451.6 61.9 465.4 60.4 473.3 C58.8 481.2 60.0 478.3 58.0 481.0 C56.0 483.7 52.2 484.9 48.4 489.3 C44.7 493.8 39.9 500.2 35.5 507.6 C31.0 515.0 23.9 528.9 21.5 533.7 C19.1 538.6 21.0 535.8 21.1 536.6 C21.1 537.3 21.4 537.9 21.9 538.2 C22.4 538.5 22.9 538.8 24.1 538.4 C25.3 538.0 27.2 537.2 29.2 535.8 C31.1 534.3 33.9 531.8 35.9 529.5 C37.8 527.2 39.6 523.6 40.9 522.0 C42.2 520.4 44.3 512.4 43.8 519.9 C43.3 527.4 38.9 558.2 37.9 567.0 C36.9 575.7 37.6 571.1 37.9 572.5 C38.2 573.8 38.9 574.9 39.7 575.3 C40.5 575.7 41.9 575.6 42.8 575.1 C43.6 574.6 43.4 578.3 45.0 572.3 C46.6 566.2 50.6 545.5 52.3 539.0 C54.0 532.5 54.5 533.8 55.1 533.1 C55.8 532.5 56.6 529.1 56.1 535.2 C55.6 541.2 52.6 562.3 52.1 569.4 C51.6 576.6 52.3 576.6 53.1 578.1 C53.9 579.7 55.8 579.6 56.9 578.7 C58.1 577.9 59.1 575.9 60.0 573.1 C60.9 570.2 61.6 567.5 62.4 561.7 C63.3 555.9 64.3 542.8 65.1 538.4 C65.8 534.0 66.2 535.5 66.7 535.2 C67.1 534.8 68.0 531.1 67.7 536.4 C67.4 541.7 65.2 560.1 64.9 567.0 C64.5 573.8 65.3 575.6 65.7 577.5 C66.0 579.5 66.4 578.6 67.1 578.7 C67.7 578.9 68.6 579.4 69.5 578.5 C70.4 577.7 71.4 580.0 72.6 573.7 C73.7 567.4 75.3 547.0 76.2 540.8 C77.1 534.6 77.4 536.8 77.8 536.4 C78.3 535.9 78.7 533.4 78.8 538.2 C78.9 543.0 78.1 560.0 78.4 565.0 C78.7 569.9 79.9 567.6 80.7 568.0 C81.4 568.4 82.3 568.0 82.9 567.6 C83.5 567.2 83.7 567.9 84.3 565.8 C84.9 563.6 85.6 563.0 86.3 554.6 C87.1 546.2 88.4 524.9 88.8 515.3 C89.1 505.6 88.9 501.7 88.4 496.6 C87.9 491.5 84.8 491.6 85.7 484.7 C86.7 477.8 90.0 466.6 94.3 455.3 C98.5 443.9 106.6 428.2 111.3 416.5 C115.9 404.9 119.9 392.9 122.2 385.3 C124.6 377.7 124.6 376.2 125.3 371.1 C125.9 366.0 125.4 361.1 126.1 354.9 C126.8 348.7 126.9 346.4 129.5 333.8 C132.2 321.2 139.8 288.5 142.1 279.3 C144.4 270.1 141.2 269.0 143.1 278.7 C145.1 288.3 151.8 323.1 153.9 337.3 C156.0 351.4 156.1 350.9 155.7 363.4 C155.3 376.0 153.7 397.9 151.6 412.5 C149.6 427.0 145.6 439.3 143.5 450.8 C141.4 462.3 140.1 471.8 139.1 481.2 C138.0 490.6 137.5 498.0 137.2 507.4 C137.0 516.8 136.6 521.2 137.4 537.6 C138.3 554.0 140.0 584.3 142.3 605.7 C144.6 627.2 150.3 651.1 151.4 666.3 C152.6 681.6 149.4 688.9 149.2 697.4 C149.0 705.8 150.3 711.4 150.0 717.0 C149.7 722.6 148.2 725.8 147.6 731.0 C146.9 736.3 146.3 740.0 146.2 748.5 C146.0 756.9 145.8 769.6 146.8 781.9 C147.8 794.2 149.2 803.7 152.2 822.1 C155.3 840.4 163.0 878.9 165.2 892.0 C167.5 905.1 166.2 897.1 165.8 900.5 C165.5 904.0 163.7 907.5 163.2 912.7 C162.7 917.9 164.2 926.5 163.0 931.5 C161.8 936.6 160.7 936.5 156.1 942.9 C151.5 949.3 139.0 964.2 135.2 969.9 C131.4 975.5 133.4 975.3 133.2 976.8 C132.9 978.2 133.2 977.8 133.8 978.4 C134.4 979.0 136.1 979.4 136.8 980.4 C137.5 981.4 137.1 983.4 138.0 984.5 C139.0 985.5 141.5 985.9 142.7 986.7 C143.9 987.5 144.0 989.0 145.3 989.3 C146.7 989.6 149.6 988.2 150.8 988.5 C152.0 988.9 151.5 990.8 152.6 991.4 C153.8 992.0 156.3 992.3 157.7 992.2 C159.1 992.0 159.8 991.5 161.0 990.6 C162.1 989.6 163.9 986.6 164.6 986.5 C165.3 986.4 164.6 988.9 165.0 989.9 C165.4 991.0 165.9 991.9 166.8 992.6 C167.8 993.3 169.0 993.9 170.5 994.0 C172.0 994.1 174.1 994.1 176.0 993.4 C177.8 992.7 179.7 991.8 181.6 989.9 C183.5 988.1 185.9 984.8 187.3 982.0 C188.7 979.3 189.1 977.6 190.2 973.3 C191.2 969.0 192.4 959.4 193.4 956.1 C194.4 952.8 195.2 954.9 196.0 953.4 C196.8 952.0 197.8 949.9 198.3 947.4 C198.7 944.8 199.5 944.1 198.9 938.0 C198.3 932.0 195.6 919.9 194.6 911.3 C193.7 902.7 193.0 895.0 193.2 886.3 C193.4 877.7 193.9 872.7 195.8 859.6 C197.7 846.4 202.6 820.2 204.6 807.5 C206.5 794.8 207.1 797.1 207.4 783.3 C207.7 769.5 206.0 742.0 206.2 724.7 C206.4 707.4 205.7 705.4 208.6 679.5 C211.5 653.6 220.5 593.5 223.4 569.4 C226.4 545.3 225.8 544.4 226.2 534.9 C226.7 525.5 224.8 516.6 226.0 512.8 C227.3 509.1 232.3 508.8 233.5 512.4 C234.8 516.1 233.2 525.5 233.8 534.9 C234.3 544.4 235.0 555.0 236.6 569.4 C238.1 583.8 240.9 605.7 243.1 621.5 C245.3 637.3 248.2 652.7 249.8 664.1 C251.3 675.6 251.5 680.1 252.2 690.3 C252.9 700.4 253.6 714.9 253.8 724.9 C254.1 735.0 254.1 743.6 253.8 750.7 C253.6 757.8 252.5 761.3 252.4 767.5 C252.3 773.8 251.1 772.9 253.0 788.2 C255.0 803.5 261.9 843.2 264.2 859.6 C266.5 875.9 266.6 878.1 266.8 886.3 C267.0 894.6 266.5 901.3 265.6 909.2 C264.7 917.2 262.2 928.0 261.5 934.0 C260.8 939.9 261.1 942.0 261.3 944.9 C261.6 947.8 262.1 949.6 262.9 951.4 C263.8 953.3 265.4 952.2 266.6 956.1 C267.8 960.0 269.0 970.2 270.2 974.9 C271.5 979.7 272.5 982.0 273.9 984.5 C275.2 987.0 277.0 988.6 278.4 989.9 C279.7 991.3 280.1 991.7 282.0 992.4 C283.9 993.1 287.5 994.1 289.5 994.0 C291.5 993.9 293.2 992.8 294.2 991.6 C295.2 990.3 294.6 986.7 295.4 986.5 C296.2 986.3 297.9 989.6 299.0 990.6 C300.2 991.5 300.9 992.0 302.3 992.2 C303.7 992.3 306.2 992.0 307.4 991.4 C308.5 990.8 308.0 988.9 309.2 988.5 C310.4 988.2 313.3 989.6 314.7 989.3 C316.0 989.0 316.1 987.5 317.3 986.7 C318.5 985.9 321.0 985.5 322.0 984.5 C322.9 983.4 322.6 981.3 323.2 980.4 C323.7 979.6 324.6 980.0 325.2 979.4 C325.8 978.8 326.9 978.4 326.8 976.8 C326.8 975.2 328.6 975.5 324.8 969.9 C321.0 964.2 308.5 949.3 303.9 942.9 C299.3 936.5 298.2 936.6 297.0 931.5 C295.8 926.5 297.3 917.9 296.8 912.7 C296.3 907.5 294.5 904.0 294.2 900.5 C293.8 897.1 292.5 905.1 294.8 892.0 C297.0 878.9 304.7 840.4 307.8 822.1 C310.8 803.7 312.2 794.2 313.2 781.9 C314.2 769.6 314.0 757.2 313.8 748.5 C313.7 739.7 312.9 734.6 312.2 729.4 C311.6 724.2 310.2 722.4 310.0 717.0 C309.8 711.7 311.0 705.8 310.8 697.4 C310.6 688.9 307.4 681.6 308.6 666.3 C309.7 651.1 315.4 627.2 317.7 605.7 C320.0 584.3 321.7 554.0 322.6 537.6 C323.4 521.2 323.0 516.8 322.8 507.4 C322.5 498.0 322.0 490.6 320.9 481.2 C319.9 471.8 318.6 462.3 316.5 450.8 C314.4 439.3 310.4 427.0 308.4 412.5 C306.3 397.9 305.0 373.4 304.3 363.6 C303.6 353.8 304.0 357.9 304.3 353.5 C304.6 349.1 304.0 349.7 306.1 337.3 C308.2 324.8 314.9 288.3 316.9 278.7 C318.8 269.0 315.6 270.1 317.9 279.3 C320.2 288.5 327.8 321.2 330.5 333.8 C333.1 346.4 333.2 348.9 333.9 354.9 C334.6 360.9 333.9 364.6 334.5 369.7 C335.2 374.8 335.4 377.5 337.8 385.3 C340.1 393.1 344.2 405.1 348.7 416.5 C353.3 427.9 360.9 442.3 365.1 453.6 C369.4 465.0 373.2 477.5 374.3 484.7 C375.3 491.8 372.1 491.5 371.6 496.6 C371.1 501.7 370.9 505.6 371.2 515.3 C371.6 524.9 372.9 546.2 373.7 554.6 C374.4 563.0 375.1 563.6 375.7 565.8 C376.3 567.9 376.5 567.2 377.1 567.6 C377.7 568.0 378.6 568.4 379.3 568.0 C380.1 567.6 381.3 569.9 381.6 565.0 C381.9 560.0 381.1 543.0 381.2 538.2 C381.3 533.4 381.7 535.9 382.2 536.4 C382.6 536.8 382.9 534.6 383.8 540.8 C384.7 547.0 386.3 567.4 387.4 573.7 C388.6 580.0 389.6 577.7 390.5 578.5 C391.4 579.4 392.3 578.9 392.9 578.7 C393.6 578.6 394.0 579.5 394.3 577.5 C394.7 575.6 395.5 573.8 395.1 567.0 C394.8 560.1 392.6 541.7 392.3 536.4 C392.0 531.1 392.9 534.8 393.3 535.2 C393.8 535.5 394.2 534.0 394.9 538.4 C395.7 542.8 396.7 555.9 397.6 561.7 C398.4 567.5 399.2 570.3 400.0 573.1 C400.9 575.9 401.5 577.7 402.7 578.5 C403.8 579.4 406.0 579.7 406.9 578.1 C407.8 576.6 408.4 576.5 407.9 569.4 C407.4 562.3 404.4 541.4 403.9 535.4 C403.4 529.3 404.2 532.5 404.9 533.1 C405.5 533.7 406.0 532.5 407.7 539.0 C409.4 545.5 413.4 566.2 415.0 572.3 C416.6 578.3 416.4 574.6 417.2 575.1 C418.1 575.6 419.5 575.7 420.3 575.3 C421.1 574.9 421.8 573.8 422.1 572.5 C422.4 571.1 423.1 575.7 422.1 567.0 C421.1 558.2 416.7 527.4 416.2 519.9 C415.7 512.4 417.8 520.4 419.1 522.0 C420.4 523.6 422.2 527.2 424.1 529.5 C426.1 531.8 429.0 534.3 430.8 535.8 C432.7 537.2 433.9 537.8 435.1 538.2 C436.2 538.6 437.1 538.9 437.7 538.4 C438.4 537.9 441.1 540.5 438.9 535.4 C436.7 530.2 429.1 515.2 424.5 507.6 C420.0 499.9 415.3 493.8 411.6 489.3 C407.8 484.9 404.0 483.7 402.0 481.0 C400.0 478.3 401.2 481.2 399.6 473.3 C398.1 465.4 395.3 451.6 392.7 433.6 C390.1 415.6 386.5 379.6 384.2 365.2 C381.9 350.8 381.1 352.6 378.9 347.2 C376.8 341.8 372.8 339.8 371.4 332.8 C370.0 325.8 371.8 316.5 370.4 305.0 C369.0 293.5 364.4 277.2 363.1 263.7 C361.8 250.1 363.0 231.7 362.7 223.5 C362.4 215.4 362.1 217.9 361.3 214.8 C360.5 211.6 359.8 208.2 358.0 204.7 C356.3 201.1 354.0 196.6 350.9 193.3 C347.9 190.0 350.3 189.4 339.8 184.6 C329.3 179.7 299.6 169.1 287.9 164.1 C276.1 159.1 273.6 157.3 269.2 154.8 C264.9 152.2 263.3 150.5 261.7 148.9 C260.2 147.2 260.5 146.8 260.1 144.8 C259.7 142.8 259.2 140.9 259.3 136.9 C259.4 132.9 259.4 126.7 260.5 120.7 C261.7 114.8 264.7 104.8 266.2 101.2 C267.7 97.7 268.5 100.5 269.6 99.4 C270.8 98.3 272.2 96.8 273.3 94.8 C274.4 92.7 275.4 89.9 276.1 87.3 C276.8 84.6 277.4 81.6 277.5 79.1 C277.6 76.7 277.6 74.0 276.7 72.7 C275.9 71.3 272.9 74.1 272.3 71.0 C271.6 68.0 273.2 59.5 272.9 54.4 C272.6 49.3 272.1 45.2 270.7 40.6 C269.2 36.0 266.6 30.4 264.0 26.6 C261.4 22.8 258.6 20.2 255.0 17.7 C251.5 15.2 246.0 12.9 242.5 11.6 C239.0 10.3 236.7 10.3 234.0 10.0 C231.2 9.7 229.6 9.4 226.0 10.0Z",
] as const;

/** Interior lines drawn only on the back face: spine + shoulder blades. */
const BODY_BACK_DETAIL = [
  "M230 172 C229.2 252 230.6 358 229.8 478",
  "M195 223 C184.6 237 182.4 259.6 190.8 279",
  "M265 223 C275.4 237 277.6 259.6 269.2 279",
] as const;

const bodyStroke = {
  fill: "none",
  /* --ink resolves at runtime (:root); --color-ink is @theme-inline only. */
  stroke: "var(--ink)",
  strokeOpacity: 0.35,
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  vectorEffect: "non-scaling-stroke" as const,
};

/** One figure's line art. `back` mirrors the silhouette (seen from
 *  behind) and adds the spine/shoulder-blade hints. Prop is stable, so
 *  the memo makes this render exactly once per figure. */
const BodyArt = React.memo(function BodyArt({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 460 1000"
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
      aria-hidden
    >
      <g transform={back ? "translate(460,0) scale(-1,1)" : undefined}>
        {BODY_PATHS.map((d, i) => (
          <path key={i} d={d} {...bodyStroke} />
        ))}
        {back && (
          <g opacity={0.8}>
            {BODY_BACK_DETAIL.map((d, i) => (
              <path key={i} d={d} {...bodyStroke} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
});

/** The two figures side by side — front on the viewer's left, back on
 *  the viewer's right — each with a quiet caption underneath. */
function BodyOutline({ bodyScale }: { bodyScale: number }) {
  const w = BODY_W * bodyScale;
  const h = BODY_H * bodyScale;
  const caption: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 20 * bodyScale,
    textAlign: "center",
    fontSize: Math.max(11, 14 * bodyScale),
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--ink-faint)",
  };
  const figure = (depth: Depth) => (
    <div
      key={depth}
      style={{
        position: "absolute",
        left: figureCenterX(depth, bodyScale) - w / 2,
        top: -h / 2,
        width: w,
        height: h,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <BodyArt back={depth === "back"} />
      <div style={caption}>{depth}</div>
    </div>
  );
  return (
    <>
      {figure("front")}
      {figure("back")}
    </>
  );
}

/** Faint dots on every magnet-snappable anchor on both figures, shown
 *  while a part is lifted so the person can aim. Always mounted; only
 *  opacity animates (fade-out needs the DOM to still be there). */
const AnchorConstellation = React.memo(function AnchorConstellation({
  bodyScale,
  visible,
  boost = false,
  spotRef,
}: {
  bodyScale: number;
  visible: boolean;
  /** Tap-to-place mode: the whole vocabulary of points steps forward
   *  (the person is choosing a home, not steering a drag). */
  boost?: boolean;
  /** Spotlight circle — the drag rAF loop writes cx/cy at the steer
   *  point each frame, so guidance is local: dots near the pointer
   *  brighten, distant ones stay a whisper. */
  spotRef: React.RefObject<SVGCircleElement | null>;
}) {
  const dots = (["front", "back"] as const).map((depth) =>
    SNAP_SETS[depth].map((r) => {
      const a = anchorToFlow(r, depth, bodyScale);
      return (
        <circle
          key={`${depth}:${r.key}`}
          cx={a.x}
          cy={a.y}
          r={2 * bodyScale}
          fill="var(--ink)"
        />
      );
    }),
  );
  return (
    <svg
      className="anchor-constellation"
      width={0}
      height={0}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity: visible ? 1 : 0,
        transition: "opacity 150ms ease",
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <defs>
        {/* userSpaceOnUse: the svg box is 0×0 with visible overflow, so
            bounding-box units would collapse — flow units only. */}
        <clipPath id="anchor-spotlight" clipPathUnits="userSpaceOnUse">
          <circle
            ref={spotRef}
            cx={0}
            cy={0}
            r={SPOT_R_FRAC * BODY_H * bodyScale}
          />
        </clipPath>
      </defs>
      <g
        opacity={boost ? 0.22 : 0.05}
        style={{ transition: "opacity 200ms ease" }}
      >
        {dots}
      </g>
      <g opacity={0.3} clipPath="url(#anchor-spotlight)">
        {dots}
      </g>
    </svg>
  );
});

/* ════════════════════════════════════════════════════════════════════
   7. NODE / EDGE / LIFT-OVERLAY COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

type PartNodeType = Node<
  { part: Part; lifted: boolean; popKey: number; revealKey: number },
  "part"
>;

function PartNode({ id, data, selected, dragging }: NodeProps<PartNodeType>) {
  const { part, lifted, popKey, revealKey } = data;
  const api = useAppApi();
  const onBackSurface = !part.offBody && partSurface(part) === "back";
  const connectionInProgress = useConnection((c) => c.inProgress);
  // Phone layout edits through the bottom sheet (app level), not a
  // floating popover crammed over the figures.
  const isPhone = useIsPhone();
  // One-shot landing pop: the drop bumps popKey; the class rides the CSS
  // keyframe and is retired on animationend so a later re-render can't
  // replay it.
  const [popPlayed, setPopPlayed] = useState(0);
  const popping = popKey !== 0 && popKey !== popPlayed;
  // One-shot reveal halo (the list's "where is it?"), same retirement.
  const [revealPlayed, setRevealPlayed] = useState(0);
  const revealing = revealKey !== 0 && revealKey !== revealPlayed;

  return (
    <div
      className={`relative h-full w-full select-none ${dragging ? "z-10" : ""}`}
      style={{
        minWidth: part.w ? undefined : 92,
        maxWidth: part.w ? undefined : 200,
      }}
    >
      <NodeResizer
        isVisible={!!selected && !dragging}
        minWidth={90}
        minHeight={44}
        keepAspectRatio={part.shape === "ellipse"}
        onResizeEnd={() => api.endResize(id)}
      />

      <div
        ref={(el) => {
          api.registerPartInner(part.id, el);
        }}
        className={`part-inner flex h-full w-full items-center justify-center px-4 py-3 text-center leading-snug ${
          lifted ? "lifted" : ""
        } ${popping ? "drop-pop" : ""} ${revealing ? "reveal-glow" : ""}`}
        onAnimationEnd={(e) => {
          if (e.animationName === "drop-pop") setPopPlayed(popKey);
          if (e.animationName === "reveal-glow") setRevealPlayed(revealKey);
        }}
        style={{
          background: part.color,
          color: "var(--ink)",
          borderRadius: SHAPE_RADIUS[part.shape],
          fontSize: FONT_PX[part.fontSize],
          fontWeight: part.bold ? 600 : 400,
          border: "1px solid rgba(58,55,51,0.08)",
        }}
      >
        <span className="pointer-events-none break-words">{part.name}</span>
        {part.note && (
          <span
            className="pointer-events-none absolute bottom-1.5 right-2 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--ink-faint)", opacity: 0.7 }}
            aria-hidden
          />
        )}
        {onBackSurface && (
          <span
            className="pointer-events-none absolute -top-2 right-2 rounded-full px-1.5 text-[9px] tracking-wide"
            style={{
              background: "var(--ink-soft)",
              color: "#fff",
              lineHeight: "14px",
            }}
          >
            {partSurface(part)}
          </span>
        )}
      </div>

      {/* Arrow sources: rim dots, revealed on hover / selection.
          Visuals + 28px touch hit area live in globals.css. */}
      <Handle type="source" position={Position.Top} id="st" className="part-source-handle" />
      <Handle type="source" position={Position.Right} id="sr" className="part-source-handle" />
      <Handle type="source" position={Position.Bottom} id="sb" className="part-source-handle" />
      <Handle type="source" position={Position.Left} id="sl" className="part-source-handle" />

      {/* Full-card drop target, active only while an arrow is being drawn,
          so touching a card normally never hits a handle. */}
      <Handle
        type="target"
        position={Position.Left}
        id="body"
        isConnectableStart={false}
        style={{
          position: "absolute",
          inset: 0,
          transform: "none",
          width: "100%",
          height: "100%",
          borderRadius: SHAPE_RADIUS[part.shape],
          opacity: 0,
          border: "none",
          background: "transparent",
          pointerEvents: connectionInProgress ? "all" : "none",
        }}
      />

      <NodeToolbar
        isVisible={!!selected && !dragging && !connectionInProgress && !isPhone}
        position={Position.Top}
        offset={14}
      >
        <EditPopover part={part} />
      </NodeToolbar>
    </div>
  );
}

type FloatingEdgeType = Edge<{ color: string; label?: string }, "floating">;

/** Small text input for an arrow's relationship label ("manages",
 *  "protects", …). Local draft state, committed on blur / Enter. */
function ArrowLabelInput({ id, label }: { id: string; label?: string }) {
  const api = useAppApi();
  const [text, setText] = useState(label ?? "");
  // Re-seed the draft when the authoritative label changes underneath us
  // (same render-time derived-state reset as LocationField).
  const [lastLabel, setLastLabel] = useState(label ?? "");
  if (lastLabel !== (label ?? "")) {
    setLastLabel(label ?? "");
    setText(label ?? "");
  }
  const commit = () => {
    const t = text.trim().slice(0, 40);
    if (t === (label ?? "")) return;
    api.updateArrow(id, { label: t || undefined });
  };
  return (
    <input
      className="nodrag nopan w-36 rounded-md px-2 py-1 text-xs outline-none"
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      placeholder="label — e.g. manages"
      maxLength={40}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Air between an arrow's endpoints and the card faces it connects: the
 *  head ends short of the target so it never tucks under the card, and the
 *  tail leaves a hint of light at the source for symmetry. */
const ARROW_GAP = 6;
const SOURCE_GAP = 2.5;

function FloatingEdge({
  id,
  source,
  target,
  selected,
  style,
  markerEnd,
  data,
}: EdgeProps<FloatingEdgeType>) {
  const api = useAppApi();
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  if (!sn || !tn) return null;

  const dims = (n: typeof sn) => ({
    w: n.measured?.width ?? n.width ?? 140,
    h: n.measured?.height ?? n.height ?? 48,
  });
  const sd = dims(sn);
  const td = dims(tn);
  const sc = {
    x: sn.internals.positionAbsolute.x + sd.w / 2,
    y: sn.internals.positionAbsolute.y + sd.h / 2,
  };
  const tc = {
    x: tn.internals.positionAbsolute.x + td.w / 2,
    y: tn.internals.positionAbsolute.y + td.h / 2,
  };
  // Terminate on a slightly expanded rect: the node layer paints above the
  // edge SVG, so a path ending exactly on the border loses the arrowhead
  // tip under the card. A small breathing gap keeps the full head visible
  // at any approach angle (flow-space, so it scales with zoom).
  const sp = rectEdgePoint(sc, sd.w + SOURCE_GAP * 2, sd.h + SOURCE_GAP * 2, tc);
  const tp = rectEdgePoint(tc, td.w + ARROW_GAP * 2, td.h + ARROW_GAP * 2, sc);

  const horizontal = Math.abs(tc.x - sc.x) > Math.abs(tc.y - sc.y);
  const sourcePosition = horizontal
    ? tc.x > sc.x
      ? Position.Right
      : Position.Left
    : tc.y > sc.y
      ? Position.Bottom
      : Position.Top;
  const targetPosition = horizontal
    ? tc.x > sc.x
      ? Position.Left
      : Position.Right
    : tc.y > sc.y
      ? Position.Top
      : Position.Bottom;

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sp.x,
    sourceY: sp.y,
    sourcePosition,
    targetX: tp.x,
    targetY: tp.y,
    targetPosition,
    curvature: 0.28,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={24}
      />
      {(selected || data?.label) && (
        <EdgeLabelRenderer>
          <div
            className="nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {selected ? (
              <div
                className="fade-in flex max-w-[min(20rem,88vw)] flex-wrap items-center justify-center gap-x-1.5 gap-y-2 rounded-2xl px-3 py-2"
                style={panelStyle}
              >
                <ArrowLabelInput key={id} id={id} label={data?.label} />
                <button
                  aria-label="Delete arrow"
                  onClick={() => api.deleteArrow(id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ✕
                </button>
                <div className="flex w-full items-center justify-center gap-0.5">
                  {ARROW_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Arrow color ${c}`}
                      onClick={() => api.updateArrow(id, { color: c })}
                      className="flex h-7 w-7 items-center justify-center rounded-full"
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{
                          background: c,
                          outline:
                            data?.color === c
                              ? "2px solid var(--ink)"
                              : "none",
                          outlineOffset: 1,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                className="block max-w-40 truncate rounded-full px-2.5 py-1 text-[11px]"
                style={{
                  ...panelStyle,
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                }}
                onClick={() => api.selectArrow(id)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {data?.label}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  const horizontal = Math.abs(toX - fromX) > Math.abs(toY - fromY);
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: horizontal
      ? toX > fromX
        ? Position.Right
        : Position.Left
      : toY > fromY
        ? Position.Bottom
        : Position.Top,
    targetX: toX,
    targetY: toY,
    targetPosition: horizontal
      ? toX > fromX
        ? Position.Left
        : Position.Right
      : toY > fromY
        ? Position.Top
        : Position.Bottom,
    curvature: 0.28,
  });
  return (
    <>
      {/* Same head geometry as React Flow's ArrowClosed marker, so the
          in-progress line speaks the committed arrow's language. */}
      <defs>
        <marker
          id="parts-connect-arrow"
          viewBox="-10 -10 20 20"
          markerWidth={16}
          markerHeight={16}
          markerUnits="strokeWidth"
          orient="auto"
          refX={0}
          refY={0}
        >
          <polyline
            points="-5,-4 0,0 -5,4 -5,-4"
            fill="var(--accent)"
            stroke="var(--accent)"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        markerEnd="url(#parts-connect-arrow)"
      />
    </>
  );
}

/** What the lift indicator is currently pointing at (discrete state —
 *  continuous position is driven imperatively by the drag rAF loop).
 *  "moving" = the hand is in transit (too fast to be aiming): the
 *  indicator shows only a quiet dot trailing the pointer — no anchor
 *  commitment, no label, no ticks. */
export type LiftTarget =
  /** region: the landing is the region's anchor point — always. */
  | { kind: "region"; key: string; depth: Depth }
  | { kind: "free" }
  | { kind: "moving" };

/** Singletons so the per-frame state write can bail on reference
 *  equality — no re-renders while the kind is unchanged. */
const MOVING_TARGET: LiftTarget = { kind: "moving" };
const FREE_TARGET: LiftTarget = { kind: "free" };

function LiftOverlay({
  target,
  touch,
  leaderRef,
  indicatorRef,
  ringRef,
}: {
  target: LiftTarget | null;
  /** On touch, the label pill flips above the dot — below it would sit
   *  between the dot and the finger. */
  touch: boolean;
  leaderRef: React.RefObject<SVGPathElement | null>;
  indicatorRef: React.RefObject<HTMLDivElement | null>;
  ringRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!target) return null;

  return (
    <div style={{ position: "absolute", zIndex: 1200, pointerEvents: "none" }}>
      <svg
        style={{ position: "absolute", overflow: "visible", left: 0, top: 0 }}
        width={0}
        height={0}
      >
        <path
          ref={leaderRef}
          className="leader-line"
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.55}
        />
      </svg>
      {/* Pulse ring: the anchor the drop will land on breathes softly.
          Persistent element, position + opacity written by the drag loop
          every frame — never React-driven, so it can't flash at the
          origin on mount. */}
      <div
        ref={ringRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: 0,
          transition: "opacity 120ms ease",
          willChange: "transform",
        }}
      >
        <div style={{ transform: "translate(-50%, -50%)" }}>
          <div
            className="anchor-pulse"
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "1.5px solid var(--accent)",
            }}
          />
        </div>
      </div>
      <div
        ref={indicatorRef}
        style={{ position: "absolute", left: 0, top: 0, willChange: "transform" }}
      >
        <div
          key={
            target.kind === "region"
              ? `${target.key}:${target.depth}`
              : target.kind
          }
          className={target.kind === "moving" ? "" : "indicator-pop"}
          style={{ transform: "translate(-50%, -50%)", position: "relative" }}
        >
          {target.kind === "moving" ? (
            /* in transit: a quiet dot trailing the pointer — no claim */
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--ink-faint)",
                opacity: 0.8,
              }}
            />
          ) : target.kind === "free" ? (
            /* off-body: faint crosshair */
            <svg width={26} height={26} viewBox="0 0 26 26" style={{ display: "block" }}>
              <circle cx={13} cy={13} r={8} fill="none" stroke="var(--ink-faint)" strokeWidth={1.5} />
              <path d="M13 0v6M13 20v6M0 13h6M20 13h6" stroke="var(--ink-faint)" strokeWidth={1.5} />
            </svg>
          ) : (
            /* on-body landing preview: the anchor the drop will land on —
               full dot with halo, the pulse ring breathing around it. */
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "var(--accent)",
                boxShadow: "0 0 0 3px rgba(255,255,255,0.7)",
              }}
            />
          )}
          {/* label pill (hidden in transit — nothing is being claimed) */}
          {target.kind !== "moving" && (
            <div
              className="lift-label"
              style={{
                position: "absolute",
                ...(touch
                  ? { bottom: "100%", marginBottom: 8 }
                  : { top: "100%", marginTop: 8 }),
                left: "50%",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                background: "var(--panel)",
                border: "1px solid var(--line)",
                boxShadow: "var(--shadow-rest)",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 11,
                color: "var(--ink-soft)",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {target.kind === "free"
                ? "off body — place freely"
                : regionLabel(target.key)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   8. UI PANELS
   ════════════════════════════════════════════════════════════════════ */

/** Editable part name (popover + phone sheet). Local draft, committed on
 *  blur / Enter; an emptied field falls back to the current name. */
function NameField({ part, sheet }: { part: Part; sheet?: boolean }) {
  const api = useAppApi();
  const [text, setText] = useState(part.name);
  // Render-time derived-state reset when the part (or its name) changes.
  const [lastKey, setLastKey] = useState(`${part.id}:${part.name}`);
  if (lastKey !== `${part.id}:${part.name}`) {
    setLastKey(`${part.id}:${part.name}`);
    setText(part.name);
  }
  const commit = () => {
    const n = text.trim();
    if (!n) {
      setText(part.name);
      return;
    }
    if (n !== part.name) api.updatePart(part.id, { name: n });
  };
  return (
    <input
      className={`nodrag nopan w-full rounded-md px-2 outline-none ${
        sheet ? "py-2 text-sm" : "py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
      }}
      value={text}
      placeholder="name…"
      aria-label="Part name"
      data-part-name-input
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Optional private note (popover + phone sheet). Local draft, committed
 *  on blur; an emptied field clears the note. */
function NoteField({ part, sheet }: { part: Part; sheet?: boolean }) {
  const api = useAppApi();
  const [text, setText] = useState(part.note ?? "");
  const [lastKey, setLastKey] = useState(`${part.id}:${part.note ?? ""}`);
  if (lastKey !== `${part.id}:${part.note ?? ""}`) {
    setLastKey(`${part.id}:${part.note ?? ""}`);
    setText(part.note ?? "");
  }
  const commit = () => {
    const n = text.trim().slice(0, 500);
    if (n !== (part.note ?? "")) {
      api.updatePart(part.id, { note: n || undefined });
    }
  };
  return (
    <textarea
      className={`nodrag nopan w-full resize-none rounded-md px-2 outline-none ${
        sheet ? "py-2 text-sm" : "py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
      }}
      rows={2}
      maxLength={500}
      value={text}
      placeholder="note…"
      aria-label="Part note"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Editable, text-authoritative location field (shared by popover, list
 *  and phone sheet). */
function LocationField({
  part,
  compact,
  sheet,
}: {
  part: Part;
  compact?: boolean;
  sheet?: boolean;
}) {
  const api = useAppApi();
  const display = locationDisplay(part);
  const [text, setText] = useState(display);
  const [invalid, setInvalid] = useState(false);
  // Reset local text when the authoritative location changes (render-time
  // derived-state reset — no effect needed).
  const [lastDisplay, setLastDisplay] = useState(display);
  if (lastDisplay !== display) {
    setLastDisplay(display);
    setText(display);
    setInvalid(false);
  }

  const commit = () => {
    if (text.trim() === display) return;
    const ok = api.setLocationText(part.id, text);
    setInvalid(!ok);
  };

  return (
    <input
      className={`nodrag nopan rounded-md px-2 outline-none transition-shadow ${
        sheet
          ? "w-full py-2 text-sm"
          : compact
            ? "w-full py-0.5 text-[11px]"
            : "w-44 py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: invalid ? "1px solid #C08A8A" : "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      list="region-labels"
      value={text}
      placeholder="location…"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Lean Miro-style card editor: color, size, bold, shape, location, delete. */
function EditPopover({ part }: { part: Part }) {
  const api = useAppApi();
  const chip = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--line)",
    background: active ? "var(--ink)" : "rgba(255,255,255,0.7)",
    color: active ? "#fff" : "var(--ink-soft)",
  });
  return (
    <div
      className="fade-in flex w-[288px] max-w-[92vw] flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-2xl px-3 py-2.5"
      style={panelStyle}
    >
      <div className="w-full">
        <NameField part={part} />
      </div>
      <div className="flex">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            onClick={() => api.updatePart(part.id, { color: c })}
            className="flex h-8 w-8 items-center justify-center rounded-full"
          >
            <span
              className="h-5 w-5 rounded-full"
              style={{
                background: c,
                border: "1px solid rgba(58,55,51,0.18)",
                outline:
                  part.color === c ? "2px solid var(--ink-soft)" : "none",
                outlineOffset: 1,
              }}
            />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {(["s", "m", "l"] as const).map((s) => (
          <button
            key={s}
            onClick={() => api.updatePart(part.id, { fontSize: s })}
            className="min-h-8 rounded-md px-2 py-1"
            style={{
              ...chip(part.fontSize === s),
              fontSize: s === "s" ? 10 : s === "m" ? 12 : 14,
            }}
          >
            A
          </button>
        ))}
        <button
          onClick={() => api.updatePart(part.id, { bold: !part.bold })}
          className="min-h-8 rounded-md px-2.5 py-1 text-xs font-bold"
          style={chip(part.bold)}
        >
          B
        </button>
        <div className="mx-0.5 h-4 w-px" style={{ background: "var(--line)" }} />
        {(
          [
            ["rounded", "▢"],
            ["square", "□"],
            ["pill", "⬭"],
            ["ellipse", "◯"],
          ] as const
        ).map(([shape, glyph]) => (
          <button
            key={shape}
            aria-label={`Shape ${shape}`}
            onClick={() => api.updatePart(part.id, { shape })}
            className="min-h-8 rounded-md px-2 py-1 text-xs"
            style={chip(part.shape === shape)}
          >
            {glyph}
          </button>
        ))}
      </div>
      <div className="w-full">
        <NoteField part={part} />
      </div>
      <div className="flex w-full items-center gap-2">
        <LocationField part={part} />
        <button
          aria-label="Delete part"
          onClick={() => api.deletePart(part.id)}
          className="ml-auto min-h-8 rounded-md px-2.5 py-1 text-xs"
          style={{ color: "#A05B5B", background: "rgba(192,138,138,0.12)" }}
        >
          delete
        </button>
      </div>
    </div>
  );
}

/** Phone card editor: the same editor rethought as a bottom sheet — one
 *  thumb, big targets, swipe down (or ✕ / tap the canvas) to put away.
 *  Always mounted so the slide in/out can animate; keeps the last part
 *  while sliding out so the content never blanks mid-exit. */
function MobileEditSheet({
  part,
  open,
  onClose,
}: {
  part: Part | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useAppApi();
  // Keep the last part while sliding out (render-time derived-state
  // reset — the codebase idiom, see LocationField).
  const [lastPart, setLastPart] = useState<Part | null>(null);
  if (part && part !== lastPart) setLastPart(part);
  const p = part ?? lastPart;
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; dy: number } | null>(null);
  if (!p) return null;

  const region = REGION_BY_KEY[p.location];
  const surface = partSurface(p);
  // Front/back flip: only where the part's own region exists on both
  // surfaces (paired back regions like the occiput keep their own key).
  const canFlip =
    !p.offBody &&
    !!region &&
    !region.offBody &&
    !region.isBack &&
    (region.hasBack || !!region.bothViews);

  const chip = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--line)",
    background: active ? "var(--ink)" : "rgba(255,255,255,0.7)",
    color: active ? "#fff" : "var(--ink-soft)",
  });

  // Swipe-to-dismiss: the grab strip follows the finger (down only);
  // past the threshold the sheet is put away, otherwise it springs home.
  const onGrabDown = (e: React.PointerEvent) => {
    dragRef.current = { y0: e.clientY, dy: 0 };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    }
  };
  const onGrabUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const s = sheetRef.current;
    if (!s) return;
    s.style.transition = "";
    s.style.transform = "";
    if (d && d.dy > 80) onClose();
  };

  return (
    <div
      ref={sheetRef}
      data-ui-chrome
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl px-4 sm:hidden"
      style={{
        ...panelStyle,
        boxShadow: "0 -8px 32px rgba(60, 50, 40, 0.16)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        transform: open ? "translateY(0)" : "translateY(112%)",
        transition: "transform 320ms cubic-bezier(0.32, 0.72, 0.22, 1)",
        touchAction: "manipulation",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* grab strip — the whole top edge is the swipe handle */}
      <div
        className="-mx-4 flex cursor-grab justify-center pb-1 pt-2"
        style={{ touchAction: "none" }}
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        <div
          className="h-1.5 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
      </div>
      <div className="flex items-center gap-2 pb-2.5">
        <NameField part={p} sheet />
        <button
          aria-label="Done editing"
          className="shrink-0 rounded-full px-3 py-2 text-xs"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
      <div className="flex justify-between pb-2.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            onClick={() => api.updatePart(p.id, { color: c })}
            className="flex h-10 w-10 items-center justify-center rounded-full"
          >
            <span
              className="h-7 w-7 rounded-full"
              style={{
                background: c,
                border: "1px solid rgba(58,55,51,0.18)",
                outline: p.color === c ? "2px solid var(--ink-soft)" : "none",
                outlineOffset: 2,
              }}
            />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 pb-2.5">
        {(["s", "m", "l"] as const).map((s) => (
          <button
            key={s}
            aria-label={`Text size ${s}`}
            onClick={() => api.updatePart(p.id, { fontSize: s })}
            className="min-h-10 flex-1 rounded-lg"
            style={{
              ...chip(p.fontSize === s),
              fontSize: s === "s" ? 11 : s === "m" ? 14 : 17,
            }}
          >
            A
          </button>
        ))}
        <button
          aria-label="Bold"
          onClick={() => api.updatePart(p.id, { bold: !p.bold })}
          className="min-h-10 flex-1 rounded-lg text-sm font-bold"
          style={chip(p.bold)}
        >
          B
        </button>
        <div className="mx-1 h-6 w-px" style={{ background: "var(--line)" }} />
        {(
          [
            ["rounded", "▢"],
            ["square", "□"],
            ["pill", "⬭"],
            ["ellipse", "◯"],
          ] as const
        ).map(([shape, glyph]) => (
          <button
            key={shape}
            aria-label={`Shape ${shape}`}
            onClick={() => api.updatePart(p.id, { shape })}
            className="min-h-10 flex-1 rounded-lg text-sm"
            style={chip(p.shape === shape)}
          >
            {glyph}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <LocationField part={p} sheet />
        {canFlip && (
          <div
            className="flex shrink-0 overflow-hidden rounded-lg"
            style={{ border: "1px solid var(--line)" }}
            role="group"
            aria-label="Body surface"
          >
            {(["front", "back"] as const).map((d) => (
              <button
                key={d}
                aria-pressed={surface === d}
                className="min-h-10 px-3 text-[11px] uppercase tracking-wide"
                style={{
                  background:
                    surface === d ? "var(--ink)" : "rgba(255,255,255,0.7)",
                  color: surface === d ? "#fff" : "var(--ink-soft)",
                }}
                onClick={() => surface !== d && api.setDepth(p.id, d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <button
          aria-label="Delete part"
          onClick={() => {
            api.deletePart(p.id);
            onClose();
          }}
          className="ml-auto min-h-10 shrink-0 rounded-lg px-3.5 text-xs"
          style={{ color: "#A05B5B", background: "rgba(192,138,138,0.12)" }}
        >
          delete
        </button>
      </div>
      <div className="pt-2.5">
        <NoteField part={p} sheet />
      </div>
    </div>
  );
}

/** Tiny speaker glyph for the sound toggle — quiet wave when on, a
 *  soft × when off. Inline SVG, app convention. */
function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
      {on ? (
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

function Toolbar(props: {
  onAdd: (name: string) => void;
  /** The name field lives in the parent so cancelling a tap-to-place
   *  can hand the typed name back to the input. */
  nameValue: string;
  onNameChange: (v: string) => void;
  onImportOpen: () => void;
  bodyScale: number;
  onBodyScale: (v: number) => void;
  autoScale: boolean;
  onAutoScale: (v: boolean) => void;
  onSave: () => void;
  onLoad: (file: File) => void;
  listOpen: boolean;
  onToggleList: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    const n = props.nameValue.trim();
    if (!n) return;
    props.onAdd(n);
    props.onNameChange("");
  };
  const closePopovers = () => {
    setSheetOpen(false);
    setBodyOpen(false);
  };
  const btn =
    "rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-black/5 pointer-coarse:min-h-10";

  const sliderAndAuto = (
    <>
      <input
        type="range"
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={0.01}
        value={props.bodyScale}
        onChange={(e) => props.onBodyScale(Number(e.target.value))}
        className="w-24 min-w-0 flex-1 sm:flex-none"
        aria-label="Body size"
      />
      <label
        className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-[11px]"
        style={{ color: "var(--ink-soft)" }}
      >
        <input
          type="checkbox"
          checked={props.autoScale}
          onChange={(e) => props.onAutoScale(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        auto-space
      </label>
    </>
  );

  return (
    // Bottom-anchored thumb bar on phones; classic top bar from sm up.
    <div
      data-ui-chrome
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:bottom-auto sm:top-0 sm:p-3"
    >
      <div
        className="pointer-events-auto relative flex w-full max-w-full select-none flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-2xl px-2.5 py-2 sm:w-auto sm:px-3"
        style={{ ...panelStyle, touchAction: "manipulation" }}
      >
        {(sheetOpen || bodyOpen) && (
          <div className="fixed inset-0" onClick={closePopovers} />
        )}

        <button
          aria-label="Toggle parts list"
          className={`${btn} shrink-0`}
          style={{ color: "var(--ink-soft)" }}
          onClick={() => {
            closePopovers();
            props.onToggleList();
          }}
        >
          {props.listOpen ? "◂ list" : "☰ list"}
        </button>
        <input
          className="w-24 min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm outline-none sm:w-44 sm:flex-none"
          style={{
            background: "rgba(255,255,255,0.75)",
            border: "1px solid var(--line)",
          }}
          placeholder="Name a part…"
          enterKeyHint="go"
          value={props.nameValue}
          onChange={(e) => props.onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
          onClick={submit}
        >
          Add
        </button>

        {/* ——— desktop / wide: everything inline ——— */}
        <button
          className={`${btn} hidden sm:block`}
          style={{ color: "var(--ink-soft)" }}
          onClick={props.onImportOpen}
        >
          Import
        </button>
        <label
          className="hidden items-center gap-1.5 text-[11px] sm:flex"
          style={{ color: "var(--ink-soft)" }}
        >
          body
          <div className="flex items-center gap-2">{sliderAndAuto}</div>
        </label>
        <div className="hidden h-4 w-px sm:block" style={{ background: "var(--line)" }} />
        <button
          className={`${btn} hidden sm:block`}
          style={{ color: "var(--ink-soft)" }}
          onClick={props.onSave}
        >
          Save
        </button>
        <button
          className={`${btn} hidden sm:block`}
          style={{ color: "var(--ink-soft)" }}
          onClick={() => fileRef.current?.click()}
        >
          Load
        </button>
        <button
          className={`${btn} hidden shrink-0 sm:block`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="Sound"
          aria-pressed={props.soundOn}
          title={props.soundOn ? "Sound on" : "Sound off"}
          onClick={props.onToggleSound}
        >
          <SoundIcon on={props.soundOn} />
        </button>

        {/* ——— phone: body pill + overflow sheet ——— */}
        <button
          className={`${btn} shrink-0 sm:hidden`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="Body size"
          onClick={() => {
            setSheetOpen(false);
            setBodyOpen((v) => !v);
          }}
        >
          body
        </button>
        <button
          className={`${btn} shrink-0 sm:hidden`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="More actions"
          onClick={() => {
            setBodyOpen(false);
            setSheetOpen((v) => !v);
          }}
        >
          ⋯
        </button>

        {bodyOpen && (
          <div
            className="fade-in absolute bottom-full left-1/2 mb-2 flex w-[min(320px,88vw)] -translate-x-1/2 flex-col gap-2.5 rounded-2xl px-4 py-3 sm:hidden"
            style={{ ...panelStyle, touchAction: "manipulation" }}
          >
            <div className="flex items-center gap-3">{sliderAndAuto}</div>
          </div>
        )}
        {sheetOpen && (
          <div
            className="fade-in absolute bottom-full right-0 mb-2 flex w-36 flex-col rounded-2xl p-1.5 sm:hidden"
            style={{ ...panelStyle, touchAction: "manipulation" }}
          >
            <button
              className="rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => {
                setSheetOpen(false);
                props.onImportOpen();
              }}
            >
              Import
            </button>
            <button
              className="rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => {
                setSheetOpen(false);
                props.onSave();
              }}
            >
              Save
            </button>
            <button
              className="rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => {
                setSheetOpen(false);
                fileRef.current?.click();
              }}
            >
              Load
            </button>
            <button
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              aria-pressed={props.soundOn}
              onClick={props.onToggleSound}
            >
              <SoundIcon on={props.soundOn} />
              {props.soundOn ? "Sound on" : "Sound off"}
            </button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onLoad(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** The way home. The canvas is endless and easy to get lost in, so the
 *  frame-map control is a standalone floating button — always in the same
 *  corner on both layouts, big enough to hit without looking. */
function FrameMapButton({ onFrame }: { onFrame: () => void }) {
  return (
    <button
      data-ui-chrome
      aria-label="Frame the map"
      title="Frame the map"
      className="absolute bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 sm:bottom-10"
      style={{ ...panelStyle, touchAction: "manipulation" }}
      onClick={onFrame}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--ink-soft)"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M5.5 1.5H3A1.5 1.5 0 0 0 1.5 3v2.5" />
        <path d="M10.5 1.5H13A1.5 1.5 0 0 1 14.5 3v2.5" />
        <path d="M5.5 14.5H3A1.5 1.5 0 0 1 1.5 13v-2.5" />
        <path d="M10.5 14.5H13a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
      </svg>
    </button>
  );
}

/** The list filter's state — only offered once the list is long enough to
 *  need it; clears itself whenever the list is put away. */
function useListQuery(parts: Part[], open: boolean) {
  const [query, setQuery] = useState("");
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open) setQuery("");
  }
  const q = query.trim().toLowerCase();
  const shown = q
    ? parts.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          locationDisplay(p).toLowerCase().includes(q),
      )
    : parts;
  return { query, setQuery, shown };
}

/** The copy/export actions — one set of buttons shared by the desktop
 *  panel and the phone sheet (the caller provides the wrapping row). */
function CopyActions({
  parts,
  arrows,
  phone,
}: {
  parts: Part[];
  arrows: Arrow[];
  phone?: boolean;
}) {
  const [copied, setCopied] = useState<"list" | "rel" | "flow" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (kind: "list" | "rel" | "flow") => {
    setCopied(kind);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1400);
  };
  const copy = async (kind: "list" | "rel") => {
    const text =
      kind === "list"
        ? parts
            .map(
              (p) =>
                `${p.name}\t${locationDisplay(p)}${p.note ? `\t${p.note}` : ""}`,
            )
            .join("\n")
        : relationshipsText(parts, arrows);
    if (!(await copyText(text))) return;
    flash(kind);
  };
  const exportFlow = async () => {
    if (!(await downloadFlowchartPng(parts, arrows))) return;
    flash("flow");
  };
  const actionBtn = phone
    ? "rounded-lg px-2.5 py-2 text-xs hover:bg-black/5 disabled:opacity-40"
    : "rounded-md px-2 py-1 text-[11px] hover:bg-black/5 pointer-coarse:py-2 disabled:opacity-40";
  return (
    <>
      <button
        className={actionBtn}
        style={{ color: "var(--ink-soft)" }}
        onClick={() => copy("list")}
        disabled={!parts.length}
      >
        {copied === "list" ? "copied ✓" : "copy list"}
      </button>
      <button
        className={actionBtn}
        style={{ color: "var(--ink-soft)" }}
        onClick={() => copy("rel")}
        disabled={!arrows.length}
        title="Copy all arrows as a text flowchart"
      >
        {copied === "rel" ? "copied ✓" : "copy relationships"}
      </button>
      <button
        className={actionBtn}
        style={{ color: "var(--ink-soft)" }}
        onClick={exportFlow}
        disabled={!arrows.length}
        title="Download all arrows as a flowchart image"
      >
        {copied === "flow" ? "exported ✓" : "export flowchart"}
      </button>
    </>
  );
}

/** One list row, two dialects: desktop keeps the inline location editor
 *  and gains a hover "show on map" affordance; phone is a single
 *  thumb-sized target with a read-only location line (editing lives in
 *  the edit sheet). */
function PartRow({
  part: p,
  selected,
  phone,
  onTap,
}: {
  part: Part;
  selected: boolean;
  phone?: boolean;
  onTap: () => void;
}) {
  const noteDot = p.note ? (
    <span
      title={p.note}
      className="h-1 w-1 shrink-0 rounded-full"
      style={{ background: "var(--ink-faint)", opacity: 0.8 }}
    />
  ) : null;
  const backBadge = partIsBack(p) ? (
    <span
      className="shrink-0 rounded-full px-1.5 text-[9px]"
      style={{
        border: "1px solid var(--line)",
        color: "var(--ink-faint)",
        lineHeight: "13px",
      }}
    >
      back
    </span>
  ) : null;
  const rowBg = selected ? "rgba(125,139,116,0.12)" : "transparent";

  if (phone) {
    return (
      <button
        data-part-row={p.id}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors active:bg-black/5"
        style={{ background: rowBg }}
        onClick={onTap}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{
            background: p.color,
            border: "1px solid rgba(58,55,51,0.2)",
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm" style={{ color: "var(--ink)" }}>
            {p.name}
          </span>
          <span
            className="block truncate text-[11px]"
            style={{ color: "var(--ink-faint)" }}
          >
            {locationDisplay(p)}
          </span>
        </span>
        {noteDot}
        {backBadge}
      </button>
    );
  }
  return (
    <div
      data-part-row={p.id}
      className="mb-1 rounded-xl px-2 py-2 transition-colors"
      style={{ background: rowBg }}
    >
      <button
        className="group flex w-full items-center gap-2 text-left"
        title="Show on map"
        onClick={onTap}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: p.color,
            border: "1px solid rgba(58,55,51,0.2)",
          }}
        />
        <span className="truncate text-xs" style={{ color: "var(--ink)" }}>
          {p.name}
        </span>
        {noteDot}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <svg
            className="opacity-0 transition-opacity group-hover:opacity-100"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--ink-faint)"
            strokeWidth="1.2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="6" cy="6" r="2.6" />
            <path d="M6 0.8v1.7M6 9.5v1.7M0.8 6h1.7M9.5 6h1.7" />
          </svg>
          {backBadge}
        </span>
      </button>
      <div className="mt-1 pl-[18px]">
        <LocationField part={p} compact />
      </div>
    </div>
  );
}

function PartsListPanel({
  parts,
  arrows,
  open,
  selectedId,
  onSelect,
  onReveal,
  onClose,
}: {
  parts: Part[];
  arrows: Arrow[];
  open: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Glide the camera to the part (the row's "where is it?"). */
  onReveal: (id: string) => void;
  onClose: () => void;
}) {
  const { query, setQuery, shown } = useListQuery(parts, open);
  const reducedMotion = useReducedMotion();
  // Canvas selection answers "where in my list": keep the selected row
  // in view while the panel is open.
  const rowsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !selectedId) return;
    rowsRef.current
      ?.querySelector(`[data-part-row="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({
        block: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
  }, [open, selectedId, reducedMotion]);
  return (
    <div
      data-ui-chrome
      className={`absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] top-3 z-10 flex w-[min(264px,78vw)] flex-col rounded-2xl transition-transform duration-300 ease-out sm:bottom-3 sm:top-[68px] ${
        open ? "translate-x-0" : "-translate-x-[120%]"
      }`}
      style={panelStyle}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
          Parts ({parts.length})
        </span>
        <button
          aria-label="Close list"
          className="rounded-md px-2 py-1 text-[11px] hover:bg-black/5 pointer-coarse:min-h-9 pointer-coarse:min-w-9"
          style={{ color: "var(--ink-faint)" }}
          onClick={onClose}
        >
          ◂
        </button>
      </div>
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <CopyActions parts={parts} arrows={arrows} />
      </div>
      {parts.length > 8 && (
        <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--line)" }}>
          <input
            className="w-full rounded-md px-2 py-1 text-[11px] outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            value={query}
            placeholder="find a part…"
            aria-label="Filter parts"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div ref={rowsRef} className="flex-1 select-text overflow-y-auto px-2 py-2">
        {parts.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
            No parts yet. Name one above, or Import a list.
          </p>
        )}
        {parts.length > 0 && shown.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
            Nothing matches “{query.trim()}”.
          </p>
        )}
        {shown.map((p) => (
          <PartRow
            key={p.id}
            part={p}
            selected={p.id === selectedId}
            onTap={() => {
              onSelect(p.id);
              onReveal(p.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Phone parts list — a bottom sheet in the same language as the edit
 *  sheet (grab strip, swipe to put away). Rows reveal rather than select:
 *  the sheet slides out of the way so the camera glide and reveal halo
 *  play unobstructed. */
function PhonePartsSheet({
  parts,
  arrows,
  open,
  onReveal,
  onClose,
}: {
  parts: Part[];
  arrows: Arrow[];
  open: boolean;
  onReveal: (id: string) => void;
  onClose: () => void;
}) {
  const { query, setQuery, shown } = useListQuery(parts, open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; dy: number } | null>(null);

  // Swipe-to-dismiss — same gesture as MobileEditSheet: the strip follows
  // the finger (down only); past the threshold the sheet is put away.
  const onGrabDown = (e: React.PointerEvent) => {
    dragRef.current = { y0: e.clientY, dy: 0 };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    }
  };
  const onGrabUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const s = sheetRef.current;
    if (!s) return;
    s.style.transition = "";
    s.style.transform = "";
    if (d && d.dy > 80) onClose();
  };

  return (
    <div
      ref={sheetRef}
      data-ui-chrome
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl px-4 sm:hidden"
      style={{
        ...panelStyle,
        boxShadow: "0 -8px 32px rgba(60, 50, 40, 0.16)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        maxHeight: "62dvh",
        transform: open ? "translateY(0)" : "translateY(112%)",
        transition: "transform 320ms cubic-bezier(0.32, 0.72, 0.22, 1)",
        touchAction: "manipulation",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* grab strip — the whole top edge is the swipe handle */}
      <div
        className="-mx-4 flex shrink-0 cursor-grab justify-center pb-1 pt-2"
        style={{ touchAction: "none" }}
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        <div
          className="h-1.5 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
      </div>
      <div className="flex shrink-0 items-center justify-between pb-2">
        <span className="text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
          Parts ({parts.length})
        </span>
        <button
          aria-label="Close list"
          className="shrink-0 rounded-full px-3 py-2 text-xs"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
      {parts.length > 8 && (
        <div className="shrink-0 pb-2">
          <input
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            value={query}
            placeholder="find a part…"
            aria-label="Filter parts"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className="-mx-1.5 flex-1 overflow-y-auto overscroll-contain">
        {parts.length === 0 && (
          <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            No parts yet. Name one below, or Import a list.
          </p>
        )}
        {parts.length > 0 && shown.length === 0 && (
          <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            Nothing matches “{query.trim()}”.
          </p>
        )}
        {shown.map((p) => (
          <PartRow
            key={p.id}
            part={p}
            phone
            selected={false}
            onTap={() => {
              onReveal(p.id);
              onClose();
            }}
          />
        ))}
      </div>
      <div
        className="mt-1 flex shrink-0 flex-wrap items-center gap-1 pt-1.5"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <CopyActions parts={parts} arrows={arrows} phone />
      </div>
    </div>
  );
}

function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const [text, setText] = useState("");
  if (!open) return null;
  return (
    <div
      data-ui-chrome
      className="absolute inset-0 z-30 flex items-start justify-center p-4 pt-14 sm:items-center sm:pt-4"
      style={{ background: "rgba(58,55,51,0.18)" }}
      onClick={onClose}
    >
      <div
        className="fade-in w-full max-w-md rounded-2xl p-4"
        style={{ ...panelStyle, background: "#FDFCFA" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium">Import parts</h2>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          One part per line. Optionally add a location after a comma or tab —
          e.g. <span className="font-mono">Protector, solar plexus</span>.
          Anything unmatched lands beside the body, ready to place.
        </p>
        <textarea
          className="mt-3 w-full resize-none rounded-xl p-3 text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--line)" }}
          rows={6}
          autoFocus
          placeholder={"Inner Critic\tforehead\nAnxious One, stomach\nThe Watcher, behind me"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
            style={{ color: "var(--ink-soft)" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-xs text-white hover:opacity-90"
            style={{ background: "var(--accent)" }}
            onClick={() => {
              onImport(text);
              setText("");
              onClose();
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   9. MAIN APP
   ════════════════════════════════════════════════════════════════════ */

const nodeTypes = { part: PartNode };
const edgeTypes = { floating: FloatingEdge };

const sameLiftTarget = (a: LiftTarget | null, b: LiftTarget): boolean =>
  !!a &&
  (b.kind === "region"
    ? a.kind === "region" && a.key === b.key && a.depth === b.depth
    : a.kind === b.kind);

/** Per-gesture touch detection. React Flow hands us d3-drag's sourceEvent —
 *  a genuine MouseEvent or TouchEvent — so this is exact. No environment
 *  heuristics: a mouse drag on a touch-screen laptop is a mouse drag. */
const isTouchInput = (e: unknown): boolean => {
  const n = (e as { nativeEvent?: unknown } | null)?.nativeEvent ?? e;
  if (typeof TouchEvent !== "undefined" && n instanceof TouchEvent) return true;
  const t = n as { pointerType?: string; type?: string } | null;
  return t?.pointerType === "touch" || /^touch/.test(t?.type ?? "");
};

/** Screen-space pointer position from a drag event (mouse or touch).
 *  The aim gate measures hand speed here, in raw client px — never in
 *  flow space, so the drag-follow camera's own motion can't masquerade
 *  as hand motion. */
const eventClient = (e: unknown): XYPosition | null => {
  const n = (e as { nativeEvent?: unknown } | null)?.nativeEvent ?? e;
  if (typeof TouchEvent !== "undefined" && n instanceof TouchEvent) {
    const t = n.touches[0] ?? n.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  const m = n as { clientX?: number; clientY?: number } | null;
  return typeof m?.clientX === "number" && typeof m?.clientY === "number"
    ? { x: m.clientX, y: m.clientY }
    : null;
};

/** Derived render centers for every part (no drag override applied) — the
 *  one place location → x,y happens, shared by the render memo and the
 *  settle tweens so they can never disagree. A part renders on the
 *  figure of the surface it sits on (its depth; back regions are always
 *  the back figure). */
function derivePositions(
  parts: Part[],
  bodyScale: number,
): Map<string, XYPosition> {
  const out = new Map<string, XYPosition>();
  const groupCount = new Map<string, number>();
  for (const p of parts) {
    const region = REGION_BY_KEY[p.location];
    if (p.offBody || !region || region.offBody) {
      out.set(p.id, p.freePos);
      continue;
    }
    let pos = anchorToFlow(region, partSurface(p), bodyScale);
    // Co-located parts (same region + depth) fan out in a small
    // deterministic spiral — scaling alone can never separate parts
    // that sit on the same point.
    const gk = `${p.location}:${p.depth}`;
    const n = groupCount.get(gk) ?? 0;
    groupCount.set(gk, n + 1);
    if (n > 0) {
      const angle = n * 2.4;
      const rad = 18 + 7 * n;
      pos = {
        x: pos.x + Math.cos(angle) * rad,
        y: pos.y + Math.sin(angle) * rad,
      };
    }
    out.set(p.id, pos);
  }
  return out;
}

function PartsMapApp() {
  const rf = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ——— the single source of truth ———
  const [parts, setParts] = useState<Part[]>([]);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [bodyScale, setBodyScale] = useState(1);
  const [autoScale, setAutoScale] = useState(true);

  // ——— view state ———
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dragOverride, setDragOverride] = useState<{
    id: string;
    pos: XYPosition;
  } | null>(null);
  // React Flow's DOM measurements, echoed back through the controlled
  // `nodes` prop so RF considers nodes initialized (else dragging logs
  // error #015 and useNodesInitialized never turns true). Never written
  // into `parts` — p.w/p.h means "the user fixed this size" — and never
  // persisted.
  const [measuredDims, setMeasuredDims] = useState<
    ReadonlyMap<string, { w: number; h: number }>
  >(new Map());
  const [lift, setLift] = useState<{ id: string; isTouch: boolean } | null>(
    null,
  );
  const [liftTarget, setLiftTarget] = useState<LiftTarget | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** Tap-to-place: pressing Add births the part into a brief placement
   *  mode — a ghost card follows the hand, the anchor constellation
   *  steps forward, and one tap gives the part its home. The part is
   *  only created at the tap; cancelling hands the name back. */
  const [placing, setPlacing] = useState<{
    name: string;
    color: string;
  } | null>(null);
  /** Whether the placement gesture is touch (flips the label pill). */
  const [placingTouch, setPlacingTouch] = useState(false);
  /** The Add input's text — lives here so cancelling a placement can
   *  restore the typed name. */
  const [draft, setDraft] = useState("");
  const isPhone = useIsPhone();
  const reducedMotion = useReducedMotion();
  const isPhoneRef = useRef(false);
  useEffect(() => {
    isPhoneRef.current = isPhone;
  }, [isPhone]);
  /** Quiet notice pill: transient feedback (auto-space, saved, undo…),
   *  optionally carrying a single action such as Undo. */
  const [notice, setNotice] = useState<{
    text: string;
    key: number;
    action?: { label: string; run: () => void };
    ttlMs?: number;
  } | null>(null);
  /** Session-only sound preference (no persistence by design). */
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    sndSetMuted(!soundOn);
  }, [soundOn]);
  /** One-shot landing effects: card pop (via node data) + anchor ripple. */
  const [dropPop, setDropPop] = useState<{ id: string; key: number } | null>(
    null,
  );
  const [ripple, setRipple] = useState<{
    pos: XYPosition;
    key: number;
  } | null>(null);

  // ——— refs for the imperative drag loop (zero re-renders per frame) ———
  const partsRef = useRef(parts);
  const arrowsRef = useRef(arrows);
  const bodyScaleRef = useRef(bodyScale);
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);
  useEffect(() => {
    arrowsRef.current = arrows;
  }, [arrows]);
  useEffect(() => {
    bodyScaleRef.current = bodyScale;
  }, [bodyScale]);

  /* ——— undo: a bounded snapshot history of the map (parts + arrows).
         Body scale keeps its own pill Undo; viewport and selection are
         not history. In-memory only — nothing persists, by design. ——— */
  const historyRef = useRef<
    { parts: Part[]; arrows: Arrow[]; label: string; tag: string; at: number }[]
  >([]);
  /** Anything worth undoing is also unsaved — the beforeunload guard
   *  reads this. Cleared on save and on load. */
  const dirtyRef = useRef(false);
  /** Snapshot the map BEFORE a mutation. Same-tag pushes within a second
   *  coalesce (scrubbing color swatches is one undo, not eight). */
  const pushHistory = useCallback((tag: string, label: string) => {
    dirtyRef.current = true;
    const h = historyRef.current;
    const now = Date.now();
    const top = h[h.length - 1];
    if (top && top.tag === tag && now - top.at < 1000) {
      top.at = now;
      return;
    }
    h.push({
      parts: partsRef.current,
      arrows: arrowsRef.current,
      label,
      tag,
      at: now,
    });
    if (h.length > 30) h.shift();
  }, []);

  /* One-time touch hint: the connect dots have no hover to reveal them
     on touch — name them once, the first time a card is selected. */
  const linkHintShownRef = useRef(false);
  const maybeShowLinkHint = useCallback(() => {
    if (linkHintShownRef.current) return;
    if (!(window.matchMedia?.("(pointer: coarse)").matches ?? false)) return;
    linkHintShownRef.current = true;
    setNotice({
      text: "Drag a dot on the card’s edge to link parts",
      key: Date.now(),
    });
  }, []);

  const liftInfoRef = useRef<{ id: string; isTouch: boolean } | null>(null);
  const cardPosRef = useRef<XYPosition>({ x: 0, y: 0 });
  const indPosRef = useRef<XYPosition>({ x: 0, y: 0 });
  const indVelRef = useRef<XYPosition>({ x: 0, y: 0 });
  /** Sticky magnet: the anchor currently held by the lift indicator. */
  const stickRef = useRef<{ key: string; depth: Depth } | null>(null);
  /** Aim gate: screen-space pointer speed (time-based EMA) and the
   *  aim/transit hysteresis — the magnet only retargets while aiming. */
  const aimRef = useRef({
    aiming: true,
    spdEma: 0,
    prevX: 0,
    prevY: 0,
    prevT: 0,
    lastTickAt: 0,
  });
  /** Raw client px of the dragging pointer (written by onNodeDrag). */
  const pointerScreenRef = useRef<XYPosition | null>(null);
  /** React Flow's own reported node position (grab-offset based) — only
   *  the blend source before cursor-centering completes. */
  const rfPosRef = useRef<XYPosition>({ x: 0, y: 0 });
  /** Cursor-centering state for the active drag. */
  const centerRef = useRef({
    engaged: false,
    start: 0,
    travel: 0,
    /** Last frame's (center − rfPos) x-gap, so blend-injected motion can
     *  be subtracted from the tilt physics (it isn't hand velocity). */
    prevGapX: 0,
    lastWrite: null as XYPosition | null,
    /** Whether the grab seeded an anchor landing — those parts land on
     *  their anchor regardless, so zoom-drift may engage centering with
     *  zero travel without ever moving the landing. */
    seedSnapped: false,
  });
  /** Constellation spotlight circle (cx/cy written per frame). */
  const spotRef = useRef<SVGCircleElement | null>(null);
  /** Drag-follow camera: zoom at lift start, reduced-motion opt-out,
   *  phone zoom ceiling, and the spatial near/far hysteresis latch
   *  (see the FOLLOW_ consts). */
  const followRef = useRef<{
    base: number;
    reduced: boolean;
    phone: boolean;
    near: boolean;
  } | null>(null);
  const restoreRafRef = useRef(0);
  const lastTargetRef = useRef<{ target: LiftTarget; pos: XYPosition } | null>(
    null,
  );
  const liftRafRef = useRef(0);
  const leaderRef = useRef<SVGPathElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  /** The pulse ring on the targeted anchor — written imperatively. */
  const ringRef = useRef<HTMLDivElement | null>(null);
  /** Card inner elements, for direct tilt/lag transform writes. */
  const innerElsRef = useRef(new Map<string, HTMLDivElement>());
  /** Physics state for the lifted card: filtered velocity, tilt spring,
   *  eased pickup amount. */
  const tiltRef = useRef({ vf: 0, theta: 0, thetaV: 0, liftAmt: 0, prevX: 0 });

  const settleRafRef = useRef(0);
  const settlingRef = useRef(false);
  /** Active settle tween, so a cancellation (new grab mid-settle) can
   *  restore the card's inline styles and skip its landing effects. */
  const settleStateRef = useRef<{ id: string; putDown: boolean } | null>(null);
  const scaleRafRef = useRef(0);
  const resizingRef = useRef<string | null>(null);
  const autoArmedRef = useRef(false);
  /** The scale the person last chose by hand — auto-space treats it as a
   *  floor when relaxing back, so it never undoes a deliberate setting. */
  const manualScaleRef = useRef(1);
  const colorCountRef = useRef(0);
  const placingRef = useRef<{ name: string; color: string } | null>(null);
  /** Ghost card element (screen-space) — transform written per frame. */
  const ghostRef = useRef<HTMLDivElement | null>(null);

  /* ——— initial camera: fit both figures side by side; on a phone-width
         screen that leaves two tiny figures in dead margin, so frame the
         FRONT figure comfortably instead — the Front/Back pill (and
         pinch) reach the other one. ——— */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 640) {
      const zoom = Math.min(1.1, (h * 0.82) / BODY_H, (w * 0.9) / BODY_W);
      rf.setViewport({
        x: w / 2 - figureCenterX("front", 1) * zoom,
        y: h / 2,
        zoom,
      });
    } else {
      const zoom = Math.min(1.1, (h * 0.82) / BODY_H, (w * 0.92) / SCENE_W);
      rf.setViewport({ x: w / 2, y: h / 2, zoom });
    }
  }, [rf]);

  /* ——— phone Front/Back pill: which figure owns the screen center, and
         a gentle x-glide to the other one (zoom untouched — the pill
         moves the camera, it is not a mode). ——— */
  const [viewSide, setViewSide] = useState<Depth>("front");
  const glideRafRef = useRef(0);
  /** Glide the camera to a viewport with an easeOutCubic tween; reduced
   *  motion jumps straight there. One glide at a time — a new call (or a
   *  fresh grab) takes the camera over. */
  const glideViewport = useCallback(
    (to: Viewport, D = 380) => {
      cancelAnimationFrame(glideRafRef.current);
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      ) {
        rf.setViewport(to);
        return;
      }
      const from = rf.getViewport();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const e = easeOutCubic(t);
        rf.setViewport({
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          zoom: from.zoom + (to.zoom - from.zoom) * e,
        });
        if (t < 1) glideRafRef.current = requestAnimationFrame(step);
      };
      glideRafRef.current = requestAnimationFrame(step);
    },
    [rf],
  );
  const onMove = useCallback((_: unknown, vp: Viewport) => {
    const el = wrapperRef.current;
    if (!el) return;
    const cx = (el.clientWidth / 2 - vp.x) / (vp.zoom || 1);
    // The figures' midline is flow x = 0 at every body scale.
    setViewSide(cx > 0 ? "back" : "front");
  }, []);
  const jumpToFigure = useCallback(
    (depth: Depth) => {
      const el = wrapperRef.current;
      if (!el) return;
      const vp = rf.getViewport();
      glideViewport({
        x:
          el.clientWidth / 2 -
          figureCenterX(depth, bodyScaleRef.current) * vp.zoom,
        y: vp.y,
        zoom: vp.zoom,
      });
    },
    [rf, glideViewport],
  );

  /** The list's "where is it?" gesture: glide the camera to a part and
   *  give its card a soft two-breath halo. */
  const [reveal, setReveal] = useState<{ id: string; key: number } | null>(
    null,
  );
  const revealPart = useCallback(
    (id: string) => {
      const el = wrapperRef.current;
      if (!el) return;
      const p = partsRef.current.find((q) => q.id === id);
      if (!p) return;
      const pos = p.offBody
        ? p.freePos
        : derivePositions(partsRef.current, bodyScaleRef.current).get(id);
      if (!pos) return;
      const vp = rf.getViewport();
      // Come no closer than a readable zoom; never zoom out to do it.
      const zoom = Math.max(vp.zoom, 0.8);
      glideViewport({
        x: el.clientWidth / 2 - pos.x * zoom,
        y: el.clientHeight / 2 - pos.y * zoom,
        zoom,
      });
      setReveal({ id, key: Date.now() });
    },
    [rf, glideViewport],
  );

  /** Frame the whole map: both figures plus any off-body strays. On a
   *  phone-width screen, frame the front figure (as on first open). */
  const fitAll = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const s = bodyScaleRef.current;
    if (w < 640) {
      const zoom = Math.min(1.1, (h * 0.82) / BODY_H, (w * 0.9) / BODY_W);
      glideViewport({
        x: w / 2 - figureCenterX("front", s) * zoom,
        y: h / 2,
        zoom,
      });
      return;
    }
    // The two-figure scene (gap included) scales linearly about flow 0,0.
    let minX = (-SCENE_W * s) / 2;
    let maxX = (SCENE_W * s) / 2;
    let minY = (-BODY_H * s) / 2;
    let maxY = (BODY_H * s) / 2;
    for (const p of partsRef.current) {
      if (!p.offBody) continue;
      const halfW = (p.w ?? 160) / 2 + 40;
      const halfH = (p.h ?? 48) / 2 + 40;
      minX = Math.min(minX, p.freePos.x - halfW);
      maxX = Math.max(maxX, p.freePos.x + halfW);
      minY = Math.min(minY, p.freePos.y - halfH);
      maxY = Math.max(maxY, p.freePos.y + halfH);
    }
    const zoom = Math.max(
      0.15,
      Math.min(1.1, (w * 0.92) / (maxX - minX), (h * 0.82) / (maxY - minY)),
    );
    glideViewport({
      x: w / 2 - ((minX + maxX) / 2) * zoom,
      y: h / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    });
  }, [glideViewport]);

  useEffect(
    () => () => {
      cancelAnimationFrame(liftRafRef.current);
      cancelAnimationFrame(settleRafRef.current);
      cancelAnimationFrame(scaleRafRef.current);
      cancelAnimationFrame(restoreRafRef.current);
      cancelAnimationFrame(glideRafRef.current);
    },
    [],
  );

  /* ——— drop settle: rAF tween of the override (real position updates so
         edges reroute live through every frame). Optionally drives the
         card's put-down (lift/tilt relaxing to rest over the glide) and
         fires the one-shot landing effects at touchdown — never at
         release. ——— */
  const cancelSettle = useCallback(() => {
    cancelAnimationFrame(settleRafRef.current);
    const s = settleStateRef.current;
    settleStateRef.current = null;
    if (s && settlingRef.current) {
      if (s.putDown) {
        // The tween owned the inline transform; hand it back cleanly so
        // the interrupted card can't freeze mid-deformation.
        const el = innerElsRef.current.get(s.id);
        if (el) {
          el.style.transform = "";
          el.style.transition = "";
        }
      }
      settlingRef.current = false;
      setDragOverride(null);
    }
  }, []);

  /** Put the map back the way it was before the last change. Selection
   *  clears (the change being undone may have been the selected thing);
   *  auto-space stays disarmed so the restored layout isn't re-judged. */
  const undo = useCallback(() => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    cancelSettle();
    setDragOverride(null);
    setParts(snap.parts);
    setArrows(snap.arrows);
    setSelectedId(null);
    setSelectedEdgeId(null);
    autoArmedRef.current = false;
    setNotice({ text: `Undid — ${snap.label}`, key: Date.now() });
  }, [cancelSettle]);

  const settleTween = useCallback(
    (
      id: string,
      from: XYPosition,
      to: XYPosition,
      opts?: {
        /** Lift/tilt state at release — relaxed to rest over the glide. */
        putDown?: { lag: number; theta: number; liftAmt: number };
        /** Landing effects (pop, ripple, sound, haptic) — touchdown only. */
        onLand?: () => void;
      },
    ) => {
      cancelSettle();
      settlingRef.current = true;
      settleStateRef.current = { id, putDown: !!opts?.putDown };
      const start = performance.now();
      // A drop can now glide from anywhere on the figure to its anchor —
      // stretch the duration mildly with distance so long glides don't
      // read as a yank (220ms nearby, easing up to 320ms).
      const D = Math.min(
        320,
        220 + Math.hypot(to.x - from.x, to.y - from.y) * 0.3,
      );
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const e = easeOutBack(t);
        setDragOverride({
          id,
          pos: {
            x: from.x + (to.x - from.x) * e,
            y: from.y + (to.y - from.y) * e,
          },
        });
        const pd = opts?.putDown;
        if (pd) {
          // easeOutCubic, not easeOutBack: the pose must not overshoot
          // past rest, or the pop keyframe's scale(1) start would jump.
          const el = innerElsRef.current.get(id);
          if (el) {
            const r = 1 - easeOutCubic(t);
            const la = pd.liftAmt * r;
            el.style.transform = `translate(${pd.lag * r}px, ${-6 * la}px) scale(${
              1 + 0.03 * la
            }) rotate(${pd.theta * r}deg)`;
          }
        }
        if (t < 1) {
          settleRafRef.current = requestAnimationFrame(step);
        } else {
          if (pd) {
            const el = innerElsRef.current.get(id);
            if (el) {
              el.style.transform = "";
              el.style.transition = "";
            }
          }
          settlingRef.current = false;
          settleStateRef.current = null;
          setDragOverride(null);
          opts?.onLand?.();
        }
      };
      settleRafRef.current = requestAnimationFrame(step);
    },
    [cancelSettle],
  );

  /* ——— auto-scaling: gentle rAF tween of the body scale.
         On phone layouts the camera rides along: the figure under the
         screen center keeps its screen position AND its on-screen size
         (zoom compensates 1/scale), so making room reads as the cards
         gently spreading — the body never outgrows a small screen. On
         desktop the scene simply grows about its center, as before. ——— */
  const animateBodyScale = useCallback(
    (target: number) => {
      cancelAnimationFrame(scaleRafRef.current);
      const from = bodyScaleRef.current;
      const to = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
      if (Math.abs(to - from) < 0.005) return;
      dirtyRef.current = true;
      const el = wrapperRef.current;
      const phone = !!el && el.clientWidth < 640;
      const vp0 = rf.getViewport();
      const z0 = vp0.zoom || 1;
      const w = el?.clientWidth ?? 0;
      const side: Depth = (w / 2 - vp0.x) / z0 > 0 ? "back" : "front";
      // Screen x the framed figure's center must hold through the tween.
      const sx = figureCenterX(side, from) * z0 + vp0.x;
      const start = performance.now();
      const D = 650;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const s = from + (to - from) * easeInOutCubic(t);
        setBodyScale(s);
        if (phone) {
          const z = z0 * (from / s);
          rf.setViewport({
            x: sx - figureCenterX(side, s) * z,
            // Figures are vertically centered on flow y = 0, which sits
            // at screen y = vp.y at every zoom — hold it.
            y: vp0.y,
            zoom: z,
          });
        }
        if (t < 1) scaleRafRef.current = requestAnimationFrame(step);
      };
      scaleRafRef.current = requestAnimationFrame(step);
    },
    [rf],
  );

  /* ——— the lift rAF loop: steering, sticky magnet, drag-follow camera ——— */
  const startLiftLoop = useCallback(() => {
    cancelAnimationFrame(liftRafRef.current);
    const loop = () => {
      const info = liftInfoRef.current;
      if (!info) return;
      // React Flow aborts a drag without onNodeDragStop when the node is
      // deleted mid-drag — never leave the loop running headless.
      if (!partsRef.current.some((p) => p.id === info.id)) {
        liftInfoRef.current = null;
        setLift(null);
        setLiftTarget(null);
        setDragOverride(null);
        return;
      }
      const scale = bodyScaleRef.current;
      const vp = rf.getViewport();
      const zoom = vp.zoom || 1;
      // ——— aim gate: hand speed in raw screen px/s, time-based EMA —
      //     frame-rate independent, and immune to the assist zoom's own
      //     glide (flow-space deltas would read camera motion as hand
      //     motion). A fast hand is in transit: the magnet holds its
      //     tongue until the hand slows back into aiming. ———
      const aim = aimRef.current;
      const nowT = performance.now();
      const dt = Math.max(1, nowT - aim.prevT);
      aim.prevT = nowT;
      const ps = pointerScreenRef.current;
      const ctr = centerRef.current;
      if (ps) {
        const dpx = Math.hypot(ps.x - aim.prevX, ps.y - aim.prevY);
        ctr.travel += dpx;
        const spd = (dpx * 1000) / dt;
        aim.prevX = ps.x;
        aim.prevY = ps.y;
        aim.spdEma +=
          (spd - aim.spdEma) * (1 - Math.exp(-dt / SPD_EMA_TAU_MS));
      }

      // ——— the cursor holds the card: recompute the card center from
      //     the live pointer each frame, so no camera glide can ever
      //     separate them. Engages after a little true travel (a grab
      //     is not a re-aim) — or immediately once the assist zoom has
      //     drifted, for anchored parts only (they land on their anchor
      //     regardless, so zero-travel centering can't scoot a fine
      //     placement). ———
      const rp = rfPosRef.current;
      let center = rp;
      if (ps) {
        if (
          !ctr.engaged &&
          (ctr.travel > CENTER_TRAVEL_PX ||
            (ctr.seedSnapped &&
              Math.abs(zoom - (followRef.current?.base ?? zoom)) > 0.02))
        ) {
          ctr.engaged = true;
          ctr.start = nowT;
        }
        if (ctr.engaged) {
          const hand = rf.screenToFlowPosition({ x: ps.x, y: ps.y });
          const e = easeOutCubic(
            Math.min(1, (nowT - ctr.start) / CENTER_BLEND_MS),
          );
          center = {
            x: rp.x + (hand.x - rp.x) * e,
            y: rp.y + (hand.y - rp.y) * e,
          };
        }
      }
      // Blend-injected motion isn't hand velocity — keep it out of the
      // tilt physics or the centering engage reads as a rotation glitch.
      const gapX = center.x - rp.x;
      tiltRef.current.prevX += gapX - ctr.prevGapX;
      ctr.prevGapX = gapX;
      cardPosRef.current = center;
      // Publish the corrected position (screen-space change threshold —
      // a calm frame writes nothing).
      const lw = ctr.lastWrite;
      if (!lw || Math.hypot(center.x - lw.x, center.y - lw.y) > 0.25 / zoom) {
        ctr.lastWrite = { x: center.x, y: center.y };
        setDragOverride({ id: info.id, pos: { x: center.x, y: center.y } });
      }

      const card = center;
      // On touch the person steers a point above the fingertip so the
      // indicator is never hidden under the hand.
      const steer = info.isTouch
        ? { x: card.x, y: card.y - TOUCH_STEER_OFFSET / zoom }
        : card;

      const wasAiming = aim.aiming;
      if (aim.aiming) {
        if (aim.spdEma > AIM_EXIT_SPD) aim.aiming = false;
      } else if (aim.spdEma < AIM_ENTER_SPD) {
        aim.aiming = true;
      }
      if (!aim.aiming) stickRef.current = null;

      // Nearest anchor across both figures; over a figure but outside
      // every capture radius, stay magnetic to that figure's anchors.
      // This resolution runs every frame — transit or aim — so a release
      // always lands on the truth under the hand.
      const res = resolveMagnet(steer, scale);
      let near = res.near;
      let hit = res.hit;
      const snapR = res.snapR;
      // The touch offset can push the steer point past the extremities
      // (crown, feet); if it misses but the card itself is on a figure,
      // target from the card instead of falling into off-body mode.
      if (!hit && info.isTouch) {
        const fig = figureUnder(card, scale);
        const nc = nearestTarget(card, scale, fig ?? undefined);
        if (nc && (nc.dist < snapR || fig)) {
          near = nc;
          hit = true;
        }
      }

      // Sticky grip (aiming only): hold the current anchor until a rival
      // is decisively closer or the pointer has clearly left its cell —
      // the target never flickers along the midline between two anchors.
      const stick = stickRef.current;
      if (aim.aiming && hit && near && stick) {
        const same =
          stick.key === near.region.key && stick.depth === near.depth;
        if (!same) {
          const sr = REGION_BY_KEY[stick.key];
          const sa = anchorToFlow(sr, stick.depth, scale);
          const sd = Math.hypot(steer.x - sa.x, steer.y - sa.y);
          if (sd < snapR * STICK_RELEASE && near.dist > sd * STICK_RIVAL) {
            near = { region: sr, depth: stick.depth, dist: sd };
          } else {
            magnetTick(aim, 4); // the grip hands over — a soft tick
          }
        }
      }

      let target: LiftTarget;
      let tpos: XYPosition;
      let landing: XYPosition;
      if (near && hit) {
        // The magnet owns the landing: the drop always lands on the
        // targeted anchor — the pulse ring on it says so while aiming.
        tpos = anchorToFlow(near.region, near.depth, scale);
        target = { kind: "region", key: near.region.key, depth: near.depth };
        landing = tpos;
        if (aim.aiming) {
          stickRef.current = { key: near.region.key, depth: near.depth };
        }
      } else {
        stickRef.current = null;
        target = FREE_TARGET;
        tpos = steer;
        landing = steer;
      }
      lastTargetRef.current = { target, pos: landing };
      // Slowing back down over a region commits it — one soft tick.
      if (aim.aiming && !wasAiming && target.kind === "region") {
        magnetTick(aim, 3);
      }
      // Transit shows only a quiet dot trailing the hand; aiming shows
      // the resolved target. Discrete changes only — the singletons
      // compare by reference, so no re-renders while the kind holds.
      const shown = aim.aiming ? target : MOVING_TARGET;
      setLiftTarget((prev) => (sameLiftTarget(prev, shown) ? prev : shown));

      // ——— drag-follow camera: over (or near) a figure the camera eases
      //     in to the working zoom, pivoting on the steering point so
      //     the world under the pointer holds still; and on EVERY drag a
      //     deadzone-band pan drifts the viewport whenever the pointer
      //     strays from the middle of the canvas, so edge-of-screen
      //     drags follow continuously. Both glides stretch with hand
      //     speed — a fast hand makes the camera hang back. ———
      const follow = followRef.current;
      const wrapEl = wrapperRef.current;
      if (follow && !follow.reduced && ps && wrapEl) {
        // Spatial hysteresis: a slim pad engages, a wider one releases —
        // no flapping while skirting the silhouette's edge.
        follow.near =
          figureUnder(
            steer,
            scale,
            follow.near ? FOLLOW_EXIT_PAD : FOLLOW_ENTER_PAD,
          ) !== null;
        const followZoom = Math.min(
          Math.max(FOLLOW_GAP_PX / (MIN_ANCHOR_GAP * scale), FOLLOW_MIN),
          follow.phone ? FOLLOW_MAX_PHONE : FOLLOW_MAX,
        );
        // Never zoom below wherever the person already was.
        const wantZ = follow.near
          ? Math.max(follow.base, followZoom)
          : follow.base;
        const lag = 1 + Math.min(2, aim.spdEma / 500);
        // Zoom only deepens while aiming (a fling across a figure never
        // zooms in); easing back out is allowed at any speed.
        let z = zoom;
        if (wantZ < zoom || aim.aiming) {
          z = zoom + (wantZ - zoom) * (1 - Math.exp(-dt / (GLIDE_TAU_MS * lag)));
        }
        // Compose one viewport write: zoom about the steer point, then
        // the recentering pan easing the steer point back toward the
        // middle band (never yanked to dead center).
        const sxScr = steer.x * zoom + vp.x;
        const syScr = steer.y * zoom + vp.y;
        let nx = sxScr - steer.x * z;
        let ny = syScr - steer.y * z;
        const cw = wrapEl.clientWidth;
        const chh = wrapEl.clientHeight;
        const bandX = cw * CENTER_BAND_FRAC;
        const bandY = chh * CENTER_BAND_FRAC;
        const errX =
          sxScr - Math.min(Math.max(sxScr, cw / 2 - bandX), cw / 2 + bandX);
        const errY =
          syScr - Math.min(Math.max(syScr, chh / 2 - bandY), chh / 2 + bandY);
        const k = 1 - Math.exp(-dt / (CENTER_TAU_MS * lag));
        nx -= errX * k;
        ny -= errY * k;
        if (
          Math.abs(z - zoom) > 0.0004 ||
          Math.abs(nx - vp.x) > 0.01 ||
          Math.abs(ny - vp.y) > 0.01
        ) {
          rf.setViewport({ x: nx, y: ny, zoom: z });
          // A camera move under a stationary pointer shifts the card's
          // flow position — that isn't hand motion, so keep it out of
          // the tilt physics (same treatment as the centering blend).
          tiltRef.current.prevX += (sxScr - nx) / z - steer.x;
        }
      }

      // Firm, near-critically-damped spring — the landing preview: locked
      // targets pull the dot onto the anchor; free-form placement keeps
      // it under the hand; in transit it trails, claiming nothing.
      const springTo = aim.aiming ? landing : steer;
      const p = indPosRef.current;
      const v = indVelRef.current;
      v.x += (springTo.x - p.x) * 0.28;
      v.y += (springTo.y - p.y) * 0.28;
      v.x *= 0.68;
      v.y *= 0.68;
      p.x += v.x;
      p.y += v.y;

      if (leaderRef.current) {
        const len = Math.hypot(p.x - card.x, p.y - card.y);
        const sag = Math.min(26, len * 0.12);
        leaderRef.current.setAttribute(
          "d",
          `M ${card.x} ${card.y} Q ${(card.x + p.x) / 2} ${
            (card.y + p.y) / 2 + sag
          } ${p.x} ${p.y}`,
        );
        // The line speaks softly while the hand is just travelling.
        leaderRef.current.setAttribute(
          "opacity",
          aim.aiming ? "0.55" : "0.35",
        );
      }
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      if (ringRef.current) {
        // The pulse: the anchor the drop will land on breathes softly
        // while the hand is aiming; nothing pulses in transit or off-body.
        const showRing = aim.aiming && target.kind === "region";
        ringRef.current.style.opacity = showRing ? "1" : "0";
        ringRef.current.style.transform = `translate(${tpos.x}px, ${tpos.y}px)`;
      }
      if (spotRef.current) {
        spotRef.current.setAttribute("cx", String(steer.x));
        spotRef.current.setAttribute("cy", String(steer.y));
      }

      // ——— card physics: velocity tilt, trailing lag, eased pickup ———
      const el = innerElsRef.current.get(info.id);
      if (el) {
        const tl = tiltRef.current;
        const dxFlow = card.x - tl.prevX;
        tl.prevX = card.x;
        tl.vf += (dxFlow - tl.vf) * 0.25; // velocity low-pass (~60ms)
        const thetaT = Math.max(-4, Math.min(4, tl.vf * zoom * 0.35));
        tl.thetaV += (thetaT - tl.theta) * 0.18;
        tl.thetaV *= 0.75; // slight overshoot when the drag stops
        tl.theta += tl.thetaV;
        tl.liftAmt += (1 - tl.liftAmt) * 0.22; // pickup eases in, no snap
        const lag = Math.max(-6, Math.min(6, -tl.vf * 0.3));
        el.style.transform = `translate(${lag}px, ${-6 * tl.liftAmt}px) scale(${
          1 + 0.03 * tl.liftAmt
        }) rotate(${tl.theta}deg)`;
      }

      liftRafRef.current = requestAnimationFrame(loop);
    };
    liftRafRef.current = requestAnimationFrame(loop);
  }, [rf]);

  const onNodeDragStart = useCallback(
    (e: MouseEvent | TouchEvent, node: Node) => {
      cancelSettle();
      // Own the override from frame one — a regrab mid-settle must not
      // flash at the derived position while the loop spins up.
      setDragOverride({ id: node.id, pos: { ...node.position } });
      cancelAnimationFrame(restoreRafRef.current);
      cancelAnimationFrame(glideRafRef.current);
      const isTouch = isTouchInput(e);
      const session = { id: node.id, isTouch };
      liftInfoRef.current = session;
      cardPosRef.current = { ...node.position };
      rfPosRef.current = { ...node.position };
      centerRef.current = {
        engaged: false,
        start: 0,
        travel: 0,
        prevGapX: 0,
        lastWrite: { ...node.position },
        seedSnapped: false,
      };
      indPosRef.current = { ...node.position };
      indVelRef.current = { x: 0, y: 0 };
      stickRef.current = null;
      // React Flow aborts drags (pinch second-touch, deletion) without
      // firing onNodeDragStop — if the lift state survives the pointer
      // going up, tear it down rather than looping headless.
      const relief = () => {
        window.removeEventListener("pointerup", relief, true);
        window.removeEventListener("touchend", relief, true);
        window.removeEventListener("touchcancel", relief, true);
        setTimeout(() => {
          // Compare the session object, not the id — a fresh regrab of
          // the same card within the delay must not be torn down.
          if (liftInfoRef.current === session) {
            cancelAnimationFrame(liftRafRef.current);
            liftInfoRef.current = null;
            setLift(null);
            setLiftTarget(null);
            setDragOverride(null);
            const el = innerElsRef.current.get(node.id);
            if (el) {
              el.style.transition = "";
              el.style.transform = "";
            }
          }
        }, 400);
      };
      window.addEventListener("pointerup", relief, true);
      window.addEventListener("touchend", relief, true);
      window.addEventListener("touchcancel", relief, true);
      const client = eventClient(e);
      pointerScreenRef.current = client;
      aimRef.current = {
        // Seed aiming: spdEma starts at 0, so starting in transit would
        // fire a spurious commit tick on the very first frame.
        aiming: true,
        spdEma: 0,
        prevX: client?.x ?? 0,
        prevY: client?.y ?? 0,
        prevT: performance.now(),
        lastTickAt: 0,
      };
      followRef.current = {
        base: rf.getViewport().zoom || 1,
        reduced:
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
          false,
        phone: isPhoneRef.current,
        near: false,
      };
      // Seed the landing truth synchronously: a flick released before
      // the first rAF frame must still land where it was dropped, not
      // silently demote to off-body. A grab is NOT a re-aim: an on-body
      // part seeds its OWN region, so a mere flick can never relabel it
      // toward a neighboring anchor.
      {
        const scale = bodyScaleRef.current;
        const part = partsRef.current.find((p) => p.id === node.id);
        const ownRegion =
          part && !part.offBody ? REGION_BY_KEY[part.location] : undefined;
        if (part && ownRegion && !ownRegion.offBody) {
          const surface = partSurface(part);
          centerRef.current.seedSnapped = true;
          lastTargetRef.current = {
            target: { kind: "region", key: part.location, depth: surface },
            pos: { ...node.position },
          };
        } else {
          const { near, hit } = resolveMagnet(node.position, scale);
          if (hit && near) {
            const a = anchorToFlow(near.region, near.depth, scale);
            centerRef.current.seedSnapped = true;
            lastTargetRef.current = {
              target: { kind: "region", key: near.region.key, depth: near.depth },
              pos: a,
            };
          } else {
            lastTargetRef.current = {
              target: FREE_TARGET,
              pos: { ...node.position },
            };
          }
        }
      }
      // Park the spotlight under the hand before the constellation
      // fades in, so it can't reveal the previous drag's position.
      spotRef.current?.setAttribute("cx", String(node.position.x));
      spotRef.current?.setAttribute("cy", String(node.position.y));
      tiltRef.current = {
        vf: 0,
        theta: 0,
        thetaV: 0,
        liftAmt: 0,
        prevX: node.position.x,
      };
      // Suspend the CSS transform transition while the loop owns the
      // transform (keep the shadow ease); restored on drop.
      const inner = innerElsRef.current.get(node.id);
      if (inner) {
        inner.style.transition =
          "box-shadow 180ms cubic-bezier(0.33, 1, 0.68, 1)";
      }
      sndPlay("lift");
      setLift({ id: node.id, isTouch });
      setSelectedEdgeId(null);
      startLiftLoop();
    },
    [rf, startLiftLoop, cancelSettle],
  );

  const onNodeDrag = useCallback((e: MouseEvent | TouchEvent, node: Node) => {
    // The loop owns cardPosRef (cursor-centering) — RF's grab-offset
    // position is only the blend source until centering completes.
    rfPosRef.current = node.position;
    const client = eventClient(e);
    if (client) pointerScreenRef.current = client;
  }, []);

  const onNodeDragStop = useCallback(
    () => {
      cancelAnimationFrame(liftRafRef.current);
      const info = liftInfoRef.current;
      liftInfoRef.current = null;
      const last = lastTargetRef.current;
      setLift(null);
      setLiftTarget(null);
      if (!info) return;
      // The pose at release — the settle tween relaxes it to rest over
      // the glide (the put-down), so the card is never yanked upright.
      const tl = tiltRef.current;
      const putDown = {
        lag: Math.max(-6, Math.min(6, -tl.vf * 0.3)),
        theta: tl.theta,
        liftAmt: tl.liftAmt,
      };
      // The loop-corrected center (cursor-held), not RF's grab-offset
      // position — the card lands exactly where the person sees it.
      const dropPos = { ...cardPosRef.current };
      // The follow camera hands back: ease to the lift-start zoom,
      // pivoting on the drop point so the landed card doesn't jump.
      const follow = followRef.current;
      followRef.current = null;
      if (follow && !follow.reduced) {
        const vp = rf.getViewport();
        if (Math.abs(vp.zoom - follow.base) > 0.01) {
          cancelAnimationFrame(restoreRafRef.current);
          const fromZ = vp.zoom;
          const toZ = follow.base;
          const sx = dropPos.x * fromZ + vp.x;
          const sy = dropPos.y * fromZ + vp.y;
          const start = performance.now();
          const D = 360;
          const step = (now: number) => {
            const t = Math.min(1, (now - start) / D);
            const z = fromZ + (toZ - fromZ) * easeOutCubic(t);
            rf.setViewport({
              x: sx - dropPos.x * z,
              y: sy - dropPos.y * z,
              zoom: z,
            });
            if (t < 1) restoreRafRef.current = requestAnimationFrame(step);
          };
          restoreRafRef.current = requestAnimationFrame(step);
        }
      }
      if (!last || last.target.kind !== "region") {
        // Off-body: the card stays exactly where it was dropped. Hand
        // the transform straight back to CSS — the restored 180ms
        // transition relaxes the tilt/lift in place.
        const inner = innerElsRef.current.get(info.id);
        if (inner) {
          inner.style.transition = "";
          inner.style.transform = "";
        }
        const zone = nearestOffZone(dropPos, bodyScaleRef.current);
        pushHistory(`move:${info.id}`, "move");
        setParts((ps) =>
          ps.map((p) =>
            p.id === info.id
              ? {
                  ...p,
                  offBody: true,
                  freePos: dropPos,
                  location: zone,
                  depth: "front",
                }
              : p,
          ),
        );
        setDragOverride(null);
        sndPlay("free");
      } else {
        // On-body: the drop always lands on the targeted anchor — the
        // pulsing point the aim promised. Landing effects fire at
        // touchdown, never at release.
        const { key, depth } = last.target;
        pushHistory(`move:${info.id}`, "move");
        const updated = partsRef.current.map((p) =>
          p.id === info.id
            ? { ...p, offBody: false, location: key, depth }
            : p,
        );
        setParts(updated);
        const to = derivePositions(updated, bodyScaleRef.current).get(info.id);
        if (to) {
          settleTween(info.id, dropPos, to, {
            putDown,
            onLand: () => {
              const now = Date.now();
              setDropPop({ id: info.id, key: now });
              setRipple({ pos: to, key: now });
              sndPlay("drop");
              navigator.vibrate?.(8);
            },
          });
        } else {
          const inner = innerElsRef.current.get(info.id);
          if (inner) {
            inner.style.transition = "";
            inner.style.transform = "";
          }
          setDragOverride(null);
        }
      }
      autoArmedRef.current = true;
    },
    [rf, settleTween, pushHistory],
  );

  /* The ripple element removes itself once its animation has played. */
  useEffect(() => {
    if (!ripple) return;
    const t = setTimeout(() => setRipple(null), 620);
    return () => clearTimeout(t);
  }, [ripple]);

  /* ——— controlled React Flow: apply changes back onto our state ——— */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Resize dimension changes first, so their companion position changes
    // in the same batch are recognized as part of an active resize.
    const dims: { id: string; w: number; h: number }[] = [];
    const removed: string[] = [];
    for (const ch of changes) {
      if (ch.type === "dimensions" && ch.dimensions) {
        // Every measurement — resize or RF's initial DOM measure — is
        // remembered and echoed back via the nodes memo (see measuredDims).
        dims.push({ id: ch.id, w: ch.dimensions.width, h: ch.dimensions.height });
        if (ch.resizing) {
          resizingRef.current = ch.id;
          const dim = ch.dimensions;
          setParts((ps) =>
            ps.map((p) =>
              p.id === ch.id ? { ...p, w: dim.width, h: dim.height } : p,
            ),
          );
        }
      }
    }
    for (const ch of changes) {
      if (ch.type === "position" && ch.position) {
        if (liftInfoRef.current?.id === ch.id) {
          // The lift loop owns the dragged card's override — the cursor
          // holds the card by its center, recomputed from the live
          // pointer; RF's grab-offset position would fight it.
        } else if (ch.dragging || resizingRef.current === ch.id) {
          setDragOverride({ id: ch.id, pos: ch.position });
        }
        // The final non-dragging position is ignored — drop commits are
        // handled in onNodeDragStop against the parts array.
      } else if (ch.type === "select") {
        setSelectedId((prev) =>
          ch.selected ? ch.id : prev === ch.id ? null : prev,
        );
        if (ch.selected) {
          maybeShowLinkHint();
          // One sheet at a time on phones: selecting a card summons the
          // edit sheet, so the list sheet steps aside first.
          if (isPhoneRef.current) setListOpen(false);
        }
      } else if (ch.type === "remove") {
        const nm = partsRef.current.find((p) => p.id === ch.id)?.name;
        pushHistory(`delete:${ch.id}`, nm ? `deleted “${nm}”` : "delete");
        setParts((ps) => ps.filter((p) => p.id !== ch.id));
        setArrows((as) =>
          as.filter((a) => a.sourceId !== ch.id && a.targetId !== ch.id),
        );
        removed.push(ch.id);
        autoArmedRef.current = true;
      }
    }
    if (dims.length || removed.length) {
      setMeasuredDims((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const d of dims) {
          const cur = next.get(d.id);
          if (!cur || cur.w !== d.w || cur.h !== d.h) {
            next.set(d.id, { w: d.w, h: d.h });
            changed = true;
          }
        }
        for (const id of removed) {
          if (next.delete(id)) changed = true;
        }
        return changed ? next : prev;
      });
    }
  }, [pushHistory, maybeShowLinkHint]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const ch of changes) {
      if (ch.type === "select") {
        setSelectedEdgeId((prev) =>
          ch.selected ? ch.id : prev === ch.id ? null : prev,
        );
        // The arrow editor lives at canvas level — don't leave it buried
        // under the phone list sheet.
        if (ch.selected && isPhoneRef.current) setListOpen(false);
      } else if (ch.type === "remove") {
        pushHistory(`arrow-delete:${ch.id}`, "arrow removed");
        setArrows((as) => as.filter((a) => a.id !== ch.id));
      }
    }
  }, [pushHistory]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      pushHistory("arrow-add", "arrow");
      setArrows((as) => [
        ...as,
        {
          id: newId("arrow"),
          sourceId: conn.source,
          targetId: conn.target,
          color: ARROW_COLORS[0],
        },
      ]);
    },
    [pushHistory],
  );

  /* ——— the app API handed to nodes / edges / panels ——— */
  const api = useMemo<AppApi>(
    () => ({
      updatePart: (id, patch) => {
        const keys = Object.keys(patch);
        pushHistory(
          `edit:${id}:${keys.join(",")}`,
          keys.includes("name")
            ? "rename"
            : keys.includes("note")
              ? "note edit"
              : "style edit",
        );
        setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      },
      deletePart: (id) => {
        const nm = partsRef.current.find((p) => p.id === id)?.name;
        pushHistory(`delete:${id}`, nm ? `deleted “${nm}”` : "delete");
        setParts((ps) => ps.filter((p) => p.id !== id));
        setArrows((as) =>
          as.filter((a) => a.sourceId !== id && a.targetId !== id),
        );
        setSelectedId((prev) => (prev === id ? null : prev));
        // Removals free up room — let auto-space ease the body back.
        autoArmedRef.current = true;
      },
      setLocationText: (id, text) => {
        const m = matchRegion(text);
        if (!m) return false;
        pushHistory(`move:${id}`, "move");
        const region = REGION_BY_KEY[m.key];
        const scale = bodyScaleRef.current;
        if (region.offBody) {
          setParts((ps) =>
            ps.map((p) =>
              p.id === id
                ? {
                    ...p,
                    offBody: true,
                    location: m.key,
                    depth: "front",
                    freePos: offBodySuggestion(region, scale),
                  }
                : p,
            ),
          );
          autoArmedRef.current = true;
          return true;
        }
        // Text is authoritative: the edit moves the part exactly onto
        // the region's anchor.
        const updated = partsRef.current.map((p) =>
          p.id === id
            ? { ...p, offBody: false, location: m.key, depth: m.depth }
            : p,
        );
        const from = derivePositions(partsRef.current, scale).get(id);
        const to = derivePositions(updated, scale).get(id);
        setParts(updated);
        if (from && to && (from.x !== to.x || from.y !== to.y)) {
          settleTween(id, from, to);
        }
        autoArmedRef.current = true;
        return true;
      },
      setDepth: (id, depth) => {
        pushHistory(`flip:${id}`, "front/back flip");
        const scale = bodyScaleRef.current;
        const updated = partsRef.current.map((p) =>
          p.id === id ? { ...p, depth } : p,
        );
        const from = derivePositions(partsRef.current, scale).get(id);
        const to = derivePositions(updated, scale).get(id);
        setParts(updated);
        if (from && to && (from.x !== to.x || from.y !== to.y)) {
          settleTween(id, from, to);
        }
        autoArmedRef.current = true;
      },
      endResize: (id) => {
        resizingRef.current = null;
        const internal = rf.getInternalNode(id);
        const part = partsRef.current.find((p) => p.id === id);
        if (!internal || !part) {
          setDragOverride(null);
          return;
        }
        const w = internal.measured?.width;
        const h = internal.measured?.height;
        const center = {
          x: internal.internals.positionAbsolute.x + (w ?? 0) / 2,
          y: internal.internals.positionAbsolute.y + (h ?? 0) / 2,
        };
        pushHistory(`resize:${id}`, "resize");
        const updated = partsRef.current.map((p) =>
          p.id === id
            ? {
                ...p,
                w: w ?? p.w,
                h: h ?? p.h,
                freePos: p.offBody ? center : p.freePos,
              }
            : p,
        );
        setParts(updated);
        if (part.offBody) {
          setDragOverride(null);
        } else {
          // Location is authoritative: the resized card re-centers on its
          // anchor with the same settle motion as a drop.
          const to = derivePositions(updated, bodyScaleRef.current).get(id);
          if (to) settleTween(id, center, to);
          else setDragOverride(null);
        }
        autoArmedRef.current = true;
      },
      updateArrow: (id, patch) => {
        pushHistory(
          `arrow-edit:${id}:${Object.keys(patch).join(",")}`,
          "label" in patch ? "arrow label" : "arrow style",
        );
        setArrows((as) =>
          as.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        );
      },
      deleteArrow: (id) => {
        pushHistory(`arrow-delete:${id}`, "arrow removed");
        setArrows((as) => as.filter((a) => a.id !== id));
        setSelectedEdgeId((prev) => (prev === id ? null : prev));
      },
      selectArrow: (id) => {
        setSelectedEdgeId(id);
      },
      registerPartInner: (id, el) => {
        if (el) innerElsRef.current.set(id, el);
        else innerElsRef.current.delete(id);
      },
    }),
    [rf, settleTween, pushHistory],
  );

  /* ——— creation: tap-to-place ——— */

  /** Add pressed: enter placement mode. The part is NOT created yet —
   *  the name and its would-be color ride along as a ghost until the
   *  tap. Pressing Add again with a new name simply replaces the ghost. */
  const beginPlacing = useCallback((name: string) => {
    const info = {
      name,
      color: PALETTE[colorCountRef.current % PALETTE.length],
    };
    placingRef.current = info;
    setPlacing(info);
    setPlacingTouch(false);
    sndPlay("lift");
  }, []);

  /** Leave placement mode without creating anything — the typed name
   *  goes back into the input, nothing is lost. */
  const cancelPlacing = useCallback(() => {
    const info = placingRef.current;
    if (!info) return;
    placingRef.current = null;
    setPlacing(null);
    setDraft(info.name);
  }, []);

  /** The tap gives the part its home: on/near a figure it lands on the
   *  nearest anchor with the full landing choreography (glide, pop,
   *  ripple, thump); on open canvas it settles off-body right there. */
  const placePart = useCallback(
    (client: XYPosition) => {
      const info = placingRef.current;
      if (!info) return;
      placingRef.current = null;
      setPlacing(null);
      const scale = bodyScaleRef.current;
      const flow = rf.screenToFlowPosition(client);
      const id = newId("part");
      pushHistory(`add:${id}`, `added “${info.name}”`);
      colorCountRef.current++;
      const base = {
        id,
        name: info.name,
        color: info.color,
        fontSize: "m" as const,
        bold: false,
        shape: "rounded" as const,
      };
      const { near, hit } = resolveMagnet(flow, scale);
      if (hit && near) {
        const part: Part = {
          ...base,
          location: near.region.key,
          depth: near.depth,
          offBody: false,
          freePos: flow,
        };
        const updated = [...partsRef.current, part];
        setParts(updated);
        // First paint at the tap point (same batch as the part itself),
        // then the settle glides it onto its anchor — landing effects at
        // touchdown, exactly like a drop.
        setDragOverride({ id, pos: flow });
        const to = derivePositions(updated, scale).get(id);
        if (to) {
          settleTween(id, flow, to, {
            onLand: () => {
              const now = Date.now();
              setDropPop({ id, key: now });
              setRipple({ pos: to, key: now });
              sndPlay("drop");
              navigator.vibrate?.(8);
            },
          });
        } else {
          setDragOverride(null);
        }
      } else {
        const part: Part = {
          ...base,
          location: nearestOffZone(flow, scale),
          depth: "front",
          offBody: true,
          freePos: flow,
        };
        setParts((ps) => [...ps, part]);
        sndPlay("free");
      }
      // Desktop: select so the popover is ready. Phone: stay hands-off —
      // auto-opening the edit sheet would bury the landing it just made.
      if (!isPhoneRef.current) setSelectedId(id);
      autoArmedRef.current = true;
    },
    [rf, settleTween, pushHistory],
  );

  /* Placement mode: capture-phase listeners own the canvas (a stray pan
     must not fight the tap), a light rAF loop drives the ghost, the
     pulse ring, the landing dot, and the leader — the same visual
     language as a drag, without a card in hand yet. */
  useEffect(() => {
    if (!placing) return;
    const el = wrapperRef.current;
    if (!el) return;
    let pt: XYPosition | null = null;
    let lastKey = "";
    let seeded = false;
    const tick = { lastTickAt: 0 };
    indVelRef.current = { x: 0, y: 0 };
    // Park the spotlight off-scene until the pointer speaks.
    spotRef.current?.setAttribute("cx", "9999999");
    const isChrome = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("[data-ui-chrome]");
    const onMove = (e: PointerEvent) => {
      pt = { x: e.clientX, y: e.clientY };
    };
    const onDown = (e: PointerEvent) => {
      if (isChrome(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === "touch") setPlacingTouch(true);
      pt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (isChrome(e.target)) return;
      e.stopPropagation();
      placePart({ x: e.clientX, y: e.clientY });
    };
    const onClick = (e: MouseEvent) => {
      if (isChrome(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelPlacing();
    };
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const g = ghostRef.current;
      if (!pt) {
        // Nothing to aim from yet (touch, pre-contact): ghost hidden.
        if (g) g.style.opacity = "0";
        return;
      }
      const scale = bodyScaleRef.current;
      const flow = rf.screenToFlowPosition(pt);
      if (g) {
        g.style.opacity = "1";
        g.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }
      const { near, hit } = resolveMagnet(flow, scale);
      let target: LiftTarget;
      let tpos: XYPosition;
      if (hit && near) {
        tpos = anchorToFlow(near.region, near.depth, scale);
        target = { kind: "region", key: near.region.key, depth: near.depth };
        const rk = `${near.region.key}:${near.depth}`;
        if (lastKey && lastKey !== rk) magnetTick(tick, 4);
        lastKey = rk;
      } else {
        target = FREE_TARGET;
        tpos = flow;
        lastKey = "";
      }
      setLiftTarget((prev) => (sameLiftTarget(prev, target) ? prev : target));
      if (!seeded) {
        indPosRef.current = { ...flow };
        seeded = true;
      }
      // Same landing-dot spring as the drag loop.
      const p = indPosRef.current;
      const v = indVelRef.current;
      v.x += (tpos.x - p.x) * 0.28;
      v.y += (tpos.y - p.y) * 0.28;
      v.x *= 0.68;
      v.y *= 0.68;
      p.x += v.x;
      p.y += v.y;
      if (leaderRef.current) {
        const len = Math.hypot(p.x - flow.x, p.y - flow.y);
        const sag = Math.min(26, len * 0.12);
        leaderRef.current.setAttribute(
          "d",
          `M ${flow.x} ${flow.y} Q ${(flow.x + p.x) / 2} ${
            (flow.y + p.y) / 2 + sag
          } ${p.x} ${p.y}`,
        );
        leaderRef.current.setAttribute("opacity", "0.55");
      }
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      if (ringRef.current) {
        const showRing = target.kind === "region";
        ringRef.current.style.opacity = showRing ? "1" : "0";
        ringRef.current.style.transform = `translate(${tpos.x}px, ${tpos.y}px)`;
      }
      if (spotRef.current) {
        spotRef.current.setAttribute("cx", String(flow.x));
        spotRef.current.setAttribute("cy", String(flow.y));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      setLiftTarget(null);
    };
  }, [placing, rf, placePart, cancelPlacing]);

  /* Opening the import modal is a change of intent — put the ghost away
     (name restored) rather than leaving a mode running underneath. */
  useEffect(() => {
    if (importOpen) cancelPlacing();
  }, [importOpen, cancelPlacing]);

  /* ——— import ——— */

  const doImport = useCallback(
    (text: string) => {
      const lines = parseImportText(text);
      if (!lines.length) return;
      const scale = bodyScaleRef.current;
      const placements = interpretLocations(lines, scale);
      const newParts: Part[] = lines.map((l, i) => {
        const pl = placements[i];
        let freePos = pl.freePos;
        if (pl.offBody && !freePos) {
          // Unmatched bulk imports line up beside the body (its zone's
          // suggestion), not in a screen-space corner.
          const zone = REGION_BY_KEY[pl.location];
          freePos = offBodySuggestion(
            zone?.offBody ? zone : REGION_BY_KEY["off-left"],
            scale,
          );
          freePos = { x: freePos.x + (i % 3) * 26, y: freePos.y + i * 16 };
        } else if (freePos) {
          // stagger matched off-body zones so repeats don't stack
          freePos = { x: freePos.x + (i % 3) * 26, y: freePos.y + i * 16 };
        }
        return {
          id: newId("part"),
          name: l.name,
          location: pl.location,
          depth: pl.depth,
          offBody: pl.offBody,
          freePos: freePos ?? { x: 0, y: 0 },
          color: PALETTE[colorCountRef.current++ % PALETTE.length],
          fontSize: "m" as const,
          bold: false,
          shape: "rounded" as const,
        };
      });
      pushHistory("import", `imported ${newParts.length} parts`);
      setParts((ps) => [...ps, ...newParts]);
      autoArmedRef.current = true;
    },
    [pushHistory],
  );

  /* ——— persistence ——— */
  const onSave = useCallback(() => {
    downloadMap({
      version: 1,
      parts,
      arrows,
      bodyScale,
      autoScale,
      viewport: rf.getViewport(),
    });
    dirtyRef.current = false;
    setNotice({ text: "Saved ✓", key: Date.now() });
  }, [parts, arrows, bodyScale, autoScale, rf]);

  const onLoad = useCallback(
    async (file: File) => {
      try {
        const doc = await loadMapFile(file);
        cancelPlacing();
        cancelAnimationFrame(settleRafRef.current);
        cancelAnimationFrame(scaleRafRef.current);
        cancelAnimationFrame(restoreRafRef.current);
        settlingRef.current = false;
        setDragOverride(null);
        setParts(doc.parts);
        setArrows(doc.arrows);
        setBodyScale(doc.bodyScale);
        manualScaleRef.current = doc.bodyScale;
        setAutoScale(doc.autoScale);
        setSelectedId(null);
        setSelectedEdgeId(null);
        if (doc.viewport) rf.setViewport(doc.viewport);
        // A fresh document: yesterday's history belongs to the old map.
        historyRef.current = [];
        setMeasuredDims(new Map());
        dirtyRef.current = false;
        // A loaded map may open crowded — let the auto-grow pass judge it.
        autoArmedRef.current = true;
      } catch {
        setNotice({
          text: "Couldn't read that file — it doesn't look like a Parts Map JSON.",
          key: Date.now(),
        });
      }
    },
    [rf, cancelPlacing],
  );

  const onBodyScaleManual = useCallback((v: number) => {
    // Manual moves cancel any auto tween and never trigger auto-growth.
    cancelAnimationFrame(scaleRafRef.current);
    manualScaleRef.current = v;
    setBodyScale(v);
    dirtyRef.current = true;
  }, []);

  /* ——— unsaved-changes guard: prompt before the tab closes with work
         that never reached a file. No autosave, no storage — these maps
         are sensitive, and leaving nothing behind is deliberate. ——— */
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  /* ——— keyboard: Ctrl/Cmd+Z undo, Escape puts things down, Enter opens
         the selected part's name for editing. Deliberately minimal. ——— */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        // Fields keep their own text undo; mid-drag / mid-placement the
        // map is in the hand, not on the table.
        if (typing || liftInfoRef.current || placingRef.current) return;
        e.preventDefault();
        undo();
        return;
      }
      if (typing || placingRef.current) return;
      if (e.key === "Escape") {
        if (importOpen) setImportOpen(false);
        else {
          setSelectedEdgeId(null);
          setSelectedId(null);
        }
        return;
      }
      if (e.key === "Enter" && selectedId) {
        // The open editor (popover or sheet) carries the name field.
        const el = document.querySelector<HTMLInputElement>(
          "[data-part-name-input]",
        );
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, importOpen, selectedId]);


  /* ——— auto-space / anti-crowding (armed only by placement events).
         Reworked to actually make a difference: one decisive move to the
         scale that RESOLVES the worst crowding (not a timid nudge), and
         the reverse — when parts leave or spread out, the body relaxes
         back down (never below the hand-set slider value). Every move
         announces itself in a small pill with one-tap Undo. ——— */
  useEffect(() => {
    // NOTE: no useNodesInitialized gate — historically it reported false
    // forever because measurements weren't echoed back through the
    // controlled nodes (fixed via measuredDims); the pair loop skipping
    // unmeasured nodes still covers the brief pre-measure window.
    if (!autoScale || !autoArmedRef.current) return;
    if (lift || dragOverride || settlingRef.current) return;
    const timer = setTimeout(() => {
      if (
        !autoArmedRef.current ||
        liftInfoRef.current ||
        settlingRef.current
      ) {
        return;
      }
      autoArmedRef.current = false;
      const onBody = partsRef.current.filter((p) => {
        const r = REGION_BY_KEY[p.location];
        return !p.offBody && r && !r.offBody;
      });
      const cur = bodyScaleRef.current;
      const floor = Math.max(MIN_SCALE, manualScaleRef.current);
      if (onBody.length < 2) {
        // Nothing left to crowd — ease all the way back to the hand-set
        // floor rather than staying stuck large.
        if (cur > floor + 0.02) {
          animateBodyScale(floor);
          setNotice({
            text: `Auto-space: eased back (${Math.round((floor / cur - 1) * 100)}%)`,
            key: Date.now(),
            action: { label: "Undo", run: () => animateBodyScale(cur) },
            ttlMs: 8000,
          });
        }
        return;
      }
      const posMap = derivePositions(partsRef.current, cur);
      const PAD = 14;
      // For each pair, the scale factor at which it is exactly
      // comfortable (anchors spread linearly with scale; card sizes
      // don't scale — separation on either axis suffices).
      let growF = 1; // factor needed to resolve the worst crowding
      let slackF = 0; // smallest factor at which EVERY pair stays clear
      for (let i = 0; i < onBody.length; i++) {
        for (let j = i + 1; j < onBody.length; j++) {
          const a = onBody[i];
          const b = onBody[j];
          // Anchored on the same point: scaling can't separate them
          // (the spiral nudge does).
          if (a.location === b.location && a.depth === b.depth) {
            continue;
          }
          const ia = rf.getInternalNode(a.id);
          const ib = rf.getInternalNode(b.id);
          const wa = ia?.measured?.width;
          const ha = ia?.measured?.height;
          const wb = ib?.measured?.width;
          const hb = ib?.measured?.height;
          if (!wa || !ha || !wb || !hb) continue;
          const pa = posMap.get(a.id)!;
          const pb = posMap.get(b.id)!;
          const dx = Math.abs(pa.x - pb.x);
          const dy = Math.abs(pa.y - pb.y);
          const needX = (wa + wb) / 2 + PAD;
          const needY = (ha + hb) / 2 + PAD;
          const fx = dx > 2 ? needX / dx : Infinity;
          const fy = dy > 2 ? needY / dy : Infinity;
          const req = Math.min(fx, fy);
          if (!Number.isFinite(req)) continue;
          slackF = Math.max(slackF, req);
          if (dx < needX && dy < needY) growF = Math.max(growF, req);
        }
      }
      let target: number | null = null;
      if (growF > 1.02) {
        // Crowded: go straight to the scale that clears it (small
        // cushion, capped per pass so one drop never doubles the body).
        target = Math.min(cur * Math.min(growF * 1.04, 1.5), MAX_SCALE);
      } else if (slackF > 0.05 && slackF < 0.88 && cur > floor + 0.02) {
        // Everything comfortably clear: relax back toward the hand-set
        // floor, keeping a cushion above the tightest pair. The 0.88
        // gate (12% real slack) keeps grow/relax from oscillating.
        target = Math.max(cur * slackF * 1.08, floor);
      }
      if (target !== null && Math.abs(target - cur) > 0.01) {
        animateBodyScale(target);
        const pct = Math.round((target / cur - 1) * 100);
        if (pct !== 0) {
          setNotice({
            text:
              pct > 0
                ? `Auto-space: made room (+${pct}%)`
                : `Auto-space: eased back (${pct}%)`,
            key: Date.now(),
            action: { label: "Undo", run: () => animateBodyScale(cur) },
            ttlMs: 8000,
          });
        }
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [
    parts,
    autoScale,
    lift,
    dragOverride,
    rf,
    animateBodyScale,
  ]);

  /* The notice pill quietly excuses itself. */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.ttlMs ?? 4500);
    return () => clearTimeout(t);
  }, [notice]);

  /* ——— derived views: one parts array → nodes + list ——— */
  const nodes: Node[] = useMemo(() => {
    const posMap = derivePositions(parts, bodyScale);
    return parts.map((p) => {
      const md = measuredDims.get(p.id);
      return {
        id: p.id,
        type: "part" as const,
        position:
          dragOverride?.id === p.id ? dragOverride.pos : posMap.get(p.id)!,
        width: p.w,
        height: p.h,
        // Echo RF's own measurement back so adoptUserNodes doesn't wipe it
        // on every rebuild of these fresh node objects (RF error #015).
        measured: md ? { width: md.w, height: md.h } : undefined,
        selected: p.id === selectedId,
        data: {
          part: p,
          lifted: lift?.id === p.id,
          popKey: dropPop?.id === p.id ? dropPop.key : 0,
          revealKey: reveal?.id === p.id ? reveal.key : 0,
        },
      };
    });
  }, [
    parts,
    bodyScale,
    dragOverride,
    selectedId,
    lift,
    dropPop,
    reveal,
    measuredDims,
  ]);

  const edges: Edge[] = useMemo(
    () =>
      arrows.map((a) => ({
        id: a.id,
        type: "floating" as const,
        source: a.sourceId,
        target: a.targetId,
        selected: a.id === selectedEdgeId,
        data: { color: a.color, label: a.label },
        style: { stroke: a.color, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: a.color,
          width: 16,
          height: 16,
        },
      })),
    [arrows, selectedEdgeId],
  );

  return (
    <AppApiContext.Provider value={api}>
      <div
        ref={wrapperRef}
        className="relative h-dvh w-full"
        style={{ background: "var(--canvas)" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onMove={onMove}
          onPaneClick={() => {
            setSelectedId(null);
            setSelectedEdgeId(null);
            // On phone the list is a sheet over the canvas — a tap on the
            // map means "let me see it."
            if (isPhoneRef.current) setListOpen(false);
          }}
          nodeOrigin={[0.5, 0.5]}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={40}
          connectionLineComponent={ConnectionLine}
          connectOnClick={false}
          minZoom={0.15}
          maxZoom={4}
          zoomOnDoubleClick={false}
          // The drag-follow camera owns edge-following during drags; RF's
          // own auto-pan would double-pan. Reduced motion turns our camera
          // glides off, so RF's (functional, not decorative) pan returns.
          autoPanOnNodeDrag={reducedMotion}
          nodeDragThreshold={4}
          nodeClickDistance={8}
          paneClickDistance={8}
          multiSelectionKeyCode={null}
          selectionOnDrag={false}
          deleteKeyCode={["Backspace", "Delete"]}
          style={{ background: "var(--canvas)" }}
        >
          <ViewportPortal>
            <div
              style={{
                position: "absolute",
                zIndex: -1,
                pointerEvents: "none",
              }}
            >
              <BodyOutline bodyScale={bodyScale} />
              <AnchorConstellation
                bodyScale={bodyScale}
                visible={!!lift || !!placing}
                boost={!!placing}
                spotRef={spotRef}
              />
            </div>
            {ripple && (
              <div
                key={ripple.key}
                className="drop-ripple"
                style={{
                  position: "absolute",
                  left: ripple.pos.x,
                  top: ripple.pos.y,
                  zIndex: 1100,
                  pointerEvents: "none",
                }}
              />
            )}
            <LiftOverlay
              target={liftTarget}
              touch={lift?.isTouch ?? placingTouch}
              leaderRef={leaderRef}
              indicatorRef={indicatorRef}
              ringRef={ringRef}
            />
          </ViewportPortal>
        </ReactFlow>

        {/* Phone-only Front/Back jump: glides the camera between the two
            figures (framing is per-figure on narrow screens). */}
        <div
          data-ui-chrome
          className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex -translate-x-1/2 gap-0.5 rounded-full p-1 sm:hidden"
          style={{ ...panelStyle, touchAction: "manipulation" }}
        >
          {(["front", "back"] as const).map((d) => (
            <button
              key={d}
              aria-label={`Show ${d} figure`}
              aria-pressed={viewSide === d}
              className="rounded-full px-3.5 py-1 text-[11px] uppercase tracking-[0.12em] transition-colors"
              style={
                viewSide === d
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--ink-soft)" }
              }
              onClick={() => jumpToFigure(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <Toolbar
          onAdd={beginPlacing}
          nameValue={draft}
          onNameChange={setDraft}
          onImportOpen={() => setImportOpen(true)}
          bodyScale={bodyScale}
          onBodyScale={onBodyScaleManual}
          autoScale={autoScale}
          onAutoScale={(v) => {
            setAutoScale(v);
            dirtyRef.current = true;
          }}
          onSave={onSave}
          onLoad={onLoad}
          listOpen={listOpen}
          onToggleList={() => setListOpen((v) => !v)}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((v) => !v)}
        />
        <FrameMapButton onFrame={fitAll} />
        {/* Parts list — a docked side panel on desktop, a bottom sheet on
            phones (hidden while dragging/placing, like the edit sheet). */}
        {isPhone ? (
          <PhonePartsSheet
            parts={parts}
            arrows={arrows}
            open={listOpen && !lift && !placing}
            onReveal={revealPart}
            onClose={() => setListOpen(false)}
          />
        ) : (
          <PartsListPanel
            parts={parts}
            arrows={arrows}
            open={listOpen}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReveal={revealPart}
            onClose={() => setListOpen(false)}
          />
        )}
        {/* Phone card editor — bottom sheet; hides while dragging/placing
            so it never covers a landing. */}
        <MobileEditSheet
          part={parts.find((p) => p.id === selectedId) ?? null}
          open={
            isPhone &&
            !!selectedId &&
            parts.some((p) => p.id === selectedId) &&
            !lift &&
            !placing
          }
          onClose={() => setSelectedId(null)}
        />
        {/* Quiet notice pill: what just happened, sometimes one action. */}
        {notice && (
          <div
            key={notice.key}
            data-ui-chrome
            className="fade-in absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5 sm:bottom-auto sm:top-16"
            style={{ ...panelStyle, touchAction: "manipulation" }}
          >
            <span
              className="whitespace-nowrap text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {notice.text}
            </span>
            {notice.action ? (
              <button
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink)" }}
                onClick={() => {
                  notice.action!.run();
                  setNotice(null);
                }}
              >
                {notice.action.label}
              </button>
            ) : (
              <span className="pr-1.5" />
            )}
          </div>
        )}
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={doImport}
        />
        {parts.length === 0 && !placing && (
          <div className="fade-in pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center sm:top-20">
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              Name a part to begin — then tap where it lives.
            </p>
          </div>
        )}
        {placing && (
          <>
            {/* Ghost card: the part-to-be, held by the hand. Screen-space,
                transform written by the placement loop. */}
            <div
              ref={ghostRef}
              className="pointer-events-none absolute left-0 top-0 z-30"
              style={{ opacity: 0, willChange: "transform" }}
            >
              <div
                className="part-inner lifted px-4 py-3 text-center leading-snug"
                style={{
                  background: placing.color,
                  color: "var(--ink)",
                  borderRadius: 14,
                  fontSize: 14,
                  maxWidth: 180,
                  border: "1px solid rgba(58,55,51,0.08)",
                  transform:
                    "translate(-50%, -60%) scale(1.03) rotate(-1.5deg)",
                }}
              >
                {placing.name}
              </div>
            </div>
            {/* Hint pill — the mode's only chrome. Sits above the thumb
                bar on phones, under the top bar on desktop. */}
            <div
              data-ui-chrome
              className="fade-in absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5 sm:bottom-auto sm:top-16"
              style={{ ...panelStyle, touchAction: "manipulation" }}
            >
              <span
                className="max-w-[60vw] truncate text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                Tap where “{placing.name}” lives
              </span>
              <button
                aria-label="Cancel placing"
                className="rounded-full px-2 py-1 text-xs hover:bg-black/5 pointer-coarse:min-h-8 pointer-coarse:min-w-8"
                style={{ color: "var(--ink-faint)" }}
                onClick={cancelPlacing}
              >
                ✕
              </button>
            </div>
          </>
        )}
        <datalist id="region-labels">
          {REGIONS.map((r) => (
            <option key={r.key} value={r.label} />
          ))}
        </datalist>
      </div>
    </AppApiContext.Provider>
  );
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <PartsMapApp />
    </ReactFlowProvider>
  );
}
