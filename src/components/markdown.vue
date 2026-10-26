<template>
  <div class="fictif-markdown max-w-full text-inherit prose dark:prose-invert">
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
      <div
        v-else
        class="fictif-markdown-html [&_h1]:text-2rem [&_h1]:font-bold [&_h1]:my-6 [&_h1]:text-slate-50 [&_h2]:text-1.5rem [&_h2]:font-semibold [&_h2]:my-5 [&_h2]:text-slate-100 [&_h3]:text-1.25rem [&_h3]:font-semibold [&_h3]:my-4 [&_h3]:text-slate-200 [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-slate-300 [&_ul]:my-3 [&_ul]:pl-6 [&_ul]:text-slate-300 [&_ol]:my-3 [&_ol]:pl-6 [&_ol]:text-slate-300 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-sky-400 [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:text-slate-400 [&_blockquote]:italic [&_a]:text-sky-400 [&_a]:underline [&_code:not(.fictif-code-editor_code)]:bg-white/8 [&_code:not(.fictif-code-editor_code)]:text-sky-400 [&_code:not(.fictif-code-editor_code)]:px-1.5 [&_code:not(.fictif-code-editor_code)]:py-0.5 [&_code:not(.fictif-code-editor_code)]:rounded [&_code:not(.fictif-code-editor_code)]:text-[0.875em]"
        v-html="block.html"
      />
    </template>

    <!-- Hidden slot to keep Vue reactivity -->
    <div class="hidden">
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
