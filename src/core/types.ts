/**
 * sereview core types — the contract between the deterministic packet builder
 * (Tier 2, this package) and the host Claude Code session that reviews (Tier 1).
 *
 * Nothing in this package ever calls an LLM. `buildPacket` is pure and
 * deterministic: same diff in, same packet out.
 */

/** How serious a finding is. Mirrors the rulebook's severity scale. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Top-level grouping for a rule / finding. The built-in starter rulebook only
 * emits hints in the first four (it is security-leaning); `maintainability` and
 * `style` carry no built-in rule but remain valid categories the reviewer may
 * assign to a Finding.
 */
export type RuleCategory =
  | 'security'
  | 'correctness'
  | 'concurrency'
  | 'performance'
  | 'maintainability'
  | 'style';

/** What happened to a file in the diff. */
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/** A single file touched by the diff, with summary metadata. */
export interface ChangedFile {
  /** New path (post-change). For a deleted file this is the path that was removed. */
  path: string;
  /** For renames/copies, the path before the change. */
  previousPath?: string;
  status: FileStatus;
  /** Best-effort language id derived from the extension (e.g. 'typescript'). */
  language?: string;
  additions: number;
  deletions: number;
  /** True when git reported the file as binary (no reviewable text). */
  binary: boolean;
}

/** One line inside a hunk. `add`/`del` carry the relevant line number. */
export interface DiffLine {
  type: 'add' | 'del' | 'context';
  /** 1-based line number in the new file (present for `add` and `context`). */
  newLine?: number;
  /** 1-based line number in the old file (present for `del` and `context`). */
  oldLine?: number;
  /** Line content WITHOUT the leading +/-/space marker and WITHOUT the newline. */
  content: string;
}

/** A contiguous changed region of a file (`@@ -a,b +c,d @@`). */
export interface DiffHunk {
  /** The raw `@@ ... @@` header line (including any trailing section heading). */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * A rule from the rulebook that the deterministic matcher flagged as relevant to
 * a bundle. It is a HINT for the reviewer, never a finding — Claude decides
 * whether the code actually violates it.
 */
export interface MatchedRule {
  id: string;
  category: RuleCategory;
  severityHint: Severity;
  title: string;
  /** What to look for and why it matters — fed to the reviewer verbatim. */
  guidance: string;
  /** Human-readable scope tags (languages / path patterns) the rule covers. */
  appliesTo: string[];
}

/** A changed file together with its parsed hunks. */
export interface BundledFile {
  file: ChangedFile;
  hunks: DiffHunk[];
}

/**
 * A group of changed files small enough to review together, plus the rules the
 * matcher flagged for the bundle and a rough token cost.
 */
export interface ReviewBundle {
  id: string;
  files: BundledFile[];
  matchedRules: MatchedRule[];
  tokenEstimate: number;
}

/** Where a packet's diff came from. */
export interface ReviewSource {
  kind: 'github-pr' | 'local-diff';
  /** PR URL / `owner/repo#n` / a label for a local diff. */
  ref: string;
  title?: string;
  baseSha?: string;
  headSha?: string;
}

/**
 * The deterministic output of `buildPacket`: everything the reviewer needs and
 * nothing it doesn't. Serialized to the host Claude Code session.
 */
export interface ReviewPacket {
  schemaVersion: 1;
  source: ReviewSource;
  bundles: ReviewBundle[];
  /** Files intentionally left out of review, each with a reason (binary, lockfile…). */
  skipped: { path: string; reason: string }[];
  stats: { files: number; additions: number; deletions: number; bundles: number };
  rulebookVersion: string;
}

/**
 * A single review comment. Produced by the reviewer (Claude) per the SKILL
 * contract — sereview never creates these, it only defines the shape.
 */
export interface Finding {
  bundleId: string;
  file: string;
  /** 1-based NEW-file line the comment anchors to. */
  line: number;
  endLine?: number;
  severity: Severity;
  category: RuleCategory;
  ruleId?: string;
  title: string;
  body: string;
  suggestion?: string;
}

/** The reviewer's full result for a packet. */
export interface ReviewResult {
  schemaVersion: 1;
  source: ReviewSource;
  findings: Finding[];
  summary: string;
  countsBySeverity: Record<Severity, number>;
}

/** Options for {@link buildPacket}. Pure in, pure out — no I/O, no model calls. */
export interface BuildPacketOptions {
  /** Unified diff text (e.g. the output of `gh pr diff --patch`). */
  diff: string;
  source: ReviewSource;
  /** Soft cap on a bundle's estimated tokens before a new bundle is started. */
  maxBundleTokens?: number;
  /** Override the matched-rule set (defaults to the built-in rulebook). */
  rules?: MatchedRule[];
  /**
   * Per-file skip predicate: return a reason string to exclude the file
   * (recorded in `packet.skipped`), or null/undefined to keep it. Applied on top
   * of the always-on binary-file skip.
   */
  skip?: (f: ChangedFile) => string | null | undefined;
}
