import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dts from "vite-plugin-dts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    UnoCSS(),
    vue(),
    dts({
      insertTypesEntry: true,
      cleanVueFileName: false,
    }),
  ],
  build: {
    target: "esnext",
    cssCodeSplit: false,
    outDir: path.resolve(__dirname, "./dist"),
    lib: {
      entry: {
        index: path.resolve(__dirname, "./src/index.ts"),
        "client/index": path.resolve(__dirname, "./src/index.ts"),
        "plugin/index": path.resolve(__dirname, "./src/plugin/index.ts"),
        path: path.resolve(__dirname, "./src/path.ts"),
        router: path.resolve(__dirname, "./src/router.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      // Robust external handling to prevent absolute paths in output
      external: [
        "vue",
        "@vitejs/plugin-vue",
        "vite",
        "fast-glob",
        "markdown-it",
        "markdown-it-mathjax3",
        "unplugin-vue-markdown",
        "unplugin-vue-markdown/vite",
        "node:path",
        "node:fs",
        "node:url",
        "virtual:mist-pages-data",
        "virtual:mist-views-data"
      ],
      output: {
        exports: "named",
        entryFileNames: "[name].js",
        chunkFileNames: "shared/[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
