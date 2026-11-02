import { defineConfig } from 'vite';
import { portraitHeadAssets } from '@twa/portrait-head/vite';

export default defineConfig({
  plugins: [portraitHeadAssets()],
  server: { port: 5187, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
