import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5170,
    open: false,     // Hekatan Calc abrira en WebView2
    host: 'localhost'
  },
  build: {
    outDir: 'dist'
  }
});
