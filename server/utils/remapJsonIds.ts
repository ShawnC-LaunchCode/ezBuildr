export function remapJsonIds<T>(value: T, idMap: Map<string, string>): T {
  if (typeof value === "string") {
    return (idMap.get(value) ?? value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => remapJsonIds(item, idMap)) as T;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const remapped: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      remapped[key] = remapJsonIds(nestedValue, idMap);
    }
    return remapped as T;
  }

  return value;
}
