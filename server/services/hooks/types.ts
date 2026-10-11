export type ToolName = 'claude' | 'cursor' | 'codex';
export type ToolStatus = 'configured' | 'available' | 'not_installed';
export type EnableResult = 'ok' | 'manual' | 'not_installed' | 'error';

export interface HookStatus {
  claude: ToolStatus;
  cursor: ToolStatus;
  codex: ToolStatus;
}

export interface EnableToolResult {
  status: EnableResult;
  snippet?: string;
  error?: string;
}

export interface EnableResultMap {
  claude: EnableToolResult;
  cursor: EnableToolResult;
  codex: EnableToolResult;
}

export interface HookManifest {
  createdFiles: string[];
  codexFeatureFlagAdded: boolean;
}

export interface ToolHookAdapter {
  name: ToolName;
  status(): ToolStatus;
  enable(manifest: HookManifest): EnableToolResult;
  disable(manifest: HookManifest): string;
}
