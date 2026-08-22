import { KNOWN_LANGUAGES } from './diff.ts';
import type { BundledFile, MatchedRule, RuleContext, RuleDefinition } from './types.ts';

export type { RuleContext, RuleDefinition } from './types.ts';

/** Bump when rule ids / semantics change so packets are traceable to a rulebook. */
export const RULEBOOK_VERSION = 'sereview-rulebook-9 (2026-08-22)';

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
 * The starter rulebook: a security-leaning set of twenty heuristics. Each `matches`
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
  {
    id: 'template-injection',
    category: 'security',
    severityHint: 'high',
    title: 'Possible server-side template injection (SSTI)',
    guidance:
      'FreeMarker builtins that reach into the JVM (?new, ?eval, ?api) or classes like freemarker.template.utility.Execute / ObjectConstructor let a template execute arbitrary code or shell commands, and a dynamically built <#include>/<#import> target lets an attacker choose the template to render. Verify template names/bodies never derive from request input and that a restricted TemplateClassResolver is configured; also treat ?no_esc / <#noautoesc> on user-controlled data as an escaping escape-hatch worth double-checking.',
    appliesTo: ['security', 'freemarker', 'java'],
    matches: (c) =>
      /\?\s*new\s*\(/.test(c.addedText) ||
      /\?eval\b/i.test(c.addedText) ||
      /\?api\b/i.test(c.addedText) ||
      /freemarker\.template\.utility\.Execute|ObjectConstructor/.test(c.addedText) ||
      /<#(include|import)[^\n]*\$\{/.test(c.addedText) ||
      /\?no_esc\b|<#noautoesc/i.test(c.addedText),
  },
  {
    id: 'rust-macro-correctness',
    category: 'correctness',
    severityHint: 'medium',
    title: 'Rust macro definition (macro_rules! / procedural macro)',
    guidance:
      'The diff DEFINES a macro, so review the expansion itself — ordinary macro invocations are out of scope. (1) An `$x:expr` fragment interpolated more than once re-runs the caller\'s expression, side effects included; bind it to a `let` once inside the expansion. (2) An exported macro that names items without `$crate::` resolves against the *calling* crate: the defining crate compiles clean and the consumer fails with E0433. (3) A token-tree (`$t:tt`) fragment re-emitted without wrapping parentheses can silently change operator precedence — this applies to `tt` interpolation only, since an `:expr` fragment and a whole expansion are each parsed as one complete expression. (4) A procedural macro that `unwrap()`/`expect()`/`panic!`s on malformed input should emit a `syn::Error` / `compile_error!` with a useful span instead. (5) Hygiene assumptions that break: generated identifiers relying on call-site names, or items that collide when the macro is invoked twice in the same module.',
    appliesTo: ['correctness', 'rust'],
    matches: (c) => /\bmacro_rules\s*!/.test(c.addedText) || /#\[proc_macro(_derive|_attribute)?\b/.test(c.addedText),
  },
  {
    id: 'julia-security',
    category: 'security',
    severityHint: 'high',
    title: 'Security-sensitive Julia construct',
    guidance:
      'A Julia construct that is only safe on trusted input. Check that: `eval` / `@eval` / `Meta.parse` / `include_string` never see externally derived input (code injection); an explicit shell invocation (`sh -c`, `bash -c`) never interpolates untrusted input — a plain backtick `Cmd` passes its arguments straight to the process without a shell, so the risk arises only when a shell is invoked deliberately; `ccall`, `unsafe_*` and raw `pointer` use validate length, alignment, lifetime and null-ness of the underlying memory; SQL and filesystem paths are not built by concatenating/interpolating external input; and secrets, tokens or PII are never logged.',
    appliesTo: ['security', 'julia'],
    matches: (c) =>
      /\b(eval|include_string)\s*\(|@eval\b|\bMeta\.parse\s*\(/.test(c.addedText) ||
      /\b(sh|bash)\s+-c\b|["'](sh|bash)["']\s*,\s*["']-c["']/.test(c.addedText) ||
      /\bccall\s*\(|\bunsafe_\w+|\bpointer\s*\(/.test(c.addedText) ||
      (/\b(select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from)\b/i.test(c.addedText) &&
        /\$\(|\$\w/.test(c.addedText)),
  },
  {
    id: 'iac-security',
    category: 'security',
    severityHint: 'high',
    title: 'Security-sensitive infrastructure-as-code change',
    guidance:
      'Infrastructure-as-code touches security-sensitive network or access-control state. Check whether: an unrestricted source (`0.0.0.0/0`, `::/0`, or `*`) opens a sensitive port (SSH 22, RDP 3389, a database port) or all ports to the public internet; an IAM/role policy uses a wildcard `Action`/`Resource` instead of the narrowest set the workload actually needs; a storage account/bucket\'s public access or `publicNetworkAccess: \'Enabled\'` (Bicep) / `public_network_access_enabled = true` (Terraform) is an intentional, reviewed exposure rather than a default left open; a committed `terraform.tfstate` (or `.tfstate.backup`) file can hold secrets and resource attributes in plaintext, so it must be removed, purged from history, and any exposed credentials rotated; and a variable/parameter that carries a credential is marked `sensitive = true` (Terraform) or `@secure()` (Bicep) so it never lands in logs or state output.',
    appliesTo: ['security', 'terraform', 'bicep'],
    matches: (c) => {
      if (c.paths.some((p) => /\.tfstate(\.backup)?$/i.test(p))) return true;
      return (
        // unrestricted CIDR alone isn't a signal (e.g. a route table's default route);
        // require it alongside a security group/NSG rule context, per the guidance above
        (/(^|[^\d.])0\.0\.0\.0\/0|::\/0/.test(c.addedText) &&
          /\b(ingress|security_rule|security_group|network_acl|firewall|cidr_blocks|source_address_prefix(es)?|source_ranges)\b|securityRules|sourceAddressPrefix/i.test(
            c.addedText,
          )) ||
        /"(Action|Resource)"\s*:\s*"\*"/.test(c.addedText) ||
        /publicNetworkAccess['"\s:=]+'?"?Enabled/i.test(c.addedText) ||
        /public_network_access_enabled\s*=\s*true/i.test(c.addedText) ||
        /sourceAddressPrefix['"\s:=]+'?"?(\*|Internet)/i.test(c.addedText)
      );
    },
  },
  {
    id: 'haskell-security',
    category: 'security',
    severityHint: 'high',
    title: 'Security-sensitive Haskell construct',
    guidance:
      'A Haskell construct that is only safe under documented invariants. Check that: `unsafePerformIO`\'s result does not depend on mutable state or evaluation order and carries a `{-# NOINLINE #-}` pragma (or another documented reason) so GHC cannot float or duplicate it; `unsafeCoerce` preserves the runtime representation of both types; a shell invocation (`callCommand`, `spawnCommand`, `runCommand`, or `shell` from `System.Process`) never interpolates external input — prefer `proc` with an explicit argument list, which reaches the process directly without a shell; and a `foreign import` validates pointer lifetime, null-ness, buffer length and encoding at the FFI boundary.',
    appliesTo: ['security', 'haskell'],
    matches: (c) =>
      /\bunsafe(PerformIO|Coerce|InterleaveIO|IOToSTM)\b/.test(c.addedText) ||
      // narrowed to function-application position (`shell (...)` / `shell $ ...`)
      // so a plain identifier like `shellSort` doesn't false-positive
      /\bcallCommand\b|\bspawnCommand\b|\brunCommand\b|\bshell\s*[($]/.test(c.addedText) ||
      /\bforeign\s+import\b/.test(c.addedText),
  },
  {
    id: 'nim-security',
    category: 'security',
    severityHint: 'high',
    title: 'Security-sensitive Nim construct',
    guidance:
      'A Nim construct that crosses a trust or memory-safety boundary. Check that: external input never reaches `execShellCmd`, a shell command, a SQL statement, or a filesystem path without validation; `cast[]`/`unsafeAddr` preserve type, alignment, bounds and lifetime invariants (a plain `addr` on a local is common and not itself a signal); an `{.importc.}`/`{.exportc.}`/`{.dynlib.}` FFI declaration matches the callee\'s calling convention, null-ness, buffer length and ownership; `staticExec`/`gorge` never execute untrusted text at compile time; and input is not validated only via `assert`, which release builds compile out.',
    appliesTo: ['security', 'nim'],
    matches: (c) =>
      /\bexecShellCmd\b|\bstaticExec\b|\bgorge\b/.test(c.addedText) ||
      /\bcast\[/.test(c.addedText) ||
      // unsafeAddr only — a bare `addr` on a local is routine Nim and not a signal
      /\bunsafeAddr\b/.test(c.addedText) ||
      /\{\.\s*(importc|exportc|dynlib)\b/.test(c.addedText),
  },
  {
    id: 'nix-reproducibility',
    category: 'correctness',
    severityHint: 'medium',
    title: 'Nix fetcher / channel pinning',
    guidance:
      'A Nix fetcher or channel import that affects build reproducibility. Check that a fetcher (`fetchTarball`, `fetchGit`, `fetchurl`, `fetchFromGitHub`, or a `builtins.fetch*` call) is pinned to a fixed `rev` and content hash rather than a mutable branch/ref; that a version bump updates the `rev`/hash together rather than leaving a stale hash; and that pinned (flake/lockfile) code does not newly pull in a mutable `<nixpkgs>`/channel import. The rule stays quiet when the added lines already carry a `rev`/hash pin alongside the fetcher.',
    appliesTo: ['correctness', 'nix'],
    matches: (c) => {
      if (/<nixpkgs>/.test(c.addedText)) return true;
      const hasFetcher =
        /\b(fetchTarball|fetchGit|fetchurl|fetchFromGitHub)\s*[({]/.test(c.addedText) ||
        /builtins\.fetch\w+/.test(c.addedText);
      if (!hasFetcher) return false;
      // A fetcher paired with a rev/hash attr in the same added lines is the
      // pinned, reproducible shape upstream's nix.md asks for — stay quiet.
      // No pin token alongside the fetcher means either an unpinned source or
      // a URL/version bump that left the hash stale, so flag it either way.
      const hasPinToken = /\b(sha256|sha512|hash|narHash|outputHash|rev)\s*=/.test(c.addedText);
      return !hasPinToken;
    },
  },
  {
    id: 'swift-security',
    category: 'security',
    severityHint: 'high',
    title: 'Security-sensitive Swift construct',
    guidance:
      'A Swift construct that crosses a memory-safety or trust boundary. Check that: an `Unsafe*Pointer` / `withUnsafeBytes`-style region has guaranteed lifetime, alignment and bounds, and that the pointer never escapes the closure it was formed in; `unsafeBitCast`/`unsafeDowncast` preserve the runtime representation and dynamic type (a conditional `as?` is the checked alternative); a `WKWebView` JavaScript bridge (`WKUserContentController.add`, a `WKScriptMessageHandler`, or `evaluateJavaScript`) validates every message body, never interpolates untrusted text into evaluated JavaScript, and allowlists URL schemes/hosts before navigating; and that transport protections stay intact — `NSAllowsArbitraryLoads` disables App Transport Security, and answering an authentication challenge with `URLCredential(trust:)`/`serverTrust` accepts the presented certificate chain without validating it.',
    appliesTo: ['security', 'swift'],
    matches: (c) =>
      /\bUnsafe(Mutable)?(Raw)?(Buffer)?Pointer\b|\bwithUnsafe\w*(Bytes|Pointer)\s*[({]/.test(c.addedText) ||
      /\bunsafeBitCast\s*\(|\bunsafeDowncast\s*\(/.test(c.addedText) ||
      /\bWKScriptMessageHandler\b|\bWKUserContentController\b|\bevaluateJavaScript\s*\(/.test(c.addedText) ||
      /\bNSAllowsArbitraryLoads\b/.test(c.addedText) ||
      /\bURLCredential\s*\(\s*trust\s*:|\.serverTrust\b/.test(c.addedText),
  },
  {
    id: 'swift-concurrency',
    category: 'concurrency',
    severityHint: 'high',
    title: 'Swift concurrency isolation escape hatch',
    guidance:
      'A Swift concurrency construct that opts out of — or can outlive — the compiler-checked isolation model. Check that: an `@unchecked Sendable` conformance or a `nonisolated(unsafe)` declaration is backed by a real synchronization invariant (a lock, a serial queue, or immutability) rather than a silenced diagnostic; a `Task.detached` is deliberate, since it inherits neither actor context nor priority nor cancellation, and any isolated state it touches needs an explicit hop; a `withUnsafeContinuation`/`withUnsafeThrowingContinuation` resumes exactly once on every path including error and cancellation (the `Checked` variants trap on misuse and are the safer default); and a `DispatchSemaphore` — or any synchronous wait — is never blocked on across an `await`, which can deadlock the cooperative thread pool.',
    appliesTo: ['concurrency', 'swift'],
    matches: (c) =>
      /@unchecked\s+Sendable\b/.test(c.addedText) ||
      /\bnonisolated\s*\(\s*unsafe\s*\)/.test(c.addedText) ||
      /\bTask\.detached\b/.test(c.addedText) ||
      /\bwithUnsafe(Throwing)?Continuation\s*[({]/.test(c.addedText) ||
      /\bDispatchSemaphore\b/.test(c.addedText),
  },
  {
    id: 'swift-runtime-safety',
    category: 'correctness',
    severityHint: 'medium',
    title: 'Swift trap-on-failure / unowned lifetime risk',
    guidance:
      'A Swift construct that turns a recoverable failure into a runtime crash. Check that: `try!` cannot actually throw on the paths it is reachable from — decoding, networking, persistence and filesystem calls can, so propagate with `try`/`Result` instead of trapping; a force cast (`as!`) of a deserialized value (JSON, property list, `UserDefaults`, archived data) is written as `as?` with a failure path, since a schema or server change otherwise turns it into a crash; and an `[unowned]` capture is guaranteed to outlive the closure that reads it — `[weak]` with an explicit nil path is the safe default whenever the owner can be deallocated first (a cancelled task, a dismissed view, a delegate outliving its owner).',
    appliesTo: ['correctness', 'swift'],
    matches: (c) =>
      /\btry!/.test(c.addedText) ||
      /\[\s*unowned\b/.test(c.addedText) ||
      // Line-scoped: a force cast of a *deserialized* value. An ordinary `as!`
      // downcast (a dequeued cell, a storyboard-instantiated controller) is
      // routine Swift and not a signal on its own.
      /^.*\b(JSONSerialization|jsonObject|JSONDecoder|PropertyListSerialization|NSKeyedUnarchiver|UserDefaults)\b.*\bas!\s/m.test(
        c.addedText,
      ),
  },
];

function toMatchedRule(r: RuleDefinition, matchedPaths: string[]): MatchedRule {
  return {
    id: r.id,
    category: r.category,
    severityHint: r.severityHint,
    title: r.title,
    guidance: r.guidance,
    appliesTo: r.appliesTo,
    matchedPaths,
  };
}

/**
 * The subset of a rule's {@link RuleDefinition.appliesTo} that are real language
 * ids (machine-checked). Entries that are not language ids (e.g. `any`,
 * `backend`, `ci`) are display-only tags and do not gate matching.
 */
function languageGate(rule: RuleDefinition): string[] {
  return rule.appliesTo.filter((a) => KNOWN_LANGUAGES.has(a));
}

/**
 * Whether `rule` applies to a single-file context: its heuristic must match AND
 * the file's language must be in the rule's language gate. Rules with no
 * language ids in `appliesTo` (tag-only, e.g. `secret-exposure`) are
 * language-agnostic and fire on any file. A file whose language is unknown/
 * undetected only triggers language-agnostic rules.
 */
function ruleAppliesToFile(rule: RuleDefinition, gate: string[], ctx: RuleContext): boolean {
  if (!rule.matches(ctx)) return false;
  if (gate.length === 0) return true;
  for (const lang of ctx.languages) if (gate.includes(lang)) return true;
  return false;
}

/**
 * Run the rulebook over a set of changed files and return the matched rules (as
 * plain {@link MatchedRule}s, without the matcher fn) in rulebook order, each
 * carrying the diff-ordered `matchedPaths` it fired on. Pure and deterministic.
 */
export function matchRules(files: BundledFile[], rulebook: RuleDefinition[] = RULEBOOK): MatchedRule[] {
  // Match each file independently so a matcher that needs several signals (e.g.
  // n+1 = a loop AND a query) only fires when they co-occur in the SAME file —
  // not when a loop in one bundled file and a query in another are joined into
  // one text. A rule is attached if it matches any single file, and language
  // gating (appliesTo) is enforced per file. Rulebook order (then diff order for
  // matchedPaths) and determinism are preserved.
  const contexts = files.map((bf) => buildContext([bf]));
  const matched: MatchedRule[] = [];
  for (const rule of rulebook) {
    const gate = languageGate(rule);
    const matchedPaths: string[] = [];
    contexts.forEach((ctx, idx) => {
      if (ruleAppliesToFile(rule, gate, ctx)) matchedPaths.push(files[idx]!.file.path);
    });
    if (matchedPaths.length > 0) matched.push(toMatchedRule(rule, matchedPaths));
  }
  return matched;
}
