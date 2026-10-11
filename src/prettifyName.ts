const ACRONYMS = new Set([
  'ai',
  'api',
  'ci',
  'cli',
  'css',
  'db',
  'html',
  'http',
  'ide',
  'io',
  'js',
  'json',
  'llm',
  'ml',
  'qa',
  'sdk',
  'sql',
  'ts',
  'ui',
  'url',
]);

/** Title-case a folder slug. Short tokens like api and ml stay uppercase. */
export function prettifyName(raw: string): string {
  return raw
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
