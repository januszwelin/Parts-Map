# Enhancement prompt — Parts Map UI v1.1 (body redesign + mobile polish + relationship labels)

Paste this into the model session. It is self-contained, but it assumes the Parts Map v1 prototype repo (the app lives in `app/page.tsx`). Read `parts_map_spec.md` first if anything here needs deeper context — the spec is the source of truth and has already been updated to include everything below.

---

You are enhancing an existing, working prototype of Parts Map: a spatial canvas for Internal Family Systems (IFS) parts work. A person names inner "parts," places each on a body outline, and draws directional arrows between them. It is a contemplative, therapeutic tool, used heavily on phones. **The top priority is feel** — dragging, the lift interaction, and arrow-drawing must stay Miro-grade fluid. When any change below conflicts with fluid motion, preserve the motion.

## Current state of the code (orient yourself before touching anything)

- Next.js 16 + React 19 + `@xyflow/react` (React Flow) 12 + Tailwind 4. The whole app is one file, `app/page.tsx` (~2,700 lines), deliberately organized into 9 numbered, swappable sections (see the header comment).
- The body is drawn by `BodyOutline` (section 6): a head ellipse plus three hand-drawn half-body Bézier paths (`BODY_HALF_PATHS`), mirrored for the other side, in a 360×1000 viewBox. Region anchors live in the same normalized space (`BODY_ASPECT = 0.36`, `BODY_H = 1000`).
- The region config (section 1) is a single editable data array — `{ key, label, anchor: {x,y} normalized 0–1, hasBack, offBody, noSnap }`. Back anchors are pre-offset a few pixels from their front counterparts. **This config is data, not logic; keep it that way.**
- Arrows are `{ id, sourceId, targetId, color }` (type `Arrow`, section 2), rendered by `FloatingEdge` (section 7), which already computes a Bézier label position (`labelX`/`labelY`) for its color/delete popover.
- Persistence is a JSON save/load seam: `parseSavedMap` (section 3) validates everything on load. **Anything you add to the data model must round-trip through it.**
- The parts list panel (section 8) already has a "copy list" button that copies a two-column part/location list.
- One parts array is the single source of truth for canvas + list. Location is text-authoritative: a part stores a region key + `front|back` depth; render x,y is derived. Do not disturb this.

Run it with `npm run dev`. Verify on a real phone viewport (DevTools device mode at minimum) — mobile is the primary target for everything below.

## 1. Body redesign — properly proportioned, rotatable front/back (the centerpiece)

The current outline is too slim and crudely drawn (the hands especially). Replace it with the best thin-line human figure you can draw, and make it turnable.

### The figure

- **Proper anatomical proportions.** Use classical figure-drawing ratios: total height ≈ 7.5 heads; shoulders ≈ 2 head-widths for a neutral adult figure; arms reach mid-thigh; legs are half the total height. Give the figure real shoulder slope, a neck that widens into trapezius, a waist, hips, and calves — not a stick with sausage limbs.
- **Hands and feet must look right.** Simple mitten-style hands with a suggested thumb are fine at this line weight; what is not fine is the current noodle. Feet in front view are short and angled slightly outward.
- **Style stays a thin, calm outline** — a single elegant stroke weight (keep `vectorEffect: "non-scaling-stroke"`), no facial features beyond the head shape, no interior anatomy except what the back view needs (see below). It is a coordinate space, not an illustration. Neutral, androgynous, unclothed-but-abstract.
- **Two views, one space:** draw a FRONT view and a BACK view. Both live in the same normalized viewBox as the region anchors so drawing and config stay aligned. The back view is the same silhouette (a mirror — remember left/right are anatomical, so the person's right is on the viewer's LEFT in front view and on the viewer's RIGHT in back view) plus minimal distinguishing interior lines: the spine line and shoulder-blade hints are enough to read instantly as "back."
- **Widen the canvas box if the figure needs it.** `BODY_ASPECT = 0.36` produced the slimness; a properly proportioned figure will likely need ~0.44–0.50. When you change it, **re-tune every region anchor** in the config so each named region sits on the new drawing (this is data editing, ~100 x/y values — tedious, not architectural). Check the dense torso cluster, the arm chain, and the off-body zones especially. The anchor-constellation debug overlay (`anchor-constellation` in section 6) exists for exactly this — use it while tuning.

### The rotation (2.5D flip — NOT a 3D scene)

- Add a **rotate control**: a small "turn around" button (front/back with a rotate glyph). Desktop: near the body-size slider in the toolbar. Mobile: reachable by thumb — bottom toolbar region, not a top corner.
- Tapping it turns the figure with a **smooth, unhurried Y-axis flip animation** — the figure should feel like it turns in space (CSS 3D transform on the body layer, e.g. `rotateY` with a soft ease and a subtle scale dip at the midpoint, crossfading front→back artwork at 90°). Aim for ~600–800 ms; this is a contemplative app, not a game. Respect `prefers-reduced-motion` with a simple crossfade.
- **Rotation is a view state, `view: "front" | "back"`, and nothing more.** No Three.js, no free orbit, no perspective camera. The data model does not change: parts keep their region + depth exactly as today.
- **View semantics:**
  - In **front view** (today's behavior): front-depth parts render normally; back-depth parts render with their existing dimmed/dashed "back" treatment.
  - In **back view**: mirror-flip the anchor space horizontally (x → 1 − x) so anatomy stays true, back-depth parts render as the primary, full-opacity layer, and front-depth parts get the ghosted treatment (with a "front" tag instead of "back").
  - **Magnet targets swap with the view.** In back view, back anchors are the primary snap targets and the "pop" (dragging slightly past) switches the target to the *front* anchor — the filled-dot / hollow-ring indicator logic inverts symmetrically. The lift, leader line, and text-authoritative location model are untouched.
  - Parts dragged, created, or imported while in back view default to back depth where the region has one.
- Arrows keep working across views — an arrow between a front part and a back part simply renders between wherever the two cards currently are. No special casing.

## 2. Mobile-first UI polish (web gets the same pass, phone drives the decisions)

Audit and refine the whole shell with a phone in hand. Specifically:

- **Touch targets:** every tappable control ≥ 44×44 px effective hit area — the list panel's small text buttons, popover swatches, the edge-popover controls, and the panel-close chevron are all currently below that.
- **Thumb ergonomics:** primary actions (add part, rotate, body size, list toggle) reachable one-handed on a ~6" phone. Prefer a bottom-anchored control cluster on mobile over top corners.
- **Safe areas:** respect `env(safe-area-inset-*)` so nothing hides behind the home indicator or notch.
- **Popovers and panels at phone width:** the part-edit popover and edge popover must never clip off-screen or sit under the keyboard; the parts list panel should behave as a bottom sheet or full-height drawer rather than a skinny overlay if that reads better at narrow widths.
- **Gesture model is locked, don't touch it:** one finger on empty canvas pans; one finger on a part drags it; pinch zooms; the lift indicator stays offset from the fingertip. Verify pinch-zoom stays smooth (no layout thrash — the body layer must scale via transform, not re-layout) after the body redesign.
- **Keep the aesthetic:** calm, spacious, restrained — soft muted palette, generous whitespace, gentle shadows, unhurried transitions. The craft budget goes into motion design.

## 3. Arrow relationship labels (client requirement)

- Extend the `Arrow` type with optional `label?: string` (e.g. "manages," "protects," "exiles" — free text, but keep it short; cap at ~24 chars in the input).
- **Edit surface:** the existing `FloatingEdge` popover (which already offers color + delete) gains a small text input for the label. The popover already renders at the computed `labelX`/`labelY` — reuse that.
- **Render:** a labeled arrow shows a small, quiet pill at the Bézier midpoint (same soft card styling as the rest of the UI; readable at mobile zoom levels; must not intercept drags on the canvas beneath except to select/edit its own arrow). Unlabeled arrows look exactly as they do today — the label is optional, color + direction remain enough for people who don't want words.
- **Round-trip:** label survives JSON save/load — extend `parseSavedMap` validation (string, trimmed, optional) and the save path.

## 4. Flowchart text export — "Copy Relationships" (client requirement)

- Add a **"Copy Relationships"** button to the parts list panel header, next to the existing "copy list" button.
- It parses all arrows on the canvas into clean, copyable plain text, one relationship per line, source → target following each arrow's direction:
  - Labeled: `[Source Part Name] -> label -> [Target Part Name]` — e.g. `[Inner Critic] -> manages -> [Vulnerable Child]`
  - Unlabeled: `[Source Part Name] -> [Target Part Name]`
- Order the lines as a readable tree: start from parts that are sources but never targets (the "top" of the hierarchy), walk connections depth-first, then list any remaining/cyclic connections. Parts with no arrows are omitted.
- Copies to clipboard with the same quiet "copied ✓" confirmation the list button uses. If there are no arrows, the button is disabled or copies a friendly one-line note.

## Process

- Work on a `feature/…` branch per project conventions (e.g. `feature/ui-v1_1-body-and-labels`), off the current prototype branch.
- Use the installed plugin skills: `engineering-skills:senior-frontend` for the React/interaction work; run `/code-review` (or the adversarial reviewer) before finishing; use `/verify` to drive the changed flows in the running app rather than trusting a compile.
- Keep the single-file section structure of `app/page.tsx` intact (or, if you split the body artwork into its own module, keep the section map comment accurate).
- Do not add localStorage, a backend, auth, or live AI calls. The JSON seam remains the only persistence.

## Definition of done

A person on a phone can: see a well-proportioned body that no longer looks starved; tap rotate and watch the figure turn around smoothly; place a part on the back directly in back view; still use the lift + magnet pop exactly as before (with front/back snap semantics matching the current view); add a short label to any arrow and see it as a quiet pill; save and reload a map with labels intact; tap "Copy Relationships" and paste `[A] -> label -> [B]` lines into any text field; and reach every control comfortably with a thumb. Dragging, arrow-drawing, pinch-zoom, and the flip animation all feel fluid and unhurried. If any single item can't be both complete and fluid in this pass, choose fluid and note what you deferred.
