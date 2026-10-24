import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import Markdown from "unplugin-vue-markdown/vite";
// @ts-ignore
import mathjax3 from "markdown-it-mathjax3";

import type {
  FictifOptions,
  FictifPlugin,
  ResolvedFictifOptions,
  ViewManifest,
} from "./types.js";
import { buildViewManifest, generateVirtualViewsModule } from "./manifest.js";

const VIRTUAL_VIEWS_ID = "virtual:fictif-views-data";
const RESOLVED_VIRTUAL_VIEWS_ID = "\0" + VIRTUAL_VIEWS_ID;

function injectInheritAttrsFalse(code: string): string {
  if (!code.includes("<script setup")) return code;

  const defineOptionsRegex = /defineOptions\s*\(\s*{([\s\S]*?)}\s*\)/;

  if (defineOptionsRegex.test(code)) {
    // Already has defineOptions — try merging into it
    return code.replace(defineOptionsRegex, (match, content) => {
      // If it already contains inheritAttrs, leave it alone
      if (/inheritAttrs\s*:/.test(content)) return match;

      // Else, inject inheritAttrs: false
      const newContent = content.trim().endsWith(",")
        ? `${content} inheritAttrs: false`
        : `${content}, inheritAttrs: false`;

      return `defineOptions({${newContent}})`;
    });
  } else {
    // No defineOptions present — inject a new one after <script setup>
    return code.replace(
      /<script setup(.*?)>/,
      `<script setup$1>\ndefineOptions({ inheritAttrs: false });`,
    );
  }
}

export default function fictif(userOptions: FictifOptions = {}): any {
  let config: ResolvedConfig;
  let manifest: ViewManifest;
  let options: ResolvedFictifOptions;

  let rebuildTimeout: NodeJS.Timeout | null = null;
  let rebuildInProgress = false;

  function scheduleManifestRebuild(server: ViteDevServer) {
    if (rebuildInProgress) return;
    if (rebuildTimeout) clearTimeout(rebuildTimeout);

    rebuildTimeout = setTimeout(async () => {
      rebuildInProgress = true;
      try {
        manifest = await buildViewManifest(options);

        const module = server.moduleGraph.getModuleById(
          RESOLVED_VIRTUAL_VIEWS_ID,
        );
        if (module) {
          server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: "full-reload" });
        }
      } catch (err) {
        console.error("[Fictif] Failed to rebuild manifest:", err);
      } finally {
        rebuildInProgress = false;
      }
    }, 10);
  }

  const fictifPlugin: FictifPlugin = {
    name: "vite-plugin-fictif",
    enforce: "pre",
    api: { getManifest: () => manifest },

    config(config) {
      config.optimizeDeps ??= {};
      config.optimizeDeps.exclude ??= [];
      if (!config.optimizeDeps.exclude.includes(VIRTUAL_VIEWS_ID)) {
        config.optimizeDeps.exclude.push(VIRTUAL_VIEWS_ID);
      }
    },

    configResolved(_config) {
      config = _config;
      const root = config.root;

      let viewsOptions: ResolvedFictifOptions["views"];

      const userViews = userOptions.views ?? userOptions.screens;

      if (userViews === false) {
        viewsOptions = false;
      } else {
        let globNamespaces: string[] | false;
        if (userViews?.globNamespaces === false) {
          globNamespaces = false;
        } else if (Array.isArray(userViews?.globNamespaces)) {
          globNamespaces = userViews.globNamespaces;
        } else {
          globNamespaces = ["./packages"];
        }

        viewsOptions = {
          namespaces: {
            "@": ["./src/views/**"],
            docs: "docs/**",
            ...userViews?.namespaces,
          },
          globNamespaces,
        };
      }

      options = { root, views: viewsOptions };
    },

    configureServer(server) {
      const { watcher } = server;
      const isViewFile = (file: string) =>
        options.views !== false &&
        (file.endsWith(".vue") || file.endsWith(".md"));

      const onChange = (file: string) => {
        if (isViewFile(file)) {
          // We ideally should check if it's inside one of our watched directories
          // For now, simpler check
          console.log(`[Fictif] View change detected: ${file}`);
          scheduleManifestRebuild(server);
        }
      };

      watcher.on("add", onChange);
      watcher.on("unlink", onChange);
    },

    buildStart() {
      return buildViewManifest(options).then((m) => {
        manifest = m;
      });
    },

    resolveId(id) {
      if (id === VIRTUAL_VIEWS_ID) {
        return RESOLVED_VIRTUAL_VIEWS_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_VIEWS_ID) {
        return generateVirtualViewsModule(manifest);
      }
    },

    transform(code, id) {
      if (id.includes("node_modules") || id.startsWith("\0")) return;
      if (!id.endsWith(".vue") && !id.endsWith(".md")) return;

      let transformed = code;

      // Escape raw HTML tags inside <Code> and <Markdown> slots so Vue template compiler doesn't fail on raw tags (like <Must>)
      // Match HTML comments <!-- ... --> first so tags inside comments are left completely untouched.
      // Match self-closing <Code ... /> or <Markdown ... /> so they are also untouched.
      const componentTagRegex =
        /<!--[\s\S]*?-->|<(Code|Markdown)(?:\s+[^>]*?)?\/>|<(Code|Markdown)(?:\s+([^>]*?))?>([\s\S]*?)<\/\2>/g;

      if (transformed.includes("<Markdown") || transformed.includes("<Code")) {
        transformed = transformed.replace(
          componentTagRegex,
          (match, _selfTag, pairTag, attrs, content) => {
            if (match.startsWith("<!--") || match.endsWith("/>")) {
              return match;
            }
            const tagAttrs = attrs ? ` ${attrs}` : "";
            const escaped = content.replace(
              new RegExp(`<(?!\\/${pairTag})`, "g"),
              "&lt;",
            );
            const wrappedContent = escaped.trim().startsWith("<pre")
              ? escaped
              : `<pre>${escaped}</pre>`;
            return `<${pairTag}${tagAttrs}>${wrappedContent}</${pairTag}>`;
          },
        );
      }

      if (transformed.includes("<script setup")) {
        transformed = injectInheritAttrsFalse(transformed);
      }

      return { code: transformed, map: null };
    },
  };

  const markdownPlugin = Markdown({
    markdownItSetup(md: any) {
      md.use(mathjax3);
    },

    // Allows full Vue usage in markdown
    // script setup and scoped styles are supported by default in unplugin-vue-markdown
    wrapperClasses: "prose prose-montserrat dark:prose-invert",
  });

  return [fictifPlugin, markdownPlugin];
}
