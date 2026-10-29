<template>
  <div
    class="mist-code-wrapper relative bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35)] my-4 flex flex-col"
    :class="{ 'mist-code-editable': isWritable }"
  >
    <!-- CodeMirror Editor Container (clean, no titlebar or copy button) -->
    <div ref="editorContainerRef" class="mist-code-editor w-full" />

    <!-- Hidden slot container for Vue slot reactivity -->
    <div class="hidden">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  useSlots,
  onMounted,
  onBeforeUnmount,
  watch,
  type VNode,
  Comment,
  Text,
} from "vue";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Language support loaders
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { vue } from "@codemirror/lang-vue";

interface CodeProps {
  lang?: string;
  write?: boolean | string;
  lineNum?: boolean | string;
  extensions?: Extension[];
  modelValue?: string;
  code?: string;
}

const props = withDefaults(defineProps<CodeProps>(), {
  lang: "javascript",
  write: false,
  lineNum: true,
  extensions: () => [],
  modelValue: undefined,
  code: undefined,
});

const emit = defineEmits<{
  (e: "update:modelValue", val: string): void;
  (e: "change", val: string): void;
}>();

const slots = useSlots();
const editorContainerRef = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

const isWritable = computed(() => {
  return props.write === true || props.write === "true";
});

const showLineNumbers = computed(() => {
  return props.lineNum !== false && props.lineNum !== "false";
});

// Compartments for dynamic reconfiguration
const readOnlyCompartment = new Compartment();
const editableCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const languageCompartment = new Compartment();
const userExtensionsCompartment = new Compartment();

// Tailwind Dark theme styling for CodeMirror
const tailwindDarkTheme = EditorView.theme(
  {
    "&": {
      color: "#f8fafc",
      backgroundColor: "#0f172a", // slate-900
      fontSize: "0.875rem",
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: "1.65",
    },
    ".cm-content": {
      caretColor: "#38bdf8", // sky-400
      padding: "0.75rem 0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#38bdf8",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(56, 189, 248, 0.25) !important",
    },
    ".cm-gutters": {
      backgroundColor: "#0f172a",
      color: "#475569", // slate-600
      borderRight: "1px solid rgba(255, 255, 255, 0.06)",
      paddingLeft: "0.5rem",
      paddingRight: "0.5rem",
      userSelect: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.025)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#94a3b8", // slate-400
    },
    ".cm-line": {
      paddingLeft: "1rem",
      paddingRight: "1rem",
    },
    ".cm-scroller": {
      overflow: "auto",
      scrollbarWidth: "thin",
      scrollbarColor: "rgba(255, 255, 255, 0.2) transparent",
    },
  },
  { dark: true }
);

// High-contrast modern syntax highlighting
const tailwindHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c084fc", fontWeight: "600" }, // purple-400
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#e2e8f0" },
  { tag: [t.function(t.variableName), t.labelName], color: "#38bdf8" }, // sky-400
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#fb923c" }, // orange-400
  { tag: [t.definition(t.name), t.separator], color: "#f8fafc" },
  { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#f472b6" }, // pink-400
  { tag: [t.number], color: "#fbbf24" }, // amber-400
  { tag: [t.bool, t.null], color: "#fb923c", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "#34d399" }, // emerald-400
  { tag: [t.regexp, t.escape], color: "#f43f5e" }, // rose-500
  { tag: [t.variableName], color: "#e2e8f0" },
  { tag: [t.operator, t.operatorKeyword], color: "#94a3b8" }, // slate-400
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#64748b", fontStyle: "italic" }, // slate-500
  { tag: [t.tagName], color: "#60a5fa" }, // blue-400
  { tag: [t.attributeName], color: "#fbbf24" }, // amber-400
  { tag: [t.attributeValue], color: "#34d399" }, // emerald-400
]);

function resolveLanguage(langName?: string): Extension {
  if (!langName) return [];
  const normalized = langName.toLowerCase().trim();

  switch (normalized) {
    case "js":
    case "javascript":
      return javascript();
    case "ts":
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "html":
      return html();
    case "vue":
      return vue();
    case "css":
      return css();
    case "json":
      return json();
    case "py":
    case "python":
      return python();
    case "md":
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

// Extract code from slot VNodes without falling for HTML tags
function formatProps(propsObj?: Record<string, any>): string {
  if (!propsObj) return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(propsObj)) {
    if (key === "children") continue;
    if (val === true) {
      parts.push(key);
    } else if (typeof val === "string") {
      parts.push(`${key}="${val}"`);
    } else if (typeof val === "number") {
      parts.push(`:${key}="${val}"`);
    } else if (typeof val === "function") {
      const cleanKey = key.startsWith("on") ? `@${key.slice(2).toLowerCase()}` : `:${key}`;
      parts.push(`${cleanKey}="..."`);
    }
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

function renderVNodeToCode(vnode: any): string {
  if (vnode === null || vnode === undefined) return "";
  if (typeof vnode === "string") return vnode;
  if (typeof vnode === "number" || typeof vnode === "boolean") return String(vnode);

  if (Array.isArray(vnode)) {
    return vnode.map(renderVNodeToCode).join("");
  }

  if (vnode.type === Comment) {
    return "";
  }

  // Pre wrapper injected by compiler plugin to preserve newlines
  if (vnode.type === "pre") {
    if (typeof vnode.children === "string") return vnode.children;
    if (Array.isArray(vnode.children)) return vnode.children.map(renderVNodeToCode).join("");
    return "";
  }

  // Text nodes
  if (vnode.type === Text || typeof vnode.children === "string") {
    const text = typeof vnode.children === "string" ? vnode.children : "";
    if (typeof vnode.type === "string") {
      const attrs = formatProps(vnode.props);
      return `<${vnode.type}${attrs}>${text}</${vnode.type}>`;
    }
    return text;
  }

  // Fragment
  if (typeof vnode.type === "symbol" && Array.isArray(vnode.children)) {
    return vnode.children.map(renderVNodeToCode).join("");
  }

  // DOM elements or components (e.g. <Must> or <div>)
  if (typeof vnode.type === "string") {
    const tagName = vnode.type;
    const attrs = formatProps(vnode.props);
    const inner = Array.isArray(vnode.children) ? vnode.children.map(renderVNodeToCode).join("") : "";
    if (!inner && !attrs) {
      return `<${tagName} />`;
    }
    return `<${tagName}${attrs}>${inner}</${tagName}>`;
  }

  // Vue Component definition VNode
  if (typeof vnode.type === "object" && vnode.type) {
    const compName = vnode.type.name || vnode.type.__name || "Component";
    const attrs = formatProps(vnode.props);
    const inner = Array.isArray(vnode.children) ? vnode.children.map(renderVNodeToCode).join("") : "";
    if (!inner && !attrs) {
      return `<${compName} />`;
    }
    return `<${compName}${attrs}>${inner}</${compName}>`;
  }

  return "";
}

// Clean and dedent code
function cleanCode(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n");

  // Remove leading and trailing empty lines
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) return "";

  // Find minimum common indentation across non-empty lines
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

function getInitialCode(): string {
  if (props.modelValue !== undefined) return props.modelValue;
  if (props.code !== undefined) return props.code;
  if (slots.default) {
    const raw = renderVNodeToCode((slots.default as any)());
    return cleanCode(raw);
  }
  return "";
}

function initEditor() {
  if (!editorContainerRef.value) return;

  const initialDoc = getInitialCode();

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      tailwindDarkTheme,
      syntaxHighlighting(tailwindHighlightStyle),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      highlightActiveLine(),
      highlightActiveLineGutter(),

      // Compartmentalized extensions
      lineNumbersCompartment.of(showLineNumbers.value ? lineNumbers() : []),
      readOnlyCompartment.of(EditorState.readOnly.of(!isWritable.value)),
      editableCompartment.of(EditorView.editable.of(isWritable.value)),
      languageCompartment.of(resolveLanguage(props.lang)),
      userExtensionsCompartment.of(props.extensions || []),

      // Listen for changes
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          emit("update:modelValue", newDoc);
          emit("change", newDoc);
        }
      }),
    ],
  });

  view = new EditorView({
    state,
    parent: editorContainerRef.value,
  });
}

// Watch props and reconfigure compartments dynamically
watch(
  () => props.lang,
  (newLang) => {
    if (view) {
      view.dispatch({
        effects: languageCompartment.reconfigure(resolveLanguage(newLang)),
      });
    }
  }
);

watch(
  () => props.write,
  () => {
    if (view) {
      view.dispatch({
        effects: [
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(!isWritable.value)),
          editableCompartment.reconfigure(EditorView.editable.of(isWritable.value)),
        ],
      });
    }
  }
);

watch(
  () => props.lineNum,
  () => {
    if (view) {
      view.dispatch({
        effects: lineNumbersCompartment.reconfigure(showLineNumbers.value ? lineNumbers() : []),
      });
    }
  }
);

watch(
  () => props.extensions,
  (newExts) => {
    if (view) {
      view.dispatch({
        effects: userExtensionsCompartment.reconfigure(newExts || []),
      });
    }
  },
  { deep: true }
);

// Watch code/modelValue prop changes
watch(
  () => props.modelValue ?? props.code,
  (newVal) => {
    if (newVal !== undefined && view) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== newVal) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: newVal },
        });
      }
    }
  }
);

onMounted(() => {
  initEditor();
});

onBeforeUnmount(() => {
  if (view) {
    view.destroy();
    view = null;
  }
});
</script>
