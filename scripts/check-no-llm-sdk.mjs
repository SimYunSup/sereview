#!/usr/bin/env node
// Enforces sereview's no-key invariant (PRD §11.1): sereview must NEVER call an
// LLM directly — the host Claude Code session is the only model caller. This guard
// fails CI if any LLM SDK becomes a dependency OR is imported anywhere in src/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Package names (or scopes) that imply a direct LLM call. Match on the bare
 *  package name (`foo`) or scoped name (`@scope/foo`); subpaths are normalized. */
const FORBIDDEN = new Set([
  '@anthropic-ai/sdk',
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/vertex-sdk',
  'openai',
  '@azure/openai',
  '@google/generative-ai',
  '@google/genai',
  '@google-cloud/aiplatform',
  'cohere-ai',
  '@mistralai/mistralai',
  'groq-sdk',
  'replicate',
  'ai',
  '@ai-sdk/anthropic',
  '@ai-sdk/openai',
  'langchain',
  '@langchain/core',
  'llamaindex',
  'ollama',
]);

/** Reduce an import specifier to its package name (drops subpaths). */
function packageOf(spec) {
  if (spec.startsWith('.') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const problems = [];

// 1) No dependency field may declare a forbidden package.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const field of [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
]) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (FORBIDDEN.has(name)) problems.push(`package.json ${field} declares forbidden "${name}"`);
  }
}

// 2) No source file may import/require a forbidden package.
const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(entry)) {
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(importRe)) {
        const pkgName = packageOf(m[1] ?? m[2] ?? '');
        if (pkgName && FORBIDDEN.has(pkgName)) problems.push(`${p} imports forbidden "${pkgName}"`);
      }
    }
  }
}
walk(join(root, 'src'));

if (problems.length > 0) {
  console.error('no-llm-sdk guard FAILED — sereview must never call an LLM directly:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('no-llm-sdk guard passed: no LLM SDK dependency or import found.');
