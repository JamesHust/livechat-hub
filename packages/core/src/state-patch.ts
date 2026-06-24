import type { JsonPatchOperation } from '@livechat-hub/transport';

/**
 * Apply a minimal subset of JSON Patch (RFC 6902) used by STATE_DELTA events:
 * `add`, `replace` and `remove`. Paths are JSON Pointers (`/a/b/0`). Returns a
 * new object; unsupported ops are ignored to stay forward-compatible.
 */
export function applyJsonPatch(
  base: Record<string, unknown>,
  ops: JsonPatchOperation[],
): Record<string, unknown> {
  let next: Record<string, unknown> = structuredCloneSafe(base);
  for (const op of ops) {
    const segments = op.path.split('/').filter(Boolean).map(decodePointer);
    if (segments.length === 0) {
      if (op.op === 'replace' || op.op === 'add') {
        next = (op.value as Record<string, unknown>) ?? {};
      }
      continue;
    }
    if (op.op === 'add' || op.op === 'replace') {
      setAtPath(next, segments, op.value);
    } else if (op.op === 'remove') {
      removeAtPath(next, segments);
    }
  }
  return next;
}

function setAtPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let node: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]!] = value;
}

function removeAtPath(root: Record<string, unknown>, segments: string[]): void {
  let node: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    if (typeof node[key] !== 'object' || node[key] === null) return;
    node = node[key] as Record<string, unknown>;
  }
  delete node[segments[segments.length - 1]!];
}

function decodePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
