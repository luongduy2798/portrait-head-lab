/** URLs are explicit so one library can be used by different hosts/base paths. */
export interface HeadAssetOptions { assetBaseUrl: string }

export function headAssetURL(options: HeadAssetOptions, path: string): string {
  return new URL(path, options.assetBaseUrl.replace(/\/?$/, '/')).href;
}

export function headWorkerAssets(options: HeadAssetOptions) {
  return {
    runtime: headAssetURL(options, 'runtime/'),
    landmarker: headAssetURL(options, 'face_landmarker.task'),
    segmenter: headAssetURL(options, 'selfie_multiclass.tflite'),
  };
}

/** A session can stop waiting without aborting another session's shared assets. */
export function waitForHeadAssets<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}
