# Security

Builders Space is a local dashboard. The server binds to loopback, checks the page origin, and requires a per-launch token. Please still report anything that lets another page, user, or machine read session logs, change hook config, or start a process.

## Reporting

Use GitHub private vulnerability reporting:

https://github.com/swathidbhat/builders-space/security/advisories/new

Do not open a public issue for a vulnerability. Include what you ran, what you expected, and the smallest request or file that shows the problem. A macOS note matters for `open` and `osascript`; everything else can be shown on Linux.

There is no separate security email.
