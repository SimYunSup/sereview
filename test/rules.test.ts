import test from 'node:test';
import assert from 'node:assert/strict';
import type { BundledFile, DiffLine } from '../src/core/types.ts';
import { detectLanguage } from '../src/core/diff.ts';
import { matchRules, RULEBOOK, RULEBOOK_VERSION } from '../src/core/rules.ts';

/** Build a BundledFile consisting solely of the given added lines. */
function added(path: string, ...addedLines: string[]): BundledFile {
  const lang = detectLanguage(path);
  return {
    file: {
      path,
      status: 'modified',
      additions: addedLines.length,
      deletions: 0,
      binary: false,
      ...(lang ? { language: lang } : {}),
    },
    hunks: [
      {
        header: `@@ -0,0 +1,${addedLines.length} @@`,
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: addedLines.length,
        lines: addedLines.map((content, i): DiffLine => ({ type: 'add', newLine: i + 1, content })),
      },
    ],
  };
}

const ids = (fs: BundledFile[]): string[] => matchRules(fs).map((r) => r.id);

test('matchRules: SQL built by string concatenation → sql-injection', () => {
  const fs = [added('src/db.ts', 'const q = "SELECT * FROM users WHERE id = " + userId;', 'db.query(q);')];
  assert.ok(ids(fs).includes('sql-injection'));
});

test('matchRules: hardcoded API key → secret-exposure (critical/security)', () => {
  const fs = [added('src/config.ts', 'const apiKey = "sk-abc123def456ghijkl";')];
  const secret = matchRules(fs).find((r) => r.id === 'secret-exposure');
  assert.ok(secret, 'secret-exposure should match');
  assert.equal(secret!.severityHint, 'critical');
  assert.equal(secret!.category, 'security');
});

test('matchRules: innerHTML assignment → xss', () => {
  assert.ok(ids([added('web/view.ts', 'element.innerHTML = userInput;')]).includes('xss'));
});

test('detectLanguage: .astro maps to astro', () => {
  assert.equal(detectLanguage('src/pages/index.astro'), 'astro');
});

test('matchRules: Astro set:html directive → xss', () => {
  assert.ok(ids([added('src/pages/Post.astro', '<article set:html={post.body} />')]).includes('xss'));
  const xss = matchRules([added('src/pages/Post.astro', '<article set:html={post.body} />')]).find(
    (r) => r.id === 'xss',
  );
  assert.ok(xss!.appliesTo.includes('astro'), 'xss rule should advertise astro applicability');
});

test('matchRules: language gating — eval() in a .py file does NOT fire xss', () => {
  // eval( matches the xss heuristic, but xss.appliesTo has no `python` id, so
  // the language gate must suppress it on a Python file.
  assert.ok(!ids([added('src/app.py', 'result = eval(user_input)')]).includes('xss'));
});

test('matchRules: language gating — SQL in a .md file does NOT fire sql-injection', () => {
  const fs = [added('docs/guide.md', 'Example query: "SELECT * FROM users WHERE id = " + id')];
  assert.ok(!ids(fs).includes('sql-injection'));
});

test('matchRules: language gating — positive cases in a matching language still fire', () => {
  assert.ok(ids([added('src/app.ts', 'const x = eval(userInput);')]).includes('xss'));
  assert.ok(
    ids([added('db.go', 'q := "SELECT * FROM users WHERE id = " + userId')]).includes('sql-injection'),
  );
});

test('matchRules: language gating — tag-only rules fire on unknown-language files', () => {
  // secret-exposure.appliesTo is ['any'] (no language id) → language-agnostic.
  const fs = [added('Dockerfile', 'ENV API_KEY="sk-abc123def456ghijkl"')];
  assert.ok(ids(fs).includes('secret-exposure'));
});

test('matchRules: matchedPaths lists the files a rule fired on, in diff order', () => {
  const fs = [
    added('web/a.ts', 'el.innerHTML = x;'),
    added('web/clean.ts', 'const y = 1 + 2;'),
    added('web/b.ts', 'node.innerHTML = y;'),
  ];
  const xss = matchRules(fs).find((r) => r.id === 'xss');
  assert.ok(xss, 'xss should match');
  assert.deepEqual(xss!.matchedPaths, ['web/a.ts', 'web/b.ts']);
});

test('matchRules: query inside a loop → n-plus-1', () => {
  const fs = [
    added(
      'src/svc.ts',
      'for (const u of users) {',
      '  const p = await prisma.profile.findUnique({ where: { id: u.id } });',
      '}',
    ),
  ];
  assert.ok(ids(fs).includes('n-plus-1'));
});

test('matchRules: n+1 signals split across bundled files do NOT cross-trigger', () => {
  const fs = [
    added('a.ts', 'for (const u of users) { doSomething(u); }'), // loop, no query
    added('b.ts', 'const all = await prisma.user.findMany();'), // query, no loop
  ];
  assert.ok(!ids(fs).includes('n-plus-1'), 'a loop in one file + a query in another must not match per-file');
});

test('matchRules: benign arithmetic matches no security/perf rule', () => {
  const matched = ids([added('src/math.ts', 'const sum = a + b;', 'return sum;')]);
  for (const id of ['sql-injection', 'xss', 'ssrf', 'path-traversal', 'secret-exposure', 'n-plus-1']) {
    assert.ok(!matched.includes(id), `should not match ${id}`);
  }
});

test('matchRules: matched entries carry catalog fields, not the matcher fn', () => {
  const r = matchRules([added('src/config.ts', 'const apiKey = "sk-abc123def456ghijkl";')])[0]!;
  assert.equal(typeof r.id, 'string');
  assert.equal(typeof r.title, 'string');
  assert.equal(typeof r.guidance, 'string');
  assert.ok(Array.isArray(r.appliesTo));
  assert.equal((r as unknown as Record<string, unknown>).matches, undefined);
});

test('matchRules: results follow rulebook order and are unique', () => {
  const fs = [
    added('a.ts', 'const apiKey = "sk-abc123def456ghijkl";'), // secret-exposure (idx 4)
    added('b.ts', 'el.innerHTML = x;'), // xss (idx 1)
  ];
  const order = matchRules(fs).map((r) => r.id);
  const rbOrder = RULEBOOK.map((r) => r.id);
  const idx = order.map((id) => rbOrder.indexOf(id));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  assert.equal(new Set(order).size, order.length);
});

test('RULEBOOK exposes all twenty rules and a version string', () => {
  assert.equal(RULEBOOK.length, 20);
  assert.equal(typeof RULEBOOK_VERSION, 'string');
  assert.ok(RULEBOOK_VERSION.length > 0);
  const expected = [
    'sql-injection', 'xss', 'ssrf', 'path-traversal', 'secret-exposure', 'authz', 'npe', 'race', 'n-plus-1',
    'github-actions-security', 'template-injection', 'rust-macro-correctness', 'julia-security', 'iac-security',
    'haskell-security', 'nim-security', 'nix-reproducibility',
    'swift-security', 'swift-concurrency', 'swift-runtime-safety',
  ];
  assert.deepEqual([...RULEBOOK.map((r) => r.id)].sort(), [...expected].sort());
});

test('detectLanguage: .ftl / .ftlh map to freemarker', () => {
  assert.equal(detectLanguage('templates/mail.ftl'), 'freemarker');
  assert.equal(detectLanguage('t/page.ftlh'), 'freemarker');
});

test('matchRules: FreeMarker ?new() builtin in a .ftl file → template-injection', () => {
  const fs = [added('templates/mail.ftl', '<#assign ex = "freemarker.template.utility.Execute"?new()>')];
  assert.ok(ids(fs).includes('template-injection'));
});

test('matchRules: dynamic <#include> target → template-injection', () => {
  const fs = [added('t/page.ftlh', '<#include "/tpl/${userPath}.ftl">')];
  assert.ok(ids(fs).includes('template-injection'));
});

test('matchRules: language gating — same dangerous text in a .py file does NOT fire template-injection', () => {
  const fs = [added('scripts/build.py', '# ex = "freemarker.template.utility.Execute"?new()')];
  assert.ok(!ids(fs).includes('template-injection'));
});

test('matchRules: benign FreeMarker interpolation does NOT fire template-injection', () => {
  const fs = [added('templates/greeting.ftl', '<p>${name?html}</p>')];
  assert.ok(!ids(fs).includes('template-injection'));
});

test('detectLanguage: .jl maps to julia', () => {
  assert.equal(detectLanguage('src/solver.jl'), 'julia');
});

test('matchRules: macro_rules! definition in a .rs file → rust-macro-correctness', () => {
  const fs = [
    added(
      'src/macros.rs',
      'macro_rules! twice {',
      '    ($x:expr) => { $x + $x };',
      '}',
    ),
  ];
  assert.ok(ids(fs).includes('rust-macro-correctness'));
});

test('matchRules: a procedural-macro attribute → rust-macro-correctness', () => {
  const fs = [added('derive/src/lib.rs', '#[proc_macro_derive(Builder)]', 'pub fn derive_builder(input: TokenStream) -> TokenStream {')];
  assert.ok(ids(fs).includes('rust-macro-correctness'));
});

test('matchRules: an ordinary macro invocation does NOT fire rust-macro-correctness', () => {
  // Upstream guards the section to macro *definitions*; invocations are noise.
  const fs = [added('src/main.rs', 'println!("{}", vec![1, 2, 3].len());')];
  assert.ok(!ids(fs).includes('rust-macro-correctness'));
});

test('matchRules: eval of parsed input in a .jl file → julia-security', () => {
  const fs = [added('src/run.jl', 'eval(Meta.parse(user_input))')];
  assert.ok(ids(fs).includes('julia-security'));
});

test('matchRules: unsafe FFI in a .jl file → julia-security', () => {
  const fs = [added('src/ffi.jl', 'v = unsafe_load(ptr, i)', 'ccall((:memcpy, "libc"), Ptr{Cvoid}, (Ptr{Cvoid},), dst)')];
  assert.ok(ids(fs).includes('julia-security'));
});

test('matchRules: language gating — the same Julia construct in a .py file does NOT fire julia-security', () => {
  const fs = [added('scripts/run.py', '# eval(Meta.parse(user_input))')];
  assert.ok(!ids(fs).includes('julia-security'));
});

test('matchRules: a backtick Cmd without a shell does NOT fire julia-security', () => {
  // Julia backticks pass arguments straight to the process — no shell involved.
  const fs = [added('src/tools.jl', 'run(`convert $input out.png`)')];
  assert.ok(!ids(fs).includes('julia-security'));
});

test('detectLanguage: .tf / .bicep / .proto / .phtml / .prisma map to their languages', () => {
  assert.equal(detectLanguage('main.tf'), 'terraform');
  assert.equal(detectLanguage('infra/network.bicep'), 'bicep');
  assert.equal(detectLanguage('api/message.proto'), 'protobuf');
  assert.equal(detectLanguage('templates/page.phtml'), 'php');
  assert.equal(detectLanguage('schema.prisma'), 'prisma');
  assert.equal(detectLanguage('infra/terraform.tfstate.backup'), 'terraform');
});

test('matchRules: unrestricted CIDR in a .tf file → iac-security', () => {
  const fs = [added('infra/sg.tf', 'cidr_blocks = ["0.0.0.0/0"]')];
  assert.ok(ids(fs).includes('iac-security'));
});

test('matchRules: publicNetworkAccess Enabled in a .bicep file → iac-security', () => {
  const fs = [added('infra/storage.bicep', "publicNetworkAccess: 'Enabled'")];
  assert.ok(ids(fs).includes('iac-security'));
});

test('matchRules: public_network_access_enabled = true in a .tf file → iac-security', () => {
  const fs = [added('infra/storage.tf', 'public_network_access_enabled = true')];
  assert.ok(ids(fs).includes('iac-security'));
});

test('matchRules: a committed terraform.tfstate file → iac-security', () => {
  const fs = [added('infra/terraform.tfstate', '{"version": 4}')];
  assert.ok(ids(fs).includes('iac-security'));
});

test('matchRules: a committed .tfstate.backup file → iac-security', () => {
  const fs = [added('infra/terraform.tfstate.backup', '{"version": 4}')];
  assert.ok(ids(fs).includes('iac-security'));
});

test('matchRules: language gating — the same 0.0.0.0/0 text in a .py file does NOT fire iac-security', () => {
  const fs = [added('scripts/net.py', 'cidr_blocks = ["0.0.0.0/0"]')];
  assert.ok(!ids(fs).includes('iac-security'));
});

test('matchRules: a default route 0.0.0.0/0 without a network-rule signal does NOT fire iac-security', () => {
  const fs = [added('infra/routes.tf', 'destination_cidr_block = "0.0.0.0/0"')];
  assert.ok(!ids(fs).includes('iac-security'));
});

test('matchRules: a bare 0.0.0.0/0 variable default without a network-rule signal does NOT fire iac-security', () => {
  const fs = [added('infra/variables.tf', 'default = "0.0.0.0/0"')];
  assert.ok(!ids(fs).includes('iac-security'));
});

test('matchRules: .phtml file gains sql-injection via the php language mapping', () => {
  const fs = [added('templates/page.phtml', '$sql = "SELECT * FROM users WHERE id = " + $id;')];
  assert.ok(ids(fs).includes('sql-injection'));
});

test('detectLanguage: .hs / .lhs map to haskell', () => {
  assert.equal(detectLanguage('src/Parser.hs'), 'haskell');
  assert.equal(detectLanguage('docs/Tutorial.lhs'), 'haskell');
});

test('detectLanguage: .nim / .nims / .nimble map to nim', () => {
  assert.equal(detectLanguage('src/parser.nim'), 'nim');
  assert.equal(detectLanguage('config.nims'), 'nim');
  assert.equal(detectLanguage('project.nimble'), 'nim');
});

test('detectLanguage: .nix maps to nix', () => {
  assert.equal(detectLanguage('flake.nix'), 'nix');
});

test('matchRules: unsafePerformIO in a .hs file → haskell-security', () => {
  const fs = [added('src/Cache.hs', 'x = unsafePerformIO (readIORef ref)')];
  assert.ok(ids(fs).includes('haskell-security'));
});

test('matchRules: shell command execution in a .hs file → haskell-security', () => {
  const fs = [added('src/Tool.hs', 'run = callCommand ("rm -rf " ++ userInput)')];
  assert.ok(ids(fs).includes('haskell-security'));
});

test('matchRules: language gating — the same Haskell construct in a .py file does NOT fire haskell-security', () => {
  const fs = [added('scripts/run.py', '# x = unsafePerformIO (readIORef ref)')];
  assert.ok(!ids(fs).includes('haskell-security'));
});

test('matchRules: proc with an argument list, and a shellSort identifier, do NOT fire haskell-security', () => {
  // `proc` passes arguments straight to the process (no shell), and `shellSort`
  // is an ordinary identifier — neither is the `shell (...)`/`shell $ ...` call form.
  const fs = [added('src/Tool.hs', 'run = readCreateProcess (proc "ls" ["-l"]) ""', 'shellSort xs = xs')];
  assert.ok(!ids(fs).includes('haskell-security'));
});

test('matchRules: execShellCmd in a .nim file → nim-security', () => {
  const fs = [added('src/tool.nim', 'let out = execShellCmd("rm -rf " & userInput)')];
  assert.ok(ids(fs).includes('nim-security'));
});

test('matchRules: cast[] / unsafeAddr in a .nim file → nim-security', () => {
  const fs = [added('src/mem.nim', 'let p = cast[pointer](unsafeAddr x)')];
  assert.ok(ids(fs).includes('nim-security'));
});

test('matchRules: language gating — the same Nim construct in a .py file does NOT fire nim-security', () => {
  const fs = [added('scripts/tool.py', '# let out = execShellCmd(cmd)')];
  assert.ok(!ids(fs).includes('nim-security'));
});

test('matchRules: a bare addr on a local does NOT fire nim-security', () => {
  const fs = [added('src/mem.nim', 'let p = addr x')];
  assert.ok(!ids(fs).includes('nim-security'));
});

test('matchRules: an unpinned fetchTarball call in a .nix file → nix-reproducibility', () => {
  const fs = [added('pkgs/default.nix', 'src = fetchTarball { url = "https://example.com/src.tar.gz"; };')];
  assert.ok(ids(fs).includes('nix-reproducibility'));
});

test('matchRules: a <nixpkgs> channel import in a .nix file → nix-reproducibility', () => {
  const fs = [added('shell.nix', 'let pkgs = import <nixpkgs> {};')];
  assert.ok(ids(fs).includes('nix-reproducibility'));
});

test('matchRules: language gating — the same fetchTarball text in a .py file does NOT fire nix-reproducibility', () => {
  const fs = [added('scripts/build.py', '# src = fetchTarball { url = "https://example.com/src.tar.gz"; };')];
  assert.ok(!ids(fs).includes('nix-reproducibility'));
});

test('matchRules: a plain Nix expression without a fetcher or channel import does NOT fire nix-reproducibility', () => {
  const fs = [added('pkgs/default.nix', 'let greeting = "hello"; in greeting')];
  assert.ok(!ids(fs).includes('nix-reproducibility'));
});

test('matchRules: a fetcher pinned with rev/sha256 in the same added lines does NOT fire nix-reproducibility', () => {
  const fs = [
    added(
      'pkgs/default.nix',
      'src = fetchFromGitHub {',
      '  owner = "o"; repo = "r";',
      '  rev = "abc123";',
      '  sha256 = "sha256-AAAA";',
      '};',
    ),
  ];
  assert.ok(!ids(fs).includes('nix-reproducibility'));
});

test('matchRules: a fetcher URL bump without a matching hash update → nix-reproducibility', () => {
  const fs = [added('pkgs/default.nix', 'url = "https://example.com/v2.tar.gz"; src = fetchurl {')];
  assert.ok(ids(fs).includes('nix-reproducibility'));
});

test('detectLanguage: .swift maps to swift', () => {
  assert.equal(detectLanguage('Sources/App/User.swift'), 'swift');
});

test('matchRules: an UnsafeMutableBufferPointer region in a .swift file → swift-security', () => {
  const fs = [added('Sources/App/Bytes.swift', 'let buf = UnsafeMutableBufferPointer<UInt8>(start: p, count: n)')];
  assert.ok(ids(fs).includes('swift-security'));
});

test('matchRules: a WKWebView JavaScript bridge in a .swift file → swift-security', () => {
  const fs = [added('Sources/App/Web.swift', 'webView.evaluateJavaScript("show(\\(payload))")')];
  assert.ok(ids(fs).includes('swift-security'));
});

test('matchRules: a server-trust credential in a .swift file → swift-security', () => {
  const fs = [added('Sources/App/Net.swift', 'completionHandler(.useCredential, URLCredential(trust: challenge.protectionSpace.serverTrust!))')];
  assert.ok(ids(fs).includes('swift-security'));
});

test('matchRules: language gating — the same Swift construct in a .py file does NOT fire swift-security', () => {
  const fs = [added('scripts/tool.py', '# buf = UnsafeMutableBufferPointer(start: p, count: n)')];
  assert.ok(!ids(fs).includes('swift-security'));
});

test('matchRules: a checked cast and an ordinary URLSession call do NOT fire swift-security', () => {
  const fs = [
    added(
      'Sources/App/Net.swift',
      'let cell = view.dequeueReusableCell(withIdentifier: "row") as? RowCell',
      'let (data, _) = try await URLSession.shared.data(from: url)',
    ),
  ];
  assert.ok(!ids(fs).includes('swift-security'));
});

test('matchRules: @unchecked Sendable in a .swift file → swift-concurrency', () => {
  const fs = [added('Sources/App/Cache.swift', 'final class Cache: @unchecked Sendable {')];
  const rule = matchRules(fs).find((r) => r.id === 'swift-concurrency');
  assert.ok(rule, 'swift-concurrency should match');
  assert.equal(rule!.category, 'concurrency');
});

test('matchRules: nonisolated(unsafe) / Task.detached / an unsafe continuation → swift-concurrency', () => {
  for (const line of [
    'nonisolated(unsafe) static var shared: Cache?',
    'Task.detached { await refresh() }',
    'await withUnsafeContinuation { c in load(c) }',
    'let sem = DispatchSemaphore(value: 0)',
  ]) {
    assert.ok(ids([added('Sources/App/Job.swift', line)]).includes('swift-concurrency'), line);
  }
});

test('matchRules: an actor with a checked continuation does NOT fire swift-concurrency', () => {
  const fs = [
    added(
      'Sources/App/Job.swift',
      'actor Loader {',
      '  func load() async -> Data { await withCheckedContinuation { c in fetch(c) } }',
      '}',
    ),
  ];
  assert.ok(!ids(fs).includes('swift-concurrency'));
});

test('matchRules: try! and an [unowned self] capture in a .swift file → swift-runtime-safety', () => {
  const fs = [added('Sources/App/Store.swift', 'let model = try! JSONDecoder().decode(Model.self, from: data)')];
  assert.ok(ids(fs).includes('swift-runtime-safety'));
  assert.ok(ids([added('Sources/App/Store.swift', 'task = Task { [unowned self] in await self.refresh() }')]).includes(
    'swift-runtime-safety',
  ));
});

test('matchRules: a force cast of a deserialized value → swift-runtime-safety', () => {
  const fs = [
    added('Sources/App/Store.swift', 'let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]'),
  ];
  assert.ok(ids(fs).includes('swift-runtime-safety'));
});

test('matchRules: an ordinary as! downcast and a retry! -free throwing call do NOT fire swift-runtime-safety', () => {
  const fs = [
    added(
      'Sources/App/View.swift',
      'let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath) as! RowCell',
      'let model = try decoder.decode(Model.self, from: data)',
      'retry!(request)',
      'task = Task { [weak self] in await self?.refresh() }',
    ),
  ];
  assert.ok(!ids(fs).includes('swift-runtime-safety'));
});
