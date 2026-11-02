import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const assetRoot = path.join(packageRoot, 'assets');
const manifestPath = path.join(packageRoot, 'asset-manifest.json');
const mime = {
  '.json': 'application/json', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.txt': 'text/plain', '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
};

function manifestAssets() {
  return JSON.parse(readFileSync(manifestPath, 'utf8')).assets;
}

async function assetBytes(asset) {
  const filename = path.resolve(packageRoot, asset.sourceFile);
  if (!filename.startsWith(`${assetRoot}${path.sep}`)) throw new Error('Invalid portrait asset path.');
  const bytes = await readFile(filename);
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`Pinned portrait asset does not match: ${asset.path}`);
  }
  return bytes;
}

/** Both consumers read the package's files directly. No preparation/copy in apps. */
export function portraitHeadAssets({ basePath = 'assets/portrait-head/', emitAssets = true } = {}) {
  const prefix = `/${basePath.replace(/^\/+|\/+$/g, '')}/`;
  let building = false;
  return {
    name: 'portrait-head-shared-assets',
    config() {
      return {
        resolve: { dedupe: ['three'] },
        optimizeDeps: { exclude: ['@twa/portrait-head'] },
      };
    },
    configResolved(config) { building = config.command === 'build'; },
    configureServer(server) {
      // Extend the resolved allowlist, preserving Vite's workspace discovery.
      server.config.server.fs.allow.push(path.join(packageRoot, 'src'));
      const base = server.config.base.replace(/\/$/, '');
      server.watcher.add([assetRoot, manifestPath]);
      server.watcher.on('change', (filename) => {
        if (filename === manifestPath || filename.startsWith(`${assetRoot}${path.sep}`)) {
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.middlewares.use(async (request, response, next) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
        catch { next(); return; }
        if (base && pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
        if (!pathname.startsWith(prefix)) { next(); return; }
        const filename = pathname.slice(prefix.length);
        try {
          const asset = manifestAssets().find((entry) => entry.path === filename);
          if (!asset) { response.statusCode = 404; response.end('Unknown portrait asset.'); return; }
          const bytes = await assetBytes(asset);
          response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(bytes);
        } catch (error) {
          response.statusCode = error.code === 'ENOENT' ? 404 : 500;
          response.end('Portrait asset missing or checksum mismatch. Restore the pinned asset from portrait-head-lab.');
        }
      });
    },
    async buildStart() {
      if (!building || !emitAssets) return;
      for (const asset of manifestAssets()) {
        this.emitFile({ type: 'asset', fileName: `${prefix.slice(1)}${asset.path}`, source: await assetBytes(asset) });
      }
    },
  };
}
