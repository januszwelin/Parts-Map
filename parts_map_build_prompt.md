# Build prompt — Parts Map

Paste this into the model session. It is self-contained.

---

You are building a polished frontend prototype of a spatial mapping tool for Internal Family Systems (IFS) parts work. A person names their inner "parts," places each one roughly where it sits in or around the body on a thin, scalable body outline, and draws arrows showing relationships between them. Think Miro or a whiteboard, but purpose-built for mapping parts onto a body.

This is a contemplative, therapeutic tool. The people using it are doing quiet inner work, often on a phone. The single most important quality is *feel*: dragging parts and drawing arrows must be fluid, smooth, and satisfying. If a tradeoff arises between adding a feature and preserving fluid motion, preserve the motion.

## Tech and scope

- Build it as a single, self-contained React app. No backend, no login, no browser storage (no localStorage/sessionStorage). Hold all state in memory.
- Persistence for this prototype is via JSON: a Save button downloads the full map as a .json file, and a Load button reads one back in. Round-trip everything (parts, positions, locations, colors, arrows, body size).
- Structure the code cleanly so it can later be moved to a hosted app (Vercel) and have real accounts and a database added. Keep persistence behind a small seam (a save/load module) so swapping file-JSON for a backend is a localized change.
- Must be fully responsive and excellent on a phone. Assume heavy mobile use. It will eventually be embedded or linked from a community platform, so it should fill its container gracefully at any width.
- You may use a node-and-edge canvas library if it helps the feel (React Flow is a strong fit for draggable nodes plus connectors that stay attached during drag, with built-in pan/zoom; tldraw is an alternative for a looser whiteboard feel). Use your judgment. The custom body-coordinate system, lift interaction, magnet pop, and auto-scaling below are bespoke and may need to layer on top of, or replace parts of, whatever library you choose. Prioritize the feel over library convenience.

## Core data model

One array of parts is the single source of truth; the canvas and the side list are two views onto it.

A **part** has:
- id
- name (text)
- location: a region key from the region config below
- depth: "front" or "back"
- offBody: boolean (true for parts perceived around/in front of the person rather than in the body)
- freePos: {x, y} used only when offBody is true
- color, fontSize, bold, shape (card styling)

A part's on-body render position is **derived** from its region anchor and the current body scale, never stored as the source of truth. The location text is authoritative (see "Location is text-authoritative" below).

An **arrow** has: id, sourceId, targetId, color, and an optional short **label** (free text, e.g. "manages," "protects," "exiles"). Arrows are directional. Labels round-trip through save/load like everything else.

The **region config** is a single editable array, separate from app logic, so it can be renamed/extended/nudged later without touching behavior. Each region: { key, label, anchor: {x, y} in body-normalized coordinates (0 to 1), hasBack: boolean }. When hasBack is true, the back anchor is the front anchor offset by a few pixels so a front part and a back part never perfectly stack.

## Region config (starting list, editable)

Conventions: default view is front. Left/right are the *person's own* body, so the person's right appears on the viewer's left. Regions marked [back] sit on the back of the body. Greatest density is in the central torso, where most parts live.

Head & face: crown/top of head; forehead right, forehead center (brow center), forehead left; upper face right/center/left; mid face right (cheek), center (nose/eyes), left (cheek); lower face right (jaw), center (mouth/chin), left (jaw); temple right, temple left; behind the eyes; back of head/occiput [back].

Neck & throat: throat/front of neck (center); side of neck right, left; base of throat; nape/back of neck [back].

Upper chest: collarbone right/center/left; upper chest center; heart center; left chest, right chest; side ribs right, left; between shoulder blades [back]; shoulder blade right, left [back].

Mid torso: solar plexus (center); diaphragm band; upper abdomen right, left; mid-back [back].

Belly: upper belly/stomach; navel/center belly; lower belly; flank right, left; lower back/lumbar [back]; sacrum [back].

Pelvis & hips: pelvic center; hip right, left; groin; sit bones/base [back]; tailbone [back].

Arms (each side): shoulder, upper arm, elbow, forearm, wrist, hand/palm, fingers (right and left).

Legs (each side): upper thigh, thigh, knee, shin/calf, ankle, foot (right and left).

Diffuse: whole body/everywhere; skin/surface/boundary.

Off-body zones (free placement, ignored by auto-scaling): in front (face/chest/belly); above the head; behind me; right side, left side; surrounding/field; below the feet.

## Interactions, in priority order

### 1. Creating parts
- Type a name and a generic sticky appears, ready to place. Every part is typed in (this is how the complete list stays complete).
- Bulk import: a paste box accepts either a block of text (one part per line) or a two-column format (part name, location). Parts auto-populate. Location text is matched to the nearest region (for the prototype, a simple text matcher against region labels and common synonyms is fine; leave a clear seam to later swap in an AI interpretation call for loose phrases like "solar plexus" or "front of my breastplate"). Anything mismatched is fixable by dragging or by editing location text.

### 2. The lift interaction (this is signature; make it feel great)
- Grabbing a part lifts it: shadow deepens, card raises slightly, like picking up Google Maps' Pegman.
- While lifted, a leader line runs from the card to a target indicator on the body. The person is steering the *indicator* (the body anchor), not the card. On touch, offset the indicator from the fingertip so it stays visible.
- The indicator snaps magnetically to the nearest region anchor.
- Front/back magnet pop: for a region with a back counterpart, nudging the drag slightly past it produces a satisfying magnetic pop that switches the target from front anchor to back anchor. Front shows a filled solid dot; back shows a hollow ring labeled "back." Most parts land front; back is a deliberate small pull.
- On drop: the animation resolves, the card settles flat, the leader line vanishes, and the part takes that anchor as its location and depth.

### 3. Location is text-authoritative
- Each part shows its location as editable text (in the side list and/or its edit popover).
- Editing the location text moves the node to that region's anchor. This is how a person corrects depth the flat view can't show: if a drag read as "belly" but the part is really on the lower spine, they set the location to "lower back/lumbar" and the node relocates.
- Dragging proposes a location (nearest region label); the text edit is the precise override. Drag for rough, text for exact and for front/back.

### 4. Part editing
- Tapping a part opens a small, lean popover (Miro-style). Controls: color, font size, bold toggle, shape. Nothing more.
- Selecting a part shows a bounding box with handles to drag-resize/reshape the card.
- All parts carry a soft drop shadow; a more pronounced shadow while lifted. Back-of-body parts carry a persistent subtle cue (dashed border or a small "back" tag).

### 5. Arrows
- Draw directional arrows between parts. Smooth, rounded connectors with pleasing routing physics, like Miro.
- Arrows stay attached to both nodes and reroute live as either node moves.
- Arrow color is user-selectable.
- Any arrow may optionally carry a short relationship label (e.g. "manages," "protects," "exiles"), edited from the arrow's popover and rendered as a small quiet pill at the arrow's midpoint. Unlabeled arrows look unchanged — color plus direction stays sufficient for people who don't want words.

### 6. The body and scaling
- Background is a thin body outline, not a detailed illustration. It is a scalable coordinate space.
- A manual size slider grows/shrinks the body. Parts keep their anatomical anchor as it scales (the throat part stays on the throat; the throat just moves). Critical because arrow-drawing needs room once parts are placed.
- Build this manual scaling first and make it rock solid.

### 7. Auto-scaling / anti-crowding (build after the manual base is solid; make it toggleable)
- When parts in a region get too close, the body grows so labels never overlap, and parts re-spread while each keeps its anatomical anchor.
- This must feel lovely, not unsettling. Use gentle easing; only nudge when genuinely crowded; never yank things the user just placed. Make it a toggle so it can be tuned or switched off without destabilizing the core. Off-body parts are exempt.

### 8. Parts list panel
- A collapsible side panel (open/close for space) listing every part with its current location (the region label, derived from position).
- Same single source of truth as the canvas; editing in either updates the same record. (There is no feedback loop, just one dataset with two views.)
- The list must be selectable/copyable as clean text, so it can be pasted out as a two-column part/location list.
- A **"Copy Relationships"** (export flowchart) button in the panel header parses all arrows on the canvas into clean, copyable plain text — one relationship per line, following each arrow's direction: `[Source Part Name] -> relationship label -> [Target Part Name]` when labeled (e.g. `[Inner Critic] -> manages -> [Vulnerable Child]`), or `[Source Part Name] -> [Target Part Name]` when not. Order the lines as a readable tree: roots first (sources that are never targets), depth-first, remaining/cyclic connections after; parts with no arrows are omitted.

### 9. Canvas navigation and mobile
- Smooth pan and pinch-zoom. Gesture model: one finger on empty canvas pans; one finger on a part drags that part; pinch zooms. Make zoom in/out genuinely smooth on a phone.

## Out of scope for this build
- No authentication, accounts, or backend persistence beyond JSON file save/load.
- No live per-keystroke AI; only the optional batch-matcher seam noted above.
- No free-orbit 3D body (no Three.js scene, no arbitrary camera angles). The in-scope alternative — specified in `parts_map_ui_enhancement_prompt.md` — is a **2.5D front/back flip**: a properly proportioned figure with drawn front and back views and a smooth turn animation, as a simple `front | back` view state on top of the same front/back depth model above.

## Aesthetic direction
Calm, spacious, trustworthy. This is a tool for quiet inner work, so favor restraint: a soft, muted palette, generous whitespace, gentle shadows, unhurried transitions. Not clinical-cold, not toy-playful. The motion design (lift, magnet pop, arrow routing, scaling) is where the craft shows; make those moments feel considered and physical. Mobile-first.

## Definition of done
A person can: type parts in (or paste a batch), place each with the lift-and-drop interaction including the front/back magnet pop, correct any location by editing its text, restyle a card, draw arrows that stay attached while dragging, optionally label an arrow with a relationship word, copy the whole arrow hierarchy as `[Source] -> label -> [Target]` text via Copy Relationships, rotate the body between front and back views, grow the body manually (and try the auto-scaling toggle), open/close a copyable parts list, place off-body parts freely, pan and pinch-zoom smoothly on a phone, and save/load the whole map as JSON (labels included). Above all, dragging and arrow-drawing feel fluid and enjoyable.

Build it. If any single interaction can't be both feature-complete and fluid in this pass, choose fluid and note what you deferred.
