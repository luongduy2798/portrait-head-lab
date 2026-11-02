import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { dedupe: ['three'] },
  server: { port: 5187, strictPort: true },
  build: { target: 'es2022' },
});
