import {
  reactive,
  ref,
  computed,
  watchEffect,
  onMounted,
  onUpdated,
  onBeforeUnmount,
  getCurrentInstance,
  isRef,
  unref,
  type Ref,
  type VNode,
  type useSlots,
  Comment,
} from "vue";

export interface HeadTagDef {
  tag: string;
  props?: Record<string, any>;
  text?: string;
}

export interface HeadEntry {
  id: string;
  tags: HeadTagDef[];
}

export interface HeadConfig {
  title?: string;
  meta?: Array<Record<string, any>>;
  link?: Array<Record<string, any>>;
  script?: Array<Record<string, any> & { text?: string; content?: string }>;
  style?: Array<Record<string, any> & { text?: string; content?: string }>;
  base?: Record<string, any>;
  [key: string]: any;
}

export interface HeadHandle {
  id: string;
  update: (newConfig: HeadConfig) => void;
  destroy: () => void;
}

// Global reactive registry of active Head entries
const headEntries = ref<HeadEntry[]>([]);
let headIdCounter = 0;

/**
 * Resolves templated strings using the %separator%% (back) or %%separator% (front) syntax.
 */
export function compileTemplateString(templates: string[]): string {
  if (templates.length === 0) return "";
  if (templates.length === 1) {
    return stripTemplateMarkers(templates[0]);
  }

  // Resolve subsequent definitions first (right-to-left)
  const subsequent = compileTemplateString(templates.slice(1));
  const current = templates[0];

  // Pattern 1: %%<separator>%<base> (%% is in front -> prepend subsequent)
  const frontMatch = current.match(/^%%([\s\S]*?)%(.*)$/);
  if (frontMatch) {
    const sep = frontMatch[1];
    const base = frontMatch[2];
    return subsequent ? `${subsequent}${sep}${base}` : base;
  }

  // Pattern 2: <base>%<separator>%% (%% is in back -> append subsequent)
  const backMatch = current.match(/^(.*?)%([\s\S]*?)%%$/);
  if (backMatch) {
    const base = backMatch[1];
    const sep = backMatch[2];
    return subsequent ? `${base}${sep}${subsequent}` : base;
  }

  // No template token: first head wins as-is
  return stripTemplateMarkers(current);
}

function stripTemplateMarkers(str: string): string {
  if (!str) return "";
  str = str.replace(/^%%([\s\S]*?)%/, "");
  str = str.replace(/%([\s\S]*?)%%$/, "");
  return str.trim();
}

/**
 * Gets a unique deduplication key for tags that must be unique.
 */
function getUniqueKey(tag: HeadTagDef): string | null {
  const tagName = tag.tag.toLowerCase();
  const props = tag.props || {};

  if (tagName === "title") {
    return "title";
  }

  if (tagName === "meta") {
    if (props.name) return `meta:name:${props.name.toLowerCase()}`;
    if (props.property) return `meta:property:${props.property.toLowerCase()}`;
    if (props["http-equiv"]) return `meta:http-equiv:${props["http-equiv"].toLowerCase()}`;
    if (props.charset) return `meta:charset`;
  }

  if (tagName === "link") {
    const rel = (props.rel || "").toLowerCase();
    if (rel === "canonical") return "link:canonical";
    if (rel === "icon" || rel === "shortcut icon") return "link:icon";
  }

  if (tagName === "base") {
    return "base";
  }

  return null;
}

/**
 * Merges all active <Head> entries intelligently.
 */
export function compileHead(entries: HeadEntry[]) {
  const titles: string[] = [];
  const uniqueTagsMap = new Map<string, { tag: HeadTagDef; contents: string[] }>();
  const normalTags: HeadTagDef[] = [];

  for (const entry of entries) {
    for (const item of entry.tags) {
      const uniqueKey = getUniqueKey(item);

      if (item.tag.toLowerCase() === "title") {
        if (item.text) titles.push(item.text);
        continue;
      }

      if (uniqueKey) {
        if (!uniqueTagsMap.has(uniqueKey)) {
          uniqueTagsMap.set(uniqueKey, {
            tag: item,
            contents: item.props?.content ? [item.props.content] : [],
          });
        } else {
          // If subsequent definitions exist for a unique meta, collect content for templating
          if (item.props?.content) {
            uniqueTagsMap.get(uniqueKey)!.contents.push(item.props.content);
          }
        }
      } else {
        // Non-unique tags (scripts, stylesheets, etc.)
        normalTags.push(item);
      }
    }
  }

  // Compile final title
  const finalTitle = compileTemplateString(titles);

  // Compile unique tags (with meta content templating if applicable)
  const compiledUniqueTags: HeadTagDef[] = [];
  for (const [key, { tag, contents }] of uniqueTagsMap.entries()) {
    if (contents.length > 0 && (tag.props?.content?.includes("%%") || tag.props?.content?.includes("%"))) {
      const resolvedContent = compileTemplateString(contents);
      compiledUniqueTags.push({
        ...tag,
        props: {
          ...tag.props,
          content: resolvedContent,
        },
      });
    } else {
      // First head wins
      compiledUniqueTags.push(tag);
    }
  }

  return {
    title: finalTitle,
    tags: [...compiledUniqueTags, ...normalTags],
  };
}

/**
 * Applies compiled head tags to the real document.head.
 */
export function updateDOMHead(compiled: { title: string; tags: HeadTagDef[] }) {
  if (typeof document === "undefined" || !document.head) return;

  // 1. Update Title
  if (compiled.title) {
    document.title = compiled.title;
  }

  // 2. Reconcile Tags
  const oldElements = Array.from(document.head.querySelectorAll("[data-mist-head]"));
  const newElements: HTMLElement[] = [];

  for (const item of compiled.tags) {
    const el = document.createElement(item.tag);
    el.setAttribute("data-mist-head", "true");

    if (item.props) {
      for (const [k, v] of Object.entries(item.props)) {
        if (v !== undefined && v !== null) {
          el.setAttribute(k, String(v));
        }
      }
    }

    if (item.text) {
      el.textContent = item.text;
    }

    newElements.push(el);
  }

  // Remove obsolete elements
  for (const oldEl of oldElements) {
    oldEl.remove();
  }

  // Append new elements to document.head
  for (const newEl of newElements) {
    document.head.appendChild(newEl);
  }
}

/**
 * Head composable for managing entries.
 */
export function useHead() {
  function registerHead(tags: HeadTagDef[]): string {
    const id = `head_${++headIdCounter}`;
    headEntries.value.push({ id, tags });
    sync();
    return id;
  }

  function updateHead(id: string, tags: HeadTagDef[]) {
    const entry = headEntries.value.find((e) => e.id === id);
    if (entry) {
      entry.tags = tags;
      sync();
    }
  }

  function unregisterHead(id: string) {
    const idx = headEntries.value.findIndex((e) => e.id === id);
    if (idx !== -1) {
      headEntries.value.splice(idx, 1);
      sync();
    }
  }

  function sync() {
    const compiled = compileHead(headEntries.value);
    updateDOMHead(compiled);
  }

  return {
    registerHead,
    updateHead,
    unregisterHead,
    entries: computed(() => headEntries.value),
    getCompiled: () => compileHead(headEntries.value),
  };
}

/**
 * Converts a HeadConfig object into an array of HeadTagDef.
 */
export function parseHeadConfig(config: HeadConfig): HeadTagDef[] {
  if (!config || typeof config !== "object") return [];
  const tags: HeadTagDef[] = [];

  if (config.title !== undefined) {
    tags.push({
      tag: "title",
      text: String(config.title),
    });
  }

  if (config.base) {
    tags.push({
      tag: "base",
      props: config.base,
    });
  }

  const listKeys = ["meta", "link", "script", "style"];
  for (const key of listKeys) {
    const val = config[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (!item || typeof item !== "object") continue;
        if (key === "meta" || key === "link") {
          tags.push({
            tag: key,
            props: { ...item },
          });
        } else {
          const { text, content, children, ...props } = item;
          tags.push({
            tag: key,
            props: Object.keys(props).length > 0 ? props : undefined,
            text: text ?? content ?? children ?? undefined,
          });
        }
      }
    } else if (val && typeof val === "object") {
      if (key === "meta" || key === "link") {
        tags.push({
          tag: key,
          props: { ...val },
        });
      } else {
        const { text, content, children, ...props } = val;
        tags.push({
          tag: key,
          props: Object.keys(props).length > 0 ? props : undefined,
          text: text ?? content ?? children ?? undefined,
        });
      }
    }
  }

  for (const [k, v] of Object.entries(config)) {
    if (listKeys.includes(k) || k === "title" || k === "base") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "object" && item) {
          const { text, content, ...props } = item;
          tags.push({ tag: k, props, text: text ?? content });
        }
      }
    } else if (typeof v === "object" && v) {
      const { text, content, ...props } = v;
      tags.push({ tag: k, props, text: text ?? content });
    }
  }

  return tags;
}

/**
 * Programmatic head() function:
 * head({
 *   title: "My Page",
 *   link: [{ rel: "icon", href: "/favicon.ico" }],
 *   meta: [{ name: "description", content: "..." }]
 * })
 */
export function head(
  initialConfig: HeadConfig | Ref<HeadConfig> | (() => HeadConfig)
): HeadHandle {
  const { registerHead, updateHead, unregisterHead } = useHead();

  function getConfigValue(): HeadConfig {
    if (typeof initialConfig === "function") {
      return (initialConfig as () => HeadConfig)();
    }
    if (isRef(initialConfig)) {
      return unref(initialConfig);
    }
    return initialConfig;
  }

  const id = registerHead(parseHeadConfig(getConfigValue()));

  function update(newConfig: HeadConfig) {
    updateHead(id, parseHeadConfig(newConfig));
  }

  let cleanupWatcher: (() => void) | null = null;
  if (typeof initialConfig === "function" || isRef(initialConfig)) {
    cleanupWatcher = watchEffect(() => {
      const cfg = getConfigValue();
      updateHead(id, parseHeadConfig(cfg));
    });
  }

  function destroy() {
    if (cleanupWatcher) {
      cleanupWatcher();
      cleanupWatcher = null;
    }
    unregisterHead(id);
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      destroy();
    });
  }

  return {
    id,
    update,
    destroy,
  };
}

/**
 * Extracts text content from a Vue VNode tree.
 */
export function extractTextFromVNode(vnode: VNode): string {
  if (typeof vnode.children === "string") {
    return vnode.children;
  }
  if (Array.isArray(vnode.children)) {
    return vnode.children
      .map((c) => {
        if (typeof c === "string") return c;
        if (typeof c === "object" && c && (c as VNode).children) {
          return extractTextFromVNode(c as VNode);
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * Parses default slot VNodes of <Head> component into HeadTagDef array.
 */
export function parseSlotVNodes(slots: { default?: (...args: any[]) => any }): HeadTagDef[] {
  if (!slots.default) return [];

  const rawNodes = slots.default();
  const tags: HeadTagDef[] = [];

  function walk(nodes: VNode[]) {
    for (const node of nodes) {
      if (!node || node.type === Comment) continue;

      if (typeof node.type === "symbol" && Array.isArray(node.children)) {
        walk(node.children as VNode[]);
        continue;
      }

      if (typeof node.type === "string") {
        const tagName = node.type.toLowerCase();
        const text = extractTextFromVNode(node);
        const props = { ...(node.props || {}) };

        tags.push({
          tag: tagName,
          props,
          text: text || undefined,
        });
      }
    }
  }

  walk(rawNodes);
  return tags;
}

/**
 * Lifecycle and slot management hook for the <Head> component.
 */
export function useHeadComponent(slots: { default?: (...args: any[]) => any }): void {
  const { registerHead, updateHead, unregisterHead } = useHead();
  let headId: string | null = null;

  onMounted(() => {
    headId = registerHead(parseSlotVNodes(slots));
  });

  onUpdated(() => {
    if (headId) {
      updateHead(headId, parseSlotVNodes(slots));
    }
  });

  onBeforeUnmount(() => {
    if (headId) {
      unregisterHead(headId);
      headId = null;
    }
  });
}
