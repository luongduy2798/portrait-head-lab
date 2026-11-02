export interface PortraitHeadAssetsOptions {
  /** Path relative to Vite's base. Defaults to assets/portrait-head/. */
  basePath?: string;
  /** Include prepared assets in build output; defaults to true. Disable when using a CDN. */
  emitAssets?: boolean;
}

// A structural plugin type avoids coupling consumers to Vite 5 or Vite 7 types.
export function portraitHeadAssets(options?: PortraitHeadAssetsOptions): { name: string };
