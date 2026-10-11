import { z } from 'zod';

export function timestampMs(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.length === 0) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(record: object | undefined, ...keys: string[]): string {
  if (!isRecord(record)) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

const claudeBlockSchema = z
  .object({
    type: z.string(),
    name: z.string().optional(),
    text: z.string().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type ClaudeBlock = z.infer<typeof claudeBlockSchema>;

const claudeLineSchema = z
  .object({
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    slug: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    message: z
      .object({
        content: z.union([z.string(), z.array(z.unknown())]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ClaudeLine = z.infer<typeof claudeLineSchema>;

export function parseClaudeLine(value: unknown): ClaudeLine | null {
  const parsed = claudeLineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function claudeBlocks(content: unknown): ClaudeBlock[] {
  if (!Array.isArray(content)) return [];
  const blocks: ClaudeBlock[] = [];
  for (const item of content) {
    const parsed = claudeBlockSchema.safeParse(item);
    if (parsed.success) blocks.push(parsed.data);
  }
  return blocks;
}

const cursorLineSchema = z
  .object({
    role: z.string().optional(),
    cwd: z.string().optional(),
    workspace_roots: z.array(z.unknown()).optional(),
    message: z.unknown().optional(),
  })
  .passthrough();

export type CursorLine = z.infer<typeof cursorLineSchema>;

const cursorMessageSchema = z.object({
  content: z.union([z.string(), z.array(z.unknown())]),
});

const cursorTextBlockSchema = z.object({ type: z.literal('text'), text: z.string() }).passthrough();

export function parseCursorLine(value: unknown): CursorLine | null {
  const parsed = cursorLineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function cursorMessageText(message: unknown): string | undefined {
  const parsed = cursorMessageSchema.safeParse(message);
  if (!parsed.success) return undefined;
  const content = parsed.data.content;
  if (typeof content === 'string') return content;
  for (const block of content) {
    const text = cursorTextBlockSchema.safeParse(block);
    if (text.success) return text.data.text;
  }
  return undefined;
}

export function cursorCwd(entry: CursorLine): string | undefined {
  if (typeof entry.cwd === 'string' && entry.cwd.startsWith('/')) return entry.cwd;
  const root = entry.workspace_roots?.[0];
  if (typeof root === 'string' && root.startsWith('/')) return root;
  return undefined;
}

const codexLineSchema = z
  .object({
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    payload: z.unknown().optional(),
  })
  .passthrough();

export type CodexLine = z.infer<typeof codexLineSchema>;

const codexMetaSchema = z
  .object({
    id: z.string().optional(),
    cwd: z.string().optional(),
  })
  .passthrough();

const codexUserSchema = z
  .object({
    type: z.literal('user_message'),
    message: z.string(),
  })
  .passthrough();

const codexCallSchema = z
  .object({
    type: z.literal('function_call'),
    name: z.string(),
    arguments: z.string().optional(),
  })
  .passthrough();

export const codexArgsSchema = z
  .object({
    cmd: z.string().optional(),
    command: z.string().optional(),
    path: z.string().optional(),
    file_path: z.string().optional(),
    file: z.string().optional(),
  })
  .passthrough();

export type CodexArgs = z.infer<typeof codexArgsSchema>;

export function parseCodexLine(value: unknown): CodexLine | null {
  const parsed = codexLineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseCodexMetaPayload(payload: unknown): { id?: string; cwd?: string } | null {
  const parsed = codexMetaSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function parseCodexUserPayload(payload: unknown): { message: string } | null {
  const parsed = codexUserSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function parseCodexCallPayload(
  payload: unknown,
): { name: string; arguments?: string } | null {
  const parsed = codexCallSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

const indexLineSchema = z
  .object({
    id: z.string().min(1),
    thread_name: z.string().min(1),
  })
  .passthrough();

export function parseIndexLine(value: unknown): { id: string; thread_name: string } | null {
  const parsed = indexLineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const hookEventSchema = z
  .object({
    tool: z.unknown().optional(),
    source: z.unknown().optional(),
    cursor_version: z.unknown().optional(),
    workspace_roots: z.array(z.unknown()).optional(),
    transcript_path: z.unknown().optional(),
    hook_event_name: z.unknown().optional(),
    session_id: z.unknown().optional(),
    sessionId: z.unknown().optional(),
    conversation_id: z.unknown().optional(),
    cwd: z.unknown().optional(),
    working_directory: z.unknown().optional(),
    error_message: z.unknown().optional(),
    reason: z.unknown().optional(),
    status: z.unknown().optional(),
    event: z.unknown().optional(),
    tool_name: z.unknown().optional(),
    tool_input: z.unknown().optional(),
    final_status: z.unknown().optional(),
  })
  .passthrough();

export type HookEvent = z.infer<typeof hookEventSchema>;

export function parseHookEvent(value: unknown): HookEvent | null {
  const parsed = hookEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function hookString(event: HookEvent, ...keys: (keyof HookEvent)[]): string {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}
