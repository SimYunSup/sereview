import type { BundledFile, MatchedRule } from './types.ts';

/** Bump when rule ids / semantics change so packets are traceable to a rulebook. */
export const RULEBOOK_VERSION = 'sereview-rulebook-3 (2026-07-14)';

/** Pre-computed view of a diff used by rule matchers (added lines only). */
interface RuleContext {
  /** All added-line contents joined by "\n". */
  addedText: string;
  paths: string[];
  languages: Set<string>;
}

/** A rulebook entry: the public {@link MatchedRule} plus a deterministic matcher. */
export interface RuleDefinition extends MatchedRule {
  /** Heuristic over added code — a HINT for the reviewer, never a verdict. */
  matches(ctx: RuleContext): boolean;
}

function buildContext(files: BundledFile[]): RuleContext {
  const addedParts: string[] = [];
  const paths: string[] = [];
  const languages = new Set<string>();
  for (const bf of files) {
    paths.push(bf.file.path);
    if (bf.file.language) languages.add(bf.file.language);
    for (const hunk of bf.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') addedParts.push(line.content);
      }
    }
  }
  return { addedText: addedParts.join('\n'), paths, languages };
}

/**
 * The starter rulebook: a security-leaning set of nine heuristics. Each `matches`
 * is intentionally conservative — it flags *candidates* so the host Claude Code
 * session knows where to look; it never decides that a finding is real.
 */
export const RULEBOOK: RuleDefinition[] = [
  {
    id: 'sql-injection',
    category: 'security',
    severityHint: 'high',
    title: 'SQL injection via string-built query',
    guidance:
      'A SQL statement appears to be assembled with string concatenation or interpolation. Check whether any interpolated value can originate from user input; if so, require parameterized queries / prepared statements instead of building SQL by hand.',
    appliesTo: ['backend', 'database', 'javascript', 'typescript', 'python', 'java', 'go', 'php', 'ruby'],
    matches: (c) =>
      /\b(select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from)\b/i.test(c.addedText) &&
      /(\$\{|['"]\s*\+|\+\s*['"]|%s|f["'])/.test(c.addedText),
  },
  {
    id: 'xss',
    category: 'security',
    severityHint: 'high',
    title: 'Possible XSS via an unescaped HTML sink',
    guidance:
      'Data may reach an HTML sink (innerHTML, dangerouslySetInnerHTML, document.write, v-html, insertAdjacentHTML, Astro set:html) or eval. Confirm the value is escaped/sanitized, or rendered as text rather than HTML.',
    appliesTo: ['frontend', 'javascript', 'typescript', 'html', 'vue', 'svelte', 'astro'],
    matches: (c) =>
      /\b(innerhtml|outerhtml|dangerouslysetinnerhtml|insertadjacenthtml|document\.write|v-html)\b|\bset:html\b|\beval\s*\(/i.test(
        c.addedText,
      ),
  },
  {
    id: 'ssrf',
    category: 'security',
    severityHint: 'high',
    title: 'Possible SSRF via a request to a non-constant URL',
    guidance:
      'An outbound HTTP request appears to target a URL derived from input or a variable. Validate/allowlist the destination host and block internal/metadata addresses to prevent server-side request forgery.',
    appliesTo: ['backend', 'javascript', 'typescript', 'python', 'go', 'java'],
    matches: (c) =>
      /\b(fetch|axios|got|undici|node-fetch|requests\.(get|post|put|delete)|urllib|http\.(get|request)|https\.(get|request)|httpclient|resttemplate|webclient)\b/i.test(
        c.addedText,
      ) &&
      /\$\{|\+\s*\w|req\.(query|params|body)|request\.(query|params|body)|process\.env|\burl\s*[=:]|\bhost\s*[=:]/i.test(
        c.addedText,
      ),
  },
  {
    id: 'path-traversal',
    category: 'security',
    severityHint: 'high',
    title: 'Possible path traversal in filesystem access',
    guidance:
      'A filesystem path appears to be built from input. Normalize and confine the resolved path to an allowed base directory before reading/writing so "../" sequences cannot escape it.',
    appliesTo: ['backend', 'javascript', 'typescript', 'python', 'go', 'java', 'php'],
    matches: (c) =>
      /\b(readfile|readfilesync|writefile|writefilesync|createreadstream|createwritestream|fs\.open|sendfile|path\.join|path\.resolve|os\.path\.join)\b/i.test(
        c.addedText,
      ) &&
      /\$\{|\+\s*\w|req\.(query|params|body)|request\.|params\[|\bfilename\b|\bfilepath\b/i.test(c.addedText),
  },
  {
    id: 'secret-exposure',
    category: 'security',
    severityHint: 'critical',
    title: 'Hardcoded secret or credential',
    guidance:
      'An added line looks like a hardcoded secret (API key, token, password, private key). Move it to a secret store / environment variable, and rotate the value if it is real and was committed.',
    appliesTo: ['any'],
    matches: (c) =>
      /(sk-[a-z0-9]{16,}|ghp_[a-z0-9]{20,}|gho_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9a-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(
        c.addedText,
      ) ||
      /(api[_-]?key|secret|password|passwd|pwd|token|client[_-]?secret|private[_-]?key|access[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i.test(
        c.addedText,
      ),
  },
  {
    id: 'authz',
    category: 'security',
    severityHint: 'high',
    title: 'Authorization / access-control change',
    guidance:
      'Added code touches authentication or authorization (roles, permissions, ownership checks). Verify the check cannot be bypassed, fails closed, and is applied to every privileged path.',
    appliesTo: ['backend', 'security'],
    matches: (c) =>
      /\b(isadmin|is_admin|authorize|authorization|hasrole|has_role|haspermission|has_permission|checkpermission|can_?access|requireauth|require_auth|preauthorize|ensureloggedin|currentuser|current_user|isauthenticated|access[_-]?control|\bacl\b)\b/i.test(
        c.addedText,
      ) || /\breq\.user\b/i.test(c.addedText),
  },
  {
    id: 'npe',
    category: 'correctness',
    severityHint: 'medium',
    title: 'Possible null / undefined dereference',
    guidance:
      'A value that can be null/undefined may be used without a guard (result of find/match/JSON.parse/getElementById, a non-null assertion, or a nullable field access). Confirm it is checked before use.',
    appliesTo: ['javascript', 'typescript', 'java', 'kotlin', 'csharp', 'go'],
    matches: (c) =>
      /\.find\(|\.match\(|JSON\.parse\(|getElementById\(|querySelector\(|!\.\w|\bNullPointerException\b|\boptional\.get\(/i.test(
        c.addedText,
      ),
  },
  {
    id: 'race',
    category: 'concurrency',
    severityHint: 'medium',
    title: 'Possible race condition / unsynchronized shared state',
    guidance:
      'Concurrent execution touches shared state without obvious synchronization (goroutines, threads, Promise.all with side effects, locks, mutexes). Check for interleavings that corrupt state or double-process work.',
    appliesTo: ['concurrency', 'go', 'java', 'kotlin', 'javascript', 'typescript', 'python'],
    matches: (c) =>
      /\bgo\s+func\b|\bgoroutine\b|sync\.(mutex|waitgroup|rwmutex)|Promise\.all\b|\bnew\s+Thread\b|threading\.|asyncio\.gather|\.lock\(\)|\bmutex\b|\bsemaphore\b|\bvolatile\b|\bsynchronized\b|setinterval\(/i.test(
        c.addedText,
      ),
  },
  {
    id: 'n-plus-1',
    category: 'performance',
    severityHint: 'medium',
    title: 'Possible N+1 query (DB call inside a loop)',
    guidance:
      'A database/ORM call appears inside a loop, which can issue one query per iteration. Consider batching (IN query, join, dataloader) or moving the fetch outside the loop.',
    appliesTo: ['performance', 'database', 'backend'],
    matches: (c) =>
      /\bfor\b|\bforeach\b|\.foreach\(|\.map\(|\bwhile\b/i.test(c.addedText) &&
      /prisma\.|\.findone|\.findmany|\.findunique|\.findall|repository\.|\.query\(|await\s+db\.|\.aggregate\(|knex\(|sequelize\.|\bselect\s+.+\s+from\b|entitymanager|session\.query/i.test(
        c.addedText,
      ),
  },
  {
    id: 'github-actions-security',
    category: 'security',
    severityHint: 'high',
    title: 'GitHub Actions security issue',
    guidance:
      'Check for: (1) pull_request_target with checkout of PR head — runs untrusted code with write permissions; (2) secrets interpolated in run: blocks (echo ${{ secrets.X }}) — must be passed via env: instead; (3) user-controlled expressions (${{ github.event.issue.title }}) used directly in run: — enables script injection; (4) third-party actions pinned to a mutable tag rather than a full commit SHA — tags can be hijacked.',
    appliesTo: ['ci', 'yaml'],
    matches: (c) =>
      c.paths.some((p) => /\.github\/workflows\//i.test(p)) &&
      (/pull_request_target/i.test(c.addedText) ||
        /\$\{\{\s*secrets\.[^}]+\}\}/i.test(c.addedText) ||
        /\$\{\{\s*github\.event\.(issue|pull_request|comment|discussion)\.(title|body|name)\s*\}\}/i.test(
          c.addedText,
        ) ||
        /uses:\s+(?!actions\/)[\w/-]+@(?![\da-f]{40})[^#\s\n]+/i.test(c.addedText)),
  },
];

function toMatchedRule(r: RuleDefinition): MatchedRule {
  return {
    id: r.id,
    category: r.category,
    severityHint: r.severityHint,
    title: r.title,
    guidance: r.guidance,
    appliesTo: r.appliesTo,
  };
}

/**
 * Run the rulebook over a set of changed files and return the matched rules (as
 * plain {@link MatchedRule}s, without the matcher fn) in rulebook order. Pure.
 */
export function matchRules(files: BundledFile[], rulebook: RuleDefinition[] = RULEBOOK): MatchedRule[] {
  // Match each file independently so a matcher that needs several signals (e.g.
  // n+1 = a loop AND a query) only fires when they co-occur in the SAME file —
  // not when a loop in one bundled file and a query in another are joined into
  // one text. A rule is attached if it matches any single file. Rulebook order
  // and determinism are preserved.
  const contexts = files.map((bf) => buildContext([bf]));
  return rulebook.filter((rule) => contexts.some((ctx) => rule.matches(ctx))).map(toMatchedRule);
}
