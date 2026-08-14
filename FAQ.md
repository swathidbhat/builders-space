# FAQ

Written for non-technical users. If you can use a web browser, you can understand this document.

---

## What is Builders Space?

A visual dashboard that shows you what all your AI coding assistants are doing, across all your projects, in real time. Instead of switching between tool windows and reading technical logs, you open one screen and see everything at a glance.

It looks like a space scene. Each of your projects appears as a planet. Each AI assistant working on a project appears as a little worker on that planet's surface. Assistants pulling toward the same goal stand together under a banner naming it, so you read what is being built rather than what commands are running.

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

Everything is in the world itself — there is no panel or list to cross-reference.

**The agents themselves** stand on the ground as small animated figures — walking, digging, trembling, or seated with a thought bubble. Each carries above its head:

- Its name, and a dot for its status: **Working** (green), **Waiting** (amber), **Error** (red), **Done** (blue)
- What it is trying to achieve, in plain words — for example, "Add a login form" rather than the command it happens to be running
- If it has stopped, the decision now sitting with you — not what it said, but what you have to settle

**Agents working toward the same goal stand under a shared banner** naming that goal. A member under a banner stays quiet rather than repeating it, so three agents on one feature read as one thing, not three. An agent with a question is the exception: it always speaks for itself, however crowded the ground is.

Done agents don't stand on the surface at all — they've finished and need nothing from you. The sidebar and the HUD still count them.

## How do I know when an agent needs me?

Three ways, so you never miss it:

- **From the space view**: the planet gets a pulsing orange ring.
- **From the sidebar**: the project's dot turns orange.
- **From the top bar**: a counter shows how many agents are "Awaiting you" across all projects.

## What is a "work party"?

A group of agents on the same project that were asked for the same outcome. They stand together under one banner naming that goal — something like "Create social media artifact and post" — plus a count of how many agents are in the party.

The point is that four agents shipping one feature is *one* thing happening, and should read as one line of text rather than four. An agent whose goal nobody else shares does not get a banner; it just carries its own short line of intent above its head.

Parties are worked out fresh each time you land on a planet, from what each agent was last asked to do. They are labels only — they never change where anyone is standing.

## Why don't I see what command an agent is running?

Because it wouldn't help you decide anything. A label reading "Editing surfacePlacement.ts" tells you an agent is busy, which you already knew from the fact that it's standing there.

What the surface shows instead is intent: what the agent is trying to achieve, and — if it has stopped — the decision now sitting with you.

That second part is not the agent's message relayed back. Agents rarely end by asking a clean question; they end by describing what they built, with the choice they are actually blocked on buried somewhere inside. Handing you that text is the same reading work you were trying to avoid. So the app works out the decision instead: an agent that writes four paragraphs about the LinkedIn drafts it produced shows up as "Choose which of the four posts to publish". If nothing is genuinely pending, it says nothing at all.

## Why do the planets look different from each other?

Every planet is generated from its project name. The same project always produces the same planet — same color, same terrain, same type. There are five types (gas giant, rocky, oceanic, volcanic, ice), chosen randomly but consistently.

Planet type is purely cosmetic — it doesn't reflect anything about the project itself. It's just visual variety inspired by NASA exoplanet research.

## How are planets arranged in space?

Planets are scattered through a volume of space rather than laid out on a ring. The pattern underneath is the one seeds take in a sunflower head — each planet about 137.5 degrees around from the last, drifting further out as it goes — which never closes into a circle or lines up into spokes the way evenly spaced rings do. Each planet is then nudged out, around, and off the midplane by its own name, so the underlying spiral does not show through either.

It is still completely predictable: the same set of project names always produces the same arrangement. When agents start working, finish, or update their activity, **planets do not jump to new positions**. Only the rings, labels, and sidebar reflect those changes.

If you add a new project (a new planet appears), or a project drops off when all its sessions go idle, the set of names changes, so positions are recalculated for everyone — still in alphabetical order.

## Can I click on things?

Yes:

- **Click a planet** (or its name in the sidebar) to land on it — the camera flies down and sets you on its surface.
- **Drag** while landed to walk your viewpoint along the surface, and **scroll** to change your altitude.
- **Click an agent** standing on the surface to open its tool — Cursor opens the Cursor window, Claude opens the Claude desktop app, Codex opens the Codex desktop app.
- **Press Escape** or click **Back to orbit** to fly home.

## What happens when I click a planet?

The camera leaves orbit and lands on the planet. You end up standing on its surface with the horizon curving across the lower part of the screen, and the agents working on that project are standing on the ground in front of you — digging if they're working, sitting with a thought bubble if they're waiting for you, trembling if something broke.

The camera drops straight down onto the face of the planet already turned toward you, so landing reads as an approach rather than a trip around the world.

## Why aren't all my agents standing on the planet?

The planets are small, so the horizon is close — you can see roughly half a planet-radius of ground before it curves out of sight, and every agent standing there needs a readable label above it. So at most five stand on the ground at a time.

They are chosen by what needs you most: anything that hit an error first, then anything waiting on your input, then agents that are working.

Anyone who didn't make it onto the ground isn't shown while you're landed — nor are the finished agents, who never stand there. The sidebar and the HUD keep counting everyone, so the number beside a project is always the true one. The five that do stand are the five you would have looked at first.

## Do I need to configure anything?

No. The app automatically discovers active AI sessions from the standard directories where each tool stores its data. Just run it and it finds everything.

The only optional setup is adding an Anthropic API key, which is what lets the app group agents into work parties and name their goals well. Without it, agents that were asked for *exactly* the same thing are still grouped together — you just get coarser groups and plainer wording, never a wrong or invented goal.

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

### How does it work out what the agents are trying to do?

When you land on a project, the app sends the server a short list of the agents standing on the ground — just an id and the task each one was last asked to do, nothing else. That is the app's only call to an AI model. Claude Sonnet reads the list and answers both questions at once: what each agent is contributing, and which of them are pulling toward the same outcome. It has to be one answer, because you cannot decide who shares a goal before you have worked out what the goals are.

The answer is checked before anything is drawn. Any agent id the model invented is dropped, an agent named twice is only counted once, and an agent it forgot is added back on its own. If more than half the group went missing, the whole answer is thrown out — a model that lost half the list misunderstood the question, so the parts it did return aren't trustworthy either.

The call is deliberately hard to trigger repeatedly: the answer is remembered for 30 minutes, two browser tabs asking the same thing share a single call, and there is a three-second floor between calls. That matters because the underlying data updates several times a second — sending anything that changes that often (like the current command, or the agent's status) would mean paying for a new call every tick, which is why the request carries only the id and the task.

Without an API key, or if the call fails, agents asked for *exactly* the same thing are grouped together and their task is used as the goal. Coarser, but never invented.

### How are planet positions computed?

Orbital layout is a pure function, `layoutOrbitalLanes()`, in `src/scene/layout.ts`. Projects are sorted by `name` with `localeCompare`, then distributed evenly around rings: at most 8 planets per ring, base radius 8 units, 6 units spacing between rings, all at Y = 0. Positions depend only on **project name** and **how many projects exist** — not on agent `status`, `lastActivityMs`, or tier. Automated tests in `src/scene/__tests__/layout.test.ts` lock this behavior in.

### How are the planets rendered?

Every planet is generated entirely with math — there are no image textures. The surfaces are built from layered noise functions (algorithms that produce natural-looking randomness) running on your graphics card. Each planet type uses these functions differently: gas giants get banded storms, rocky planets get continents, volcanic planets get lava rifts, and so on.

The agents standing on the surface are lit geometry — head, torso, arms and legs, all built from one shared box and posed by rotating the limbs. They take the same sunlight as the terrain and cast real shadows onto it. They used to be pixel-art sprites, which worked as thumbnails but fell apart once the camera came close enough to land: each art pixel covered a dozen screen pixels, and no amount of supersampling adds detail that was never drawn. Boxes have no resolution to run out of.

The ground itself is a patch of the sphere pushed outward by a height field seeded from the project name — the same height field decides where the camera's feet are and where each agent stands, which is why nobody floats above the ground or sinks into it.

### Where does the camera go when I land?

It ends up half a world-unit above the ground, tipped 29 degrees down. That combination is what puts the horizon in the lower third of the frame and the agents in the band above it. On a planet this small those numbers matter: standing much lower squashes all the visible ground into a sliver near the horizon and blows the nearest agents up to half the screen.

The fall itself interpolates in planet-relative terms — the direction rotates around the planet while the distance shrinks geometrically — so it reads as an even descent rather than a rush at one end. The camera also rolls to match the local surface normal on the way down, because the landing site is hashed from the project name and can be anywhere on the sphere, including upside-down relative to the rest of the scene.

### How do agents get their names and appearances?

Agent IDs from the tools are opaque strings like `a3f8c2b1-...`. The app runs each ID through a hash function to deterministically pick a name (from a list of 40 space-themed names), a color gradient, a hair color, a skin tone, and a suit color. The same agent ID always produces the same identity, and collision resolution ensures no two agents on the same project share a name.

### How does it know which message in a transcript is a real request from you?

All three tools write machine-generated messages into the same place as your own — safety-check prompts, command echoes, notes about which file you have open, "this session is being continued from a previous conversation" preambles. They sit in the transcript looking exactly like something you typed, so simply taking the most recent message often surfaces one of those as the agent's goal.

The app keeps a list of the openings that mark a message as machine-written, measured across roughly 120 real Codex sessions and 150 real Claude sessions rather than guessed at. Anything matching is skipped and the app walks back to the last message that reads like a person asking for something. If your latest message is just "continue" or "yes", it uses the instruction before it. It always takes your *latest* real request, not your first — a session you redirected halfway through should show what you redirected it to.

The same logic decides what an agent is *asking* you: the agent's last message, but only when it isn't a tool call and isn't machine-written. Anything that parses as JSON is rejected outright — a question addressed to a person is never JSON.

### Why don't the agents move around when their goals get grouped?

Because grouping is only ever allowed to *read* the arrangement, never change it. Where each agent stands is worked out from its own ID before the goals are known, and the goal banners are then hung over the spots already chosen — a banner sits above the furthest-back member of its party, at the average sideways position of the group.

This matters more than it sounds. The grouping arrives a moment after you land, comes from a cache some of the time, and occasionally falls back to a simpler method. If any of that could move people, the camp would rearrange itself in front of you for reasons you can't see. There is an automated test named "grouping cannot move anyone" whose only job is to keep it that way.

Banners are lifted straight *outward* from the planet's centre rather than "upwards", because on a sphere those are only the same direction if you happen to be standing at the north pole. Landing sites are scattered anywhere on the globe, so anything lifted the naive way drifts off to one side.
