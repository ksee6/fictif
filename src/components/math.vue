<template>
  <span
    class="mist-math"
    :class="isDisplayMode ? 'mist-math-block block text-center my-4 overflow-x-auto overflow-y-hidden' : 'inline-block align-middle'"
    v-html="renderedHtml"
  />
</template>

<script setup lang="ts">
import { computed, useSlots, type VNode, Comment, Text } from "vue";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathProps {
  expr?: string;
  display?: boolean | string;
  throwOnError?: boolean;
}

const props = withDefaults(defineProps<MathProps>(), {
  expr: undefined,
  display: undefined,
  throwOnError: false,
});

const slots = useSlots();

function extractText(vnode: any): string {
  if (vnode === null || vnode === undefined) return "";
  if (typeof vnode === "string") return vnode;
  if (typeof vnode === "number" || typeof vnode === "boolean") return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(extractText).join("");
  if (vnode.type === Comment) return "";
  if (vnode.type === Text || typeof vnode.children === "string") {
    return typeof vnode.children === "string" ? vnode.children : "";
  }
  if (Array.isArray(vnode.children)) {
    return vnode.children.map(extractText).join("");
  }
  return "";
}

const rawContent = computed<string>(() => {
  if (props.expr !== undefined) return props.expr;
  const defSlot = (slots as any).default;
  if (defSlot) {
    return extractText(defSlot());
  }
  return "";
});

const isDisplayMode = computed<boolean>(() => {
  if (props.display !== undefined) {
    return props.display === true || props.display === "true";
  }
  const trimmed = rawContent.value.trim();
  return trimmed.startsWith("$$") && trimmed.endsWith("$$");
});

const cleanExpr = computed<string>(() => {
  let content = rawContent.value.trim();
  // Strip $$ or $ wrappers if present
  if (content.startsWith("$$") && content.endsWith("$$") && content.length >= 4) {
    content = content.slice(2, -2).trim();
  } else if (content.startsWith("$") && content.endsWith("$") && content.length >= 2) {
    content = content.slice(1, -1).trim();
  }
  return content;
});

const renderedHtml = computed<string>(() => {
  if (!cleanExpr.value) return "";
  try {
    return katex.renderToString(cleanExpr.value, {
      displayMode: isDisplayMode.value,
      throwOnError: props.throwOnError,
    });
  } catch (err: any) {
    return `<span class="mist-math-error text-red-500">${err.message || err}</span>`;
  }
});
</script>
