export function isOurHook(command?: string): boolean {
  return Boolean(command?.includes('fire-hook.sh') || command?.includes('status-hook.sh'));
}

export function fileHasOurHook(content: string): boolean {
  return content.includes('status-hook.sh') || content.includes('fire-hook.sh');
}
