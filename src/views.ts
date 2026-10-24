// src/views.ts

import { h, defineAsyncComponent, type Component, type VNode } from "vue";
import type { HeadConfig } from "./components/head.js";
import { Path } from "./path.js";

export type ViewComponent = Component;

let views: Record<string, () => Promise<{ default: ViewComponent }>> = {};
let nameToId: Record<string, string> = {};
let viewsHead: Record<string, any> = {};
let viewsDigest: Record<string, StoredViewDigest> = {};
let viewsList: string[] = [];

try {
  // @ts-ignore
  const virtualData = await import("virtual:fictif-views-data");
  views = virtualData.views || {};
  nameToId = virtualData.nameToId || {};
  viewsHead = virtualData.viewsHead || {};
  viewsDigest = virtualData.viewsDigest || {};
  viewsList = virtualData.viewsList || [];
} catch {
  // Non-Vite unit testing or headless environment
}

const isProd = true;

const resolvedModulesCache = new Map<string, ViewComponent>();

/**
 * Normalizes a view name:
 * 1. Converts dot notation to forward slashes
 * 2. Strips leading /
 * 3. Strips trailing /
 */
export function normalizeViewName(name: string): string {
  if (name === null || name === undefined) return "";
  let s = String(name).trim();
  s = s.replaceAll(".", "/");
  s = s.replace(/^\/+/, "");
  s = s.replace(/\/+$/, "");
  return s;
}

export function getViewId(name: string): string {
  const norm = normalizeViewName(name);

  if (norm in nameToId) return nameToId[norm];
  const lower = norm.toLowerCase();
  if (lower in nameToId) return nameToId[lower];

  const withAt = `@::${norm}`;
  if (withAt in nameToId) return nameToId[withAt];
  const withAtLower = `@::${lower}`;
  if (withAtLower in nameToId) return nameToId[withAtLower];

  if (norm === "" && "index" in nameToId) return nameToId["index"];
  if (norm === "index" && "" in nameToId) return nameToId[""];

  // Suffix matching: e.g. "servers" -> "serversview" / "ServersView"
  const viewSuffix = `${lower}view`;
  if (viewSuffix in nameToId) return nameToId[viewSuffix];
  if (`@::${viewSuffix}` in nameToId) return nameToId[`@::${viewSuffix}`];

  for (const k of Object.keys(nameToId)) {
    const kLower = k.toLowerCase().replace(/^@::/, "");
    if (kLower === viewSuffix || kLower.replace(/view$/, "") === lower) {
      return nameToId[k];
    }
  }

  return isProd ? ((nameToId as Record<string, string>)[norm] || norm) : norm;
}

export async function resolve(name: string | object): Promise<ViewComponent> {
  if (typeof name === "object" && name !== null) return name as ViewComponent;

  const normalized = normalizeViewName(String(name));
  if (resolvedModulesCache.has(normalized)) {
    return resolvedModulesCache.get(normalized)!;
  }

  const id = getViewId(normalized);
  if (resolvedModulesCache.has(id)) {
    return resolvedModulesCache.get(id)!;
  }

  const loader = (
    views as Record<string, () => Promise<{ default: ViewComponent }>>
  )[id] || (
    views as Record<string, () => Promise<{ default: ViewComponent }>>
  )[normalized];

  if (!loader) {
    console.error(`[Fictif] View not found: "${name}" with id: "${id}".`);
    throw new Error(`View not found: ${name}`);
  }

  const module = await loader();
  const comp = module.default;
  resolvedModulesCache.set(normalized, comp);
  resolvedModulesCache.set(id, comp);
  return comp;
}

export function has(name: string): boolean {
  if (name === "" || name === "/") {
    return (
      "" in nameToId ||
      "index" in nameToId ||
      "" in views ||
      "index" in views ||
      "@::index" in nameToId
    );
  }
  const norm = normalizeViewName(name);
  const id = getViewId(norm);
  return id in views || norm in nameToId || norm.toLowerCase() in nameToId;
}

export function list(): string[] {
  if (viewsList && viewsList.length > 0) {
    return [...viewsList];
  }
  const distinct = new Set<string>();
  for (const k of Object.keys(nameToId)) {
    if (!k) continue;
    const clean = k.startsWith("@::") ? k.slice(3) : k;
    if (clean && !clean.includes(".")) {
      distinct.add(clean);
    }
  }
  return Array.from(distinct);
}

/**
 * Returns the Vue component definition for a given view name.
 * Synchronous: returns cached component or defineAsyncComponent.
 */
export function get(name: string | object): ViewComponent {
  if (typeof name === "object" && name !== null) {
    return name as ViewComponent;
  }

  const normalized = normalizeViewName(String(name));
  if (resolvedModulesCache.has(normalized)) {
    return resolvedModulesCache.get(normalized)!;
  }
  const id = getViewId(normalized);
  if (resolvedModulesCache.has(id)) {
    return resolvedModulesCache.get(id)!;
  }

  return defineAsyncComponent(async () => {
    return await resolve(name);
  });
}

/**
 * Returns all merged head data statically extracted from inside that view.
 * Synchronous.
 */
export function viewHead(name: string): HeadConfig | undefined {
  if (name === null || name === undefined) return undefined;
  const normalized = normalizeViewName(name);
  const id = getViewId(normalized);

  return (
    viewsHead[id] ||
    viewsHead[normalized] ||
    viewsHead[name] ||
    viewsHead[`@::${normalized}`] ||
    viewsHead[normalized.toLowerCase()] ||
    viewsHead[name.toLowerCase()] ||
    undefined
  );
}

export interface StoredViewDigest {
  title: Record<string, number>;
  link: Record<string, number>;
  content: Record<string, number>;
}

export interface ViewDigestOptions {
  title?: number;
  link?: number;
  content?: number;
}

/**
 * Merges stored view digest sections using specified weight multipliers.
 */
export function mergeViewDigests(
  stored: StoredViewDigest,
  options?: ViewDigestOptions
): Record<string, number> {
  const titleWeight = options?.title ?? 1;
  const linkWeight = options?.link ?? 1;
  const contentWeight = options?.content ?? 1;

  const result: Record<string, number> = {};

  const addTokens = (tokens: Record<string, number> | undefined, weight: number) => {
    if (!tokens || weight <= 0) return;
    for (const [token, score] of Object.entries(tokens)) {
      const weightedScore = Math.round(score * weight);
      if (weightedScore > 0) {
        result[token] = (result[token] || 0) + weightedScore;
      }
    }
  };

  addTokens(stored.title, titleWeight);
  addTokens(stored.link, linkWeight);
  addTokens(stored.content, contentWeight);

  return result;
}

/**
 * Returns merged search digest for a given view with weight bonuses.
 * Compatible with search.digest and search.compare.
 */
export function viewDigest(
  name: string,
  options?: ViewDigestOptions
): Record<string, number> {
  if (name === null || name === undefined) return {};
  const normalized = normalizeViewName(name);
  const id = getViewId(normalized);

  const stored: StoredViewDigest | undefined =
    viewsDigest[id] ||
    viewsDigest[normalized] ||
    viewsDigest[name] ||
    viewsDigest[`@::${normalized}`] ||
    viewsDigest[normalized.toLowerCase()] ||
    viewsDigest[name.toLowerCase()] ||
    undefined;

  if (!stored) {
    return {};
  }

  return mergeViewDigests(stored, options);
}

/**
 * Programmatically set viewsDigest (useful for tests or headless environments).
 */
export function setViewsDigest(data: Record<string, StoredViewDigest>): void {
  viewsDigest = data;
}

/**
 * Programmatically set viewsList (useful for tests or headless environments).
 */
export function setViewsList(data: string[]): void {
  viewsList = data;
}

/**
 * Queries registered views matching a path pattern using Path from path.ts.
 *
 * e.g.
 *   view.query("*") // one level
 *   view.query("**") // all levels
 *   view.query("somewhere/**") // all levels after somewhere
 */
export function viewQuery(pattern: string): string[] {
  if (pattern === null || pattern === undefined || typeof pattern !== "string") {
    return [];
  }

  const rawPattern = pattern.trim().replace(/^@::/, "").replaceAll(".", "/");
  const pat = new Path(rawPattern);
  const allViews = list();
  const matched = new Set<string>();

  for (const viewName of allViews) {
    if (!viewName) continue;
    const cleanViewName = viewName.replace(/^@::/, "").replaceAll(".", "/");
    const vPath = new Path(cleanViewName);
    if (vPath.matches(pat)) {
      matched.add(viewName);
    }
  }

  return Array.from(matched);
}

export interface ViewFunction {
  (name: string | object, props?: Record<string, any>): Promise<VNode>;
  resolve: (name: string | object) => Promise<ViewComponent>;
  has: (name: string) => boolean;
  list: () => string[];
  get: (name: string | object) => ViewComponent;
  head: (name: string) => HeadConfig | undefined;
  digest: (name: string, options?: ViewDigestOptions) => Record<string, number>;
  query: (pattern: string) => string[];
}

/**
 * Gets the view component asynchronously, caches it, and instantiates it with props as a Vue VNode.
 * props are real Vue props passed directly to the component.
 */
export const view: ViewFunction = async function (
  name: string | object,
  props?: Record<string, any>,
): Promise<VNode> {
  if (typeof name === "object" && name !== null) {
    return h(name as any, props || null);
  }
  const comp = await resolve(name);
  return h(comp as any, props || null);
} as any;

view.resolve = resolve;
view.has = has;
view.list = list;
view.get = get;
view.head = viewHead;
view.digest = viewDigest;
view.query = viewQuery;

export default view;
