// Maintainer-only SDK artifact preparation. No model downloads, inference,
// deployment, app/demo builds, tests or project typecheck are performed here.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = join(root, 'src');
const outputRoot = join(root, 'runtime');
const manifestPath = join(root, 'asset-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const mime = {
  '.json': 'application/json', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.txt': 'text/plain', '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
};
const registry = manifest.assets.map((asset) =>
  `  ${JSON.stringify(asset.path)}: { bytes: ${asset.bytes}, sha256: ${JSON.stringify(asset.sha256)}, mime: ${JSON.stringify(mime[extname(asset.path)] || 'application/octet-stream')} }`,
);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, 'workers'), { recursive: true });
await writeFile(join(sourceRoot, 'prepared-manifest.ts'), `// Generated from asset-manifest.json by SDK artifact preparation.\nexport interface PreparedAsset { bytes: number; sha256: string; mime: string }\nexport const preparedAssetManifest: Record<string, PreparedAsset> = {\n${registry.join(',\n')}\n};\n`);

const generation = await build({
  entryPoints: [join(sourceRoot, 'workers/generate.worker.ts')], bundle: true,
  format: 'iife', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent',
});
const workerSources = {
  analysis: await readFile(join(sourceRoot, 'workers/analysis.worker.js'), 'utf8'),
  generation: generation.outputFiles[0].text,
};
for (const [name, code] of Object.entries(workerSources)) {
  await writeFile(join(outputRoot, 'workers', `${name}.worker.js`), code);
  await writeFile(join(outputRoot, 'workers', `${name}-source.js`), `// Prepared worker source, loaded by the SDK as a classic Blob worker.\nexport default ${JSON.stringify(code)};\n`);
  await writeFile(join(outputRoot, 'workers', `${name}-source.d.ts`), 'declare const source: string;\nexport default source;\n');
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(filename);
  }
  return files;
}
const files = await sourceFiles(sourceRoot);
for (const filename of files) {
  if (filename.includes('/workers/')) continue;
  const output = join(outputRoot, relative(sourceRoot, filename).replace(/\.ts$/, '.js'));
  await mkdir(dirname(output), { recursive: true });
  const result = ts.transpileModule(await readFile(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, isolatedModules: true },
    fileName: filename,
  });
  await writeFile(output, result.outputText);
}
const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: true, skipLibCheck: true, types: [], declaration: true, emitDeclarationOnly: true,
  noEmitOnError: false, rootDir: sourceRoot, outDir: outputRoot,
});
const result = program.emit();
if (result.emitSkipped) throw new Error('SDK declaration artifacts could not be emitted.');
await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify({
  packageVersion: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
  assetCount: manifest.assets.length,
  assetManifestSHA256: createHash('sha256').update(await readFile(manifestPath)).digest('hex'),
  sourceSHA256: Object.fromEntries(await Promise.all(files.map(async (filename) => [relative(root, filename), createHash('sha256').update(await readFile(filename)).digest('hex')]))),
}, null, 2)}\n`);
console.log(`Prepared SDK JavaScript, declarations, two workers and metadata for ${manifest.assets.length} CDN assets.`);
