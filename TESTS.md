# Tests that need a person on macOS

Automated coverage lives in Vitest and Playwright. CI runs `npm run test:coverage` and `npm run test:e2e` on Linux. Those suites cover parsers, watcher status, hook setup, open-session commands, auth, the status HUD, sidebar dots, agent cards, the hooks panel, and a fixture-backed dashboard smoke test.

This file is only the checks that still need a person at a Mac. Linux CI cannot launch the Claude, Codex, or Cursor desktop apps, drive Terminal through `osascript`, or judge the 3D scene by eye.

## Desktop launch

1. With Claude.app installed, click a Claude agent card. The Claude app should open, and the toast should say it opened Claude.
2. Quit and move Claude.app aside, restart the server, and click a Claude card that is not `working` and has a session id. Terminal should run `claude --resume` for that id. The toast should say the session is resuming.
3. Repeat for Codex.app and `codex resume`.
4. Click a Cursor card. Cursor should open that project. The toast should say it opened in Cursor.
5. Click a card while the server is stopped. The toast should say it could not connect.

Detection of `/Applications/Claude.app` and `/Applications/Codex.app` runs once at startup. Install an app after the server is up and the click still uses the Terminal fallback until restart.

## Live process detection

1. Start a `claude` or `codex` process whose working directory is a project that already has a session file.
2. Leave the session idle for more than 10 minutes. The agent should show as needing you while the process is alive, and as working again after new transcript output.
3. Stop the process. Within an hour of the last transcript write the agent should show as needing you; after an hour, as done.

`ps` and `lsof` are how the server sees a running CLI. That path is macOS-specific and is not asserted in CI.

## Scene, by eye

1. Error beats waiting, waiting beats working, working beats done: sidebar dot, planet label (`error` / `needs you`), and ring treatment should agree. Error rings are several fast red pulses. Waiting is one slow amber ring. Working and done have no rings. Done planets are dimmer.
2. Press Escape, click empty space, and click another planet. The panel and camera should follow. Orbit is disabled while the camera is moving and works again after it settles.
3. Open a project twice. The pixel surface (terrain, stars) should match. Done agents stay off the surface. Error sprites sit in front of waiting sprites, which sit in front of working sprites.
4. With several planets, positions should stay put when only agent status changes, sit in name order, and use another ring after eight planets.

Frame rate, shader uniforms, and tone mapping are not asserted in CI. Watch a space view with several planets if you are changing the renderer.
