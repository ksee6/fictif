// src/plugin/manifest.ts

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type {
  ResolvedFictifOptions,
  StoredViewDigest,
  ViewDefinition,
  ViewManifest,
} from "./types.js";
import { digest } from "../search.js";

const VIEW_SUFFIXES = [".vue", ".md"];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseAttributes(rawAttrs: string): Record<string, any> {
  const attrs: Record<string, any> = {};
  const attrRegex = /([:\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? true;
    attrs[key] = typeof val === "string" ? decodeHtmlEntities(val) : val;
  }

  return attrs;
}

export function extractHeadFromContent(content: string): Record<string, any> {
  const headData: Record<string, any> = {};

  // 1. Template <Head> or <head> blocks
  const headBlockRegex = /<[Hh]ead\b[^>]*>([\s\S]*?)<\/[Hh]ead>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = headBlockRegex.exec(content)) !== null) {
    const inner = blockMatch[1];

    // <title>...</title>
    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(inner);
    if (titleMatch) {
      headData.title = decodeHtmlEntities(titleMatch[1].trim());
    }

    // <meta ... /?>
    const metaRegex = /<meta\b([^>]*?)\/?>/gi;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = metaRegex.exec(inner)) !== null) {
      headData.meta ??= [];
      headData.meta.push(parseAttributes(tagMatch[1]));
    }

    // <link ... /?>
    const linkRegex = /<link\b([^>]*?)\/?>/gi;
    while ((tagMatch = linkRegex.exec(inner)) !== null) {
      headData.link ??= [];
      headData.link.push(parseAttributes(tagMatch[1]));
    }

    // <script ...>...</script> or <script ... />
    const scriptRegex = /<script\b([^>]*?)(?:>([\s\S]*?)<\/script>|\/>)/gi;
    while ((tagMatch = scriptRegex.exec(inner)) !== null) {
      headData.script ??= [];
      const attrs = parseAttributes(tagMatch[1]);
      if (tagMatch[2] && tagMatch[2].trim()) {
        attrs.text = tagMatch[2].trim();
      }
      headData.script.push(attrs);
    }

    // <style ...>...</style>
    const styleRegex = /<style\b([^>]*?)>([\s\S]*?)<\/style>/gi;
    while ((tagMatch = styleRegex.exec(inner)) !== null) {
      headData.style ??= [];
      const attrs = parseAttributes(tagMatch[1]);
      if (tagMatch[2] && tagMatch[2].trim()) {
        attrs.text = tagMatch[2].trim();
      }
      headData.style.push(attrs);
    }

    // <base ... /?>
    const baseMatch = /<base\b([^>]*?)\/?>/i.exec(inner);
    if (baseMatch) {
      headData.base = parseAttributes(baseMatch[1]);
    }
  }

  // 2. Programmatic head({ ... }) call in <script> or <script setup>
  const programmaticRegex = /\bhead\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
  let progMatch: RegExpExecArray | null;
  while ((progMatch = programmaticRegex.exec(content)) !== null) {
    try {
      const rawObj = progMatch[1];
      const evaluated = new Function(`return (${rawObj})`)();
      if (evaluated && typeof evaluated === "object") {
        if (evaluated.title) headData.title = evaluated.title;
        if (Array.isArray(evaluated.meta)) {
          headData.meta = [...(headData.meta || []), ...evaluated.meta];
        }
        if (Array.isArray(evaluated.link)) {
          headData.link = [...(headData.link || []), ...evaluated.link];
        }
        if (Array.isArray(evaluated.script)) {
          headData.script = [...(headData.script || []), ...evaluated.script];
        }
        if (Array.isArray(evaluated.style)) {
          headData.style = [...(headData.style || []), ...evaluated.style];
        }
        if (evaluated.base) headData.base = evaluated.base;
      }
    } catch {
      // Dynamic expressions cannot be evaluated statically; ignore
    }
  }

  return headData;
}

function tryExtractHead(filePath: string): Record<string, any> | undefined {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return extractHeadFromContent(content);
    }
  } catch {
    // Ignore
  }
  return undefined;
}

export function extractViewDigestFromContent(content: string): StoredViewDigest {
  // 1. Extract Title
  let titleText = "";
  const titleMatch = /<[Hh]ead\b[^>]*>[\s\S]*?<title\b[^>]*>([\s\S]*?)<\/title>[\s\S]*?<\/[Hh]ead>/i.exec(content);
  if (titleMatch) {
    titleText = decodeHtmlEntities(titleMatch[1].trim());
  } else {
    const progTitleMatch = /\bhead\s*\(\s*\{[\s\S]*?title\s*:\s*["'`]([^"'`]+)["'`]/i.exec(content);
    if (progTitleMatch) {
      titleText = decodeHtmlEntities(progTitleMatch[1].trim());
    } else {
      const h1Match = /^#\s+(.+)$/m.exec(content);
      if (h1Match) {
        titleText = h1Match[1].trim();
      }
    }
  }

  // 2. Extract Links (anchor text only, URLs skipped)
  const linkTexts: string[] = [];
  // Markdown links: [anchor](url) -> anchor
  const mdLinkRegex = /\[([^\]]+)\]\([^)]+\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdLinkRegex.exec(content)) !== null) {
    linkTexts.push(mdMatch[1]);
  }

  // HTML and Vue links: <a ...>anchor</a>, <router-link ...>anchor</router-link>, <NuxtLink ...>, etc.
  const htmlLinkRegex = /<(?:a|router-link|nuxtlink|link|navlink)\b[^>]*>([\s\S]*?)<\/(?:a|router-link|nuxtlink|link|navlink)>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlLinkRegex.exec(content)) !== null) {
    const cleanAnchor = htmlMatch[1].replace(/<[^>]+>/g, " ").trim();
    if (cleanAnchor) {
      linkTexts.push(cleanAnchor);
    }
  }

  // 3. Extract Content (body text)
  let bodyContent = content;
  const templateMatch = /<template\b[^>]*>([\s\S]*?)<\/template>/i.exec(content);
  if (templateMatch) {
    bodyContent = templateMatch[1];
  } else {
    // In markdown/plain: remove frontmatter
    bodyContent = bodyContent.replace(/^---[\s\S]*?---/, "");
    // Remove <script> blocks
    bodyContent = bodyContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  }

  // Remove <Head> blocks from bodyContent
  bodyContent = bodyContent.replace(/<[Hh]ead\b[^>]*>[\s\S]*?<\/[Hh]ead>/gi, " ");
  // Remove <style> blocks from bodyContent
  bodyContent = bodyContent.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  const titleDigest = titleText ? digest(titleText) : {};
  const linkDigest = linkTexts.length > 0 ? digest(linkTexts.join(" ")) : {};
  const contentDigest = bodyContent ? digest(bodyContent) : {};

  return {
    title: titleDigest,
    link: linkDigest,
    content: contentDigest,
  };
}

function tryExtractDigest(filePath: string): StoredViewDigest | undefined {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return extractViewDigestFromContent(content);
    }
  } catch {
    // Ignore
  }
  return undefined;
}

function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `f_${hash.toString(16)}`;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function deriveLogicalNameFromFile(
  targetFile: string,
  root: string,
  namespaces: Record<string, import("./types.js").ViewNamespaceValue>,
): string | null {
  const normalizedTarget = normalizePath(targetFile);

  for (const [ns, nsValue] of Object.entries(namespaces)) {
    const nsPaths = Array.isArray(nsValue) ? nsValue : [nsValue];
    for (const p of nsPaths) {
      if (p.includes("*")) {
        const baseDir = p.split("*")[0];
        const paramsBase = normalizePath(path.join(root, baseDir));
        const cleanBase = paramsBase.endsWith("/") ? paramsBase : `${paramsBase}/`;
        if (normalizedTarget.startsWith(cleanBase)) {
          let rel = normalizedTarget.substring(cleanBase.length);
          for (const suffix of VIEW_SUFFIXES) {
            if (rel.endsWith(suffix)) {
              rel = rel.slice(0, -suffix.length);
              break;
            }
          }
          let primaryName = rel;
          if (rel === "index") {
            primaryName = "";
          } else if (rel.endsWith("/index")) {
            primaryName = rel.slice(0, -"/index".length);
          }
          return ns === "@" ? primaryName : `${ns}::${primaryName}`;
        }
      } else {
        const directPath = normalizePath(
          path.resolve(root, p.includes(":") ? p.split(":")[0] : p)
        );
        if (normalizedTarget === directPath) {
          if (p.includes(":")) {
            const alias = p.split(":")[1];
            return ns === "@" ? alias : `${ns}::${alias}`;
          }
          const ext = path.extname(p);
          const name = path.basename(p, ext);
          const primaryName = name === "index" ? "" : name;
          return ns === "@" ? primaryName : `${ns}::${primaryName}`;
        }
      }
    }
  }

  return null;
}

export async function buildViewManifest(
  options: ResolvedFictifOptions,
): Promise<ViewManifest> {
  const manifest: ViewManifest = new Map();
  if (options.views === false) {
    return manifest;
  }

  const { root, views } = options;
  const { namespaces, globNamespaces } = views;

  // 1. Process globNamespaces (packages/vendor)
  if (globNamespaces) {
    const patterns: string[] = [];
    for (const baseDir of globNamespaces) {
      const normalizedBase = normalizePath(path.join(baseDir, "/**/src/views"));
      const pkgViewDirs = await fg(normalizedBase, {
        cwd: root,
        onlyDirectories: true,
        absolute: true,
        followSymbolicLinks: true,
      });

      for (const pkgDir of pkgViewDirs) {
        for (const suffix of VIEW_SUFFIXES) {
          patterns.push(normalizePath(path.join(pkgDir, `**/*${suffix}`)));
        }
      }
    }

    if (patterns.length > 0) {
      await fg(patterns, {
        cwd: root,
        onlyFiles: true,
        absolute: true,
        unique: true,
        followSymbolicLinks: true,
      });
    }
  }

  // New logic: Iterate namespaces, then paths.
  for (const [ns, nsValue] of Object.entries(namespaces)) {
    const nsPaths = Array.isArray(nsValue) ? nsValue : [nsValue];

    for (const p of nsPaths) {
      let pattern = "";
      let alias: string | undefined;
      let isWildcard = false;

      if (p.includes("*")) {
        pattern = normalizePath(path.join(root, p));
        isWildcard = true;
      } else if (p.includes(":")) {
        const [filePath, a] = p.split(":");
        pattern = normalizePath(path.resolve(root, filePath));
        alias = a;
      } else {
        const absolutePath = path.resolve(root, p);
        pattern = normalizePath(absolutePath);
      }

      // If it's a wildcard pattern (directory /**/*.vue etc)
      if (isWildcard) {
        const files = await fg(pattern, {
          cwd: root,
          onlyFiles: true,
          absolute: true,
          unique: true,
          followSymbolicLinks: true,
        });

        // We need to determine the "root" of this pattern to calculate relative path (logical name)
        const baseDir = p.split("*")[0];
        const paramsBase = normalizePath(path.join(root, baseDir));

        for (const file of files) {
          const normalizedFile = normalizePath(file);

          let isSymlink = false;
          let realFile = normalizedFile;
          let symlinkTarget: string | undefined = undefined;

          try {
            const lstat = fs.lstatSync(normalizedFile);
            if (lstat.isSymbolicLink()) {
              isSymlink = true;
              realFile = normalizePath(fs.realpathSync(normalizedFile));
              const linkDest = fs.readlinkSync(normalizedFile);
              const immediateFile = normalizePath(path.resolve(path.dirname(normalizedFile), linkDest));
              const immediateTarget = deriveLogicalNameFromFile(immediateFile, root, namespaces);
              if (immediateTarget !== null && immediateTarget !== undefined) {
                symlinkTarget = immediateTarget || "index";
              } else {
                const finalTarget = deriveLogicalNameFromFile(realFile, root, namespaces);
                if (finalTarget !== null && finalTarget !== undefined) {
                  symlinkTarget = finalTarget || "index";
                }
              }
            } else {
              const real = normalizePath(fs.realpathSync(normalizedFile));
              if (real !== normalizedFile) {
                realFile = real;
              }
            }
          } catch {
            // Ignore broken symlinks
          }

          // Calculate logical name using forward slashes
          const relativePath = normalizedFile.substring(paramsBase.length);
          let logicalName = relativePath.replace(/^\//, "");

          for (const suffix of VIEW_SUFFIXES) {
            if (logicalName.endsWith(suffix)) {
              logicalName = logicalName.slice(0, -suffix.length);
              break;
            }
          }

          // Automatically register xxx/index.vue as xxx, and "" for root index
          let primaryName = logicalName;
          let altName: string | null = null;

          if (logicalName === "index") {
            primaryName = "";
            altName = "index";
          } else if (logicalName.endsWith("/index")) {
            primaryName = logicalName.slice(0, -"/index".length);
            altName = logicalName;
          }

          const finalPrimaryName =
            ns === "@" ? primaryName : `${ns}::${primaryName}`;
          const finalAltName =
            altName !== null
              ? (ns === "@" ? altName : `${ns}::${altName}`)
              : null;

          const headData = tryExtractHead(realFile);
          const digestData = tryExtractDigest(realFile);
          const obfuscatedId = cyrb53(realFile);

          if (!manifest.has(finalPrimaryName)) {
            manifest.set(finalPrimaryName, {
              absolutePath: normalizedFile,
              realAbsolutePath: realFile,
              logicalName: finalPrimaryName,
              obfuscatedId,
              namespace: ns,
              head: headData,
              digest: digestData,
              isSymlink,
              symlinkTarget,
            });
          }

          if (finalAltName && !manifest.has(finalAltName)) {
            manifest.set(finalAltName, {
              absolutePath: normalizedFile,
              realAbsolutePath: realFile,
              logicalName: finalAltName,
              obfuscatedId,
              namespace: ns,
              head: headData,
              digest: digestData,
              isSymlink,
              symlinkTarget,
            });
          }
        }
      } else {
        // Single file mapping (alias or direct)
        let absolutePath = "";
        let finalLogicalName = "";

        if (alias) {
          // p = "path/to/file:Alias"
          const [filePath] = p.split(":");
          absolutePath = normalizePath(path.resolve(root, filePath));
          finalLogicalName = ns === "@" ? alias : `${ns}::${alias}`;
        } else {
          // p = "path/to/file"
          absolutePath = normalizePath(path.resolve(root, p));
          const ext = path.extname(p);
          const name = path.basename(p, ext);
          finalLogicalName = ns === "@" ? name : `${ns}::${name}`;
        }

        let isSymlink = false;
        let realFile = absolutePath;
        let symlinkTarget: string | undefined = undefined;

        try {
          const lstat = fs.lstatSync(absolutePath);
          if (lstat.isSymbolicLink()) {
            isSymlink = true;
            realFile = normalizePath(fs.realpathSync(absolutePath));
            const linkDest = fs.readlinkSync(absolutePath);
            const immediateFile = normalizePath(path.resolve(path.dirname(absolutePath), linkDest));
            const immediateTarget = deriveLogicalNameFromFile(immediateFile, root, namespaces);
            if (immediateTarget !== null && immediateTarget !== undefined) {
              symlinkTarget = immediateTarget || "index";
            } else {
              const finalTarget = deriveLogicalNameFromFile(realFile, root, namespaces);
              if (finalTarget !== null && finalTarget !== undefined) {
                symlinkTarget = finalTarget || "index";
              }
            }
          } else {
            const real = normalizePath(fs.realpathSync(absolutePath));
            if (real !== absolutePath) {
              realFile = real;
            }
          }
        } catch {
          // Ignore
        }

        const obfuscatedId = cyrb53(realFile);
        const headData = tryExtractHead(realFile);
        const digestData = tryExtractDigest(realFile);

        if (!manifest.has(finalLogicalName)) {
          manifest.set(finalLogicalName, {
            absolutePath: normalizePath(`/${path.relative(root, absolutePath)}`),
            realAbsolutePath: realFile,
            logicalName: finalLogicalName,
            obfuscatedId,
            namespace: ns,
            head: headData,
            digest: digestData,
            isSymlink,
            symlinkTarget,
          });
        }

        if (finalLogicalName === "index" || finalLogicalName === "@::index") {
          const rootName = finalLogicalName === "index" ? "" : "@::";
          if (!manifest.has(rootName)) {
            manifest.set(rootName, {
              absolutePath: normalizePath(`/${path.relative(root, absolutePath)}`),
              realAbsolutePath: realFile,
              logicalName: rootName,
              obfuscatedId,
              namespace: ns,
              head: headData,
              digest: digestData,
              isSymlink,
              symlinkTarget,
            });
          }
        }
      }
    }
  }

  // Post-process to ensure all symlinks have their symlinkTarget resolved
  for (const def of manifest.values()) {
    if (def.isSymlink && !def.symlinkTarget) {
      for (const otherDef of manifest.values()) {
        if (!otherDef.isSymlink && otherDef.realAbsolutePath === def.realAbsolutePath) {
          def.symlinkTarget = otherDef.logicalName;
          break;
        }
      }
    }
  }

  return manifest;
}

export function generateVirtualViewsModule(manifest: ViewManifest): string {
  const uniqueDefs = new Map<string, ViewDefinition>();
  for (const def of manifest.values()) {
    if (!uniqueDefs.has(def.obfuscatedId)) {
      uniqueDefs.set(def.obfuscatedId, def);
    } else if (!def.isSymlink && uniqueDefs.get(def.obfuscatedId)?.isSymlink) {
      // Prefer non-symlink definition for canonical import path
      uniqueDefs.set(def.obfuscatedId, def);
    }
  }

  const mapEntries = Array.from(uniqueDefs.values()).map((def) => {
    return `'${def.obfuscatedId}': () => import('${def.realAbsolutePath || def.absolutePath}')`;
  });

  const nameToIdMap: Record<string, string> = {};
  for (const def of manifest.values()) {
    nameToIdMap[def.logicalName] = def.obfuscatedId;
    nameToIdMap[def.logicalName.toLowerCase()] = def.obfuscatedId;

    if (def.logicalName.includes("/")) {
      const dotted = def.logicalName.replaceAll("/", ".");
      nameToIdMap[dotted] = def.obfuscatedId;
      nameToIdMap[dotted.toLowerCase()] = def.obfuscatedId;
    }

    if (def.logicalName.startsWith("@::")) {
      const stripped = def.logicalName.slice(3);
      nameToIdMap[stripped] = def.obfuscatedId;
      nameToIdMap[stripped.toLowerCase()] = def.obfuscatedId;
      if (stripped.includes("/")) {
        const dotted = stripped.replaceAll("/", ".");
        nameToIdMap[dotted] = def.obfuscatedId;
        nameToIdMap[dotted.toLowerCase()] = def.obfuscatedId;
      }
    }
  }

  const headMap: Record<string, any> = {};
  for (const def of manifest.values()) {
    if (def.head && Object.keys(def.head).length > 0) {
      headMap[def.obfuscatedId] = def.head;
      headMap[def.logicalName] = def.head;
      headMap[def.logicalName.toLowerCase()] = def.head;

      if (def.logicalName.includes("/")) {
        const dotted = def.logicalName.replaceAll("/", ".");
        headMap[dotted] = def.head;
        headMap[dotted.toLowerCase()] = def.head;
      }

      // Allow looking up without namespace prefix when namespace is @
      if (def.logicalName.startsWith("@::")) {
        const stripped = def.logicalName.slice(3);
        headMap[stripped] = def.head;
        headMap[stripped.toLowerCase()] = def.head;
        if (stripped.includes("/")) {
          const dotted = stripped.replaceAll("/", ".");
          headMap[dotted] = def.head;
          headMap[dotted.toLowerCase()] = def.head;
        }
      }
    }
  }

  const digestMap: Record<string, any> = {};
  for (const def of manifest.values()) {
    if (def.digest) {
      digestMap[def.obfuscatedId] = def.digest;
      digestMap[def.logicalName] = def.digest;
      digestMap[def.logicalName.toLowerCase()] = def.digest;

      if (def.logicalName.includes("/")) {
        const dotted = def.logicalName.replaceAll("/", ".");
        digestMap[dotted] = def.digest;
        digestMap[dotted.toLowerCase()] = def.digest;
      }

      // Allow looking up without namespace prefix when namespace is @
      if (def.logicalName.startsWith("@::")) {
        const stripped = def.logicalName.slice(3);
        digestMap[stripped] = def.digest;
        digestMap[stripped.toLowerCase()] = def.digest;
        if (stripped.includes("/")) {
          const dotted = stripped.replaceAll("/", ".");
          digestMap[dotted] = def.digest;
          digestMap[dotted.toLowerCase()] = def.digest;
        }
      }
    }
  }

  const viewsList: string[] = [];
  const seenViews = new Set<string>();
  for (const def of manifest.values()) {
    let name = def.logicalName;
    if (name.startsWith("@::")) {
      name = name.slice(3);
    }
    if (name === "") {
      name = "index";
    }
    if (name && !seenViews.has(name)) {
      seenViews.add(name);
      viewsList.push(name);
    }
  }

  const symlinksMap: Record<string, string> = {};
  for (const def of manifest.values()) {
    if (def.isSymlink && def.symlinkTarget) {
      let symName = def.logicalName;
      let targetName = def.symlinkTarget;

      const cleanSym = symName.startsWith("@::") ? symName.slice(3) : symName;
      let cleanTarget = targetName.startsWith("@::") ? targetName.slice(3) : targetName;
      if (cleanTarget === "") {
        cleanTarget = "index";
      }

      symlinksMap[cleanSym] = cleanTarget;
      symlinksMap[cleanSym.toLowerCase()] = cleanTarget;
      if (cleanSym.includes("/")) {
        symlinksMap[cleanSym.replaceAll("/", ".")] = cleanTarget;
        symlinksMap[cleanSym.replaceAll("/", ".").toLowerCase()] = cleanTarget;
      }

      symlinksMap[symName] = targetName;
      symlinksMap[symName.toLowerCase()] = targetName;
      if (symName.includes("/")) {
        symlinksMap[symName.replaceAll("/", ".")] = targetName;
        symlinksMap[symName.replaceAll("/", ".").toLowerCase()] = targetName;
      }
    }
  }

  return `// Generated by Fictif. DO NOT EDIT.
export const views = { ${mapEntries.join(",\n  ")} };
export const nameToId = ${JSON.stringify(nameToIdMap, null, 2)};
export const viewsHead = ${JSON.stringify(headMap, null, 2)};
export const viewsDigest = ${JSON.stringify(digestMap, null, 2)};
export const viewsList = ${JSON.stringify(viewsList, null, 2)};
export const viewsSymlinks = ${JSON.stringify(symlinksMap, null, 2)};
`;
}
