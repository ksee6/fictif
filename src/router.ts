// src/router.ts
/**
 * Hierarchical Radix Tree Router with full lifecycle hooks.
 * Automatically hooks into browser history and intercepts links when assuming global in browser environments.
 */

import { Path } from "./path.js";
import { Tree } from "./tree.js";
import { RequestObject } from "./app.js";

export { RequestObject };

export type RouteHandler<T = any> = (
  requestedPath: Path,
  requestObj: T,
) => Promise<boolean | any> | boolean | any;

export type LeavingHook<T = any> = (
  requestedPath: Path,
  requestObj: T,
) => Promise<boolean> | boolean;

export type ResolvedHook<T = any> = (
  requestedPath: Path,
  requestObj: T,
) => Promise<void> | void;

export type DoneHook = () => Promise<void> | void;

export interface RouteEntry<T = any> {
  method: string; // Empty for any, or "GET", "POST", "PUT", "DELETE"
  handler: RouteHandler<T>;
}

export type NextFunction<ReturnType = any> = () => ReturnType | Promise<ReturnType>;

export type RouterHandler<Request = RequestObject, ReturnType = any> =
  | ((path: Path, req: Request, next: NextFunction<ReturnType>) => ReturnType | Promise<ReturnType>)
  | ((path: Path, req: Request) => ReturnType | Promise<ReturnType>)
  | ((path: Path) => ReturnType | Promise<ReturnType>)
  | (() => ReturnType | Promise<ReturnType>);

export class Router<T = any> extends Tree<any> {
  public currentPath: Path = new Path();
  public currentRequest!: T;
  public history: Path[] = [];
  public requestFactory?: (path: Path) => T;

  private _leavingHooks: LeavingHook<T>[] = [];
  private _resolvedHooks: ResolvedHook<T>[] = [];
  private _doneHooks: DoneHook[] = [];

  constructor(rootPath?: Path | string) {
    super(rootPath);
  }

  protected addRoute(path: Path | string, method: string, handler: RouteHandler<T>): void {
    let target = path instanceof Path ? path : new Path(path);
    if (target.length === 0) {
      target = new Path("/");
    }

    const entry: RouteEntry<T> = { method, handler };

    const existing = this.get(target);
    if (existing && Array.isArray(existing.value)) {
      existing.value.push(entry);
      return;
    }

    this.push<RouteEntry<T>[]>(target, [entry]);
  }

  protected static scoreNode(node: Tree<any>): number {
    let score = 0;
    for (let k = 0; k < node.path.length; ++k) {
      const pt = node.path[k];
      if (pt === "**") score += 1;
      else if (pt === "*" || pt.length === 0) score += 5;
      else score += 20; // Exact segments have highest specificity
    }
    return score;
  }

  public async dispatchHandlers(reqPath: Path, reqObj: T, depth: number = 0): Promise<boolean> {
    if (depth > 16) return false;

    let lookupPath = reqPath;
    if (reqPath.isHttp && reqPath.isHttp()) {
      const soft = reqPath._getSoftItems();
      lookupPath = new Path();
      for (const s of soft) lookupPath.push(s);
    }
    if (lookupPath.length === 0) {
      lookupPath = new Path("/");
    }

    const candidates = this.queryAll(lookupPath);
    const exactNode = this.get(lookupPath);
    if (exactNode && !candidates.includes(exactNode)) {
      candidates.push(exactNode);
    }
    if (candidates.length === 0) {
      const rootNode = this.get(new Path("/"));
      if (rootNode) candidates.push(rootNode);
    }

    // Sort descending by specificity
    candidates.sort((a, b) => Router.scoreNode(b) - Router.scoreNode(a));

    const reqMethod = reqPath.method ? (reqPath.method() || "GET").toUpperCase() : "GET";

    for (const candidate of candidates) {
      if (!Array.isArray(candidate.value)) continue;

      const entries = candidate.value as RouteEntry<T>[];
      for (const entry of entries) {
        if (entry.method && entry.method !== reqMethod) {
          continue;
        }

        const beforeCall = new Path(reqPath);
        const result = await entry.handler(reqPath, reqObj);

        if (reqObj && typeof reqObj === "object") {
          (reqObj as any).__result = result;
        }

        // return true (or truthy/undefined) means handled / no next required
        // return false means do next
        const handled =
          result !== false &&
          (result === true ||
            result === undefined ||
            Boolean(reqObj && (reqObj as any).view) ||
            Boolean(reqObj && (reqObj as any).component) ||
            Boolean(reqObj && (reqObj as any).response && Object.keys((reqObj as any).response).length > 0));

        if (handled) {
          return true;
        }

        // Handler returned false: check if it altered requestedPath
        if (reqPath.isBack()) {
          if (this.history.length > 0) {
            const prev = this.history.pop()!;
            reqPath.length = 0;
            for (const s of prev) reqPath.push(s);
          }
          return await this.dispatchHandlers(reqPath, reqObj, depth + 1);
        }

        if (!reqPath.equals(beforeCall)) {
          this.wasRedirected = true;
          // Re-route with the updated path
          return await this.dispatchHandlers(reqPath, reqObj, depth + 1);
        }
      }
    }

    return false;
  }

  // Route registration API
  public handle(path: Path | string, handler: RouteHandler<T>): void {
    this.addRoute(path, "", handler);
  }

  public override get(path: Path | string): Tree<any> | null;
  public override get(path: Path | string, handler: RouteHandler<T>): Tree<any> | null;
  public override get(path: Path | string, handler?: RouteHandler<T>): Tree<any> | null {
    if (handler === undefined) {
      return super.get(path);
    }
    this.addRoute(path, "GET", handler);
    return super.get(path);
  }

  public post(path: Path | string, handler: RouteHandler<T>): void {
    this.addRoute(path, "POST", handler);
  }

  public put(path: Path | string, handler: RouteHandler<T>): void {
    this.addRoute(path, "PUT", handler);
  }

  public del(path: Path | string, handler: RouteHandler<T>): void {
    this.addRoute(path, "DELETE", handler);
  }

  public delete(path: Path | string, handler: RouteHandler<T>): void {
    this.del(path, handler);
  }

  // Lifecycle hooks
  public onLeaving(hook: LeavingHook<T>): void {
    this._leavingHooks.push(hook);
  }

  public onResolved(hook: ResolvedHook<T>): void {
    this._resolvedHooks.push(hook);
  }

  public onDone(hook: DoneHook): void {
    this._doneHooks.push(hook);
  }

  public wasRedirected = false;

  /**
   * Triggers the navigation visit lifecycle: handlers, onLeaving, onResolved, onDone.
   * Accepts only the path and uses this.currentRequest.
   */
  public async visit(path: Path | string): Promise<boolean> {
    const MAX_REDIRECTS = 32;
    let redirects = 0;

    let target = path instanceof Path ? path : new Path(path);
    const initialTargetStr = target.toString();
    this.wasRedirected = false;

    // If already at target route and history is initialized, avoid redundant re-render & scroll reset
    if (this.currentPath && this.currentPath.equals(target) && this.history.length > 0) {
      return true;
    }

    if (!this.currentRequest) {
      this.currentRequest = this.requestFactory
        ? this.requestFactory(target)
        : ({} as T);
    }
    const req = this.currentRequest;

    while (redirects++ < MAX_REDIRECTS) {
      // Handle Back navigation
      if (target.isBack()) {
        this.wasRedirected = true;
        if (this.history.length > 0) {
          target = this.history.pop()!;
        } else {
          return false;
        }
      }

      const cycleStart = new Path(target);

      // 1. onLeaving Phase
      let allowLeave = true;
      for (const hook of this._leavingHooks) {
        const canLeave = await hook(target, req);
        if (!canLeave) {
          allowLeave = false;
          break;
        }
        if (target.isBack()) {
          allowLeave = false;
          break;
        }
      }

      if (!allowLeave) {
        return false;
      }

      if (!target.equals(cycleStart)) {
        this.wasRedirected = true;
        continue; // Redirected during onLeaving
      }

      // 2. Handle Phase
      const handled = await this.dispatchHandlers(target, req);

      // 3. onResolved Phase
      const afterResolved = new Path(target);
      for (const hook of this._resolvedHooks) {
        await hook(afterResolved, req);
      }

      // If onResolved modified target, trigger another visit cycle
      if (!afterResolved.equals(target) || afterResolved.isBack()) {
        this.wasRedirected = true;
        target = afterResolved;
        continue;
      }

      // Commit current state: after all resolved, and before done
      this.currentPath = target;
      this.currentRequest = req;

      if (this.currentPath.toString() !== initialTargetStr) {
        this.wasRedirected = true;
      }

      // Record into history
      if (
        this.history.length === 0 ||
        !this.history[this.history.length - 1].equals(this.currentPath)
      ) {
        this.history.push(new Path(this.currentPath));
      }

      // 4. onDone Phase
      for (const hook of this._doneHooks) {
        await hook();
      }

      return handled;
    }

    return false; // Exceeded max redirects
  }

  /**
   * Visited without modifying currentPath / currentRequest, and without triggering lifecycle events.
   * Used for internal routing, API handlers, etc.
   */
  public async visitNoEvent(path: Path | string, req: T): Promise<boolean> {
    const MAX_REDIRECTS = 32;
    let redirects = 0;

    let target = path instanceof Path ? path : new Path(path);

    while (redirects++ < MAX_REDIRECTS) {
      const cycleStart = new Path(target);

      const handled = await this.dispatchHandlers(target, req);

      if (!target.equals(cycleStart)) {
        continue; // Redirected
      }

      return handled;
    }

    return false;
  }

  public async dispatch(path: Path | string): Promise<boolean> {
    return await this.visit(path);
  }

  public async back(): Promise<boolean> {
    if (this.history.length <= 1) return false;
    this.history.pop(); // Pop current
    const prev = this.history.pop()!;
    return await this.visit(prev);
  }
}

// --- Browser Auto-Hooks & Link Interception ---

export function shouldInterceptLink(
  link: HTMLAnchorElement,
  event?: MouseEvent,
): boolean {
  if (link.hasAttribute("data-intercept-link")) return true;
  if (link.hasAttribute("data-no-intercept")) return false;

  let eventDisallows = false;

  if (event) {
    eventDisallows =
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
  }

  return !(
    eventDisallows ||
    link.hasAttribute("target") ||
    link.hasAttribute("download") ||
    link.origin !== window.location.origin
  );
}

let browserHooksAttached = false;

export function hookBrowser(router: Router<any>) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (browserHooksAttached) return;
  browserHooksAttached = true;

  // 1. Popstate listener (browser back / forward buttons)
  window.addEventListener("popstate", () => {
    const current = window.location.pathname + window.location.search + window.location.hash;
    void router.visit(current);
  });

  // 2. Link click interception
  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest("a") as HTMLAnchorElement | null;
    if (!link) return;

    if (shouldInterceptLink(link, event)) {
      event.preventDefault();
      const href = link.getAttribute("href");
      if (href) {
        void router.visit(href);
      }
    }
  });

  // 3. Synchronize window history on visit completion
  router.onDone(() => {
    if (typeof window === "undefined") return;
    const pathStr = router.currentPath ? router.currentPath.toString() : "/";
    const formatted = pathStr.startsWith("/") ? pathStr : "/" + pathStr;
    const currentBrowserPath = window.location.pathname + window.location.search + window.location.hash;

    if (currentBrowserPath !== formatted) {
      if (router.wasRedirected) {
        window.history.replaceState(window.history.state, "", formatted);
      } else {
        window.history.pushState(window.history.state, "", formatted);
      }
    } else {
      window.history.replaceState(window.history.state, "", formatted);
    }
  });
}

// --- Global Router Reference & Hook ---

export let globalRouter: Router<any> | null = null;

export function useRouter<Request = RequestObject>(
  options?: Router<Request> | any,
): Router<Request> {
  if (options instanceof Router) {
    if (!globalRouter) {
      globalRouter = options;
      hookBrowser(globalRouter);
    }
    return options;
  }

  if (!globalRouter) {
    const r = new Router<Request>();
    r.requestFactory = (path: Path) => new RequestObject(path) as any;
    globalRouter = r;
    hookBrowser(globalRouter);
    return globalRouter as Router<Request>;
  }

  return globalRouter as Router<Request>;
}
