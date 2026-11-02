import { gunzip } from 'three/addons/libs/fflate.module.js';
import { preparedAssetManifest } from './prepared-manifest.js';
import { HeadError } from './errors.js';

export function preparedAssetInfo(path: string) {
  const asset = preparedAssetManifest[path];
  if (!asset) throw new HeadError('assets');
  return asset;
}

/** Lazy compressed payloads keep model data out of the initial SDK module. */
export async function readPreparedAsset(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const asset = preparedAssetInfo(path);
  const { default: encoded } = await asset.load();
  const compressed = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Promise((resolve, reject) => {
    gunzip(compressed, { consume: true }, (error, bytes) => {
      if (error) { reject(new HeadError('assets')); return; }
      resolve(Uint8Array.from(bytes));
    });
  });
}
