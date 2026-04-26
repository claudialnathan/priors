/**
 * Minimal YAML frontmatter parser/serializer.
 *
 * v1 supports the strict subset that Priors entries actually use:
 * - top-level map of key: value pairs
 * - scalar values: string (quoted or bare), number, boolean, null
 * - lists of scalars or simple maps
 * - nested maps (one level deep is what we need; more works)
 * - inline `[]` and `{}` for empty collections
 *
 * Anything outside that subset throws a descriptive error. We control the
 * write side, so the parser only has to read what we ourselves emit (plus
 * hand-edits that follow the same conventions).
 */

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlValue[] | { [k: string]: YamlValue };

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface Frontmatter {
  data: { [k: string]: YamlValue };
  body: string;
}

export function parseFrontmatter(text: string): Frontmatter {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    throw new Error("file is missing YAML frontmatter delimited by ---");
  }
  const yamlBlock = m[1] ?? "";
  const body = m[2] ?? "";
  const data = parseYaml(yamlBlock);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("frontmatter must be a YAML map at the top level");
  }
  return { data: data as { [k: string]: YamlValue }, body };
}

export function serializeFrontmatter(
  data: { [k: string]: YamlValue },
  body: string,
): string {
  const yaml = serializeYaml(data).trimEnd();
  const trimmedBody = body.startsWith("\n") ? body.slice(1) : body;
  return `---\n${yaml}\n---\n${trimmedBody}`;
}

interface Cursor {
  lines: string[];
  i: number;
}

export function parseYaml(text: string): YamlValue {
  const lines = text.split(/\r?\n/);
  const filtered = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => !isBlankOrComment(line));
  if (filtered.length === 0) return {};
  const cursor: Cursor = { lines: text.split(/\r?\n/), i: 0 };
  return parseBlock(cursor, 0);
}

function isBlankOrComment(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith("#");
}

function indentOf(line: string): number {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " ") n++;
    else if (line[i] === "\t")
      throw new Error("tabs are not allowed in YAML indentation");
    else break;
  }
  return n;
}

function skipBlanks(c: Cursor): void {
  while (c.i < c.lines.length) {
    const line = c.lines[c.i] ?? "";
    if (isBlankOrComment(line)) c.i++;
    else break;
  }
}

function parseBlock(c: Cursor, baseIndent: number): YamlValue {
  skipBlanks(c);
  if (c.i >= c.lines.length) return {};
  const peek = c.lines[c.i] ?? "";
  const indent = indentOf(peek);
  if (indent < baseIndent) return {};
  const stripped = peek.slice(indent);
  if (stripped.startsWith("- ") || stripped === "-") {
    return parseList(c, indent);
  }
  return parseMap(c, indent);
}

function parseMap(c: Cursor, indent: number): { [k: string]: YamlValue } {
  const out: { [k: string]: YamlValue } = {};
  while (c.i < c.lines.length) {
    skipBlanks(c);
    if (c.i >= c.lines.length) break;
    const raw = c.lines[c.i] ?? "";
    const ind = indentOf(raw);
    if (ind < indent) break;
    if (ind > indent) {
      throw new Error(
        `unexpected indent at line ${c.i + 1}: expected ${indent}, got ${ind}`,
      );
    }
    const stripped = raw.slice(indent);
    const colonIdx = findKeyColon(stripped);
    if (colonIdx < 0) {
      throw new Error(`expected "key: value" at line ${c.i + 1}: ${raw}`);
    }
    const key = stripped.slice(0, colonIdx).trim();
    const after = stripped.slice(colonIdx + 1).trim();
    c.i++;
    if (after.length === 0) {
      const child = parseBlock(c, indent + 2);
      out[key] = child;
    } else if (after === "[]") {
      out[key] = [];
    } else if (after === "{}") {
      out[key] = {};
    } else {
      out[key] = parseScalar(after);
    }
  }
  return out;
}

function parseList(c: Cursor, indent: number): YamlValue[] {
  const out: YamlValue[] = [];
  while (c.i < c.lines.length) {
    skipBlanks(c);
    if (c.i >= c.lines.length) break;
    const raw = c.lines[c.i] ?? "";
    const ind = indentOf(raw);
    if (ind < indent) break;
    if (ind > indent) {
      throw new Error(
        `unexpected indent inside list at line ${c.i + 1}: expected ${indent}, got ${ind}`,
      );
    }
    const stripped = raw.slice(indent);
    if (!stripped.startsWith("- ") && stripped !== "-") break;
    const after = stripped === "-" ? "" : stripped.slice(2);
    if (after.length === 0) {
      c.i++;
      out.push(parseBlock(c, indent + 2));
      continue;
    }
    if (after === "[]") {
      out.push([]);
      c.i++;
      continue;
    }
    if (after === "{}") {
      out.push({});
      c.i++;
      continue;
    }
    const colonIdx = findKeyColon(after);
    if (colonIdx >= 0) {
      const key = after.slice(0, colonIdx).trim();
      const tail = after.slice(colonIdx + 1).trim();
      const itemIndent = indent + 2;
      const itemMap: { [k: string]: YamlValue } = {};
      itemMap[key] =
        tail.length === 0
          ? (c.i++, parseBlock(c, itemIndent + 2))
          : (c.i++, parseScalar(tail));
      while (c.i < c.lines.length) {
        skipBlanks(c);
        if (c.i >= c.lines.length) break;
        const next = c.lines[c.i] ?? "";
        const nind = indentOf(next);
        if (nind !== itemIndent) break;
        const ns = next.slice(nind);
        if (ns.startsWith("- ") || ns === "-") break;
        const ncolon = findKeyColon(ns);
        if (ncolon < 0) break;
        const nkey = ns.slice(0, ncolon).trim();
        const ntail = ns.slice(ncolon + 1).trim();
        c.i++;
        if (ntail.length === 0) {
          itemMap[nkey] = parseBlock(c, itemIndent + 2);
        } else if (ntail === "[]") {
          itemMap[nkey] = [];
        } else {
          itemMap[nkey] = parseScalar(ntail);
        }
      }
      out.push(itemMap);
    } else {
      out.push(parseScalar(after));
      c.i++;
    }
  }
  return out;
}

function findKeyColon(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = s[i + 1];
      if (next === undefined || next === " " || next === "\t") return i;
    }
  }
  return s.endsWith(":") ? s.length - 1 : -1;
}

function parseScalar(raw: string): YamlScalar {
  const trimmed = raw.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return JSON.parse(trimmed) as string;
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function serializeYaml(
  value: YamlValue,
  indent = 0,
): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return formatString(value);
  if (Array.isArray(value)) return serializeList(value, indent);
  if (typeof value === "object") return serializeMap(value, indent);
  throw new Error(`unsupported YAML value: ${typeof value}`);
}

function serializeMap(
  obj: { [k: string]: YamlValue },
  indent: number,
): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  const pad = " ".repeat(indent);
  const parts: string[] = [];
  for (const key of keys) {
    const v = obj[key]!;
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        parts.push(`${pad}${key}: []`);
      } else {
        parts.push(`${pad}${key}:`);
        parts.push(serializeListBody(v, indent + 2));
      }
    } else if (v !== null && typeof v === "object") {
      const keysInner = Object.keys(v);
      if (keysInner.length === 0) parts.push(`${pad}${key}: {}`);
      else {
        parts.push(`${pad}${key}:`);
        parts.push(serializeMap(v, indent + 2));
      }
    } else {
      parts.push(`${pad}${key}: ${serializeYaml(v, 0)}`);
    }
  }
  return parts.join("\n");
}

function serializeListBody(items: YamlValue[], indent: number): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const item of items) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const keys = Object.keys(item);
      if (keys.length === 0) {
        lines.push(`${pad}- {}`);
      } else {
        const first = keys[0]!;
        const rest = keys.slice(1);
        const firstVal = (item as { [k: string]: YamlValue })[first]!;
        lines.push(`${pad}- ${first}: ${serializeYaml(firstVal, 0)}`);
        for (const k of rest) {
          const vv = (item as { [k: string]: YamlValue })[k]!;
          lines.push(`${pad}  ${k}: ${serializeYaml(vv, 0)}`);
        }
      }
    } else if (Array.isArray(item)) {
      lines.push(`${pad}-`);
      lines.push(serializeListBody(item, indent + 2));
    } else {
      lines.push(`${pad}- ${serializeYaml(item, 0)}`);
    }
  }
  return lines.join("\n");
}

function serializeList(items: YamlValue[], indent: number): string {
  if (items.length === 0) return "[]";
  return serializeListBody(items, indent);
}

function formatString(s: string): string {
  if (s.length === 0) return '""';
  if (
    /^[A-Za-z][A-Za-z0-9 _\-./@:+]*$/.test(s) &&
    !/^(null|true|false|~)$/i.test(s) &&
    !/^-?\d/.test(s)
  ) {
    return s;
  }
  return JSON.stringify(s);
}
