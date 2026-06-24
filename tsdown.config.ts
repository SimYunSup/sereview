import { defineConfig } from 'tsdown';

// Two entries, two outputs (paths line up with package.json `bin`/`exports`):
//   src/core/index.ts → dist/core/index.js   (library, `.` export, with .d.ts)
//   src/cli/index.ts  → dist/cli/index.js    (the `sereview` bin, shebang preserved)
export default defineConfig({
  entry: ['src/core/index.ts', 'src/cli/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  // The package is `"type": "module"`, so plain `.js` is already ESM — emit `.js`
  // (not `.mjs`) so it lines up with package.json `bin`/`exports`.
  outExtensions: () => ({ js: '.js' }),
});
