/** Drop cache entries the latest directory scan did not open. */
export function retainCache<T>(cache: Map<string, T>, seen: ReadonlySet<string>): void {
  for (const key of cache.keys()) {
    if (!seen.has(key)) cache.delete(key);
  }
}
