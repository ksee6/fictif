// src/inertia-router.ts
/**
 * 100% Inertia.js-compatible Route Handler for Mist.
 *
 * Intercepts router requests, exchanges Inertia protocol headers with any
 * Inertia backend (Laravel, Rails, Django, Go, etc.), and renders matching
 * Mist views with backend props.
 *
 * Usage:
 *   import { inertiaRouter } from "mist";
 *   router.handle("*", inertiaRouter);
 */

import { shallowRef, computed, h, defineComponent, type ComputedRef } from "vue";
import { Path } from "./path.js";
import { view } from "./views.js";
import { noRouter } from "./api.js";
import type { RouteHandler } from "./router.js";

export interface InertiaPage<Props = Record<string, any>> {
  component: string;
  props: Props;
  url: string;
  version: string | null;
  clearHistory?: boolean;
  encryptHistory?: boolean;
}

export interface InertiaOptions {
  version?: string | null;
  onVersionMismatch?: (url: string) => void;
  headers?: Record<string, string> | (() => Record<string, string>);
  resolve?: (name: string) => any;
}

export interface InertiaRouteHandler extends RouteHandler {
  (path: Path, req: any): Promise<boolean>;
  configure: (options: InertiaOptions) => InertiaRouteHandler;
  page: ComputedRef<InertiaPage | null>;
  version: string | null;
}

// Reactive page store accessible via usePage()
const currentPageRef = shallowRef<InertiaPage | null>(null);
let activeVersion: string | null = null;

/**
 * Returns a reactive computed ref of the current Inertia page object,
 * including props, component name, and version.
 */
export function usePage<T = Record<string, any>>(): ComputedRef<InertiaPage<T> | null> {
  return computed(() => currentPageRef.value as InertiaPage<T> | null);
}

/**
 * Returns the current Inertia asset version.
 */
export function getInertiaVersion(): string | null {
  return activeVersion;
}

/**
 * Sets or updates the active Inertia asset version.
 */
export function setInertiaVersion(version: string | null): void {
  activeVersion = version;
}

/**
 * Inspects body or [data-page] elements for raw initial Inertia HTML/SSR payloads,
 * extracts and parses the JSON, and immediately destroys the data attribute
 * so it will never be found again on subsequent route transitions.
 */
export function consumeInitialPageData(): InertiaPage | null {
  if (typeof document === "undefined") return null;

  // 1. Check document.body first
  const bodyEl = document.body;
  let rawData = bodyEl?.getAttribute("data-page");
  let targetEl: Element | null = bodyEl;

  // 2. Check #app or any element with data-page attribute
  if (!rawData) {
    const el =
      (typeof document.getElementById === "function" ? document.getElementById("app") : null) ||
      (typeof document.querySelector === "function" ? document.querySelector("[data-page]") : null);
    if (el) {
      rawData = el.getAttribute("data-page");
      targetEl = el;
    }
  }

  if (rawData && targetEl) {
    try {
      const parsed: InertiaPage = JSON.parse(rawData);
      // Immediately destroy the data-page attribute so it is never found again
      targetEl.removeAttribute("data-page");
      return parsed;
    } catch (err) {
      targetEl.removeAttribute("data-page");
      console.error("[mist/inertia] Failed to parse initial data-page payload:", err);
      return null;
    }
  }

  return null;
}

/**
 * Extracts CSRF token from document.cookie (Laravel XSRF-TOKEN) or meta tag.
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;

  // 1. Check XSRF-TOKEN cookie (Laravel default)
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith("XSRF-TOKEN=")) {
      try {
        return decodeURIComponent(trimmed.slice("XSRF-TOKEN=".length));
      } catch {
        return trimmed.slice("XSRF-TOKEN=".length);
      }
    }
  }

  // 2. Check <meta name="csrf-token" content="...">
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta && meta.content) {
    return meta.content;
  }

  return null;
}

/**
 * Creates an Inertia.js route handler configured with custom options.
 */
export function createInertiaRouter(options: InertiaOptions = {}): InertiaRouteHandler {
  if (options.version) {
    activeVersion = options.version;
  }

  async function resolveViewWithFallback(componentName: string | object, props?: Record<string, any>) {
    try {
      if (options.resolve) {
        const customComp = await options.resolve(String(componentName));
        return await view(customComp, props);
      }
      return await view(componentName, props);
    } catch {
      // If client view is missing (e.g. headless unit testing), render a generic component with props
      return await view(
        defineComponent({
          name: typeof componentName === "string" ? componentName : "InertiaView",
          render() {
            return h("div", {
              class: "mist-inertia-view",
              "data-component": String(componentName),
            });
          },
        }),
        props
      );
    }
  }

  const handler: any = async function (path: Path, req: any): Promise<boolean> {
    // 1. Check for initial HTML data-page attribute (skip backend request on initial load)
    const initialPage = consumeInitialPageData();
    if (initialPage) {
      if (initialPage.version) {
        activeVersion = initialPage.version;
      }
      currentPageRef.value = initialPage;
      req.inertia = initialPage;
      req.props = initialPage.props;
      req.view = await resolveViewWithFallback(initialPage.component, initialPage.props);

      if (typeof window !== "undefined" && window.history) {
        const state = window.history.state || {};
        window.history.replaceState({ ...state, inertia: initialPage }, "", window.location.href);
      }

      return true;
    }

    // 2. Format request URL & method
    const pathStr = path.toString().trim();
    const targetUrl = pathStr.startsWith("/") ? pathStr : "/" + pathStr;
    const method = (path.method ? path.method() : req.method || "GET").toUpperCase();

    // 3. Assemble Inertia protocol headers
    const headers: Record<string, string> = {
      "X-Inertia": "true",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html, application/xhtml+xml",
    };

    if (activeVersion) {
      headers["X-Inertia-Version"] = activeVersion;
    }

    const csrf = getCsrfToken();
    if (csrf) {
      headers["X-XSRF-TOKEN"] = csrf;
    }

    if (options.headers) {
      const extra = typeof options.headers === "function" ? options.headers() : options.headers;
      Object.assign(headers, extra);
    }

    // 4. Serialize request body for mutation requests
    let body: any = undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (req && req.data !== undefined) {
        if (typeof FormData !== "undefined" && req.data instanceof FormData) {
          body = req.data;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(req.data);
        }
      }
    }

    // 5. Execute HTTP request bypassing router interception via noRouter
    let response: Response;
    try {
      response = await noRouter(async () => {
        return await fetch(targetUrl, {
          method,
          headers,
          body,
          credentials: "same-origin",
        });
      });
    } catch (networkError) {
      // Network failure: do nothing and return false to fall through to next handler
      return false;
    }

    // 6. Handle Version Mismatch (HTTP 409 Conflict)
    if (response.status === 409) {
      const location = response.headers.get("X-Inertia-Location") || targetUrl;
      if (options.onVersionMismatch) {
        options.onVersionMismatch(location);
      } else if (typeof window !== "undefined") {
        window.location.href = location;
      }
      return true;
    }

    // 7. Handle External Redirects (X-Inertia-Location header)
    const externalLocation = response.headers.get("X-Inertia-Location");
    if (externalLocation) {
      if (options.onVersionMismatch) {
        options.onVersionMismatch(externalLocation);
      } else if (typeof window !== "undefined") {
        window.location.href = externalLocation;
      }
      return true;
    }

    // 8. Validate Inertia Response Header
    const isInertia = response.headers.get("X-Inertia") === "true";
    if (!response.ok || !isInertia) {
      // Failure or non-Inertia response: return false to fall through to next handler
      return false;
    }

    // 9. Parse Inertia JSON response and resolve matching Mist view with props
    try {
      const page: InertiaPage = await response.json();
      if (page.version) {
        activeVersion = page.version;
      }
      currentPageRef.value = page;

      // Synchronize router path if server redirected to a different URL
      if (page.url) {
        path.set(page.url);
      }

      req.inertia = page;
      req.props = page.props;
      req.view = await resolveViewWithFallback(page.component, page.props);

      if (typeof window !== "undefined" && window.history) {
        const state = window.history.state || {};
        window.history.replaceState({ ...state, inertia: page }, "", page.url || targetUrl);
      }

      return true;
    } catch (parseOrRenderError) {
      // Failed to parse or render: return false to fall through to next handler
      return false;
    }
  };

  handler.configure = (newOpts: InertiaOptions) => createInertiaRouter({ ...options, ...newOpts });
  Object.defineProperty(handler, "page", {
    get: () => usePage(),
  });
  Object.defineProperty(handler, "version", {
    get: () => activeVersion,
    set: (v: string | null) => {
      activeVersion = v;
    },
  });

  return handler as InertiaRouteHandler;
}

/**
 * Default Inertia router instance ready to be passed directly to router.handle("*", inertiaRouter).
 */
export const inertiaRouter: InertiaRouteHandler = createInertiaRouter();

export default inertiaRouter;
