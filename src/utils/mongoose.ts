/**
 * Shared toJSON transform for Mongoose models.
 * Strips _id / __v and any sensitive fields, renames _id → id.
 *
 * Used because TypeScript's delete operator complains about non-optional
 * properties in the default Document.toJSON ret object.
 */
export function cleanToJSON(ret: unknown, extraDelete: string[] = []): Record<string, unknown> {
  const src = ret as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === '_id') {
      next.id = v;
    } else if (k === '__v' || extraDelete.includes(k)) {
      continue;
    } else {
      next[k] = v;
    }
  }
  return next;
}
