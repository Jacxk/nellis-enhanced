/**
 * Build script for bundling the extension with esbuild.
 * Handles Chromium and Firefox builds with appropriate manifest copying.
 */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const ROOT_DIR = resolve(__dirname, '..');
const SRC_DIR = join(ROOT_DIR, 'src');
const DIST_DIR = join(ROOT_DIR, 'dist');

const browser = process.argv[2] || 'chromium';

async function bundle() {
  console.log(`Building for ${browser}...`);

  // Clean dist directory
  try {
    rmSync(DIST_DIR, { recursive: true, force: true });
  } catch (e) {
    // ignore if doesn't exist
  }

  mkdirSync(DIST_DIR, { recursive: true });

  const browserSrcDir = join(SRC_DIR, browser);
  const sharedSrcDir = join(SRC_DIR, 'shared');

  // Determine entry point and manifest
  const manifestSrc = join(browserSrcDir, 'manifest.json');
  const contentScriptSrc = join(browserSrcDir, 'contentScript.js');
  const backgroundScriptSrc = join(browserSrcDir, 'background.js');
  const buildTarget = browser === 'firefox' ? ['firefox121'] : ['chrome100'];

  await Promise.all([
    build({
      entryPoints: [contentScriptSrc],
      bundle: true,
      outfile: join(DIST_DIR, 'contentScript.bundle.js'),
      format: 'iife',
      target: buildTarget,
      minify: true,
      sourcemap: false,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    }),
    build({
      entryPoints: [backgroundScriptSrc],
      bundle: true,
      outfile: join(DIST_DIR, 'background.bundle.js'),
      format: 'esm',
      target: buildTarget,
      minify: true,
      sourcemap: false,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    }),
  ]);

  // Copy manifest
  copyFileSync(manifestSrc, join(DIST_DIR, 'manifest.json'));

  // Create icons directory (placeholder - you should add real icons)
  const iconsDir = join(DIST_DIR, 'icons');
  mkdirSync(iconsDir, { recursive: true });

  // Create placeholder icon files (1x1 transparent PNG)
  const placeholderPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  writeFileSync(join(iconsDir, 'icon16.png'), placeholderPng);
  writeFileSync(join(iconsDir, 'icon48.png'), placeholderPng);
  writeFileSync(join(iconsDir, 'icon128.png'), placeholderPng);

  console.log(`Build complete! Output in ${DIST_DIR}`);
  const extensionsPage = browser === 'firefox' ? 'about:debugging#/runtime/this-firefox' : 'chrome://extensions/';
  console.log(`\nTo load in ${browser === 'firefox' ? 'Firefox' : 'Chrome'}:`);
  console.log(`1. Open ${extensionsPage}`);
  console.log(`2. Enable "Developer mode"`);
  console.log(
    browser === 'firefox'
      ? `3. Click "Load Temporary Add-on" and choose dist/manifest.json`
      : `3. Click "Load unpacked"`
  );
  if (browser !== 'firefox') {
    console.log(`4. Select the dist/ folder`);
  }
}

bundle().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
