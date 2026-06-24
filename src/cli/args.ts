/** A resolved GitHub PR reference. */
export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parse a PR reference: a GitHub URL (`https://github.com/owner/repo/pull/123`,
 * with or without scheme / trailing path) or the `owner/repo#number` shorthand.
 * Throws if neither form matches.
 */
export function parsePrRef(input: string): PrRef {
  const s = input.trim();

  const short = /^([^/\s]+)\/([^/\s#]+)#(\d+)$/.exec(s);
  if (short) return { owner: short[1]!, repo: short[2]!, number: Number(short[3]) };

  const url = /(?:^|\/\/)[^/]*github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(s);
  if (url) return { owner: url[1]!, repo: url[2]!, number: Number(url[3]) };

  throw new Error(`Not a recognizable PR reference: "${input}". Use a PR URL or owner/repo#number.`);
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
      const n = Number(v);
      if (v === undefined || !Number.isFinite(n) || n <= 0) {
        throw new Error(`--max-bundle-tokens needs a positive number (got "${v ?? ''}").`);
      }
      maxBundleTokens = n;
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
