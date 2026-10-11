import { z } from 'zod';

const commandHook = z
  .object({
    type: z.string().optional(),
    command: z.string().optional(),
  })
  .passthrough();

const hookGroup = z
  .object({
    matcher: z.string().optional(),
    hooks: z.array(commandHook).optional(),
  })
  .passthrough();

export const claudeSettingsSchema = z
  .object({
    hooks: z.record(z.string(), z.array(hookGroup)).optional(),
  })
  .passthrough();

export const cursorConfigSchema = z
  .object({
    version: z.number().optional(),
    hooks: z
      .record(z.string(), z.array(z.object({ command: z.string().optional() }).passthrough()))
      .optional(),
  })
  .passthrough();

export const codexHooksSchema = z
  .object({
    hooks: z.record(z.string(), z.array(hookGroup)).optional(),
  })
  .passthrough();

export function readJsonConfig<T>(content: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('hook config is not JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error('hook config JSON did not match the expected shape');
  return parsed.data;
}
