import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "hekatan-math": resolve(__dirname, "../hekatan-math/src"),
      "awatif-fem": resolve(__dirname, "../hekatan-math/src/awatif-fem"),
      "awatif-ui": resolve(__dirname, "src/awatif-ui"),
      "awatif-mesh": resolve(__dirname, "../hekatan-math/src/awatif-mesh"),
    },
  },
  server: {
    port: 4610,
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        editor: resolve(__dirname, "editor/index.html"),
        hekatanEditor: resolve(__dirname, "src/editor/index.html"),
        mathcanvas: resolve(__dirname, "src/mathcanvas/index.html"),
      },
    },
  },
});
