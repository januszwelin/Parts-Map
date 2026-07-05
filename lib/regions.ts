/* ════════════════════════════════════════════════════════════════════
   REGION CONFIG — the body vocabulary (data, editable — no logic)
   ════════════════════════════════════════════════════════════════════ */

// Regions on the body's silhouette (limbs, hips, sides) declare
// `bothViews: true` in the config below: they stay visible and
// magnet-snappable from both the front and the back view, while central
// front-surface regions belong to the front only.

export type RegionDef = {
  key: string;
  label: string;
  /** Normalized 0–1 over the body box. Person's right = smaller x
   *  (anatomical left/right: their right appears on the viewer's left). */
  anchor: { x: number; y: number };
  hasBack: boolean;
  /** The named back region this front region corresponds to (used by
   *  the location text matcher for "back of …" phrasings). */
  backKey?: string;
  /** Back-of-body region (renders/tag as "back"; anchors pre-offset). */
  isBack?: boolean;
  /** On a back region: the corresponding front region (the reverse of
   *  backKey — kept as data so the pairing stays queryable). */
  frontKey?: string;
  /** Silhouette region (limb, hip, side): visible and snappable from
   *  both views. Mutually exclusive with hasBack / isBack. */
  bothViews?: boolean;
  /** Off-body zone: anchor is only a placement suggestion; parts there
   *  are free-positioned and exempt from body scaling. */
  offBody?: boolean;
  /** Not a magnet target while dragging (diffuse + off-body zones);
   *  reachable via location text or import. */
  noSnap?: boolean;
};

const R = (
  key: string,
  label: string,
  x: number,
  y: number,
  extra: Partial<RegionDef> = {},
): RegionDef => ({ key, label, anchor: { x, y }, hasBack: false, ...extra });

/** The region vocabulary (spec Appendix A). Edit freely — behavior reads
 *  this data and never hard-codes regions. */
export const REGIONS: RegionDef[] = [
  // ——— Head & face ———
  R("crown", "Crown / top of head", 0.5, 0.016),
  R("forehead-right", "Forehead right", 0.457, 0.058),
  R("forehead-center", "Forehead center (brow)", 0.5, 0.058),
  R("forehead-left", "Forehead left", 0.543, 0.058),
  R("upper-face-right", "Upper face right", 0.457, 0.078),
  R("upper-face-center", "Upper face center", 0.5, 0.078),
  R("upper-face-left", "Upper face left", 0.543, 0.078),
  R("mid-face-right", "Mid face right (cheek)", 0.443, 0.098),
  R("mid-face-center", "Mid face center (nose/eyes)", 0.5, 0.098, {
    hasBack: true,
    backKey: "occiput",
  }),
  R("mid-face-left", "Mid face left (cheek)", 0.557, 0.098),
  R("lower-face-right", "Lower face right (jaw)", 0.452, 0.122),
  R("lower-face-center", "Lower face center (mouth/chin)", 0.5, 0.122),
  R("lower-face-left", "Lower face left (jaw)", 0.548, 0.122),
  R("temple-right", "Temple right", 0.413, 0.072),
  R("temple-left", "Temple left", 0.587, 0.072),
  R("behind-eyes", "Behind the eyes", 0.5, 0.09, {
    hasBack: true,
    backKey: "occiput",
  }),
  R("occiput", "Back of head / occiput", 0.512, 0.084, {
    isBack: true,
    frontKey: "behind-eyes",
  }),

  // ——— Neck & throat ———
  R("throat", "Throat / front of neck", 0.5, 0.158, {
    hasBack: true,
    backKey: "nape",
  }),
  R("neck-side-right", "Side of neck right", 0.443, 0.155),
  R("neck-side-left", "Side of neck left", 0.557, 0.155),
  R("throat-base", "Base of throat", 0.5, 0.183),
  R("nape", "Nape / back of neck", 0.512, 0.15, {
    isBack: true,
    frontKey: "throat",
  }),

  // ——— Upper chest ———
  R("collarbone-right", "Collarbone right", 0.408, 0.205),
  R("collarbone-center", "Collarbone center", 0.5, 0.205),
  R("collarbone-left", "Collarbone left", 0.592, 0.205),
  R("upper-chest-center", "Upper chest center", 0.5, 0.232, {
    hasBack: true,
    backKey: "between-blades",
  }),
  R("heart", "Heart center", 0.5, 0.268, {
    hasBack: true,
    backKey: "between-blades",
  }),
  R("chest-right", "Right chest", 0.404, 0.268, {
    hasBack: true,
    backKey: "blade-right",
  }),
  R("chest-left", "Left chest", 0.596, 0.268, {
    hasBack: true,
    backKey: "blade-left",
  }),
  R("ribs-right", "Side ribs right", 0.339, 0.305, { bothViews: true }),
  R("ribs-left", "Side ribs left", 0.661, 0.305, { bothViews: true }),
  R("between-blades", "Between the shoulder blades", 0.512, 0.244, {
    isBack: true,
    frontKey: "heart",
  }),
  R("blade-right", "Shoulder blade right", 0.398, 0.252, {
    isBack: true,
    frontKey: "chest-right",
  }),
  R("blade-left", "Shoulder blade left", 0.602, 0.252, {
    isBack: true,
    frontKey: "chest-left",
  }),

  // ——— Mid torso ———
  R("solar-plexus", "Solar plexus", 0.5, 0.33, {
    hasBack: true,
    backKey: "mid-back",
  }),
  R("diaphragm", "Diaphragm band", 0.5, 0.357, {
    hasBack: true,
    backKey: "mid-back",
  }),
  R("upper-abdomen-right", "Upper abdomen right", 0.422, 0.342),
  R("upper-abdomen-left", "Upper abdomen left", 0.578, 0.342),
  R("mid-back", "Mid-back", 0.512, 0.337, {
    isBack: true,
    frontKey: "solar-plexus",
  }),

  // ——— Belly ———
  R("stomach", "Upper belly / stomach", 0.5, 0.392),
  R("navel", "Navel / center belly", 0.5, 0.432, {
    hasBack: true,
    backKey: "lumbar",
  }),
  R("lower-belly", "Lower belly", 0.5, 0.472, {
    hasBack: true,
    backKey: "sacrum",
  }),
  R("flank-right", "Flank right", 0.365, 0.432, {
    hasBack: true,
    backKey: "lumbar",
  }),
  R("flank-left", "Flank left", 0.635, 0.432, {
    hasBack: true,
    backKey: "lumbar",
  }),
  R("lumbar", "Lower back / lumbar", 0.512, 0.427, {
    isBack: true,
    frontKey: "navel",
  }),
  R("sacrum", "Sacrum", 0.512, 0.497, {
    isBack: true,
    frontKey: "lower-belly",
  }),

  // ——— Pelvis & hips ———
  R("pelvic-center", "Pelvic center", 0.5, 0.507, {
    hasBack: true,
    backKey: "tailbone",
  }),
  R("hip-right", "Hip right", 0.357, 0.512, { bothViews: true }),
  R("hip-left", "Hip left", 0.643, 0.512, { bothViews: true }),
  R("groin", "Groin", 0.5, 0.535, { hasBack: true, backKey: "sit-bones" }),
  R("sit-bones", "Sit bones / base", 0.512, 0.552, {
    isBack: true,
    frontKey: "groin",
  }),
  R("tailbone", "Tailbone", 0.512, 0.524, {
    isBack: true,
    frontKey: "pelvic-center",
  }),

  // ——— Arms (person's right = viewer's left / smaller x; silhouette
  //     regions, so visible from both views) ———
  R("shoulder-right", "Shoulder right", 0.265, 0.21, { bothViews: true }),
  R("upper-arm-right", "Upper arm right", 0.248, 0.297, { bothViews: true }),
  R("elbow-right", "Elbow right", 0.215, 0.39, { bothViews: true }),
  R("forearm-right", "Forearm right", 0.187, 0.467, { bothViews: true }),
  R("wrist-right", "Wrist right", 0.161, 0.545, { bothViews: true }),
  R("hand-right", "Hand / palm right", 0.155, 0.53, { bothViews: true }),
  R("fingers-right", "Fingers right", 0.15, 0.565, { bothViews: true }),
  R("shoulder-left", "Shoulder left", 0.735, 0.21, { bothViews: true }),
  R("upper-arm-left", "Upper arm left", 0.752, 0.297, { bothViews: true }),
  R("elbow-left", "Elbow left", 0.785, 0.39, { bothViews: true }),
  R("forearm-left", "Forearm left", 0.813, 0.467, { bothViews: true }),
  R("wrist-left", "Wrist left", 0.839, 0.545, { bothViews: true }),
  R("hand-left", "Hand / palm left", 0.845, 0.53, { bothViews: true }),
  R("fingers-left", "Fingers left", 0.85, 0.565, { bothViews: true }),

  // ——— Legs (silhouette regions, both views) ———
  R("upper-thigh-right", "Upper thigh right", 0.396, 0.575, { bothViews: true }),
  R("thigh-right", "Thigh right", 0.4, 0.65, { bothViews: true }),
  R("knee-right", "Knee right", 0.402, 0.748, { bothViews: true }),
  R("shin-right", "Shin / calf right", 0.398, 0.82, { bothViews: true }),
  R("ankle-right", "Ankle right", 0.402, 0.933, { bothViews: true }),
  R("foot-right", "Foot right", 0.393, 0.972, { bothViews: true }),
  R("upper-thigh-left", "Upper thigh left", 0.604, 0.575, { bothViews: true }),
  R("thigh-left", "Thigh left", 0.6, 0.65, { bothViews: true }),
  R("knee-left", "Knee left", 0.598, 0.748, { bothViews: true }),
  R("shin-left", "Shin / calf left", 0.602, 0.82, { bothViews: true }),
  R("ankle-left", "Ankle left", 0.598, 0.933, { bothViews: true }),
  R("foot-left", "Foot left", 0.607, 0.972, { bothViews: true }),

  // ——— Whole-body / diffuse (text-reachable; not magnet targets) ———
  R("whole-body", "Whole body / everywhere", 0.5, 0.4, { noSnap: true }),
  R("skin", "Skin / surface / boundary", 0.5, 0.3, { noSnap: true }),

  // ——— Off-body zones (free placement; scaling-exempt) ———
  R("off-front", "In front (face/chest/belly)", 0.95, 0.3, {
    offBody: true,
    noSnap: true,
  }),
  R("off-above", "Above the head", 0.5, -0.1, { offBody: true, noSnap: true }),
  R("off-behind", "Behind me", 0.05, 0.3, { offBody: true, noSnap: true }),
  R("off-right", "To the right side", -0.3, 0.45, {
    offBody: true,
    noSnap: true,
  }),
  R("off-left", "To the left side", 1.3, 0.45, {
    offBody: true,
    noSnap: true,
  }),
  R("off-surround", "Surrounding / field", 1.3, 0.05, {
    offBody: true,
    noSnap: true,
  }),
  R("off-below", "Below the feet", 0.5, 1.08, { offBody: true, noSnap: true }),
];

export const REGION_BY_KEY: Record<string, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.key, r]),
);

/* Config integrity (dev only): backKey/frontKey are two hand-maintained
   halves of one front↔back pairing, and bothViews marks silhouette
   regions — catch dangling keys and contradictory flags at load instead
   of as silent mis-matches later. */
if (process.env.NODE_ENV !== "production") {
  for (const r of REGIONS) {
    const warn = (msg: string) =>
      console.warn(`Region config: ${r.key} ${msg}`);
    if (r.backKey && !REGION_BY_KEY[r.backKey]?.isBack) {
      warn(`has backKey "${r.backKey}" that is not an existing back region`);
    }
    if (r.frontKey) {
      const f = REGION_BY_KEY[r.frontKey];
      if (!f || f.isBack) {
        warn(`has frontKey "${r.frontKey}" that is not an existing front region`);
      } else if (f.backKey !== r.key) {
        warn(`frontKey "${r.frontKey}" does not point back via backKey`);
      }
    }
    if (r.isBack && !r.frontKey && !r.offBody) {
      warn("is a back region with no frontKey (front↔back pairing incomplete)");
    }
    if (r.bothViews && (r.hasBack || r.isBack)) {
      warn("declares bothViews alongside hasBack/isBack — pick one");
    }
  }
}

/** Synonyms for the v1 text matcher (normalized token → region key). */
export const SYNONYMS: Record<string, string> = {
  head: "crown",
  "top of head": "crown",
  "third eye": "forehead-center",
  brow: "forehead-center",
  eyes: "mid-face-center",
  face: "mid-face-center",
  nose: "mid-face-center",
  cheek: "mid-face-right",
  mouth: "lower-face-center",
  chin: "lower-face-center",
  jaw: "lower-face-center",
  "back of head": "occiput",
  occiput: "occiput",
  neck: "throat",
  "back of neck": "nape",
  nape: "nape",
  throat: "throat",
  chest: "upper-chest-center",
  breastplate: "upper-chest-center",
  sternum: "upper-chest-center",
  "front of my breastplate": "upper-chest-center",
  heart: "heart",
  ribs: "ribs-right",
  "between shoulder blades": "between-blades",
  "solar plexus": "solar-plexus",
  plexus: "solar-plexus",
  diaphragm: "diaphragm",
  stomach: "stomach",
  tummy: "stomach",
  belly: "navel",
  gut: "navel",
  core: "navel",
  navel: "navel",
  abdomen: "stomach",
  "lower spine": "lumbar",
  spine: "mid-back",
  back: "mid-back",
  "lower back": "lumbar",
  lumbar: "lumbar",
  sacrum: "sacrum",
  pelvis: "pelvic-center",
  hips: "hip-right",
  groin: "groin",
  tailbone: "tailbone",
  shoulders: "shoulder-right",
  shoulder: "shoulder-right",
  arm: "upper-arm-right",
  arms: "upper-arm-right",
  hand: "hand-right",
  hands: "hand-right",
  palm: "hand-right",
  fingers: "fingers-right",
  leg: "thigh-right",
  legs: "thigh-right",
  knee: "knee-right",
  knees: "knee-right",
  feet: "foot-right",
  foot: "foot-right",
  everywhere: "whole-body",
  "whole body": "whole-body",
  "all over": "whole-body",
  skin: "skin",
  boundary: "skin",
  "in front": "off-front",
  "in front of me": "off-front",
  above: "off-above",
  "above me": "off-above",
  "over my head": "off-above",
  "behind me": "off-behind",
  around: "off-surround",
  "around me": "off-surround",
  field: "off-surround",
  surrounding: "off-surround",
  "below me": "off-below",
  "under my feet": "off-below",
};
