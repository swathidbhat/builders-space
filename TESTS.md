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

The pixel-art surface shows agents that matter right now — working, error, and waiting. Done agents are excluded (they've finished and don't need attention).

### 2.1 Agent filtering

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.1.1 | Project has 2 working, 1 waiting, 1 done agents | Open project panel, look at surface | 3 sprites visible (2 working + 1 waiting). Done agent not shown | Filter is `working \|\| error \|\| waiting` — surface shows agents the user needs to be aware of. Done agents only appear in card list |
| 2.1.2 | Project has only done agents | Open project panel | Surface shows sky + terrain, no sprites | Empty surface = nothing needs attention. Intentional |
| 2.1.3 | Project has 1 error agent only | Open project panel | 1 sprite with error animation on surface | Error agents are shown — they represent something actively wrong |
| 2.1.4 | Project has 1 waiting agent only | Open project panel | 1 sprite sitting with "..." thought bubble | Waiting agents are shown — they need the user's input |

### 2.2 Working agent animations

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.2.1 | Working agent on surface | Watch sprite | Walking or digging animation with 4-frame cycle | Movement = productive. Walk is lateral sine motion; dig has pickaxe and debris |
| 2.2.2 | Working agent walking | Watch behind sprite | Dust trail particles behind feet | Physically grounded — feet kick up dirt. This is semantic (movement), not decorative |
| 2.2.3 | Working agent digging | Watch dig impact point | Debris/sparks at dig point | Pickaxe hits rock — meaningful particle effect |
| 2.2.4 | Working agent | Look for green sparkles or ground glow | None present | Decorative particles were deliberately removed — they carried no semantic meaning |

### 2.3 Error agent animations

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.3.1 | Error agent on surface | Watch sprite | Standing and trembling (rapid horizontal shake) | "Malfunctioning" read at a glance |
| 2.3.2 | Error agent | Look at eyes | Red eyes | Immediately distinguishable from healthy agents |
| 2.3.3 | Error agent | Watch over time | Occasional suit-color glitch to red | Reinforces distress signal |
| 2.3.4 | Error agent | Look above/around sprite | Red embers rising, red `!` beacon, ground glow | "Something is broken/burning" — kept because it maps to status |
| 2.3.5 | Error agent alongside working agent | Compare visually | Error sprite visually dominant (z-order front, red effects) | `STATUS_Z = { working: 0, waiting: 1, error: 2 }` — error drawn last (front), waiting in middle, working in back |

### 2.4 Waiting agent animations

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.4.1 | Waiting agent on surface | Watch sprite | Sitting pose with slow breathing | Seated = not active, but present |
| 2.4.2 | Waiting agent | Look above sprite | Animated "..." thought bubble — 3 amber dots pulse sequentially, each bobbing up when active | Universal "thinking/waiting" indicator. Amber matches the waiting status color |
| 2.4.3 | Waiting agent | Watch over 5 seconds | Sprite occasionally flips direction (looks left briefly, then back right) | "Looking around" — subtle life, communicates the agent is aware but idle |
| 2.4.4 | Waiting agent alongside working and error agents | Compare z-order | Working (back) → waiting (middle) → error (front) | Layering matches urgency: error on top, working behind |

### 2.5 Surface determinism

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 2.5.1 | Open same project twice (close and reopen panel) | Compare terrain | Identical terrain, stars, dust motes | Surface is seeded from project name — same project always looks the same |
| 2.5.2 | Two different projects | Compare terrain | Different terrain colors and patterns | Different project names produce different seeds |

---

## 3. Agent Cards — "What do I need to know about each agent?"

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
| 4.1.1 | Space view, multiple planets | Click a planet | Camera smoothly transitions to planet; ProjectPanel slides in from right (0.3s ease) | Selection feels deliberate, not jarring |
| 4.1.2 | Planet selected | Press Escape | Panel closes, camera returns to space view | Universal dismiss gesture |
| 4.1.3 | Planet selected | Click empty space (miss all planets) | Panel closes, camera returns to space view | Click-away dismissal |
| 4.1.4 | Planet A selected | Click Planet B | Camera transitions to Planet B; panel updates | Direct planet-to-planet navigation without returning to space view first |
| 4.1.5 | Sidebar visible | Click project name in sidebar | Camera navigates to that planet, panel opens | Sidebar is an alternative navigation method |
| 4.1.6 | Planet already selected via sidebar | Click same project in sidebar again | Deselects — panel closes, camera returns to space | Toggle behavior |

### 4.2 Camera behavior

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 4.2.1 | Transition to a planet | Watch camera movement | Smooth interpolation using `1 - Math.exp(-5 * delta)` — fast start, gentle settle | Frame-rate independent smoothing; no jank regardless of FPS |
| 4.2.2 | During camera transition | Try to orbit (drag) | OrbitControls disabled during transition | Prevents controls from fighting the animation |
| 4.2.3 | Camera settled on planet | Try to orbit | OrbitControls re-enabled | User can look around freely once transition ends |
| 4.2.4 | Space view | Zoom and orbit | OrbitControls with damping (factor 0.05), min distance 3, max distance 150 | Bounded to prevent losing the scene |

### 4.3 Hover states

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 4.3.1 | Hover over a planet | Move cursor | Cursor changes to pointer | Affordance — communicates clickability |
| 4.3.2 | Move cursor off planet | Move cursor | Cursor returns to default | Clean state transition |
| 4.3.3 | Hover over sidebar project | Observe | Background highlight appears | Standard hover feedback |
| 4.3.4 | Hover over agent card | Observe | Background highlight; title text appears if sessionMeta exists | Indicates interactivity |

---

## 5. Human Lingo — "What is this agent actually doing?"

### 5.1 Translation behavior

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 5.1.1 | Open project panel with Human Lingo on (default) | Read agent action text | Human-readable labels like "Installing project tools" instead of `Shell: npm install` | Non-technical users should never need to read developer jargon |
| 5.1.2 | Toggle Human Lingo off | Read agent action text | Raw text like `Shell: npm install` or `Read: src/utils/auth.ts` | Power users can see the real commands |
| 5.1.3 | Toggle Human Lingo back on | Read agent action text | Humanized labels reappear (from cache, no delay) | Toggle is instant for previously translated text |
| 5.1.4 | Open project panel (Human Lingo on) | Watch network | `space:humanize` socket event sent only for un-cached raw texts | Client-initiated, on-demand — doesn't waste LLM calls for panels the user never opens |

### 5.2 Translation quality

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 5.2.1 | Agent action: `Read: src/components/Login.tsx` | Check humanized text | Something like "Reviewing login code" (5-8 words) | Concise, everyday language |
| 5.2.2 | Agent action: `Shell: git diff HEAD~3...HEAD -- src/` | Check humanized text | Something like "Reviewing recent code changes" | Technical git commands are opaque to non-developers |
| 5.2.3 | No ANTHROPIC_API_KEY set | Check humanized text | Fallback labels from regex rules: "Reading" for Read, "Running" for Shell, etc. | Graceful degradation — app works without API key |
| 5.2.4 | Agent action is an unrecognized format | Check fallback (no API key) | Known `Tool:detail` lines map to verbs; otherwise "Unclear activity" | No freeform truncation of arbitrary strings; no collision with lifecycle "Working" |

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

### 8.3 PlanetSurface canvas performance

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 8.3.1 | Open project panel with agents | Check canvas rendering | `requestAnimationFrame` loop, `imageSmoothingEnabled = false` | Pixel-art aesthetic requires nearest-neighbor rendering |
| 8.3.2 | Canvas dimensions | Inspect | 100×60 pixel units, scaled up via CSS | Tiny canvas = minimal per-frame computation |
| 8.3.3 | Terrain, stars, dust motes | Inspect generation | Computed in `useMemo`, not recalculated each frame | Static elements generated once from seed |
| 8.3.4 | Close project panel | Check | Animation loop cleaned up | No orphaned RAF loops |

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

### 11.1 Humanizer cache

| # | Setup | Action | Expected | Why |
|---|-------|--------|----------|-----|
| 11.1.1 | Translate the same raw text twice | Check LLM calls | Second request served from cache, no LLM call | Avoid redundant API spend |
| 11.1.2 | Cache at 500 entries | Add one more | LRU eviction — oldest entry removed | MAX_CACHE = 500 prevents unbounded memory |
| 11.1.3 | Cached entry older than 1 hour | Request it | Re-translated via LLM | CACHE_TTL_MS = 1 hour ensures freshness |
| 11.1.4 | Batch of 25 raw texts | Submit for humanization | Split into batches of 20 max | BATCH_SIZE = 20 prevents oversized LLM requests |
| 11.1.5 | LLM call fails | Check result | Falls back to regex/truncation per input, never crashes | Graceful degradation |

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
| 11.3.2 | Close project panel | Check PlanetSurface | `requestAnimationFrame` loop canceled | No orphaned animation loops |

---

## 12. Edge Cases & Resilience

### 12.1 Empty states

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 12.1.1 | No agent sessions exist on disk | Space view with stars and nebula, no planets, sidebar empty | App is usable but empty — no crash, no loading spinner stuck |
| 12.1.2 | All agents done for > 1 hour | All planets disappear | Dashboard shows live work only |
| 12.1.3 | Project panel open, last agent disappears | Panel content updates to show no agents | No stale data in open panels |

### 12.2 UI layout edge cases

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 12.2.1 | Very long project name | Name truncated with ellipsis in ProjectPanel and Sidebar | `overflow: hidden`, `textOverflow: ellipsis` prevent layout breakage |
| 12.2.2 | ProjectPanel open with long project name | ESC button not pushed off screen | Button has `flexShrink: 0` — never squeezed by title |
| 12.2.3 | Planet labels and sidebar both visible | Labels don't bleed through sidebar/panel | Canvas has `zIndex: 1`, UI panels have higher z-index |
| 12.2.4 | HUD with sidebar open | HUD shifts right by 200px | Left offset accounts for sidebar width |
| 12.2.5 | HUD with project panel open | HUD right edge aligns with panel edge (panel is 420px) | Right offset is `420px`, matching the panel width |

### 12.3 Server unavailable

| # | Scenario | Expected | Why |
|---|----------|----------|-----|
| 12.3.1 | Frontend loads but backend is down | No crash; empty state; reconnection attempts | Socket.IO reconnects with backoff (1s → 5s max) |
| 12.3.2 | Backend goes down while viewing | Existing state stays visible; reconnects when backend returns | Last-known state is better than blank screen |
| 12.3.3 | `POST /api/open-session` fails | Toast shows error; no crash | Graceful failure with user feedback |

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

Automated unit tests run via `npm test` (vitest). These complement the manual tests above — they cover the StateManager authority model and EventWatcher normalization logic that are difficult to test manually.

### 14.1 How to run

| # | Action | Expected | Why |
|---|--------|----------|-----|
| 14.1.1 | Run `npm test` | All tests pass (65 tests across 4 files) | Confirms authority model, overlay expiry, event normalization (incl. Cursor lifecycle), and stable orbital layout |
| 14.1.2 | Run `npm run test:watch` | Vitest runs in watch mode, re-runs on file changes | Development workflow |

### 14.2 What's covered

| File | Tests | Coverage |
|------|-------|----------|
| `server/__tests__/stateManager.test.ts` | 18 | Authority scenarios (realtime/inferred), overlay expiry at TTL boundaries, Cursor realtime overlays, clearHookRuntimeForSources, pre-discovery events, rapid events, empty state, cwd-based matching |
| `server/__tests__/eventWatcher.test.ts` | 37 | Event normalization (incl. Cursor camelCase, `sessionEnd`/`stop`), fire event normalization, unknown event rejection, missing field handling, `detectSource` (Cursor vs Claude), `extractSessionId`/`extractCwd` |
| `src/scene/__tests__/layout.test.ts` | 9 | `layoutOrbitalLanes`: empty/single, XZ plane, determinism, ignores agent status and `lastActivityMs`, multi-ring (>8), unique positions, order-independence (sort by name) |
| `server/__tests__/smoke.test.ts` | 1 | Test infrastructure sanity check |

### 14.3 Relationship to manual tests

Automated tests cover the internal StateManager and EventWatcher contract. Manual tests (Sections 1–13) cover the full user experience including 3D rendering, animations, Socket.IO lifecycle, and UI interactions that cannot be unit tested.

---

## Known Open Issues (do not test as passing)

These are documented bugs that remain unfixed. Listed here so testers don't file duplicates.

| Issue | Severity | Impact |
|-------|----------|--------|
| ~~Planet Y-positions use unseeded `Math.random()` in `layoutPlanets()` — positions jitter on data refresh~~ | ~~Medium~~ | **Fixed.** `layoutOrbitalLanes()` sets all planets to Y=0. No `Math.random()` in planet positioning |
| ~~Planets reordered by agent activity / tier — positions jumped on every status update~~ | ~~Medium~~ | **Fixed.** Positions are name-sorted rings only; status and `lastActivityMs` do not affect layout (`src/scene/layout.ts`) |
| Starfield positions use unseeded `Math.random()` — star layout shifts on component remount | Low | Background changes on hot reload |
| ~~Sidebar status priority uses error > working > waiting > done instead of error > waiting > working > done~~ | ~~Medium~~ | **Fixed.** Sidebar now uses error > waiting > working > done, consistent with planet status rings and labels |
| ~~HUD right offset is 340px but ProjectPanel width is 420px~~ | ~~Low~~ | **Fixed.** HUD now uses `right: selectedId ? '420px' : 0`, matching the 420px panel width |
