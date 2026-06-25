#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildPacket, defaultSkip, serializePacket } from '../core/index.ts';
import type { ReviewSource } from '../core/index.ts';
import { parseCliArgs, parsePrRef } from './args.ts';
import type { CliArgs } from './args.ts';

const HELP = `sereview — deterministic review-packet builder for Claude Code (no API key).

Usage:
  sereview packet <pr-url | owner/repo#number>   Build a packet from a GitHub PR
  sereview packet --diff <path>                  Build from a local unified diff
  sereview packet --diff -                       Build from a unified diff on stdin

Options:
  --max-bundle-tokens <n>   Soft cap per bundle (default 8000)
  -h, --help                Show this help
  --version                 Show version

The packet is printed as JSON to stdout. The review itself is performed by your
Claude Code session via the bundled skill (skill/SKILL.md) — sereview never
calls an LLM and needs no API key.
`;

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Run a `gh` subcommand, surfacing a clear error if the CLI is missing/unauthed. */
function gh(args: string[]): string {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `\`gh ${args.join(' ')}\` failed. Is the GitHub CLI installed and authenticated (\`gh auth status\`)?\n${detail}`,
    );
  }
}

function runPacket(args: CliArgs): void {
  let diff: string;
  let source: ReviewSource;

  if (args.diffPath !== undefined) {
    const fromStdin = args.diffPath === '-';
    diff = readFileSync(fromStdin ? 0 : args.diffPath, 'utf8');
    source = { kind: 'local-diff', ref: fromStdin ? 'stdin' : args.diffPath };
  } else {
    const ref = parsePrRef(args.pr!);
    const slug = `${ref.owner}/${ref.repo}`;
    diff = gh(['pr', 'diff', String(ref.number), '-R', slug, '--patch']);
    source = { kind: 'github-pr', ref: `${slug}#${ref.number}` };
    try {
      const meta = JSON.parse(
        gh(['pr', 'view', String(ref.number), '-R', slug, '--json', 'title,baseRefOid,headRefOid']),
      ) as { title?: string; baseRefOid?: string; headRefOid?: string };
      if (meta.title) source.title = meta.title;
      if (meta.baseRefOid) source.baseSha = meta.baseRefOid;
      if (meta.headRefOid) source.headSha = meta.headRefOid;
    } catch {
      // PR metadata is best-effort; the diff alone is enough to build a packet.
    }
  }

  const packet = buildPacket({
    diff,
    source,
    skip: defaultSkip,
    ...(args.maxBundleTokens !== undefined ? { maxBundleTokens: args.maxBundleTokens } : {}),
  });
  if (packet.stats.files === 0 && diff.trim() !== '') {
    process.stderr.write(
      'sereview: warning — input was non-empty but contained no `diff --git` headers; produced an empty packet.\n',
    );
  }
  process.stdout.write(serializePacket(packet) + '\n');
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }

  if (args.command === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (args.command === 'version') {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  try {
    runPacket(args);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

main();
