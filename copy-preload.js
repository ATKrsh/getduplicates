import fs from 'fs';
import path from 'path';

const src = path.resolve('electron', 'preload.cjs');
const dest = path.resolve('dist-electron', 'preload.cjs');

try {
  if (!fs.existsSync(path.dirname(dest))) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
  }
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('[Build] Copied electron/preload.cjs -> dist-electron/preload.cjs');
  }
} catch (err) {
  console.error('[Build Error] Failed to copy preload.cjs:', err);
}
