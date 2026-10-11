# Tests that need a person on macOS

Automated coverage lives in Vitest and Playwright. CI runs `npm run test:coverage` and `npm run test:e2e` on Linux. Those suites cover parsers, watcher status, hook setup, open-session commands, auth, the status HUD, sidebar dots, agent cards, the hooks panel, and a fixture-backed dashboard smoke test.

This file is only the checks that still need a person at a Mac. Linux CI cannot drive `open` or Terminal through `osascript`, or judge the 3D scene by eye.

## Launch from an agent card

The server does not look for Claude.app or Codex.app. Cursor is `open -a Cursor`. Claude Code and Codex are either `osascript` telling Terminal to resume, or `open -a Terminal`.

1. Click a Cursor card whose project path exists. Cursor should open that folder. The toast should say it opened in Cursor.
2. Click a Claude card that is not `working` and has a session id. Terminal should run `claude --resume` for that id. The toast should say the session is resuming.
3. Click a Claude card that is `working`, or that has no session id. Terminal should open the project folder. The toast should say the project directory opened.
4. Repeat steps 2 and 3 for Codex (`codex resume`).
5. Click a card while the server is stopped. The toast should say it could not connect.

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
