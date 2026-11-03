import { preparedAssetManifest } from './prepared-manifest.js';
import { HeadError } from './errors.js';

export function preparedAssetInfo(path: string) {
  const asset = preparedAssetManifest[path];
  if (!asset) throw new HeadError('assets');
  return asset;
}
