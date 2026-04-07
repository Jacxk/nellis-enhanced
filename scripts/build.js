/**
 * Build script for bundling the extension with esbuild.
 * Handles Chromium and Firefox builds with appropriate manifest copying.
 */

import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

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

  await Promise.all([
    build({
      entryPoints: [contentScriptSrc],
      bundle: true,
      outfile: join(DIST_DIR, 'contentScript.bundle.js'),
      format: 'iife',
      target: ['chrome100'],
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
      target: ['chrome100'],
      minify: true,
      sourcemap: false,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    }),
  ]);

  // Copy manifest
  copyFileSync(manifestSrc, join(DIST_DIR, 'manifest.json'));

  // Build icons
  const iconsDir = join(DIST_DIR, 'icons');
  mkdirSync(iconsDir, { recursive: true });

  const iconSourceJpg = join(ROOT_DIR, 'public', 'icon.jpg');

  if (!existsSync(iconSourceJpg)) {
    throw new Error(`Missing icon source file: ${iconSourceJpg}`);
  }

  const iconSizes = [16, 48, 128];
  await Promise.all(
    iconSizes.map((size) =>
      sharp(iconSourceJpg)
        .resize(size, size, { fit: 'cover' })
        .png()
        .toFile(join(iconsDir, `icon${size}.png`))
    )
  );

  console.log(`Build complete! Output in ${DIST_DIR}`);
  console.log(`\nTo load in Chrome:`);
  console.log(`1. Open chrome://extensions/`);
  console.log(`2. Enable "Developer mode"`);
  console.log(`3. Click "Load unpacked"`);
  console.log(`4. Select the dist/ folder`);
}

bundle().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
