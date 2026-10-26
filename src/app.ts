import {
  createApp,
  defineComponent,
  h,
  isVNode,
  shallowRef,
  onMounted,
  type App,
  type VNode,
} from "vue";
import { useRouter, Router } from "./router.js";
import { Path } from "./path.js";
import {
  curtain,
  fire,
  dismissPreCurtain,
  ensureCurtainInjected,
  setDefaultAppContext,
  type ShowCurtainOptions,
  type CurtainHandle,
} from "./components/curtain.js";

export interface FictifAppLoaderOptions extends ShowCurtainOptions {}

export interface FictifAppOptions {
  loader?: FictifAppLoaderOptions;
  router?: Router<any>;
  layout?: any;
}

export class RequestObject {
  public component: any = null;
  public data: any = {};
  public path: Path;
  public options?: any;
  public _pending?: Promise<any>;

  constructor(path?: Path | string, data?: any) {
    this.path = path
      ? path instanceof Path
        ? path
        : new Path(path)
      : new Path(typeof window !== "undefined" ? window.location.pathname : "/");
    if (data !== undefined) {
      this.data = data;
    }
  }
}

import Placeholder from "./components/placeholder.vue";

const HexagonIcon = defineComponent({
  name: "FictifHexagonIcon",
  render() {
    return h(
      "svg",
      {
        width: "64",
        height: "64",
        viewBox: "0 0 64 64",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        style: {
          display: "block",
        },
      },
      [
        h("path", {
          d: "M32 6 L54 19 L54 45 L32 58 L10 45 L10 19 Z",
          fill: "currentColor",
          "fill-opacity": "0.15",
          stroke: "currentColor",
          "stroke-width": "2.5",
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }),
      ]
    );
  },
});

const CurtainPlaceholderLoader = defineComponent({
  name: "FictifCurtainPlaceholderLoader",
  render() {
    return h(
      Placeholder,
      {
        progress: 0,
        color: "#38bdf8",
        style: {
          color: "#38bdf8",
        },
      },
      () => [h(HexagonIcon)]
    );
  },
});

/**
 * Creates and mounts a Fictif Vue application wired up to the Global Router and Curtains loader.
 */
export function createFictifApp(options: FictifAppOptions = {}): App {
  const router = options.router || useRouter();

  // Initialize router.currentRequest to have a .view = undefined
  if (!router.currentRequest) {
    router.currentRequest = router.requestFactory
      ? router.requestFactory(router.currentPath)
      : ({} as any);
  }
  if (router.currentRequest && typeof router.currentRequest === "object") {
    (router.currentRequest as any).view = undefined;
  }

  // Configure requestFactory to pass { view: undefined } by default
  const origFactory = router.requestFactory;
  router.requestFactory = (path: Path) => {
    const baseReq = origFactory ? origFactory(path) : {};
    if (baseReq && typeof baseReq === "object") {
      baseReq.view = undefined;
    }
    return baseReq;
  };

  const currentView = shallowRef<any>((router.currentRequest as any)?.view || null);
  const currentLayout = shallowRef<any>(
    (router.currentRequest as any)?.layout !== undefined
      ? (router.currentRequest as any)?.layout
      : (options.layout || null)
  );
  let activeLoaderCurtain: CurtainHandle | null = null;
  let loaderTimer: any = null;
  let dismissTimer: any = null;
  let curtainShownAt: number | null = null;
  let visitCount = 0;

  const defaultLoaderOptions: ShowCurtainOptions = {
    backgroundColor: options.loader?.backgroundColor || "#00071b",
    backgroundOpacity: options.loader?.backgroundOpacity ?? 100,
    autoDestroy: false,
    toasts: options.loader?.toasts || [
      {
        component: CurtainPlaceholderLoader,
        position: "center",
        timeout: 0,
      },
    ],
    ...options.loader,
  };

  if (typeof window !== "undefined") {
    (window as any).c = curtain;
    (window as any).d = defaultLoaderOptions;
  }

  // 1. In router on leaving:
  // Fade in curtain immediately and return a Promise waiting 500ms so the router
  // is blocked until the curtain has fully shown before switching views!
  router.onLeaving(async () => {
    if (loaderTimer) {
      clearTimeout(loaderTimer);
      loaderTimer = null;
    }
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    const isFirstVisit = visitCount === 0;
    visitCount++;

    if (!activeLoaderCurtain) {
      activeLoaderCurtain = curtain(defaultLoaderOptions);
      curtainShownAt = Date.now();
    }

    if (isFirstVisit) {
      // The curtain fades in over 500ms on top of the black pre-curtain.
      // Once the curtain finishes fading in (500ms), dismiss the pre-curtain
      // behind it so it's completely gone before the curtain starts fading out!
      setTimeout(() => {
        dismissPreCurtain();
      }, 500);
    }

    // Wait until curtain has fully covered the screen (500ms transition)
    await new Promise((resolve) => setTimeout(resolve, 500));

    return true;
  });

  // 2. In router on resolved: capture view or component and layout
  router.onResolved((path, req: any) => {
    if (req && req.view !== undefined) {
      if (
        req.view instanceof Promise ||
        (typeof req.view === "object" &&
          req.view !== null &&
          typeof req.view.then === "function")
      ) {
        Promise.resolve(req.view).then((val) => {
          currentView.value = val;
          dismissAllLoaders();
        });
      } else {
        currentView.value = req.view;
      }
    } else if (req && req.component !== undefined) {
      if (
        req.component instanceof Promise ||
        (typeof req.component === "object" &&
          req.component !== null &&
          typeof req.component.then === "function")
      ) {
        Promise.resolve(req.component).then((val) => {
          currentView.value = val;
          dismissAllLoaders();
        });
      } else {
        currentView.value = req.component;
      }
    }

    if (req && req.layout !== undefined) {
      currentLayout.value = req.layout;
    } else if (options.layout) {
      currentLayout.value = options.layout;
    }
  });

  function performDismiss() {
    dismissPreCurtain();
    if (activeLoaderCurtain) {
      activeLoaderCurtain.destroy();
      activeLoaderCurtain = null;
      curtainShownAt = null;
    }
  }

  function dismissAllLoaders() {
    if (loaderTimer) {
      clearTimeout(loaderTimer);
      loaderTimer = null;
    }

    // When the loading curtain is shown, keep it visible for at least 1s after fading in (1500ms total) before fading out
    if (activeLoaderCurtain && curtainShownAt !== null) {
      const elapsed = Date.now() - curtainShownAt;
      const remaining = Math.max(0, 1500 - elapsed);
      if (remaining > 0) {
        if (!dismissTimer) {
          dismissTimer = setTimeout(() => {
            dismissTimer = null;
            performDismiss();
          }, remaining);
        }
        return;
      }
    }

    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    performDismiss();
  }

  // 3. On done routing: cancel pending timer, destroy active loader curtain, and dismiss pre-curtains
  router.onDone(() => {
    if (
      router.currentRequest &&
      ((router.currentRequest as any).view instanceof Promise ||
        (router.currentRequest as any).component instanceof Promise)
    ) {
      return;
    }
    dismissAllLoaders();
  });

  // Root Component rendering the currentView (Curtain is auto-injected by curtain.ts)
  const FictifAppRoot = defineComponent({
    name: "FictifAppRoot",
    setup() {
      onMounted(() => {
        ensureCurtainInjected(app._context);
      });

      return () => {
        const rendered = isVNode(currentView.value)
          ? currentView.value
          : currentView.value &&
            !(currentView.value instanceof Promise) &&
            (typeof currentView.value === "object" || typeof currentView.value === "function")
          ? h(currentView.value)
          : null;

        const content = currentLayout.value
          ? h(currentLayout.value, null, () => (rendered ? [rendered] : []))
          : rendered;

        return h("div", { class: "fictif-app-root", id: "fictif-app" }, [
          content,
        ]);
      };
    },
  });

  const app = createApp(FictifAppRoot);
  setDefaultAppContext(app._context);

  // Hook into mount to visit initial route automatically
  const origMount = app.mount.bind(app);
  app.mount = function (rootContainer: any, isHydrate?: boolean) {
    const vm = origMount(rootContainer, isHydrate);
    if (typeof window !== "undefined") {
      const loc = window.location.pathname + window.location.search + window.location.hash;
      void router.visit(loc).finally(() => {
        dismissAllLoaders();
      });
    }
    return vm;
  };

  return app;
}

export default createFictifApp;
