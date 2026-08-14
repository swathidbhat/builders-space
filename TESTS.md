# Tests: User Experience & Performance

Manual test cases for Builders Space. Each test describes what to do, what should happen, and why it matters. Organized by what the user experiences (Sections 1–7) and what happens under the hood (Sections 8–11).

**Notation**: `[STATUS]` = one of working / waiting / done / error. `[SOURCE]` = cursor / claude-code / codex.

---

## 1. Status Hierarchy — "Where should I look next?"

The entire UI exists to answer one question: which project needs my attention? The 4-state hierarchy (error > waiting > working > done) must be consistent across every surface.

### 1.1 Sidebar dot reflects highest-priority agent status

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 1.1.1 | Project has 3 working agents, 1 error agent | Look at sidebar dot | Red (`#ff4444`) | Error overrides working — the error needs attention regardless of healthy agents |
| 1.1.2 | Project has 5 working agents, 1 waiting agent | Look at sidebar dot | Amber (`#ffaa44`) | Waiting overrides working — the agent needs your input |
| 1.1.3 | Project has only working agents | Look at sidebar dot | Green (`#44ffaa`) | All agents healthy, no action needed |
| 1.1.4 | Project has only done agents | Look at sidebar dot | Dim (`#6688aa`) | Nothing happening |
| 1.1.5 | Project has 1 error + 1 waiting + 2 working | Look at sidebar dot | Red (`#ff4444`) | Error is highest priority regardless of other states |

### 1.2 Planet status rings match sidebar

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 1.2.1 | Project has any error agent | Observe planet in space view | 3–4 red rings expanding outward (1.2×–2.5× radius), fast spawn (~2.5Hz), opacity flicker | Fire alarm — multiple fast flickering rings = emergency. Distinct from amber on 4 axes |
| 1.2.2 | Project has waiting (no error) agents | Observe planet | Single amber ring expanding outward (1.2×–2.2× radius), slow calm pulse (~0.7Hz) | Radar ping — single slow ring = "check when you can." Distinct from red chaos |
| 1.2.3 | Project has only working agents | Observe planet | No rings. Planet at full color, normal rotation | Active but no action needed — silence is the signal |
| 1.2.4 | Project has only done agents | Observe planet | No rings. Planet dimmed (~55% desaturated, ~45% darker), rotation ~10% of normal | Quiet — like a shop with lights off. Eye naturally skips over it |

### 1.3 Planet label matches sidebar

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 1.3.1 | Project has error agents | Read planet label | Label in `#ff4444` with red glow, suffix ` • error` | Red label matches red rings — broken |
| 1.3.2 | Project has waiting agents (no error) | Read planet label | Label in `#ffaa44` with amber glow, suffix ` • needs you` | Amber label matches amber ring — needs input |
| 1.3.3 | Project has only working agents | Read planet label | Label in `#44ffaa` with subtle glow, no suffix | Active but no call to action |
| 1.3.4 | Project has only done agents | Read planet label | Label in `rgba(200,220,255,0.5)`, no glow, no suffix | Visually recedes |

### 1.4 HUD counters are accurate

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 1.4.1 | 2 projects: one with 3 working agents, one with 1 error + 1 waiting | Read HUD | Working: 3, Awaiting you: 1, Errors: 1 (total Agents: 5) | Counts are global across all projects |
| 1.4.2 | Error count > 0 | Observe error counter | Red `#ff4444` with `hudPulse` animation (2s cycle) | Pulse draws eye to the most urgent global signal |
| 1.4.3 | Waiting count > 0 | Observe waiting counter | Amber `#ffaa44` with `hudPulse` animation | Same pulse treatment as errors |
| 1.4.4 | No errors, no waiting | Observe HUD | Error and waiting counters still visible but no pulse | Calm state — no animation when nothing needs attention |

---

## 2. Planet Surface — "What's happening on this project?"

Once you land on a planet, the agents that matter right now — working, error, and waiting — are standing on its surface. Done agents are excluded (they've finished and don't need attention) and are not shown while landed; the sidebar and HUD still count them.

### 2.1 Agent filtering

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.1.1 | Project has 2 working, 1 waiting, 1 done agents | Land on the planet | 3 figures standing on the ground (2 working + 1 waiting). Done agent not shown | Filter is `working \|\| error \|\| waiting` — the surface shows agents the user needs to be aware of. Done agents are not shown while landed |
| 2.1.2 | Project has only done agents | Land on the planet | Ground and sky, no figures | Empty surface = nothing needs attention. Intentional |
| 2.1.3 | Project has 1 error agent only | Land on the planet | 1 figure with error animation | Error agents are shown — they represent something actively wrong |
| 2.1.4 | Project has 1 waiting agent only | Land on the planet | 1 figure sitting with "..." thought bubble | Waiting agents are shown — they need the user's input |

### 2.2 Working agent animations

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.2.1 | Working agent on surface | Watch figure | Walking or digging animation with 4-frame cycle | Movement = productive. Walk is lateral sine motion; dig has pickaxe and debris |
| 2.2.2 | Working agent walking | Watch behind figure | Dust trail particles behind feet | Physically grounded — feet kick up dirt. This is semantic (movement), not decorative |
| 2.2.3 | Working agent digging | Watch dig impact point | Debris/sparks at dig point | Pickaxe hits rock — meaningful particle effect |
| 2.2.4 | Working agent | Look for green sparkles or ground glow | None present | Decorative particles were deliberately removed — they carried no semantic meaning |

### 2.3 Error agent animations

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.3.1 | Error agent on surface | Watch figure | Standing and trembling (rapid horizontal shake) | "Malfunctioning" read at a glance |
| 2.3.2 | Error agent | Look at eyes | Red eyes | Immediately distinguishable from healthy agents |
| 2.3.3 | Error agent | Watch over time | Occasional suit-color glitch to red | Reinforces distress signal |
| 2.3.4 | Error agent | Look above/around figure | Red embers rising, red `!` beacon, ground glow | "Something is broken/burning" — kept because it maps to status |
| 2.3.5 | Error agent alongside working agent | Compare visually | Error figure reads as dominant through its red effects | Depth is now real 3D — who occludes whom follows distance, so urgency is carried by the effects rather than a fixed draw order |

### 2.4 Waiting agent animations

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.4.1 | Waiting agent on surface | Watch figure | Sitting pose with slow breathing | Seated = not active, but present |
| 2.4.2 | Waiting agent | Look above figure | Animated "..." thought bubble — 3 amber dots pulse sequentially, each bobbing up when active | Universal "thinking/waiting" indicator. Amber matches the waiting status color |
| 2.4.3 | Waiting agent | Watch over 5 seconds | Figure occasionally flips direction (looks left briefly, then back right) | "Looking around" — subtle life, communicates the agent is aware but idle |
| 2.4.4 | Agent standing on the far side of the planet | Look for it | Hidden by the planet itself | The sphere is opaque and writes depth, so back-side agents are occluded without an explicit cull |

### 2.5 Surface determinism

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.5.1 | Land on the same project twice | Compare terrain and landing site | Identical terrain and identical landing spot | Both are seeded from the project name — the same project always looks the same and is approached from the same direction |
| 2.5.2 | Two different projects | Compare terrain | Different terrain colours, relief and landing sites | Different project names produce different seeds |
| 2.5.3 | Landed, wait for several socket ticks | Watch the agents | Nobody teleports or swaps places | Placement is hashed from `agent.id`, never from array index — the socket replaces the projects array roughly once a second |
| 2.5.4 | Landed, one agent's session ends and drops out | Watch the others | The rest stay put | Slots depend on the agent's own id, not on how many agents are present |
| 2.5.5 | Landed with no briefing yet, then the briefing arrives and parties appear | Watch the agents | Nobody moves — banners appear over the arrangement already on the ground | Grouping is a read-only layer over slots `planSurfaceCamp` already decided. Locked in by the `INVARIANT: grouping cannot move anyone` test |
| 2.5.6 | Landed, the briefing changes its mind (regroups the same agents) | Watch the agents | Still nobody moves; only the banners change | Placement takes no briefing input at all, so no arrangement of parties can reach it |

---

## 3. Agent Chips — "What do I need to know about each agent?"

**What a chip's detail line says is now covered in §5.2** — status, identity and click-to-open are still tested here. `AgentInfo.lastAction` is still populated by the watchers but is no longer rendered anywhere, so §3.3 exercises the formatter that builds the string, not a surface that displays it.

### 3.1 Status display

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 3.1.1 | Working agent | Read agent card | Green dot `#44ffaa`, label "Working", shows `lastAction` | Status + context at a glance |
| 3.1.2 | Waiting agent | Read agent card | Amber dot `#ffaa44`, label "Needs you", amber badge | Amber = needs your input |
| 3.1.3 | Done agent | Read agent card | Gray dot `#666`, label "Done", shows `lastAction` (not "Session completed") | Done badge + last action = status + what was accomplished. "Session completed" was removed — it duplicated the badge without adding information |
| 3.1.4 | Error agent | Read agent card | Red dot `#ff4444`, label "Error", shows `errorReason` when available | Error reason tells you what went wrong |
| 3.1.5 | Agent cards when panel opens | Check sort order | Sorted by priority: error first, then waiting, working, done last | Most urgent agents at the top |

### 3.2 Agent identity

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 3.2.1 | Multiple agents on same project | Read names | Each agent has a unique space-themed name (e.g. "Nova", "Atlas") | Deterministic from agent ID hash; collision resolution prevents duplicates per project |
| 3.2.2 | Same agent across sessions | Compare identity | Same name, same colors, same avatar shape | Identity is stable — seeded from agent ID |
| 3.2.3 | Agent card | Read source label | Shows "Claude", "Codex", or "Cursor" with source-specific color | `claude-code` → `#d97706`, `codex` → `#10b981`, `cursor` → `#6366f1` |

### 3.3 Action text formatting

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 3.3.1 | Claude agent ran `Shell` with command `cd /Users/swathibhat/Documents/build-space-opus && npm run dev` | Read agent card (raw mode) | `Shell:cd build-space-opus && npm run dev` | Deep absolute paths are shortened to the last component — reduces noise without losing context |
| 3.3.2 | Claude agent ran `Read` on `/Users/swathibhat/Documents/build-space-opus/src/App.tsx` | Read agent card (raw mode) | `Read:App.tsx` | File tool actions use `basename()` — only the filename matters |
| 3.3.3 | Shell command contains short path `/tmp` or `/usr/bin` | Read agent card | Path preserved as-is | Only paths with 3+ segments are shortened — short paths are already readable |
| 3.3.4 | Codex agent ran `exec_command` with `git -C /Users/swathibhat/Documents/my-project status` | Read agent card (raw mode) | `Shell:git -C my-project status` | Codex shell commands get the same path shortening treatment |

### 3.4 Click-to-open (launchpad behavior)

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 3.4.1 | Click Cursor agent card | Click | Opens Cursor project window via `open -a "Cursor"` | Dashboard is a launchpad — one click gets you there |
| 3.4.2 | Click Claude agent card, Claude desktop app installed | Click | Opens Claude desktop app via `open -a "Claude"` | Takes user to the app where their session lives, not a raw terminal |
| 3.4.3 | Click Codex agent card, Codex desktop app installed | Click | Opens Codex desktop app via `open -a "Codex"` | Same desktop-first behavior as Claude |
| 3.4.4 | Click Claude agent card, Claude desktop app NOT installed (agent not working, has sessionId) | Click | Falls back to `claude --resume '<sessionId>'` in Terminal | CLI resume is the best option when the desktop app isn't available |
| 3.4.5 | Click Codex agent card, Codex desktop app NOT installed (agent not working, has sessionId) | Click | Falls back to `codex resume '<sessionId>'` in Terminal | Same fallback behavior as Claude |
| 3.4.6 | Click Claude/Codex agent card, desktop app NOT installed, agent is working or no sessionId | Click | Opens project directory in Terminal (final fallback) | Can't resume an active session — fall back to project dir |
| 3.4.7 | Click any agent card | Observe | Toast message appears (3s) — "Opened Claude" / "Opened Codex" for desktop apps, "Resuming session in Terminal" for CLI fallback | User gets feedback that matches what actually happened |
| 3.4.8 | Click agent card, server unreachable | Observe | Toast shows error message | Graceful failure, not silent |

### 3.5 Desktop app detection (startup)

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 3.5.1 | Claude desktop app installed at `/Applications/Claude.app` | Start server | Server detects Claude app as available | Startup detection via `fs.existsSync` — no runtime overhead on clicks |
| 3.5.2 | Codex desktop app installed at `/Applications/Codex.app` | Start server | Server detects Codex app as available | Same detection logic for both apps |
| 3.5.3 | Neither desktop app installed | Start server, click Claude/Codex agent card | Falls back to Terminal resume behavior | Graceful degradation — CLI users still get the old behavior |
| 3.5.4 | Desktop app installed after server started | Click agent card | Still uses Terminal fallback (stale cache) | Detection runs once at startup — restart server to pick up new installs. Acceptable because installing a desktop app is rare |

---

## 4. Navigation & Interaction

### 4.1 Planet selection

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 4.1.1 | Space view, multiple planets | Click a planet | Camera descends out of orbit and lands on the surface (~1.4s); ground, figures and party banners fade in together late in the descent | Selection feels deliberate, not jarring — you travel to the project rather than opening a document about it |
| 4.1.2 | Landed on a planet | Press Escape | Bar hides, camera ascends to the orbital overview, planet labels and status rings return | Universal dismiss gesture |
| 4.1.3 | Space view | Click empty space (miss all planets) | Nothing selected; no change | Click-away only dismisses from orbit — while landed, clicking bare ground must not eject you |
| 4.1.4 | Landed on Planet A | Click Planet B in the sidebar | Camera travels to Planet B and lands; bar updates | Direct planet-to-planet navigation without returning to orbit first |
| 4.1.5 | Sidebar visible | Click project name in sidebar | Camera lands on that planet, bar opens | Sidebar is an alternative navigation method |
| 4.1.6 | Planet already selected via sidebar | Click same project in sidebar again | Deselects — bar hides, camera returns to orbit | Toggle behavior |

### 4.2 Landing and surface navigation

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 4.2.1 | Space view | Click a planet | Camera falls toward it at an even rate, gaze swinging from the planet to the horizon late in the fall | Distance eases geometrically and the gaze is remapped to the back of the descent — both at once reads as a swerve |
| 4.2.2 | Landed | Look at the horizon | Runs roughly level across the lower third of the frame, ridged rather than a clean arc | The camera rolls onto the local surface normal; the ridges are the terrain height field |
| 4.2.3 | Land on several different projects | Compare the horizon each time | Always level, never tilted or vertical | Landing sites are hashed anywhere on the sphere, including the southern hemisphere — `camera.up` must track the local normal, not world up |
| 4.2.4 | Landed | Drag left and right | Standing point slides along the surface; agents left behind lean as your local up rotates | Panning walks you around the globe. The lean is real small-planet geometry, not a bug |
| 4.2.5 | Landed | Drag up and down | Pitch changes within a clamp; the horizon never leaves the frame | Clamped to ±the horizon angle so you cannot end up staring at the sky or your feet |
| 4.2.6 | Landed | Scroll | Altitude changes between roughly 0.25 and 1.4 units | Lets you trade horizon curvature for a wider view of the camp |
| 4.2.7 | Landed | Click bare ground | Nothing happens — you stay landed | `onPointerMissed` is suppressed while landed; only Escape and Back to orbit leave |
| 4.2.8 | Landed, then return to orbit | Compare with the framing on first load | Identical | The overview pose is computed once from the ring layout and returned to exactly |
| 4.2.9 | Landed | Look at other planets in the sky | Visible as objects, with no floating name labels or status rings | Orbital-scale chrome is retired on landing — from the ground it wraps the sky and collides with the HUD |

### 4.3 Camera behavior

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 4.3.1 | Descending or ascending | Watch camera movement | Direction slerps around the planet while distance eases geometrically over ~1.4s | A straight positional lerp grazes inner-ring planets and changes apparent speed wildly across a 15x range of scale |
| 4.3.2 | Descending | Watch the path | Never passes inside the planet, at any point on the path | Distance is always interpolated between the two endpoint radii, so it cannot dip below either |
| 4.3.3 | During any transition | Try to orbit (drag) | OrbitControls disabled | Prevents controls from fighting the animation |
| 4.3.4 | Back in space view after a landing | Try to orbit | OrbitControls re-enabled and un-rolled | `camera.up` is reset to world up on arrival, or OrbitControls inherits the landed roll |
| 4.3.5 | Space view | Zoom and orbit | OrbitControls with damping (factor 0.05), min distance 3, max distance 150 | Bounded to prevent losing the scene |
| 4.3.6 | Tab backgrounded during a descent, then restored | Return to the tab | Camera completes the descent; planets do not flash blown-out | One very long frame must not make eased values overshoot their targets |

### 4.4 Hover states

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 4.3.1 | Hover over a planet | Move cursor | Cursor changes to pointer | Affordance — communicates clickability |
| 4.3.2 | Move cursor off planet | Move cursor | Cursor returns to default | Clean state transition |
| 4.3.3 | Hover over sidebar project | Observe | Background highlight appears | Standard hover feedback |
| 4.3.4 | Hover over agent card | Observe | Background highlight; title text appears if sessionMeta exists | Indicates interactivity |

---

## 5. Work Parties & Intent — "What is being built here, and what is it asking me?"

The surface names *intent*, never activity. Agents pursuing the same outcome form a **work party** that carries one banner naming the goal; an agent on its own carries its intent on its own chip; an agent that has stopped to ask you something shows the question. There is no jargon-translation layer and no raw view — the old `space:humanize` path and its regex fallback are gone.

### 5.1 Party banners

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 5.1.1 | Project where 4 agents were asked for the same outcome | Land and look above the camp | One banner with a 3–6 word goal ("Create social media artifact and post") and an `N agents` line, instead of 4 separate labels | One goal read once beats four activity strings read four times — this is the whole reason the camp stopped being a wall of labels |
| 5.1.2 | An agent whose goal nobody shares | Look for a banner over it | No banner; its own chip carries its intent | A banner needs something to say *and* someone to share it with — a party of one is just an agent |
| 5.1.3 | Party with a goal the model could not name (empty `goal`) | Look for a banner | No banner; members fall back to their own chips | An untitled banner is worse than no banner |
| 5.1.4 | Party whose members stand at different depths in the band | Look at where the banner sits | Band centroid, at the depth of the **furthest-back** member | Individual chips stagger upward with depth; sitting the banner at the back of that fan puts it above and behind every member, where the gap has already opened |
| 5.1.5 | Project whose camp is hashed into the southern hemisphere | Look at the banner | Directly above its party, not drifting off to one side | The banner is lifted along the **radius**, not along planet-local +Y — local up only points outward near the pole |
| 5.1.6 | Party containing one error agent and three working ones | Look at the banner's status dot | Red | The banner speaks for whoever most needs you: error > waiting > working > done |
| 5.1.7 | Descend onto a planet with parties | Watch the banners appear | Fade in on the same schedule as the ground and the figures | The camp should arrive as one thing, not in pieces |

### 5.2 What an agent's chip says

The detail line under an agent's name resolves in this order: toast > error reason > question > its own intent > silent.

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 5.2.1 | Working agent standing under a party banner | Read its chip | Name only — no detail line | The banner overhead has already said why this agent is here; repeating it an inch below is the duplication the banner exists to remove |
| 5.2.2 | Agent not covered by a banner | Read its chip | Name plus its own 5–8 word intent | Every standing agent accounts for itself one way or the other |
| 5.2.3 | Waiting agent whose transcript ends in a question | Read its chip | The question it actually asked — shown even inside a labelled party | An agent that has stopped and asked you something is the one thing on the planet that cannot wait for a hover |
| 5.2.4 | Error agent with an `errorReason` | Read its chip | The error reason, truncated at 120 characters | What broke outranks what was intended |
| 5.2.5 | Click an agent figure | Observe the chip | Its tool opens; a toast replaces the detail line for ~3s | Click-to-open lives on the figure itself — the thing standing in front of you is the thing you want to open |
| 5.2.6 | Camp drawing more than 3 labels | Read the chips | Working chips fold back to just a name and reveal the detail on hover; question and error chips keep their text | Density is measured in labels, not bodies — three agents under one banner draw one label between them |
| 5.2.7 | One banner over 4 agents, 3 of them holding questions | Count what is drawn | Counts as 4 labels and folds back | Regression: agents inside a banner still draw a chip when exempt from the fold-back, so they must be counted or a crowded camp reports itself as sparse |
| 5.2.8 | Land on a planet, read chips before the briefing returns | Read the chips | Names only — no raw tool call, no placeholder | Raw activity is never shown, not even while waiting |

### 5.3 Grouping without an API key

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 5.3.1 | `ANTHROPIC_API_KEY` unset | Land on a project | Agents asked exactly the same thing share a party; every agent appears in exactly one party | `fallbackBriefing` groups by exact normalised task — coarser than the model, never wrong in a way that misleads |
| 5.3.2 | No API key, one agent has no discoverable task | Look at that agent | Stands alone with no goal text — never "Unclear activity" or similar filler | An empty task is an absence of information, not a goal shared with every other taskless agent |
| 5.3.3 | Tasks differing only by trailing whitespace, case, or a final period | Compare grouping | Still one party | `normalizeTask` trims, collapses whitespace, lowercases and strips trailing punctuation on both client and server |
| 5.3.4 | API key set but the call fails or times out | Observe the surface | Same fallback grouping; no error state, no empty camp | The briefing failing must degrade the labels, not the scene |
| 5.3.5 | Model returns an answer missing more than half the roster | Observe | Whole answer discarded; fallback grouping used instead | A model that dropped half the roster misunderstood the task — its surviving parties are not more trustworthy than the ones it forgot |
| 5.3.6 | Model invents an id, or names the same agent in two parties | Observe | Invented id dropped, duplicate ignored, any forgotten agent re-added as its own party | `repairBriefing` makes the answer safe to render before it reaches the scene |

### 5.4 Request economy

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 5.4.1 | Land on a project and wait 30s with no roster change | Watch socket traffic | One `space:brief` emitted ~400ms after landing, then nothing | The guard compares roster *content*, not array identity — the socket hands over a fresh agents array every tick |
| 5.4.2 | An agent flaps in and out of the roster on a TTL boundary | Watch socket traffic | The 400ms debounce absorbs it; no request per toggle | Every toggle changes the key, and every changed key would otherwise be a cache miss |
| 5.4.3 | Land on the same project twice within 30 minutes, same roster | Check server logs | Second landing served from cache, no LLM call | `CACHE_TTL_MS` — see 11.1 |
| 5.4.4 | Two browser tabs land on the same project at once | Check server logs | One LLM call; both clients get the same answer | In-flight de-duplication by roster key |
| 5.4.5 | Land, then change the roster again within 3 seconds | Observe the second briefing | Fallback grouping, returned immediately | The rate floor degrades rather than queues — a usable answer now beats a better one after an unbounded wait |
| 5.4.6 | Land, then fly back to orbit before the briefing returns | Observe | Result discarded; no banners flash onto the next planet | The response is checked against the still-selected project before it is stored |

---

## 6. Project Discovery & Lifecycle

### 6.1 Appearance and disappearance

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 6.1.1 | Start an agent (Cursor/Claude/Codex) on a new project | Watch space view | New planet appears | Projects are agent-first: no agent = no planet |
| 6.1.2 | All agents on a project finish (> 1 hour ago) | Wait | Planet disappears | Dashboard shows live work, not history |
| 6.1.3 | Same project used by Cursor and Claude Code | Observe | One planet with agents from both tools combined | StateManager merges by normalized project path |
| 6.1.4 | Project directory has a generic name (e.g. `~/Documents`) | Check planet name | Uses `slug` from Claude session JSONL, or lowercased "documents" as fallback | Generic names are renamed, never silently skipped |
| 6.1.5 | Session files older than 48 hours | Check | Not shown — excluded by MAX_AGE_MS | Prevents stale sessions from cluttering the view |

### 6.2 Orbital layout

Layout is **name-stable**: agent status and `lastActivityMs` must not move a planet. Only the sorted project **names** and **count** determine positions (see `src/scene/layout.ts` and `src/scene/__tests__/layout.test.ts`).

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 6.2.1 | Several projects with different agent states (working, waiting, done, none) | Observe positions over time as statuses change | Planet positions unchanged — same XZ coordinates | Spatial memory: the user should not lose track of which planet is which because of activity churn |
| 6.2.2 | Multiple projects | Check order around each ring | Alphabetical by **project name** (`localeCompare`), not by activity | Recently touched projects are not reordered ahead of others in 3D space |
| 6.2.3 | More than 8 projects | Observe | Second (and further) concentric rings; 6 units radial spacing between rings; max 8 planets per ring | Prevents overlap while scaling to many projects |
| 6.2.4 | All planets | Check Y position | All at Y=0 (flat ecliptic plane) | Orrery model — flat plane, no random Y jitter |
| 6.2.5 | WebSocket pushes new `lastActivityMs` for agents | Watch planet positions | No drift or teleport — layout ignores activity fields | Confirms client matches `layoutOrbitalLanes` contract |

---

## 7. Visual Coherence — "Nothing is decorative if it could be confused with something meaningful"

### 7.1 Background elements cannot be mistaken for planets

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 7.1.1 | Stars in background | Observe | Tiny white/blue point-like dots (size 0.3–1.1), 6000 count | Too small and numerous to be confused with planets |
| 7.1.2 | Nebula in background | Observe | Ultra-faint, ultra-large diffuse colored washes (alpha ~0.015) | So transparent they read as gas clouds, never as solid objects |
| 7.1.3 | Planet | Compare with background elements | Clearly distinct: solid sphere, status rings (if any), label | No ambiguity about what is and isn't a planet |

### 7.2 Planet visual consistency

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 7.2.1 | Same project, different sessions | Compare planet appearance | Same color, terrain, type | Seeded from project name hash — identity is stable |
| 7.2.2 | Planet size | Compare all planets | All planets have identical radius (1.8) regardless of project size | Uniform size aids visual navigation — every planet is equally easy to find, click, and read |
| 7.2.3 | Planet types | Observe variety | One of 5 archetypes: gas giant, rocky, oceanic, volcanic, ice | Cosmetic variety; does NOT map to any project property |
| 7.2.4 | Planet rotation (active) | Observe | Smooth rotation at `delta * 0.06` | Provides life without time-dependent surface noise (removed to prevent strobe) |
| 7.2.5 | Planet rotation (idle) | Observe | Near-still rotation at `delta * 0.006` (~10% of normal) | Idle planets recede visually — slow rotation reinforces "lights off" |

### 7.3 Status rings

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 7.3.1 | Planet with error agents | Observe in space view | 3–4 red rings expanding outward simultaneously, fast spawn (~0.4s per ring), opacity flicker (±0.15) | Most visually dominant signal — multiple fast flickering rings = fire alarm |
| 7.3.2 | Planet with waiting agents (no error) | Observe | Single amber ring expanding and fading (1.2×–2.2× radius), calm ~0.7Hz rhythm | Radar ping — polite but visible. Clearly different from error (1 ring vs 3–4, slow vs fast) |
| 7.3.3 | Planet with only working agents | Observe | No rings at all | Silence = everything is fine. No ring makes error/waiting rings pop by contrast |
| 7.3.4 | Planet with only done/idle agents | Observe | No rings. Planet dimmed and desaturated | Nothing to signal — planet is quiet and visually recedes |
| 7.3.5 | Error rings vs blocked ring | Compare side by side | Differ on 4 axes: color (red vs amber), count (3–4 vs 1), speed (fast vs slow), stability (flicker vs smooth fade) | Colorblind-accessible — even without color, count + speed + flicker distinguish the two states |
| 7.3.6 | Ring rendering | Inspect | `RingGeometry` (flat annulus), additive blending, equatorial plane orientation | HUD-like feel — rings are flat and glowing, not 3D torus objects |

### 7.4 Idle planet dimming

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 7.4.1 | Planet with only done agents | Observe surface | Desaturated (~55% toward grayscale) and darkened (~45% brightness drop) | "Shop with lights off" — eye skips over it when scanning |
| 7.4.2 | Idle planet | Check hue | Planet hue and terrain are still recognizable, just muted | Identity is preserved — dimming doesn't change what planet it is |
| 7.4.3 | Planet transitions from active to idle | Watch over time | Smooth transition via lerp (`delta * 3`) — gradual dimming, not sudden | State transitions feel organic, not jarring |

---

## 8. Rendering Performance

### 8.1 Frame rate and GPU

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 8.1.1 | Space view with 5+ planets | Open browser DevTools Performance tab | Consistent 60fps (or display refresh rate), no dropped frames | Smooth experience is baseline |
| 8.1.2 | Space view | Check for post-processing effects | None — no EffectComposer, no Bloom | Removed: caused star invisibility, planet flickering, render artifacts during React reconciliation |
| 8.1.3 | Space view | Check tone mapping | `THREE.NoToneMapping` | ACES tone mapping crushed star brightness and planet mid-tones |
| 8.1.4 | Planet shaders | Inspect shader uniforms | `uDim` for idle dimming, no `uTerraform`. `uTime` not used in surface noise | `uDim` smoothly lerped in `useFrame`. `uTerraform` removed with terraforming |
| 8.1.5 | Planet ShaderMaterial | Inspect creation method | Created imperatively via `useMemo`, passed via `material=` prop | Declarative JSX `<shaderMaterial>` caused reconciliation resets of uniforms |
| 8.1.6 | Planet uniforms and status rings | Inspect update method | `uTime` and `uDim` updated in `useFrame`. Status rings use `RingGeometry` with additive blending | Rings are lightweight flat geometry, not shader-heavy spheres |

### 8.2 React reconciliation vs Three.js

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 8.2.1 | WebSocket pushes state update while viewing planets | Watch for visual glitches | No flickering, no strobe, no position jumps | React re-renders should not disrupt GPU state |
| 8.2.2 | Rapid state updates (many agent changes) | Monitor frame rate | Stable — no compounding re-renders | Zustand selectors + useMemo prevent unnecessary recalculation |
| 8.2.3 | React StrictMode | Check if enabled | Disabled (removed from entry point) | StrictMode double-mounting destroys and recreates WebGL resources, causing visible flashes |

### 8.3 Landed surface performance

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 8.3.1 | Land on a planet with agents | Check the WebGL canvas | One canvas for the whole app; each agent is lit box geometry sharing a single `UNIT_BOX`, posed by limb rotation | One geometry and a handful of materials per agent, and there is no second WebGL context |
| 8.3.2 | Landed, several agents | Inspect the scene graph | Every body part reuses the shared box; only the four identity materials are per-agent | Bounded per-agent GPU cost — adding an agent adds materials, never geometry |
| 8.3.3 | Terrain | Inspect generation | Ground patch built once per landing from `terrainHeight` + project seed (~19k vertices, ~15-20ms) | Deterministic look per project, and the cost is paid once, late in the descent |
| 8.3.4 | Return to orbit | Check GPU resources | Ground geometry and each agent's materials disposed on unmount; the shared box outlives them | Landing and leaving repeatedly must not leak GPU memory |
| 8.3.5 | `prefers-reduced-motion: reduce` | Toggle OS setting | Animation freezes at frame 0 | Accessibility path |

---

## 9. Socket.IO & Real-time Updates

### 9.1 Connection lifecycle

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 9.1.1 | Start app | Open browser console | Socket.IO connects, emits `space:request-state`, receives `space:state` | Client gets full state on connect |
| 9.1.2 | Kill and restart backend server | Watch browser | Client reconnects automatically (delay 1000ms, max 5000ms backoff) | Resilient to server restarts |
| 9.1.3 | On reconnect | Check state | Full state received again via `space:state` | No stale data after reconnection |
| 9.1.4 | Two browser tabs open | Change agent state | Both tabs receive update simultaneously | Socket.IO broadcasts to all clients |

### 9.2 State propagation latency

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 9.2.1 | Agent starts working (file changes in watched directory) | Measure time to UI update | < 2 seconds (chokidar watch + debounce + Socket.IO emit) | Near-real-time is the goal |
| 9.2.2 | Claude/Codex session file changes | Measure watcher response | Chokidar stability threshold: 1000ms write finish, 200ms poll | Slightly slower — these files are written less frequently |
| 9.2.4 | Fire event written to `~/.builders-space/events/` | Measure to error state | FireEvent watcher stability: 200ms write finish, 50ms poll | Error detection should be fastest — it's the most urgent |

### 9.3 Process detection

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 9.3.1 | Claude Code running | Check watcher | `ps aux` detects process; `lsof` confirms CWD match | Process detection is the "working" signal |
| 9.3.2 | Claude/Codex process detection | Check timing | `execSync` timeout 5000ms; `lsof` timeout 3000ms | Bounded — won't hang if system is slow |
| 9.3.3 | Claude/Codex process detection | Check interval | Polled every 60 seconds | Balance between freshness and system load |
| 9.3.4 | Process detection fails (e.g. permissions) | Check behavior | Error caught silently, agent status falls back to file-based heuristic | Graceful degradation |

---

## 10. Status Inference & Runtime Authority — How the backend decides agent state

Agent status is determined by the **runtime authority model**. Every agent carries a `statusSource` field: `'realtime'` (driven by trusted hook events) or `'inferred'` (derived from watcher heuristics). StateManager decides which source to use for each agent during every rebuild.

**Authority rules:**
- Any tool with a trusted, non-expired hook overlay → `statusSource: 'realtime'`, hook data drives status/errorReason/lastActivityMs/lastAction (when overlay supplies `lastAction`)
- No overlay or expired overlay → `statusSource: 'inferred'`, watcher heuristics drive all fields

**Overlay TTLs:**
- Non-terminal states (`working`, `waiting`): `HOOK_ACTIVE_TTL_MS = 600000` (10 minutes)
- Terminal states (`done`, `error`): `HOOK_TERMINAL_TTL_MS = 3600000` (1 hour)

**Watcher heuristics** (unchanged from before — used as fallback):
For Claude Code and Codex, the heuristic fallback uses a three-tier approach: file recency (< 2 min = working), process detection with a 10-minute staleness threshold (process alive but no output for 10+ min = waiting), and a process-dead fallback (dead + recent = waiting, dead + old = done). Cursor agents use file recency only (no process detection).

### 10.1 Cursor agents (transcript-based only)

CursorWatcher detects agents from conversation transcripts in `~/.cursor/projects/*/agent-transcripts/`. Terminal processes are not tracked as agents.

| # | Signal | Expected Status | Why |
|---|--------|----------------|-----|
| 10.1.1 | Transcript: `isRecentlyActive` (age < 2 min) | `working` | Recent activity = working |
| 10.1.2 | Transcript: age < 1 hour, not recently active | `waiting` | Within active window but idle |
| 10.1.3 | Transcript: age ≥ 1 hour | `done` | Long idle = done |
| 10.1.4 | Any session older than 48 hours | Excluded | MAX_AGE_MS prevents stale data from appearing |

### 10.2 Claude Code agents

Status uses a three-tier heuristic: (1) file recency, (2) process detection + staleness, (3) process-dead fallback. `STALE_THRESHOLD_MS` = 10 minutes.

| # | Signal | Expected Status | Why |
|---|--------|----------------|-----|
| 10.2.1 | Session `isActive` (last JSONL entry < 2 min ago) | `working` | Recent file activity is the strongest "working" signal |
| 10.2.2 | Claude process running, session stale ≤ 10 min | `working` | Process alive and output recent enough — probably thinking |
| 10.2.3 | Claude process running, session stale > 10 min | `waiting` | Process alive but no output for 10+ minutes — likely idle at prompt or stuck |
| 10.2.4 | No running process, session age < 1 hour | `waiting` | Recent but no process = probably waiting for input |
| 10.2.5 | No running process, session age ≥ 1 hour | `done` | Old and no process = done |
| 10.2.6 | Generic directory name (e.g. "Documents") | Project renamed to `slug` or lowercase | Not silently dropped |

### 10.3 Codex agents

Same three-tier heuristic as Claude Code: (1) file recency, (2) process detection + staleness, (3) process-dead fallback. `STALE_THRESHOLD_MS` = 10 minutes.

| # | Signal | Expected Status | Why |
|---|--------|----------------|-----|
| 10.3.1 | Session `isActive` (effective timestamp < 2 min ago) | `working` | Recent file activity is the strongest "working" signal |
| 10.3.2 | Codex process running, session stale ≤ 10 min | `working` | Process alive and output recent enough — probably thinking |
| 10.3.3 | Codex process running, session stale > 10 min | `waiting` | Process alive but no output for 10+ minutes — likely idle or stuck |
| 10.3.4 | No running process, session age < 1 hour | `waiting` | Recent but no process = probably waiting for input |
| 10.3.5 | No running process, session age ≥ 1 hour | `done` | Old and no process = done |
| 10.3.6 | `effectiveTimestamp` = max(last entry timestamp, file mtime) | Used for age calculation | File mtime covers cases where JSONL entries have stale timestamps |

### 10.4 Hook overlay model (replaces fire events + activity events)

Hook events are normalized into `HookRuntimeEntry` overlays by `EventWatcher` and stored in `StateManager.hookRuntimeByKey`. The overlay map replaces the previous `pendingFireEvents`/`pendingActivityEvents` arrays.

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 10.4.1 | Claude hook event arrives for watcher-discovered session | Agent flips to `statusSource: 'realtime'`; status/errorReason/lastActivityMs overridden by overlay | Hooks are authoritative for runtime fields when trusted |
| 10.4.2 | Codex hook event with no `lastAction` | Agent is `realtime`, watcher-derived `lastAction` preserved | Overlay only overrides lastAction when it has a non-empty value |
| 10.4.3 | Cursor status hook event arrives (e.g. `sessionStart` / `postToolUse` / matching overlay) | Agent `statusSource: 'realtime'` when overlay matches session id or cwd | Cursor uses the same overlay pipeline as Claude/Codex; requires Cursor hooks enabled and matching ids/paths |
| 10.4.4 | Hook event before watcher discovers agent | Overlay stored, no crash, no emitted effect until watcher catches up | Pre-discovery overlay storage is safe and applies on next rebuild |
| 10.4.5 | Non-terminal overlay older than 10 minutes | Overlay pruned, agent falls back to `inferred` | `HOOK_ACTIVE_TTL_MS = 600000` prevents stale hook data from persisting |
| 10.4.6 | Terminal overlay older than 1 hour | Overlay pruned, agent falls back to `inferred` | `HOOK_TERMINAL_TTL_MS = 3600000` — terminal states trusted longer |
| 10.4.7 | Cursor error overlay, then watcher reports newer `lastActivityMs` | Realtime overlay still wins until TTL expiry | Hook overlay authority is not superseded by newer watcher activity mid-window |
| 10.4.8 | Watcher rescans during active overlay trust window | Hook-driven runtime fields NOT overwritten by watcher | Overlay authority is respected until expiry |
| 10.4.9 | Hooks disabled via `/api/hooks/disable` | All overlays cleared immediately, all agents revert to `inferred` | Immediate UI consistency — no TTL wait |
| 10.4.10 | Event file processed by EventWatcher | File deleted from disk | One-shot events — don't reprocess on restart |

### 10.5 Event normalization (EventWatcher)

EventWatcher normalizes raw hook events into `HookRuntimeEntry` overlays and calls `stateManager.applyHookOverlay()`. All overlays use `mode: 'realtime'`.

| # | Event Type | Overlay Result | Why |
|---|-----------|---------------|-----|
| 10.5.1 | `SessionStart` / `session_start` / `sessionStart` | `status: 'working'`, `terminal: false` | Agent session begins |
| 10.5.2 | `PostToolUse` / `postToolUse` with `tool_name` and `tool_input` | `status: 'working'`, `terminal: false`, `lastAction` derived via `formatToolUse()` | Real-time tool action reporting |
| 10.5.3 | `Stop` / `stop` without error (Claude-shaped; Cursor `status` `completed`/`aborted`) | `status: 'waiting'`, `terminal: false` | Turn stopped — waiting for input |
| 10.5.4 | `Stop` / `stop` with error (`status=error`, `reason=error`, or `error_message`) | `status: 'error'`, `terminal: true`, `errorReason` set | Error detection |
| 10.5.5 | `SessionEnd` / `session_end` / `sessionEnd` (non-error) | `status: 'done'`, `terminal: true` | Session complete |
| 10.5.5b | `sessionEnd` with `reason: 'error'` | `status: 'error'`, `terminal: true` | Cursor session end with error |
| 10.5.6 | `fire-*` filename | `status: 'error'`, `terminal: true`, `errorReason` set | Fire hooks for error events |
| 10.5.7 | Unknown event name (e.g. `FooBar`) | Ignored — no overlay written | Deliberate change: unknown events no longer default to `working` |
| 10.5.8 | Event with no `hook_event_name` and no `event` field | Ignored — no overlay written | Empty event name treated as unknown |
| 10.5.9 | Payload with `cursor_version` or `workspace_roots` | Classified as **Cursor** in `detectSource`, not Claude | Avoids mis-routing Cursor's always-present `hook_event_name` |

---

## 11. Caching & Resource Management

### 11.1 Briefing cache

The briefing is the only LLM call in the app, so every guard against redundant spend lives in `server/services/briefing.ts`. The cache key is derived from the request DTO (`{id, task}` per agent, sorted and normalised) — nothing volatile may enter it.

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 11.1.1 | Brief the same roster twice within 30 minutes | Check LLM calls | Second request served from cache, no LLM call | Avoid redundant API spend |
| 11.1.2 | Cache at 64 entries | Add one more | Oldest entry evicted (`Map` iterates in insertion order) | MAX_CACHE = 64 prevents unbounded memory |
| 11.1.3 | Cached entry older than 30 minutes | Request it | Re-briefed via LLM | CACHE_TTL_MS = 30 min ensures freshness |
| 11.1.4 | Two identical rosters requested while the first call is still open | Check LLM calls | Second awaits the first's promise — one call, two answers | In-flight de-duplication; two sockets must not both pay for the same roster |
| 11.1.5 | A second, *different* roster within 3 seconds of the last call | Check LLM calls | No call — fallback grouping returned immediately | MIN_CALL_INTERVAL_MS = 3000 means a client bug cannot bill in a loop |
| 11.1.6 | Request with more than 8 agents | Check LLM calls | No call — fallback grouping | The client sends the surface roster, capped at 5; anything past 8 is a malformed request, not a big project |
| 11.1.7 | LLM call throws | Check result | `fallbackBriefing` returned, error logged, never crashes | Graceful degradation |
| 11.1.8 | Agent's `lastAction` or `status` changes, task unchanged | Check LLM calls | Cache hit — no new call | The DTO carries only `{id, task}`; a volatile field in the key would bill a call several times a second |

### 11.2 State management

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 11.2.1 | StateManager receives update from CursorWatcher | Check rebuild | Merges cursor, claude, codex maps; prunes expired overlays; applies matching hook overlays; sets `statusSource` per agent | Full rebuild on every update |
| 11.2.2 | Same project path from Cursor and Claude (different casing/separators) | Check | Merged into one project (path normalization: lowercase, replace `_` and spaces with `-`, trim trailing slashes) | Users don't think in terms of path encoding — same directory = same project |
| 11.2.3 | Zustand store receives `SpaceData` | Check filtering | Projects with zero agents are filtered out in `setData` | Client-side safety net — shouldn't happen but prevents empty planets |

### 11.3 File watcher resource cleanup

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 11.3.1 | Stop server (SIGINT) | Check cleanup | All watchers stopped, HTTP server closed | No orphaned file watchers or listeners |
| 11.3.2 | Return to orbit | Check SurfaceView | Ground geometry and agent materials disposed; pointer/wheel listeners removed | No orphaned render loops or listeners |

---

## 12. Edge Cases & Resilience

### 12.1 Empty states

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 12.1.1 | No agent sessions exist on disk | Space view with stars and nebula, no planets, sidebar empty | App is usable but empty — no crash, no loading spinner stuck |
| 12.1.2 | All agents done for > 1 hour | All planets disappear | Dashboard shows live work only |
| 12.1.3 | Landed, last agent disappears | Surface empties; bar shows "No active agents" | No stale data while landed |

### 12.2 UI layout edge cases

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 12.2.1 | Very long project name | Name and path truncated with ellipsis in the HUD and Sidebar | `overflow: hidden`, `textOverflow: ellipsis` prevent layout breakage |
| 12.2.2 | Very long goal or question text | Party banner clamps the goal to 2 lines; an agent chip clamps its detail line to 2 | Fixed-width chips with `WebkitLineClamp` — an unbounded string would otherwise grow a label until it covered the agents beside it |
| 12.2.3 | Planet labels and sidebar both visible | Labels don't bleed through sidebar/panel | Canvas has `zIndex: 1`, UI panels have higher z-index |
| 12.2.4 | HUD with sidebar open | HUD shifts right by 200px | Left offset accounts for sidebar width |
| 12.2.5 | HUD while landed | HUD spans the full width; planet labels and status rings are hidden | Nothing occupies the right edge any more, and orbital-scale labels would collide with the HUD from ground level |

### 12.3 Server unavailable

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 12.3.1 | Frontend loads but backend is down | No crash; empty state; reconnection attempts | Socket.IO reconnects with backoff (1s → 5s max) |
| 12.3.2 | Backend goes down while viewing | Existing state stays visible; reconnects when backend returns | Last-known state is better than blank screen |
| 12.3.3 | `POST /api/open-session` fails | Toast shows error; no crash | Graceful failure with user feedback |
| 12.3.4 | `space:brief` ack never arrives (server hangs mid-briefing) | Resolves to empty parties after 8s; agents fall back to solo chips; the request guard clears so a later tick retries | Socket.IO acks have no timeout of their own — `withAck` adds one. Without the guard clearing, one lost response would wedge that project permanently, since the key it is stuck on will never change |
| 12.3.5 | Socket disconnected when the briefing is requested | Resolves immediately to empty parties; no pending promise | A landed camp with no banners is a degraded read, not a broken one |

### 12.4 Health endpoint

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 12.4.1 | Server running | `GET /api/health` | `{ status: "ok", state: { projects: [...], lastUpdated: ... } }` | Quick way to verify backend state |

---

## 13. Hook Setup UI

The `HookSetupCard` component in `src/ui/HookSetupCard.tsx` provides a persistent tool icon and expandable panel for managing hooks. It has two states: minimized (small wrench icon) and expanded (full panel with tool status rows, enable/disable buttons).

### 13.1 Minimized state (tool icon)

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 13.1.1 | Hooks are configured | Wrench icon is green | Visual confirmation that hooks are active |
| 13.1.2 | Hooks not configured | Wrench icon is gray | Indicates hooks are available but not enabled |
| 13.1.3 | Click wrench icon | Panel expands, `localStorage` key `space:hooks-minimized` removed | Expand to manage hooks |
| 13.1.4 | Server unreachable (backend not running) | No icon rendered | `status` stays `null`, component returns `null` |

### 13.2 Expanded state

| # | Action | Expected | Why |
|---|--------|----------|-----|
| 13.2.1 | Click minimize (minus) button | Panel collapses to wrench icon, `localStorage` key `space:hooks-minimized` set to `'1'` | Persists across reloads |
| 13.2.2 | Hooks not configured | Explanation text and reassurance info box shown | Helps user understand what enabling does |
| 13.2.3 | Hooks already configured | Only tool rows and Disable button shown (no explanation text) | No need to re-explain |

### 13.3 Enable / disable

| # | Action | Expected | Why |
|---|--------|----------|-----|
| 13.3.1 | Click "Enable Hooks" | `POST /api/hooks/enable` called, status refreshed, all tools show green | One-click automated setup — no manual steps |
| 13.3.2 | Claude already has hooks in settings.json | Our hooks merged into existing arrays per event type | Follows official Claude Code guidance: merge, don't replace |
| 13.3.3 | Codex tool installed | Feature flag written to `config.toml`, hooks written to `~/.codex/hooks.json` | Separate concerns: flag in TOML, definitions in JSON |
| 13.3.4 | Click "Disable" | `POST /api/hooks/disable` called, hooks removed from all config files, status refreshed | Clean removal — deletes only our entries, preserves user's other hooks |
| 13.3.5 | Enable then disable Claude | `hooks` key removed from settings.json if empty, preserved if user has other hooks | Non-destructive cleanup |

---

## 14. Automated Tests

Automated unit tests run via `npm test` (vitest). These complement the manual tests above — they cover parsing, state and geometry logic that is difficult or impossible to check by looking at the screen.

`vitest.config.ts` includes `server/__tests__/**` and `src/**/*.test.ts` and runs `environment: 'node'`. **There is no DOM**, so React component and hook tests are not possible. That is why the briefing request key and the party anchor maths live in pure exported modules (`src/ui/briefingRequest.ts`, `src/scene/surfacePlacement.ts`) rather than inside `useBriefProject` and `PartyLabel` — extracting them is the only way they can be tested at all.

### 14.1 How to run

| # | Action | Expected | Why |
|---|--------|----------|-----|
| 14.1.1 | Run `npm test` | All tests pass (292 tests across 13 files) | Confirms transcript parsing, briefing cache/repair/fallback, authority model, overlay expiry, event normalization, and the surface geometry invariants |
| 14.1.2 | Run `npm run test:watch` | Vitest runs in watch mode, re-runs on file changes | Development workflow |
| 14.1.3 | Run `npm test` with no network access and no `ANTHROPIC_API_KEY` | Still passes | No test touches the network — `briefing.test.ts` injects a transport via `__setBriefingTransport` so the real cache and repair logic runs against a stub |

### 14.2 What's covered

| File | Tests | Coverage |
|------|-------|----------|
| `server/__tests__/userMessages.test.ts` | 51 | Table-driven over the exported `SYNTHETIC_PREFIXES` and `CONTINUATION_WORDS`, so an entry added to either list without a case shows up as untested. Reject-before-unwrap ordering, XML-ish tag shape, `meaningfulAgentText` rejecting JSON verdicts, `firstSentence` / `truncateAt` |
| `server/__tests__/eventWatcher.test.ts` | 37 | Event normalization (incl. Cursor camelCase, `sessionEnd`/`stop`), fire event normalization, unknown event rejection, missing field handling, `detectSource` (Cursor vs Claude), `extractSessionId`/`extractCwd` |
| `server/__tests__/briefing.test.ts` | 30 | Cache hit/expiry/eviction, in-flight de-duplication, the 3s rate floor, `repairBriefing` (invented ids, duplicates, forgotten agents, bail past half the roster), `fallbackBriefing` grouping and taskless agents, `briefingKey` normalization, schema validation. Transport injected via `__setBriefingTransport` |
| `server/__tests__/stateManager.test.ts` | 19 | Authority scenarios (realtime/inferred), overlay expiry at TTL boundaries, Cursor realtime overlays, clearHookRuntimeForSources, pre-discovery events, rapid events, empty state, cwd-based matching |
| `server/__tests__/parseTranscript.test.ts` | 16 | Real tmpdir fixtures: `currentTask` is the **latest** meaningful user message and not the first, continuation-word fallback to the previous turn, `question` set and unset around a trailing tool call, synthetic turns skipped |
| `server/__tests__/parseCodexSession.test.ts` | 9 | The safety-classifier prompt never becomes a goal, ambient-context unwrap below `## My request for Codex:`, `phase: final_answer` vs `commentary` |
| `server/__tests__/smoke.test.ts` | 1 | Test infrastructure sanity check |
| `src/scene/__tests__/surfacePlacement.test.ts` | 38 | Determinism per `(projectName, agent.id)`, invariance to input order and to agent status, unit-length directions, band and depth bounds, everything inside the horizon, minimum separation and graceful crowding, orthonormal landing frame. Plus `partyAnchor`: order-independence, depth of the furthest member, single-member identity, in-bounds, inside the horizon — and **`INVARIANT: grouping cannot move anyone`** |
| `src/scene/__tests__/surfaceCamera.test.ts` | 36 | Landed pose height/direction/pitch, **camera roll onto the local surface normal** (incl. a southern-hemisphere camp), descent endpoints, monotonic approach, never entering the planet, antipodal slerp, no NaN along the path, overview framing, pan clamps |
| `src/scene/__tests__/surfaceTerrain.test.ts` | 19 | Height field determinism, range, continuity (no pole or meridian seam), patch vertex bounds and radii, normals facing outward, ring resolution concentrated near the viewer, mesh radius agreeing with `terrainHeight` — the invariant that keeps agents' feet on the ground |
| `src/scene/__tests__/agentMotion.test.ts` | 16 | Which animation each status maps to, how far a walker strays, which way it faces, phase derived from the agent id rather than array index |
| `src/ui/__tests__/briefingRequest.test.ts` | 11 | Asserts on the DTO's **key set** — exactly `{id, task}` — so widening it fails here rather than on the API bill. Plus request-key stability across scan order, whitespace, case and trailing punctuation |
| `src/scene/__tests__/layout.test.ts` | 9 | `layoutOrbitalLanes`: empty/single, XZ plane, determinism, ignores agent status and `lastActivityMs`, multi-ring (>8), unique positions, order-independence (sort by name) |

### 14.3 Relationship to manual tests

Automated tests cover the parsing, state and geometry contracts. Manual tests (Sections 1–13) cover the full user experience including 3D rendering, animations, Socket.IO lifecycle, and UI interactions that cannot be unit tested in a DOM-less runner.

---

## Known Open Issues (do not test as passing)

These are documented bugs that remain unfixed. Listed here so testers don't file duplicates.

| Issue | Severity | Impact |
|-------|----------|--------|
| ~~Planet Y-positions use unseeded `Math.random()` in `layoutPlanets()` — positions jitter on data refresh~~ | ~~Medium~~ | **Fixed.** `layoutOrbitalLanes()` sets all planets to Y=0. No `Math.random()` in planet positioning |
| ~~Planets reordered by agent activity / tier — positions jumped on every status update~~ | ~~Medium~~ | **Fixed.** Positions are name-sorted rings only; status and `lastActivityMs` do not affect layout (`src/scene/layout.ts`) |
| Starfield positions use unseeded `Math.random()` — star layout shifts on component remount | Low | Background changes on hot reload |
| ~~Sidebar status priority uses error > working > waiting > done instead of error > waiting > working > done~~ | ~~Medium~~ | **Fixed.** Sidebar now uses error > waiting > working > done, consistent with planet status rings and labels |
| ~~HUD right offset is 340px but ProjectPanel width is 420px~~ | ~~Low~~ | **Fixed**, then obsolete. The side panel is gone; the HUD spans the full width |
