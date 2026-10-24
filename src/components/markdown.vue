<template>
  <div class="fictif-markdown prose dark:prose-invert">
    <template v-for="(block, idx) in parsedBlocks" :key="idx">
      <!-- Code Block: Rendered with <Code> -->
      <Code
        v-if="block.type === 'code'"
        :lang="block.lang"
        :code="block.code"
        :lineNum="true"
        :write="false"
      />
      <!-- Semantic HTML block (headings, paragraphs, lists, tables, etc. with math) -->
      <div v-else class="fictif-markdown-html" v-html="block.html" />
    </template>

    <!-- Hidden slot to keep Vue reactivity -->
    <div style="display: none;">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots, type VNode, Comment, Text } from "vue";
import { marked, type Tokens } from "marked";
import katex from "katex";
import "katex/dist/katex.min.css";
import Code from "./code.vue";

interface MarkdownProps {
  content?: string;
}

const props = withDefaults(defineProps<MarkdownProps>(), {
  content: undefined,
});

const slots = useSlots();

function extractText(vnode: any): string {
  if (vnode === null || vnode === undefined) return "";
  if (typeof vnode === "string") return vnode;
  if (typeof vnode === "number" || typeof vnode === "boolean") return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(extractText).join("");
  if (vnode.type === Comment) return "";
  if (vnode.type === "pre") {
    if (typeof vnode.children === "string") return vnode.children;
    if (Array.isArray(vnode.children)) return vnode.children.map(extractText).join("");
  }
  if (typeof vnode.children === "string") return vnode.children;
  if (Array.isArray(vnode.children)) return vnode.children.map(extractText).join("");
  if (typeof vnode.children === "object" && vnode.children !== null) return extractText(vnode.children);
  return "";
}

function cleanMarkdown(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n");

  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) return "";

  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
      if (leadingSpaces < minIndent) {
        minIndent = leadingSpaces;
      }
    }
  }

  if (minIndent > 0 && minIndent !== Infinity) {
    return lines.map((l) => (l.length >= minIndent ? l.slice(minIndent) : l)).join("\n");
  }

  return lines.join("\n");
}

const rawMarkdown = computed<string>(() => {
  if (props.content !== undefined) return props.content;
  const defSlot = (slots as any).default;
  if (defSlot) {
    const raw = extractText(defSlot());
    return cleanMarkdown(raw);
  }
  return "";
});

function renderLatex(html: string): string {
  // 1. Replace $$ ... $$ display math
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return expr;
    }
  });

  // 2. Replace $ ... $ inline math
  html = html.replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return expr;
    }
  });

  return html;
}

interface MarkdownBlock {
  type: "code" | "html";
  code?: string;
  lang?: string;
  html?: string;
}

const parsedBlocks = computed<MarkdownBlock[]>(() => {
  const text = rawMarkdown.value;
  if (!text) return [];

  const tokens = marked.lexer(text);
  const blocks: MarkdownBlock[] = [];
  let htmlTokenBuffer: any[] = [];

  function flushBuffer() {
    if (htmlTokenBuffer.length > 0) {
      const parsedHtml = marked.parser(htmlTokenBuffer);
      const withMath = renderLatex(parsedHtml);
      blocks.push({
        type: "html",
        html: withMath,
      });
      htmlTokenBuffer = [];
    }
  }

  for (const token of tokens) {
    if (token.type === "code") {
      flushBuffer();
      blocks.push({
        type: "code",
        code: token.text,
        lang: token.lang || "javascript",
      });
    } else {
      htmlTokenBuffer.push(token);
    }
  }

  flushBuffer();
  return blocks;
});
</script>

<style scoped>
.fictif-markdown {
  max-width: 100%;
  color: inherit;
}

.fictif-markdown-html :deep(h1) {
  font-size: 2rem;
  font-weight: 700;
  margin: 1.5rem 0 0.75rem 0;
  color: #f8fafc;
}

.fictif-markdown-html :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 1.25rem 0 0.65rem 0;
  color: #f1f5f9;
}

.fictif-markdown-html :deep(h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem 0;
  color: #e2e8f0;
}

.fictif-markdown-html :deep(p) {
  margin: 0.75rem 0;
  line-height: 1.65;
  color: #cbd5e1;
}

.fictif-markdown-html :deep(ul),
.fictif-markdown-html :deep(ol) {
  margin: 0.75rem 0;
  padding-left: 1.5rem;
  color: #cbd5e1;
}

.fictif-markdown-html :deep(li) {
  margin: 0.25rem 0;
}

.fictif-markdown-html :deep(blockquote) {
  border-left: 4px solid #38bdf8;
  padding-left: 1rem;
  margin: 1rem 0;
  color: #94a3b8;
  font-style: italic;
}

.fictif-markdown-html :deep(a) {
  color: #38bdf8;
  text-decoration: underline;
}

.fictif-markdown-html :deep(code:not(.fictif-code-editor code)) {
  background: rgba(255, 255, 255, 0.08);
  color: #38bdf8;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  font-size: 0.875em;
}
</style>
