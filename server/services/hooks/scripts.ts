/**
 * Status hook. Filenames use pid + $RANDOM because BSD date on macOS has no %N.
 * No python3: the script stores the raw payload.
 */
export const STATUS_HOOK_SCRIPT_CONTENT = `#!/bin/bash
INPUT=$(cat)
EVENTS_DIR="\${HOME}/.builders-space/events"
mkdir -p "$EVENTS_DIR"
chmod 700 "$EVENTS_DIR" 2>/dev/null || true
umask 077
NAME="status-$(date +%s)-$$-\${RANDOM}-\${RANDOM}.json"
printf '%s\\n' "$INPUT" > "\${EVENTS_DIR}/\${NAME}" || exit 0
exit 0
`;

/**
 * Fire hook. Detects an error status with grep so the hook does not need python3.
 */
export const FIRE_HOOK_SCRIPT_CONTENT = `#!/bin/bash
INPUT=$(cat)
if printf '%s' "$INPUT" | grep -qE '"status"[[:space:]]*:[[:space:]]*"error"|"reason"[[:space:]]*:[[:space:]]*"error"'; then
  EVENTS_DIR="\${HOME}/.builders-space/events"
  mkdir -p "$EVENTS_DIR"
  chmod 700 "$EVENTS_DIR" 2>/dev/null || true
  umask 077
  NAME="fire-$(date +%s)-$$-\${RANDOM}-\${RANDOM}.json"
  printf '%s\\n' "$INPUT" > "\${EVENTS_DIR}/\${NAME}" || exit 0
fi
exit 0
`;

export const STATUS_HOOK_COMMAND = '~/.builders-space/hooks/status-hook.sh';
export const FIRE_HOOK_COMMAND = '~/.builders-space/hooks/fire-hook.sh';
