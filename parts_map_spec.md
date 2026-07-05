# Parts Map — App Spec (v0.1, living document)

A spatial canvas for IFS parts work. A person enters each part by name, places it roughly where it sits in (or around) the body on a thin scalable body outline, and draws arrows showing relationships. The feel target is Miro-grade fluidity: smooth dragging, smooth rounded arrows, satisfying physics, equally good on phone and desktop.

This doc is the blueprint. It is model-independent. Fable 5 (or any model) is the contractor that builds from it.

---

## 1. Deployment context (decided)

- The app is hosted externally (Vercel is the natural fit) and surfaced inside Circle. Circle does not host uploaded apps; it embeds external URLs, and it blocks raw HTML in normal post bodies, so the path is a hosted URL referenced from a Circle page or opened in its own window.
- The app must be self-contained, runnable from a single URL, and responsive (fills its container; sensible behavior down to phone width).
- Known constraint: cookie-based login inside an embedded iframe is unreliable because browsers are deprecating third-party cookies. This collides with the sign-in requirement (see Section 12). Likely resolution: launch the tool in its own tab / full window rather than as an inline iframe.

## 2. Core canvas interactions (decided)

- Free 2D canvas. Pan and zoom. Parts ("stickies") are draggable; arrows connect them.
- Top priority is *feel*: dragging and arrow-drawing must be fluid and enjoyable. This is the bar everything else serves.

## 3. Part cards (decided)

- A part is created by typing its name. A generic sticky appears, then the person places it.
- Every part has a light-to-noticeable drop shadow (heavier shadow while lifted, see Section 5).
- Click/tap a part to open a small edit menu (Miro-style popover). Keep it lean. Controls:
  - Color
  - Font size
  - Bold toggle
  - Shape
- Drag-resize: selecting a part shows a bounding box with handles you can drag to resize/reshape.

## 4. The "lift" interaction (decided)

- When a part is grabbed it visually lifts (like Google Maps Pegman): shadow deepens, card raises.
- While lifted, a leader line runs from the card down to a dot on the exact body point. You are steering the *dot* (the body anchor), not the card itself.
- On drop, the lift animation resolves, the card settles flat, the leader line disappears.
- On touch this also solves finger-occlusion: the dot is offset from the fingertip so you can see where you're landing.
- **Front/back magnet pop:** the target indicator snaps magnetically to the nearest region anchor. For a region that has a back counterpart, nudging the drag slightly past it triggers a satisfying magnetic "pop" that switches the target from the front anchor to the back anchor. The indicator shows which: a **filled solid dot** for front, a **hollow ring labeled "back"** for back. Most parts land front; the back point is a deliberate small pull away. On drop, the part takes that anchor as its canonical location and depth.

## 5. Arrows (decided)

- Smooth, rounded connectors with Miro-like routing physics.
- Arrows stay attached to their two nodes and reroute live as either node is dragged.
- Directional. Color is user-selectable per arrow.
- **Optional relationship label (added by client request, 2026-07):** any arrow may carry a short free-text label (e.g. "manages," "protects," "exiles"). Labels are optional — an unlabeled arrow renders exactly as before, and color + direction remain sufficient for people who don't want words. A labeled arrow shows the text as a small quiet pill at the arrow's midpoint, editable from the arrow's popover (alongside color/delete). Labels round-trip through save/load.

## 6. Body model (decided + one open item)

- Background is a thin outline of a body (not a detailed illustration). It functions as a *scalable coordinate space*, not a fixed picture.
- **Proportions matter (revised 2026-07):** the outline must be a properly proportioned human figure — classical figure ratios (~7.5 heads tall, real shoulder width, natural limbs, credible hands and feet), not the original slim hand-drawn draft. Still a single thin calm stroke; neutral and androgynous; a coordinate space, not an illustration.
- **Rotatable front/back (2.5D flip, decided 2026-07):** the body has two drawn views — front and back — and a rotate control that turns the figure with a smooth, unhurried Y-axis flip animation (a view state `front | back`, *not* a 3D scene). In back view the anatomy mirrors correctly, back-depth parts render as the primary layer, front-depth parts are ghosted (and vice versa in front view), and the magnet-snap targets swap to match the view. The text-authoritative location model (Section 6b) is unchanged by rotation. Free-orbit 3D remains out of scope (Section 14).
- A manual size slider lets the person grow the body outline. Critical because once parts are placed, arrow-drawing needs more room.
- Anchoring: each part is tagged to a body region. When the body scales or reshapes, the part keeps its *anatomical* anchor (the throat part stays on the throat; the throat just moved), not a fixed screen pixel.
- The body uses **named regions** (see Appendix A) so a part's location can be read back as text into the list (Section 9) and so text edits can place a part.
- See Section 6b for the location data model, which is the most important structural decision in this doc.

## 6b. Location model — text-authoritative, with front/back depth (decided)

This is the structural heart of the app.

- Each part stores two linked things: a **canonical location** (a named region from Appendix A, the anatomical truth, including a front/back qualifier where relevant) and a **render position** (the x,y where the sticky draws).
- The canonical location is authoritative. The render position is derived from it (each region has an anchor point on the body outline).
- **Editing the location text moves the node.** If the system read a drag as "belly" but the part is actually on the lower spine, the person edits the location to "lower back / lumbar" and the node relocates to that region's anchor.
- **Dragging a node proposes a location** (nearest region becomes the text label), which the person can then override in text. Drag for rough placement; text for precision and for depth the 2D view can't express.
- **Depth problem:** the canvas is a 2D front view of a 3D body. Front and back of the same area project onto nearly the same screen point. "Throat (front)" and "Nape (back of neck)" are therefore only a few pixels apart on screen and are disambiguated by their text label, not their position. The region map deliberately offsets back-anchors a few pixels from their front counterparts so two such nodes never perfectly stack.
- Recommended (optional) visual cue: render back-of-body parts with a distinguishing treatment (e.g. a dashed border or a small "back" tag) so two near-stacked nodes stay legible and so a front-to-back text edit is visible at a glance.

## 7. Auto-scaling / anti-crowding (decided; sequenced for stability)

- Desired behavior: when parts in a region get too close, the body grows so labels never overlap, and parts re-spread while each keeps its anatomical anchor.
- This is a priority feature, not optional; the goal is for it to feel lovely.
- Sequencing decision: build the manual-slider foundation first and solid, then add auto-crowding as a tunable, toggleable layer on top. Optimize for "most stable by the end," not fastest to first demo. It is not CPU-heavy; the risk is it feeling unsettling (moving things the user didn't touch), solved by careful easing and only nudging when truly crowded.

## 8. Parts list panel (decided)

- A side panel listing every part. Collapsible (open/close for space).
- Single source of truth: one parts data array feeds both the list and the canvas. (This dissolves the "feedback loop" worry: there is no loop, just one dataset with two views. Editing in either view updates the same record.)
- Each list row shows the part name and its current body region, where the region label is *derived* from the part's position via the named-region map.
- The list is text-selectable/copyable so it can be pasted out as a clean two-column (part / location) list.
- **Flowchart text export (mandated by client request, 2026-07):** the panel header carries a **"Copy Relationships"** (a.k.a. "Export Flowchart") button. It parses every arrow on the canvas and formats the hierarchy ("who is managing who") as clean, copyable plain text — one relationship per line, following each arrow's direction:
  - Labeled arrow: `[Source Part Name] -> relationship label -> [Target Part Name]` — e.g. `[Inner Critic] -> manages -> [Vulnerable Child]`
  - Unlabeled arrow: `[Source Part Name] -> [Target Part Name]`
  - Lines are ordered as a readable tree: roots first (parts that are sources but never targets), walked depth-first, remaining/cyclic connections after. Parts with no arrows are omitted.

## 9. Import / paste-in (decided)

- Create parts in bulk by pasting either:
  - a block of text (one part per line, or freeform), or
  - a two-column format (part name / location).
- Pasted parts auto-populate as stickies. Location text drives initial placement where possible.

## 10. AI location interpretation (decided; batch-only for v1)

- People describe locations loosely ("front of my breastplate," "solar plexus," "around my head"). An AI pass interprets these into a body region / coordinate.
- Runs at paste/import time (batch), not live on every keystroke, for v1.
- Anything mis-placed is fixable by dragging. The drag is the correction mechanism.
- Runtime AI calls target a standard production model (e.g. Sonnet), not the preview model, so the tool keeps working long-term.

## 11. Off-body parts (decided)

- Some parts are perceived around or in front of the person, not in the body.
- These get free placement anywhere on the canvas outside the outline, flagged as off-body so scaling logic ignores them.

## 12. Persistence & auth (decided; architecture open)

- Real sign-in. Maps are saved per user so people return and keep editing.
- One identity across the whole DMC tool suite: signing in once gives access to this Parts Map and the forthcoming Values tool, and lets a person move between tools without re-authenticating each time.
- Sensitive-data note: a saved parts map is essentially personal psychological data. Where it's hosted, how it's stored, and a clear privacy stance all matter and should be decided deliberately, not by default.
- Architectural implication: this is no longer a single generated artifact; it's a small platform with shared accounts, a database, and an auth provider. See Open Decisions for the auth approach.

## 13. Mobile (decided)

- Must assume phone use. Excellent pinch-zoom and pan.
- Gesture model (proposed standard): one finger on empty canvas pans; one finger on a part drags that part; pinch zooms. The lift leader-line/dot offset keeps the target visible under the finger.

## 14. Future (not v1)

- **Free-orbit 3D body** (a true Three.js-style scene you can rotate to any angle, for parts that sit in front of/behind others). Partially superseded 2026-07: the **2.5D front/back rotatable flip is now in scope** (Section 6) and covers the main need. Full free-orbit 3D — which would require 3D region anchors and rebuilding the arrow/drag system — stays future, revisit only if the flip proves insufficient.

## 15. Recommended build tracks & model sequencing

- **Frontend feel (use the preview/frontier model now):** the canvas, drag/lift animation, arrow physics, auto-scaling, mobile gestures, the edit popover. This is where top-tier code generation shows up as visible quality, and the generated code is permanent. A node/edge canvas library (e.g. React Flow) or whiteboard library (e.g. tldraw) should do the heavy lifting; the model composes the feel and aesthetics on top.
- **Backend/auth (separate track, any model, any timeline):** sign-in, shared identity across tools, database, saved maps, privacy.
- **Model sequencing:** use the frontier preview model during its window to generate the hard frontend prototype (maps saved as exportable files, no login yet). Use Opus 4.8 for everything else and for ongoing iteration after the window closes. Whether to have the frontier model do the first build and Opus refine, or Opus scaffold and the frontier model polish the feel, the frontier model's time is best spent on the canvas-feel layer specifically.

## Decisions locked this round

- Auth/SSO: separate track, built after the prototype. v1 uses JSON export/import so nothing is lost. Eventual real version: one auth provider (e.g. Clerk or Supabase Auth) shared across all DMC tools, tools on subdomains of one domain, sign in once and move between tools freely.
- Auto-scaling: priority feature, built stability-first (manual base, then toggleable auto-crowding layer).
- Region vocabulary: drafted below in Appendix A for review and editing.

## Decisions locked 2026-07 (post-prototype, client-driven)

- **Arrow relationship labels are in** (Section 5): the earlier "no relationship typing" rule is repealed. Labels are optional short free text per arrow.
- **Flowchart text export is in** (Section 8): "Copy Relationships" button, `[Source] -> label -> [Target]` line format.
- **Body redesign + 2.5D rotatable flip** (Section 6): properly proportioned figure, front and back views, smooth turn animation as a `front | back` view state. Free-orbit 3D stays future (Section 14).
- Implementation of all three is specified in `parts_map_ui_enhancement_prompt.md`.

## Open Decisions

All resolved as of this round:

1. Left/right = the person's own body (anatomical); their right shows on the viewer's left in front view.
2. Back-of-body parts get a visual cue (dashed border or small "back" tag), reinforced live during drag by the filled-dot vs hollow-"back"-ring magnet pop (Section 4).
3. Region map (Appendix A) is an editable config, changeable anytime without touching app logic.

Ready to draft the build prompt.

---

## Appendix A — Body region map (draft for review)

Conventions: default view is front. Left/right are the person's own (anatomical). Regions marked **[back]** sit on the back of the body and their anchor points are offset a few pixels from their front counterparts so nodes don't perfectly stack. Greatest granularity is in the central torso, where most parts live.

### Head & face
- Crown / top of head
- Forehead: right, center (brow center / "third eye"), left
- Upper face: upper right, upper center, upper left
- Mid face: mid right (cheek), mid center (nose/eyes), mid left (cheek)
- Lower face: lower right (jaw), lower center (mouth/chin), lower left (jaw)
- Temples: right, left
- Behind the eyes
- Back of head / occiput **[back]**

### Neck & throat
- Throat / front of neck (center)
- Side of neck: right, left
- Base of throat (where neck meets chest)
- Nape / back of neck **[back]**

### Upper chest (high granularity)
- Collarbone: right, center, left
- Upper chest center (top of sternum)
- Heart center (mid sternum)
- Left chest, right chest
- Side ribs: right, left
- Between the shoulder blades **[back]**
- Shoulder blade: right, left **[back]**

### Mid torso / solar plexus (high granularity)
- Solar plexus (center, below the sternum)
- Diaphragm band (center)
- Upper abdomen: right, left
- Mid-back **[back]**

### Belly / lower torso (high granularity)
- Upper belly / stomach (center)
- Navel / center belly
- Lower belly (center)
- Flank: right, left
- Lower back / lumbar **[back]**
- Sacrum **[back]**

### Pelvis & hips
- Pelvic center / lower belly base
- Hip: right, left
- Groin
- Sit bones / base **[back/under]**
- Tailbone **[back]**

### Shoulders & arms (each side)
- Shoulder: right, left
- Upper arm: right, left
- Elbow: right, left
- Forearm: right, left
- Wrist: right, left
- Hand / palm: right, left
- Fingers: right, left

### Legs & feet (each side)
- Upper thigh: right, left
- Thigh: right, left
- Knee: right, left
- Shin / calf: right, left
- Ankle: right, left
- Foot: right, left

### Whole-body / diffuse
- Whole body / everywhere
- Skin / surface / boundary

### Off-body zones (free placement, ignored by auto-scaling)
- In front (of face / chest / belly)
- Above the head
- Behind me **[distinct from back-of-body]**
- To the right side (off-body), to the left side (off-body)
- Surrounding / field
- Below / beneath the feet
