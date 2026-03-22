# Builders Space

An ambient awareness dashboard for multi-agent coding work, rendered as an immersive deep-space scene. Each of your projects appears as a planet. Each coding agent (Claude, Codex, Cursor) working on a project appears as a worker on that planet's surface. Expanding status rings around a planet signal when it needs your attention — red for errors, amber for waiting. Technical jargon is translated into human lingo so you always know what's happening at a glance.

## Why This Exists

If you use AI coding tools — Cursor, Claude Code, Codex — you've probably had three or four of them running at once across different projects. Each tool has its own window, its own logs, its own technical language. If one gets stuck and needs your input, you might not notice for twenty minutes. If one hits an error, you find out when you eventually switch back to that tab.

Builders Space exists because there was no single place to answer the question: *"What are all my agents doing right now, and does any of them need me?"*

The answer should take one glance, not five tab-switches. That's the core idea — **ambient awareness**. The dashboard sits in a corner of your screen and you absorb the state of everything peripherally, the same way you'd notice a red light on a car dashboard without actively reading the instrument cluster.

## Design Principles

1. **Ambient awareness over active monitoring.** You should never have to read a log or click into a panel to know the overall state. Color, motion, and scale do the work — red rings pulse when something breaks, amber rings breathe when something waits, and idle planets dim. Your peripheral vision catches it.

2. **Attention-first hierarchy.** Every status surface — sidebar dot, planet rings, HUD counter — shows the *most urgent* state, not the most common. One error agent among five working agents means red, not green. The system is designed around what needs *you*, not what's going well.

3. **Visual coherence.** Every element maps to something real. Stars are ambient background. Nebulae are atmospheric depth. Planets are projects. Workers are agents. Nothing is decorative if it could be mistaken for a meaningful object.

4. **Plain language by default.** Technical jargon like `git diff HEAD~3` is translated into phrases like "Reviewing recent changes." The dashboard is legible to anyone, not just developers.

5. **Tool-agnostic.** Cursor, Claude Code, and Codex disagree on what an "agent" even is. Builders Space doesn't care. If it works on a project and has a status, it's a worker on a planet. All tools are treated as equals.

6. **Zero configuration.** The app discovers active sessions automatically from the standard directories each tool already writes to. No config files, no project registration, no setup beyond `npm run dev`.

## The Visual Metaphor

Every visual element in Builders Space maps to something real. Nothing is decorative-only if it could be confused with a meaningful object -- coherence is a core design principle.

| Real World | Builders Space | Why |
|---|---|---|
| Your workspace | Deep space | The void you build within |
| A project (git repo) | A planet | Each project is a self-contained world |
| A project | Planet (uniform size) | All planets are the same size — visual consistency aids navigation |
| Where a planet sits in space | Concentric rings, alphabetical by project name | Placement is **stable** while the project list is unchanged — agent status and activity timestamps do not move planets |
| Project identity | Planet color and terrain | Seeded from project name; the same project always looks the same |
| Planet visual type | One of 5 archetypes (gas giant, rocky, oceanic, volcanic, ice) | Purely cosmetic variety inspired by NASA exoplanet diversity; does not map to any project property |
| A coding agent (Claude / Codex / Cursor) | A worker on the planet surface | Workers actively building on the world |
| Planet needs attention | Expanding status rings (HUD overlay) | Red rings = error (fast, multiple, flickering). Amber ring = waiting (slow, single, calm). No ring = no action needed |
| Planet idle | Dimmed, desaturated, near-still planet | Like a shop with the lights off — the eye naturally skips over it |
| Agent actively working | Worker digging or walking, kicking up dust and debris | Visibly busy — you can see the work happening |
| Agent hit an error | Worker trembling, red eyes, sparks and embers rising | Something broke — immediately visible distress |
| Agent waiting for you | Worker sitting with animated "..." thought bubble | Needs your input before it can continue |
| Agent done | Listed in the agent cards with its last action shown | Finished; no action needed from you |
| Technical jargon (`git diff`, `npm install`, etc.) | Human Lingo status labels ("Reviewing recent changes", "Installing project tools") | Always human-readable, never developer jargon |

### Status system

The same 4-state hierarchy applies everywhere — sidebar dot, planet status rings, planet label. The most urgent status always wins:

| Priority | Status | Color | Planet visual | What it means |
|---|---|---|---|---|
| 1 | **Error** | Red `#ff4444` | 3–4 fast red rings expanding outward, flickering | An agent hit a failure. Go investigate. |
| 2 | **Waiting** | Amber `#ffaa44` | Single slow amber ring, calm radar pulse | An agent needs your input. Go respond. |
| 3 | **Working** | Green `#44ffaa` | No ring — planet at full color and normal rotation | Agents are actively working. No action needed. |
| 4 | **Done** | Dim `#6688aa` | No ring — planet dimmed, desaturated, near-still | All agents finished. Nothing happening. |

If a project has 3 working agents and 1 error agent, the planet shows red rings — because the error needs your attention regardless of the working agents. The sidebar dot matches.

### What the background elements are (and are not)

- **Stars** (tiny white/blue dots): Ambient background. They are small and point-like -- they cannot be confused with planets.
- **Nebula** (very faint, very large colored washes): Atmospheric depth. They are so diffuse and transparent that they read as gas clouds, not solid objects. They are not planets.

## FAQ

**Why does a planet have red/amber rings when most agents are working fine?**

The status hierarchy prioritizes what needs your attention. If one agent has an error, the planet shows red rings even if five other agents are working normally — because the error needs you to act. The sidebar dot follows the same rule. You can click the planet to see the full breakdown of all agents.

**Why don't done agents appear on the planet surface?**

The pixel-art surface view shows agents you need to be aware of — working (productive), error (broken), and waiting (needs your input). Done agents only appear in the agent card list below the surface. They've finished their work and don't need your attention.

**What does the "Human Lingo" toggle do?**

It translates raw agent output (like `Running: git diff HEAD~3...HEAD -- src/`) into short human-readable labels (like "Reviewing recent code changes"). Powered by an LLM with a regex fallback. Toggle it off to see the raw output.

**Why do error agents tremble and have red eyes?**

Every animation maps to a status. Trembling + red eyes + rising embers reads as "malfunctioning" at a glance. Working agents walk or dig (productive). Waiting agents sit with an animated "..." thought bubble (needs your input). The visual language is consistent: if a sprite is shaking, something is wrong; if it has a thought bubble, it's waiting for you.

**What does clicking an agent card do?**

It opens the tool where that agent lives. Cursor agents open the Cursor project window. Claude agents open the Claude desktop app. Codex agents open the Codex desktop app. If the desktop app isn't installed, it falls back to resuming the session in Terminal. The dashboard is a launchpad, not just a display.

**How are projects discovered?**

Projects only appear if they have at least one active agent session. The backend watches standard tool directories (`~/.cursor/projects/`, `~/.claude/projects/`, `~/.codex/sessions/`) for session files. No configuration needed — if an agent is running, its project appears as a planet.

**Where does each planet sit in space?**

Alphabetically by project name on concentric rings in a flat plane. Agent status and activity do not move planets — only the project list (names) does. See `FAQ.md` for detail.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- npm 9+ (ships with Node 18+)
- macOS (agent detection reads macOS-specific paths; Linux/Windows support is not tested)

## How to Run

```bash
# Install dependencies
npm install

# Copy the example env file and add your Anthropic API key (optional — enables LLM-powered jargon translation)
cp .env.example .env

# Start the app (backend + frontend together)
npm run dev
```

This starts:
- A **backend server** on `http://localhost:3002` with independent file watchers for each agent tool
- A **frontend** on `http://localhost:5174` (or next available port) that renders the 3D space

No configuration needed. The backend automatically discovers active agent sessions from standard tool directories.

A **Hooks** tool icon sits in the bottom-right corner of the dashboard. Click it to expand the hook setup panel, which lets you install shell hooks into Claude Code, Codex, and Cursor with one click. When hooks are active and events are recent, agents from all three tools can report `statusSource: 'realtime'` — lifecycle events (`sessionStart`, `postToolUse`, `stop`, `sessionEnd` for Cursor; PascalCase equivalents for Claude) drive working / waiting / done / error. If hook data goes stale, agents gracefully fall back to file-scanning heuristics. You can enable or disable hooks at any time.

## Architecture

```
Browser (React + Three.js)          Node.js Backend
┌─────────────────────────┐         ┌──────────────────────────┐
│  3D Space Scene         │◄─SIO──►│  StateManager (merge)     │
│  ├─ Starfield           │         │  ├─ CursorWatcher         │
│  ├─ Nebula              │         │  ├─ ClaudeWatcher          │
│  ├─ Planets (per project)│        │  ├─ CodexWatcher           │
│  │  └─ Agents (per agent)│        │  ├─ EventWatcher           │
│  ├─ HUD + Side Panel    │         │  └─ Humanizer (on-demand)  │
│  └─ HookSetupCard       │         └──────────────────────────┘
└─────────────────────────┘
```

**Backend** uses independent watchers that each monitor a tool's session directory:
- **CursorWatcher**: Agent transcripts in `~/.cursor/projects/` (conversation JSONL files)
- **ClaudeWatcher**: JSONL session files in `~/.claude/projects/`, with `ps aux` process detection
- **CodexWatcher**: Rollout JSONL files in `~/.codex/sessions/`, with `ps aux` process detection
- **EventWatcher**: Hook events written to `~/.builders-space/events/` — normalizes events into `HookRuntimeEntry` overlays for the StateManager

Each watcher discovers projects agent-first: a project only exists if it has at least one agent session. The **StateManager** merges project maps from all watchers, then applies hook overlays using an explicit authority model: any agent with a trusted, non-expired hook overlay becomes `statusSource: 'realtime'`; otherwise the watcher-derived heuristic is `statusSource: 'inferred'`. **Matching** overlays to agents uses `session_id` / `conversation_id` first; if that does not line up with the transcript-derived id, a **cwd** match against the project path can still apply the overlay. Overlay trust windows: 10 minutes for active states (`working`, `waiting`), 1 hour for terminal states (`done`, `error`). State is emitted to clients via Socket.IO.

**Humanization** is client-initiated: when a user opens a project panel with "Human Lingo" mode on, the client sends raw action strings to the server, which translates them via LLM (with a regex fallback) and returns short labels.

**Frontend** renders a full 3D scene using React Three Fiber (a React wrapper for Three.js). Planets are procedurally generated using GLSL shaders -- no image textures are needed.

## Project Structure

```
builders-space/
├── index.html                       HTML shell
├── package.json                     Dependencies and scripts
├── tsconfig.json                    TypeScript config
├── vite.config.ts                   Vite build config
├── vitest.config.ts                 Vitest test runner config
├── .env.example                     Environment variable template
│
├── server/                          Node.js backend
│   ├── index.ts                     Express + Socket.IO server
│   ├── __tests__/                   Automated tests (vitest)
│   │   ├── stateManager.test.ts     StateManager authority model, overlay expiry, edge cases
│   │   └── eventWatcher.test.ts     Event normalization, mode assignment, unknown events
│   ├── types.ts                     Shared data types (AgentInfo, AgentStatusSource)
│   ├── stateManager.ts              Runtime authority: merges watcher state, applies hook overlays, emits changes
│   ├── watchers/
│   │   ├── cursorWatcher.ts         Cursor agent transcript watcher
│   │   ├── claudeWatcher.ts         Claude Code session watcher
│   │   ├── codexWatcher.ts          Codex rollout session watcher
│   │   └── eventWatcher.ts          Hook event watcher (status + error events)
│   ├── services/
│   │   ├── hookSetup.ts             Hook installation/removal (status + fire hooks)
│   │   └── humanizer.ts             LLM-powered jargon translation
│   └── utils/
│       ├── parseTranscript.ts       Cursor/Claude transcript parser
│       ├── parseCodexSession.ts     Codex rollout JSONL parser
│       └── projectName.ts           Directory name → project name
│
└── src/                             React frontend
    ├── main.tsx                     Entry point
    ├── App.tsx                      Root component
    ├── types.ts                     Frontend type definitions
    ├── store.ts                     Zustand state store
    ├── hooks/
    │   └── useSocket.ts             Socket.IO connection hook
    ├── scene/
    │   ├── SpaceScene.tsx           Main 3D canvas, camera, lighting, nebula
    │   ├── layout.ts                Stable orbital positions (name-sorted rings; unit-tested)
    │   ├── __tests__/layout.test.ts Vitest tests for `layoutOrbitalLanes`
    │   ├── Starfield.tsx            Particle starfield (custom shader)
    │   ├── Planet.tsx               Procedural planet with type-based shader
    │   └── PlanetLabel.tsx          Floating HTML label above each planet
    └── ui/
        ├── HUD.tsx                  Top bar with counters
        ├── Sidebar.tsx              Collapsible project index (left panel)
        ├── ProjectPanel.tsx         Side panel when a planet is selected
        ├── PlanetSurface.tsx        Pixel-art planet surface with agent sprites
        ├── AgentCard.tsx            Individual agent status card
        ├── HookSetupCard.tsx        Hook management panel (persistent tool icon, enable/disable hooks)
        └── agentIdentity.ts         Deterministic name/color identity for agents
```

## Tech Stack

- **Frontend**: React 18, Three.js, React Three Fiber, Drei, Zustand, Vite
- **Backend**: Node.js, Express, Socket.IO, chokidar
- **Language**: TypeScript throughout
- **Rendering**: Custom GLSL shaders for planets, stars, and nebula (Three.js `ShaderMaterial`, `RingGeometry`, additive blending)

## License

[MIT](LICENSE)
