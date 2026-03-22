# FAQ

Written for non-technical users. If you can use a web browser, you can understand this document.

---

## What is Builders Space?

A visual dashboard that shows you what all your AI coding assistants are doing, across all your projects, in real time. Instead of switching between tool windows and reading technical logs, you open one screen and see everything at a glance.

It looks like a space scene. Each of your projects appears as a planet. Each AI assistant working on a project appears as a little worker on that planet's surface. Technical jargon is translated into human lingo so you always know what's happening.

## Why does it exist?

If you use AI coding tools — Cursor, Claude Code, or Codex — you might have several of them working on different projects at the same time. The problem is:

- Each tool has its own window, its own logs, and its own technical language.
- If one gets stuck and needs your input, you might not notice for a while.
- There's no single place to see what all of them are doing.

Builders Space gives you that single place. The core idea is **ambient awareness** — the dashboard sits in a corner of your screen and you absorb the state of everything at a glance, the same way you'd notice a warning light on your car dashboard without actively reading the instrument cluster. Red rings mean something broke. Amber rings mean something is waiting for you. No rings mean everything is fine. You never have to open a log or switch tabs to know the overall picture.

## What's a "project"?

A project is a folder on your computer where code lives — a website you're building, an app, a tool. If you have three projects with active AI work, you'll see three planets.

## What's an "agent"?

An agent is an AI coding assistant that's working on one of your projects. Think of it like a worker on the planet's surface. The app detects agents from three tools:

- **Cursor** — an AI-powered code editor
- **Claude Code** — Anthropic's command-line coding assistant
- **Codex** — OpenAI's cloud-based coding agent

Each agent gets a space-themed name (like "Nova" or "Atlas") and a colored avatar so you can tell them apart.

### How the tools describe themselves

The three tools don't even agree on what an "agent" is:

- **Cursor** calls it *"tools in a loop"* — describing the mechanism
- **Claude Code** calls itself *"an agentic coding tool"* — describing the product
- **Codex** calls itself *"a software engineering agent"* — describing a persona

Builders Space sidesteps this disagreement. It doesn't care what an agent *is* philosophically. It cares what an agent *does*: it works on a project, it has a current action, and it's in one of four states. All three tools are treated as equivalent workers.

## What can I see about each agent?

When you click on a planet, a panel opens showing:

1. **A pixel-art surface view** of the planet with animated figures for each agent — walking, digging, or sitting.
2. **A card for each agent** showing:
   - Its name and which tool it comes from (Cursor, Claude, or Codex)
   - Its status: **Working** (green), **Needs you** (orange), **Done** (gray), or **Error** (red)
   - What it's doing right now, in human lingo — for example, "Adding a login form" instead of the cryptic `Write: src/components/Login.tsx`

## How do I know when an agent needs me?

Three ways, so you never miss it:

- **From the space view**: the planet gets a pulsing orange ring.
- **From the sidebar**: the project's dot turns orange.
- **From the top bar**: a counter shows how many agents are "Awaiting you" across all projects.

## What does the "Human Lingo" toggle do?

AI coding tools describe their actions in developer jargon — things like `Shell: npm install` or `Read: src/utils/auth.ts`. The "Human Lingo" toggle translates these into short, readable phrases like "Installing project tools" or "Reviewing login code."

You can switch it off to see the raw technical text if you prefer.

## Why do the planets look different from each other?

Every planet is generated from its project name. The same project always produces the same planet — same color, same terrain, same type. There are five types (gas giant, rocky, oceanic, volcanic, ice), chosen randomly but consistently.

Planet type is purely cosmetic — it doesn't reflect anything about the project itself. It's just visual variety inspired by NASA exoplanet research.

## How are planets arranged in space?

Planets are placed in a simple, predictable pattern: **alphabetical order by project name**, spread around one or more concentric rings in a flat plane. That arrangement stays the same while your project list stays the same — when agents start working, finish, or update their activity, **planets do not jump to new positions**. Only the rings, labels, and sidebar reflect those changes.

If you add a new project (a new planet appears), or a project drops off when all its sessions go idle, the set of names changes, so positions are recalculated for everyone — still in alphabetical order.

## Can I click on things?

Yes:

- **Click a planet** (or its name in the sidebar) to open its detail panel.
- **Click an agent card** to open that agent's tool — Cursor opens the Cursor window, Claude opens the Claude desktop app, Codex opens the Codex desktop app.
- **Press Escape** or click empty space to close the panel.

## Do I need to configure anything?

No. The app automatically discovers active AI sessions from the standard directories where each tool stores its data. Just run it and it finds everything.

The only optional setup is adding an Anthropic API key, which improves the Human Lingo translations. Without it, the app uses built-in rules that cover most cases.

---

## How it works under the hood

The sections below go one level deeper for the curious.

### How does it detect what the AI tools are doing?

Two complementary mechanisms:

**File watchers (always active):** Each AI tool writes session files to specific folders as it works. Builders Space watches those folders for changes:
- **Cursor** stores conversation transcripts in `~/.cursor/projects/`
- **Claude Code** stores session logs in `~/.claude/projects/`
- **Codex** stores session logs in `~/.codex/sessions/`

**Hook-based events (opt-in):** When you enable hooks via the tool icon in the bottom-right corner, Builders Space installs lightweight shell scripts into Claude Code, Codex, and Cursor. These hooks fire on specific events — session start, tool use, stop, and session end — and write structured JSON files to `~/.builders-space/events/`. The app's EventWatcher picks these up for real-time, high-fidelity status updates when events are recent.

### How does it know an agent's status?

Every agent has a `statusSource` field — either `realtime` or `inferred` — that tells you how its status is being determined right now.

**Realtime** (any tool with active, recent hooks): the agent's status comes directly from hook events. A session start or post–tool-use event means **Working**. A stop without errors usually means **Needs you**. A session end usually means **Done**. A stop or session end with an error signal means **Error**. Cursor uses the same `statusSource` model when hooks are enabled and events match the agent (by session id or project path).

**Inferred** (hooks inactive, stale, or not matching an agent): the app figures out status by scanning session files and checking whether the tool's process is running (where applicable). This works well but can occasionally misread a long-running operation as "waiting."

The system transitions between the two automatically. When hook events are flowing and still within the trust window, agents show `realtime`. If hook events stop arriving for more than 10 minutes (for active states) or 1 hour (for terminal states like done/error), the agent gracefully falls back to `inferred`.

**Without hooks** (all tools use inference):

- **Cursor** (file-based only): if the agent's transcript file was modified in the last 2 minutes → **Working**. If 2 minutes to 1 hour → **Needs you**. If over 1 hour → **Done**.
- **Claude Code / Codex** (file + process detection): if the session file was written in the last 2 minutes → **Working**. If the process is alive but the session file hasn't changed in over 10 minutes → **Needs you**. If the process is dead and the session is less than 1 hour old → **Needs you**. If the process is dead and over 1 hour old → **Done**.

### What are hooks and why should I enable them?

Hooks are small shell scripts that Claude Code, Codex, and Cursor run automatically at key moments. Each hook writes a tiny JSON file that the app reads instantly.

Hooks improve tracking for all three tools, but in different ways:

- **Claude and Codex**: hooks provide lifecycle coverage (session start, tool use, stop, session end). When hooks are active and producing recent events, these agents report `statusSource: 'realtime'` — status updates are precise and immediate. If hooks stop producing events, the agents gracefully fall back to file-scanning inference.
- **Cursor**: hooks can cover the same lifecycle events (see Cursor's hooks documentation for supported hook names and payload fields). When events match your agent (session id or project folder), Cursor agents can show `statusSource: 'realtime'`. Cursor's hook format and versions evolve — enable hooks from the dashboard and ensure you're on a Cursor build that supports the documented hook types.

Enabling hooks is optional and reversible — click the tool icon in the bottom-right corner of the dashboard to enable or disable them. Your original config files are backed up before any changes. If you disable hooks, all hook overlays are cleared immediately and agents revert to inference.

### How does it combine agents from different tools onto the same project?

Each watcher independently discovers projects by reading session files. A project only exists if at least one AI tool has worked on it. The "State Manager" merges results from all three watchers by matching on the project's folder path — so if Cursor and Claude Code are both working on the same folder, their agents appear together on the same planet.

### How does the Human Lingo translation work?

When you open a project panel, the app collects all the raw action strings that haven't been translated yet and sends them to the server. If you have an Anthropic API key, the server sends them to Claude (a fast, inexpensive model) with instructions to produce 5–8 word status labels in everyday language. Results are cached for an hour so the same action doesn't need to be translated twice.

Without an API key, the server uses built-in rules — it knows that "Read" means "Reading," "Shell" means "Running," "Search" means "Searching," and so on. This covers most cases, though the LLM translations are more natural.

### How are planet positions computed?

Orbital layout is a pure function, `layoutOrbitalLanes()`, in `src/scene/layout.ts`. Projects are sorted by `name` with `localeCompare`, then distributed evenly around rings: at most 8 planets per ring, base radius 8 units, 6 units spacing between rings, all at Y = 0. Positions depend only on **project name** and **how many projects exist** — not on agent `status`, `lastActivityMs`, or tier. Automated tests in `src/scene/__tests__/layout.test.ts` lock this behavior in.

### How are the planets rendered?

Every planet is generated entirely with math — there are no image textures. The surfaces are built from layered noise functions (algorithms that produce natural-looking randomness) running on your graphics card. Each planet type uses these functions differently: gas giants get banded storms, rocky planets get continents, volcanic planets get lava rifts, and so on.

The pixel-art surface you see inside the project panel is a separate system — a tiny 100×60 pixel canvas where each agent is drawn as an animated sprite character. The terrain, stars, and dust are all generated from the project name so the surface always looks the same for the same project.

### How do agents get their names and appearances?

Agent IDs from the tools are opaque strings like `a3f8c2b1-...`. The app runs each ID through a hash function to deterministically pick a name (from a list of 40 space-themed names), a color gradient, a hair color, a skin tone, and a suit color. The same agent ID always produces the same identity, and collision resolution ensures no two agents on the same project share a name.
