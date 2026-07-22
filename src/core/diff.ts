import type { BundledFile, ChangedFile, DiffHunk, DiffLine, FileStatus } from './types.ts';

/** Extension → language id. Best-effort; unknown extensions yield `undefined`. */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  kt: 'kotlin', kts: 'kotlin', cs: 'csharp', php: 'php', swift: 'swift', scala: 'scala',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  m: 'objective-c', mm: 'objective-c',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
  html: 'html', css: 'css', scss: 'scss', less: 'less', vue: 'vue', svelte: 'svelte', astro: 'astro',
  ftl: 'freemarker', ftlh: 'freemarker', ftlx: 'freemarker',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', md: 'markdown',
};

/** The set of language ids {@link detectLanguage} can produce. */
export const KNOWN_LANGUAGES: ReadonlySet<string> = new Set(Object.values(LANGUAGE_BY_EXT));

/** Derive a language id from a path's extension (dotfiles yield `undefined`). */
export function detectLanguage(path: string): string | undefined {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return undefined;
  return LANGUAGE_BY_EXT[base.slice(dot + 1).toLowerCase()];
}

/**
 * Decode a git C-quoted path body (quotes already stripped): octal byte
 * escapes (`\ooo`, 1–3 octal digits — each is a raw UTF-8 byte, not a code
 * point) and the standard backslash escapes (`\\ \" \t \n \r \b \f \a \v`),
 * then decode the resulting byte sequence as UTF-8. Unescaped characters are
 * ASCII (git only C-quotes when it needs to) and pass through as-is.
 */
function decodeCQuoted(body: string): string {
  const SIMPLE_ESCAPES: Record<string, number> = {
    '\\': 0x5c, '"': 0x22, t: 0x09, n: 0x0a, r: 0x0d,
    b: 0x08, f: 0x0c, a: 0x07, v: 0x0b,
  };
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    const next = body[i + 1];
    if (next !== undefined && next in SIMPLE_ESCAPES) {
      bytes.push(SIMPLE_ESCAPES[next]!);
      i++;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8) & 0xff);
      i += octal[0].length;
      continue;
    }
    bytes.push(0x5c); // unrecognized escape: keep the backslash literally
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Strip a surrounding pair of double quotes and decode git's C-quoting (see
 * {@link decodeCQuoted}), used for paths with specials (git's default
 * `core.quotepath=true`). Unquoted paths pass through untouched — a
 * backslash there is literal (e.g. a Windows-style name), not an escape.
 */
function unquote(p: string): string {
  return p.length >= 2 && p.startsWith('"') && p.endsWith('"')
    ? decodeCQuoted(p.slice(1, -1))
    : p;
}

/** Strip the leading `a/` or `b/` diff prefix (leaving `/dev/null` untouched). */
function stripPrefix(p: string): string {
  if (p === '/dev/null') return p;
  return p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p;
}

/** Best-effort path extraction from a `diff --git a/<old> b/<new>` header line. */
function parseGitHeaderPaths(header: string): { old?: string; new?: string } {
  const rest = header.slice('diff --git '.length);
  if (rest.startsWith('"')) {
    const m = /^"(.*?)" "(.*?)"$/.exec(rest);
    if (m) return { old: stripPrefix(decodeCQuoted(m[1]!)), new: stripPrefix(decodeCQuoted(m[2]!)) };
  }
  const parts = rest.split(' ');
  if (parts.length === 2) return { old: stripPrefix(parts[0]!), new: stripPrefix(parts[1]!) };
  // Paths with spaces and no rename (old === new): pick the ` b/` split where the
  // two halves are identical. (Renames with spaces are C-quoted, handled above;
  // `lastIndexOf(' b/')` would mis-split a path that itself contains ` b/`.)
  if (rest.startsWith('a/')) {
    for (let idx = rest.indexOf(' b/'); idx > 0; idx = rest.indexOf(' b/', idx + 1)) {
      if (rest.slice(2, idx) === rest.slice(idx + 3)) {
        return { old: rest.slice(2, idx), new: rest.slice(idx + 3) };
      }
    }
  }
  return {};
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified diff (e.g. `gh pr diff --patch` / `git diff` output) into one
 * {@link BundledFile} per touched file, with fully line-numbered hunks. Pure and
 * deterministic; tolerant of CRLF and of rename/binary/added/deleted sections.
 */
export function parseDiff(diff: string): BundledFile[] {
  const lines = diff.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const n = lines.length;
  const files: BundledFile[] = [];
  let i = 0;

  while (i < n) {
    if (!lines[i]!.startsWith('diff --git ')) {
      i++;
      continue;
    }
    const header = lines[i]!;
    i++;

    let status: FileStatus = 'modified';
    let binary = false;
    let oldPath: string | undefined;
    let newPath: string | undefined;
    let renameFrom: string | undefined;
    let renameTo: string | undefined;
    let copied = false;
    let additions = 0;
    let deletions = 0;
    const hunks: DiffHunk[] = [];

    // Extended header + ---/+++ lines, up to the first hunk or next file.
    while (i < n) {
      const l = lines[i]!;
      if (l.startsWith('diff --git ') || l.startsWith('@@ ')) break;
      if (l.startsWith('new file mode')) status = 'added';
      else if (l.startsWith('deleted file mode')) status = 'deleted';
      else if (l.startsWith('rename from ')) { renameFrom = l.slice(12); status = 'renamed'; }
      else if (l.startsWith('rename to ')) { renameTo = l.slice(10); status = 'renamed'; }
      else if (l.startsWith('copy from ')) { renameFrom = l.slice(10); copied = true; }
      else if (l.startsWith('copy to ')) { renameTo = l.slice(8); copied = true; }
      else if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) binary = true;
      else if (l.startsWith('--- ')) oldPath = stripPrefix(unquote(l.slice(4)));
      else if (l.startsWith('+++ ')) newPath = stripPrefix(unquote(l.slice(4)));
      i++;
    }

    // Hunks.
    while (i < n && lines[i]!.startsWith('@@ ')) {
      const hunkHeader = lines[i]!;
      i++;
      const m = HUNK_RE.exec(hunkHeader);
      if (!m) continue;
      const oldStart = Number(m[1]);
      const newStart = Number(m[3]);
      const hunkLines: DiffLine[] = [];
      let oldLine = oldStart;
      let newLine = newStart;
      // Lines still owed to this hunk per its header counts. Used to recognize an
      // empty context line: some tools strip the leading space from a blank
      // context line, leaving "", which must not be mistaken for the hunk's end.
      let oldRemaining = m[2] === undefined ? 1 : Number(m[2]);
      let newRemaining = m[4] === undefined ? 1 : Number(m[4]);
      while (i < n) {
        const hl = lines[i]!;
        if (hl.startsWith('@@ ') || hl.startsWith('diff --git ')) break;
        const marker = hl[0];
        if (marker === '\\') {
          i++; // "\ No newline at end of file"
          continue;
        }
        if (marker === '+') {
          hunkLines.push({ type: 'add', newLine, content: hl.slice(1) });
          newLine++;
          newRemaining--;
          additions++;
        } else if (marker === '-') {
          hunkLines.push({ type: 'del', oldLine, content: hl.slice(1) });
          oldLine++;
          oldRemaining--;
          deletions++;
        } else if (marker === ' ') {
          hunkLines.push({ type: 'context', newLine, oldLine, content: hl.slice(1) });
          newLine++;
          oldLine++;
          oldRemaining--;
          newRemaining--;
        } else if (hl === '' && (oldRemaining > 0 || newRemaining > 0)) {
          // A whitespace-stripped empty context line, still inside the hunk.
          hunkLines.push({ type: 'context', newLine, oldLine, content: '' });
          newLine++;
          oldLine++;
          oldRemaining--;
          newRemaining--;
        } else {
          break; // blank/unexpected line ends the hunk
        }
        i++;
      }
      hunks.push({
        header: hunkHeader,
        oldStart,
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart,
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        lines: hunkLines,
      });
    }

    const fromHeader = parseGitHeaderPaths(header);
    const liveOld = oldPath && oldPath !== '/dev/null' ? oldPath : undefined;
    const liveNew = newPath && newPath !== '/dev/null' ? newPath : undefined;

    let path: string;
    let previousPath: string | undefined;
    if (status === 'deleted') {
      path = liveOld ?? renameFrom ?? fromHeader.old ?? fromHeader.new ?? 'unknown';
    } else {
      path = liveNew ?? renameTo ?? fromHeader.new ?? fromHeader.old ?? 'unknown';
    }

    if (status === 'renamed') {
      previousPath = renameFrom ?? fromHeader.old;
    } else if (copied) {
      // A copy keeps its modified/added status but still has a source path.
      previousPath = renameFrom ?? fromHeader.old;
    } else if (liveOld && liveNew && liveOld !== liveNew) {
      // Rename detected only via differing ---/+++ paths (no rename header).
      status = 'renamed';
      previousPath = liveOld;
    }

    const language = detectLanguage(path);
    const file: ChangedFile = {
      path,
      ...(previousPath && previousPath !== path ? { previousPath } : {}),
      status,
      ...(language ? { language } : {}),
      additions,
      deletions,
      binary,
    };
    files.push({ file, hunks });
  }

  return files;
}
