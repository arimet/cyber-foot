import { defineConfig } from 'vite'

export default defineConfig({
  // relative URLs: the build works under any sub-path (GitHub Pages)
  base: './',
  // ponytail: rapier3d-compat inlines its WASM as base64 (~4.9 MB, ~1.8 MB gzipped); the non-compat package
  // with a separate .wasm file would cut that if load time on phones matters
  build: { chunkSizeWarningLimit: 5000 },
})
