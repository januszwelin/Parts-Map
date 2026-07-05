# Parts Map — Handoff Checklist (from prompt to testable live tool)

This tool is meant to be used by the person building this project in fable. 

This takes the tool from "we have a build prompt" to "it's live, people can sign in, and their maps are saved." It's written for a developer to execute, and for you to track. Tags: **[You]** = your decision or action, **[Dev]** = developer does it.

## A few words so you can follow the handoff
- **GitHub / repo:** the online folder where the app's code lives and changes are tracked. The developer manages it.
- **Hosting / Vercel:** the service that turns the code into a live website with a real URL. Connects to GitHub so updates publish automatically.
- **Auth provider:** the service that handles sign-in (accounts, passwords, "stay logged in"). We pick one and use it for ALL our tools.
- **Database:** where each person's saved maps are stored, tied to their account.
- **SSO (single sign-on):** sign in once, use multiple tools without signing in again.

---

## Phase 1 — Generate the prototype  **[You]**
- [ ] Run the build prompt in a fresh Fable 5 session.
- [ ] Test the core feel: dragging, the lift + magnet pop, arrows staying attached, mobile pinch-zoom.
- [ ] Iterate in that session until the feel is right. Save the resulting code and hand it to the developer along with the spec doc.
- Done when: the prototype feels fluid, even if auto-scaling or polish is still rough.

## Phase 2 — Put it in a real project  **[Dev]**
- [ ] Create a GitHub repo for the app.
- [ ] Scaffold a production framework (Next.js recommended; it pairs cleanly with Vercel and auth) and drop the generated component in.
- [ ] Get it running locally and confirm it behaves like the prototype.
- Done when: the app runs from a real codebase, not just a chat artifact.

## Phase 3 — Put it online  **[Dev]**
- [ ] Connect the GitHub repo to Vercel so every update publishes automatically.
- [ ] Confirm a live URL works on desktop and phone.
- Done when: there's a link you can open on your phone.

## Phase 4 — Shared sign-in across all DMC tools  **[You decide, Dev builds]**
This is the step that makes one login work for both the Parts Map and the future Values tool. Decide it now even though the Values tool comes later, so both are built to the same standard.
- [ ] **[You]** Pick ONE auth provider for the whole tool suite (Clerk and Supabase Auth are both good; the developer can recommend). The rule: every DMC tool uses this same provider and the same user accounts.
- [ ] **[You]** Decide the domain plan so SSO is clean: put the tools on subdomains of one domain (for example partsmap.yourdomain.com and values.yourdomain.com). Shared domain makes "sign in once, move between tools" work smoothly.
- [ ] **[Dev]** Add sign-in to the Parts Map using that provider.
- [ ] **[Dev]** Set it up so a session created in one tool is recognized by the other (the SSO behavior), and document the setup so the Values tool can reuse it exactly.
- Done when: a test account can sign in on one tool and open the other without signing in again.

## Phase 5 — Save people's maps  **[Dev]**
- [ ] Add a database and store each user's maps tied to their account.
- [ ] Replace the prototype's JSON file save/load with database save/load (the code already has a seam for this). Keep JSON export/import as a bonus so people can download a copy.
- Done when: you sign in, make a map, close the tab, come back later, and your map is exactly as you left it.

## Phase 6 — Privacy for sensitive data  **[You decide, Dev builds]**
These maps are personal psychological data, so handle them deliberately.
- [ ] **[You]** Decide the stance: where data is hosted, a short privacy note for users, and consent at sign-up.
- [ ] **[Dev]** Encrypt data at rest, and add "export my data" and "delete my account/maps" so people can leave with their data or remove it.
- Done when: there's a clear, honest answer to "what happens to my map and who can see it."

## Phase 7 — Surface it in Circle  **[Dev, with your input]**
- [ ] Recommended: link to the tool so it opens in its own tab/window. (Embedding inside Circle as an inline iframe breaks "stay signed in" in many browsers, so a launch link is the reliable path.)
- [ ] Add a clear button/link from your Circle space to the tool.
- Done when: a member can get from Circle to a working, signed-in tool in one tap.

## Phase 8 — Testing  **[Dev runs, You spot-check]**
- [ ] Every interaction: create/paste parts, lift-and-drop with front/back magnet pop, edit location text to move a node, restyle a card, draw arrows that stay attached, manual body scaling, auto-scaling toggle, off-body placement, collapsible copyable list.
- [ ] Devices: iPhone, Android, desktop. Confirm pinch-zoom and dragging feel good on a real phone.
- [ ] Auth flow: sign in once, jump between Parts Map and (when ready) Values tool with no second sign-in.
- [ ] Persistence: make a map, reload, confirm it's intact. Test JSON export and re-import.
- [ ] Circle flow: tap the link in Circle, land in the tool already (or easily) signed in.
- Done when: all of the above pass on a real phone, not just a laptop.

## Phase 9 — Launch and iterate  **[You + Dev]**
- [ ] Soft-launch to a small group, collect feedback on feel.
- [ ] For tuning, report the specific moment that feels off (the lift, the snap, the zoom, an arrow), not "make it smoother." Bring the live code to the tuning session.

---

### The short version of what only you can decide
1. Which auth provider the whole suite uses (Phase 4).
2. The domain plan (subdomains of one domain) (Phase 4).
3. The privacy stance for sensitive map data (Phase 6).
Everything else is execution the developer can carry.
