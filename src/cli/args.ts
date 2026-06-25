/** A resolved GitHub PR reference. */
export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parse a PR reference: a GitHub URL (`https://github.com/owner/repo/pull/123`,
 * with or without scheme / trailing path) or the `owner/repo#number` shorthand.
 * Owner/repo must start with an alphanumeric and contain only `[A-Za-z0-9._-]`
 * (so a `-`/`=`-leading value can't be smuggled into `gh` as a flag), and the PR
 * number must be a safe positive integer. Throws if any part is invalid.
 */
export function parsePrRef(input: string): PrRef {
  const s = input.trim();

  const short = /^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)#(\d+)$/.exec(s);
  if (short) return { owner: short[1]!, repo: short[2]!, number: prNumber(short[3]!, input) };

  const url = /(?:^|\/\/)[^/]*github\.com\/([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)\/pull\/(\d+)/.exec(s);
  if (url) return { owner: url[1]!, repo: url[2]!, number: prNumber(url[3]!, input) };

  throw new Error(`Not a recognizable PR reference: "${input}". Use a PR URL or owner/repo#number.`);
}

/** Parse a PR number, rejecting non-positive or unsafe-integer (overflow) values. */
function prNumber(digits: string, input: string): number {
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`PR number out of range in "${input}".`);
  }
  return n;
}

/** Parsed `sereview` command line. */
export interface CliArgs {
  command: 'help' | 'version' | 'packet';
  pr?: string;
  diffPath?: string;
  maxBundleTokens?: number;
}

/**
 * Parse argv (already sliced past `node script`). Pure: no I/O. Throws on
 * malformed input so the entry point can print the message + usage.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  if (argv.length === 0) return { command: 'help' };
  const first = argv[0]!;
  if (first === '--help' || first === '-h' || first === 'help') return { command: 'help' };
  if (first === '--version' || first === '-v' || first === 'version') return { command: 'version' };
  if (first !== 'packet') throw new Error(`Unknown command: "${first}". Run \`sereview --help\`.`);

  const rest = argv.slice(1);
  let pr: string | undefined;
  let diffPath: string | undefined;
  let maxBundleTokens: number | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--diff') {
      diffPath = rest[++i];
      if (diffPath === undefined) throw new Error('--diff requires a path, or "-" for stdin.');
    } else if (arg === '--max-bundle-tokens') {
      const v = rest[++i];
      const trimmed = v?.trim();
      // Positive integer only — `Number()` would accept hex (0x10), fractions
      // (0.5, which makes every file its own bundle), and other junk.
      if (trimmed === undefined || !/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
        throw new Error(`--max-bundle-tokens needs a positive integer (got "${v ?? ''}").`);
      }
      maxBundleTokens = Number(trimmed);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: "${arg}".`);
    } else if (pr === undefined) {
      pr = arg;
    } else {
      throw new Error(`Unexpected extra argument: "${arg}".`);
    }
  }

  if (pr === undefined && diffPath === undefined) throw new Error('packet needs a PR reference or --diff <path|->.');
  if (pr !== undefined && diffPath !== undefined) throw new Error('Provide either a PR reference or --diff, not both.');

  return {
    command: 'packet',
    ...(pr !== undefined ? { pr } : {}),
    ...(diffPath !== undefined ? { diffPath } : {}),
    ...(maxBundleTokens !== undefined ? { maxBundleTokens } : {}),
  };
}
