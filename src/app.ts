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
  useCurtain,
  useCurtains,
  dismissPreCurtain,
  ensureCurtainInjected,
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

const ConfettiLauncherPhicons = defineComponent({
  name: "FictifConfettiLauncherPhicons",
  render() {
    return h(
      "svg",
      {
        width: "72",
        height: "72",
        viewBox: "0 0 64 64",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        style: {
          display: "block",
          filter: "drop-shadow(0 0 16px rgba(56, 189, 248, 0.5))",
        },
      },
      [
        // Party popper confetti cannon cone
        h("path", {
          d: "M10 52 L26 36 L20 30 L4 46 C2.5 47.5 2.5 50.5 4.5 52.5 C6.5 54.5 9.5 54.5 11 53 Z",
          fill: "currentColor",
          "fill-opacity": "0.35",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linejoin": "round",
        }),
        // Cannon decorative stripes
        h("path", {
          d: "M8 44 L18 34 M13 49 L23 39",
          stroke: "currentColor",
          "stroke-width": "1.75",
          "stroke-linecap": "round",
        }),
        // Cannon mouth ring
        h("ellipse", {
          cx: "23",
          cy: "33",
          rx: "4.5",
          ry: "2",
          transform: "rotate(-45 23 33)",
          fill: "currentColor",
          "fill-opacity": "0.7",
          stroke: "currentColor",
          "stroke-width": "1.5",
        }),
        // Phosphor Sparkle (PhSparkle / PhStarFour)
        h("path", {
          d: "M43 7 C43 13 41 15 35 17 C41 19 43 21 43 27 C43 21 45 19 51 17 C45 15 43 13 43 7 Z",
          fill: "currentColor",
          "fill-opacity": "0.95",
          stroke: "currentColor",
          "stroke-width": "1.5",
          "stroke-linejoin": "round",
        }),
        // Second Phosphor Sparkle
        h("path", {
          d: "M26 6 C26 10 24.5 11.5 21 12.5 C24.5 13.5 26 15 26 19 C26 15 27.5 13.5 31 12.5 C27.5 11.5 26 10 26 6 Z",
          fill: "currentColor",
          "fill-opacity": "0.85",
          stroke: "currentColor",
          "stroke-width": "1.25",
        }),
        // Phosphor Diamond (PhDiamond)
        h("path", {
          d: "M36 26 L42 32 L36 38 L30 32 Z",
          fill: "currentColor",
          "fill-opacity": "0.9",
          stroke: "currentColor",
          "stroke-width": "1.5",
          "stroke-linejoin": "round",
        }),
        // Mini Phosphor Star at right
        h("path", {
          d: "M54 28 C54 31 53 32 50 33 C53 34 54 35 54 38 C54 35 55 34 58 33 C55 32 54 31 54 28 Z",
          fill: "currentColor",
          "fill-opacity": "0.85",
        }),
        // Phosphor Heart (PhHeart)
        h("path", {
          d: "M16 19 C14 17 11 18 11 20.5 C11 23 15 26 16 27 C17 26 21 23 21 20.5 C21 18 18 17 16 19 Z",
          fill: "currentColor",
          "fill-opacity": "0.85",
        }),
        // Festive streamer ribbons
        h("path", {
          d: "M26 28 Q34 20 42 24 T52 18",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
        }),
        h("path", {
          d: "M23 22 Q27 14 34 10",
          stroke: "currentColor",
          "stroke-width": "1.75",
          "stroke-linecap": "round",
        }),
        h("path", {
          d: "M29 33 Q38 38 48 34",
          stroke: "currentColor",
          "stroke-width": "1.75",
          "stroke-linecap": "round",
        }),
        // Confetti dots
        h("circle", { cx: "38", cy: "12", r: "2", fill: "currentColor" }),
        h("circle", { cx: "48", cy: "24", r: "2.5", fill: "currentColor" }),
        h("circle", { cx: "32", cy: "21", r: "1.75", fill: "currentColor" }),
        h("circle", { cx: "46", cy: "38", r: "2", fill: "currentColor" }),
        h("circle", { cx: "18", cy: "13", r: "1.5", fill: "currentColor" }),
        h("circle", { cx: "56", cy: "22", r: "1.75", fill: "currentColor" }),
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
      () => [h(ConfettiLauncherPhicons)]
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
    backgroundColor: options.loader?.backgroundColor || "#0d1b2a",
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

  const curtains = useCurtains();
  if (typeof window !== "undefined") {
    (window as any).c = curtains;
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
      activeLoaderCurtain = curtains.show(defaultLoaderOptions);
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
