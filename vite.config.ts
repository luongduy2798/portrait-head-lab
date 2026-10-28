import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5187, strictPort: true },
  build: { target: 'es2022' },
});
