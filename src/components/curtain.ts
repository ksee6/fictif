import {
  reactive,
  ref,
  computed,
  markRaw,
  h,
  render,
  type AppContext,
} from "vue";
import CurtainComponent from "./curtain.vue";

export type ToastPosition =
  | "top"
  | "bottom"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface ToastOptions {
  id?: string;
  position?: ToastPosition;
  component: any;
  props?: Record<string, any>;
  events?: Record<string, Function>;
  timeout?: number; // in ms; 0 means disabled
  [key: string]: any;
}

export interface ToastInstance extends ToastOptions {
  id: string;
  position: ToastPosition;
  destroy: () => void;
  timerId?: any;
}

export interface ShowCurtainOptions {
  id?: string;
  backgroundColor?: string; // default navy blue
  backgroundOpacity?: number; // 0 to 100, default 0
  backgroundImage?: string; // default empty
  autoDestroy?: boolean; // default true
  toasts?: ToastOptions[];
}

export interface CurtainInstance {
  id: string;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundImage: string;
  autoDestroy: boolean;
  toasts: ToastInstance[];
  destroy: () => void;
  fire: (options: ToastOptions) => ToastHandle;
}

export interface ToastHandle {
  id: string;
  destroy: () => void;
}

export interface CurtainHandle {
  id: string;
  destroy: () => void;
  fire: (options: ToastOptions) => ToastHandle;
  getOptions: () => ShowCurtainOptions;
}

// Global reactive state
const curtainsList = ref<CurtainInstance[]>([]);
const leavingCurtainIds = reactive(new Set<string>());
let curtainIdCounter = 0;
let toastIdCounter = 0;

let isCurtainMounted = false;
let autoInjectedContainer: HTMLElement | null = null;

export function markCurtainMounted(mounted: boolean) {
  isCurtainMounted = mounted;
}

/**
 * Auto-injects curtain.vue into the top of document.body if it isn't already mounted.
 */
export function ensureCurtainInjected(appContext?: AppContext) {
  if (typeof document === "undefined") return;
  if (isCurtainMounted || autoInjectedContainer || document.getElementById("fictif-curtain-root")) {
    return;
  }

  const container = document.createElement("div");
  container.id = "fictif-curtain-root";

  // Prepend to the top of body
  if (document.body.firstChild) {
    document.body.insertBefore(container, document.body.firstChild);
  } else {
    document.body.appendChild(container);
  }
  autoInjectedContainer = container;

  const vnode = h(CurtainComponent);
  if (appContext) {
    vnode.appContext = appContext;
  }
  render(vnode, container);
}

export function isCurtainOpaque(curtain: Partial<CurtainInstance | ShowCurtainOptions>): boolean {
  return (curtain.backgroundOpacity ?? 0) > 0 || Boolean(curtain.backgroundImage);
}

export function hasActiveOrLeavingOpaqueCurtains(): boolean {
  if (typeof document !== "undefined") {
    // If any .pre-curtain exists anywhere in DOM
    if (document.querySelectorAll(".pre-curtain").length > 0) {
      return true;
    }
  }
  const hasActiveOpaque = curtainsList.value.some((c) => isCurtainOpaque(c));
  if (hasActiveOpaque) return true;
  if (leavingCurtainIds.size > 0) return true;
  return false;
}

export function lockScroll() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("fictif-no-scroll");
  document.body.classList.add("fictif-no-scroll");
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

export function unlockScroll() {
  if (typeof document === "undefined") return;
  if (hasActiveOrLeavingOpaqueCurtains()) return;

  document.documentElement.classList.remove("fictif-no-scroll");
  document.body.classList.remove("fictif-no-scroll");
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

export function updateScrollLock() {
  if (typeof document === "undefined") return;
  if (hasActiveOrLeavingOpaqueCurtains()) {
    lockScroll();
  } else {
    unlockScroll();
  }
}

export function notifyCurtainLeaving(curtainId: string, isOpaque: boolean) {
  if (isOpaque) {
    leavingCurtainIds.add(curtainId);
    updateScrollLock();
  }
}

export function notifyCurtainLeft(curtainId: string) {
  leavingCurtainIds.delete(curtainId);
  updateScrollLock();
}

/**
 * Dismisses any .pre-curtain elements from the raw HTML splash screen
 * by directly removing them from the DOM behind the opaque curtain.
 */
export function dismissPreCurtain() {
  if (typeof document === "undefined") return;
  const preCurtains = document.querySelectorAll<HTMLElement>(".pre-curtain");
  if (!preCurtains.length) return;

  preCurtains.forEach((el) => {
    el.remove();
  });
  updateScrollLock();
}

export function useCurtains() {
  function destroyCurtain(curtainId: string) {
    dismissPreCurtain();

    const idx = curtainsList.value.findIndex((c) => c.id === curtainId);
    if (idx !== -1) {
      const curtain = curtainsList.value[idx];
      const opaque = isCurtainOpaque(curtain);
      if (opaque) {
        // Mark as leaving immediately so scroll lock is unbroken
        leavingCurtainIds.add(curtainId);
        // Fallback safety timeout in case Curtains component is unmounted or in headless env
        setTimeout(() => {
          if (leavingCurtainIds.has(curtainId)) {
            leavingCurtainIds.delete(curtainId);
            updateScrollLock();
          }
        }, 650);
      }

      // Clear timers for all toasts
      for (const t of curtain.toasts) {
        if (t.timerId) clearTimeout(t.timerId);
      }
      curtain.toasts = [];
      curtainsList.value.splice(idx, 1);
    }
    updateScrollLock();
  }

  function destroyToast(curtainId: string, toastId: string) {
    const curtain = curtainsList.value.find((c) => c.id === curtainId);
    if (!curtain) return;

    const tIdx = curtain.toasts.findIndex((t) => t.id === toastId);
    if (tIdx !== -1) {
      const toast = curtain.toasts[tIdx];
      if (toast.timerId) clearTimeout(toast.timerId);
      curtain.toasts.splice(tIdx, 1);

      if (curtain.autoDestroy && curtain.toasts.length === 0) {
        destroyCurtain(curtainId);
      }
    }
  }

  function fireInCurtain(curtainId: string, options: ToastOptions): ToastHandle {
    ensureCurtainInjected();
    const curtain = curtainsList.value.find((c) => c.id === curtainId);
    if (!curtain) {
      throw new Error(`[curtains] Curtain with id "${curtainId}" not found.`);
    }

    const toastId = options.id || `toast_${++toastIdCounter}`;
    const opacity = curtain.backgroundOpacity;

    let position: ToastPosition;
    if (opacity === 0) {
      // If curtain opacity is 0, center is an invalid option; fallback to top
      if (options.position === "center") {
        console.warn("[curtain] 'center' position is invalid on transparent curtains. Falling back to 'top'.");
        position = "top";
      } else {
        position = options.position || "top";
      }
    } else {
      // For opaque curtains, center is default
      position = options.position || "center";
    }

    const toastInst: ToastInstance = {
      ...options,
      id: toastId,
      position,
      component: typeof options.component === "object" ? markRaw(options.component) : options.component,
      props: options.props || {},
      events: options.events || {},
      destroy: () => destroyToast(curtainId, toastId),
    };

    if (options.timeout && options.timeout > 0) {
      toastInst.timerId = setTimeout(() => {
        toastInst.destroy();
      }, options.timeout);
    }

    // Direct push on reactive array triggers Vue dependency update immediately
    curtain.toasts.push(toastInst);

    return {
      id: toastId,
      destroy: toastInst.destroy,
    };
  }

  function show(options: ShowCurtainOptions = {}): CurtainHandle {
    ensureCurtainInjected();
    const opacity = options.backgroundOpacity ?? 0;
    const bgImage = options.backgroundImage ?? "";
    const isTransparent = opacity === 0 && !bgImage;

    // Check if transparent curtain merging applies:
    // When a newer curtain has transparent background, merge its toasts into existing transparent curtain
    if (isTransparent) {
      const existingTransparent = [...curtainsList.value]
        .reverse()
        .find((c) => c.backgroundOpacity === 0 && !c.backgroundImage);

      if (existingTransparent) {
        if (options.toasts && options.toasts.length > 0) {
          for (const t of options.toasts) {
            existingTransparent.fire(t);
          }
        }
        return {
          id: existingTransparent.id,
          destroy: existingTransparent.destroy,
          fire: (toastOpts: ToastOptions) => existingTransparent.fire(toastOpts),
          getOptions: () => ({
            id: existingTransparent.id,
            backgroundColor: existingTransparent.backgroundColor,
            backgroundOpacity: existingTransparent.backgroundOpacity,
            backgroundImage: existingTransparent.backgroundImage,
            autoDestroy: existingTransparent.autoDestroy,
          }),
        };
      }
    }

    const curtainId = options.id || `curtain_${++curtainIdCounter}`;
    const curtainInst: CurtainInstance = reactive({
      id: curtainId,
      backgroundColor: options.backgroundColor || "#0d1b2a",
      backgroundOpacity: opacity,
      backgroundImage: bgImage,
      autoDestroy: options.autoDestroy ?? true,
      toasts: [],
      destroy: () => destroyCurtain(curtainId),
      fire: (toastOpts: ToastOptions) => fireInCurtain(curtainId, toastOpts),
    });

    curtainsList.value.push(curtainInst);
    updateScrollLock();

    if (options.toasts && options.toasts.length > 0) {
      for (const t of options.toasts) {
        curtainInst.fire(t);
      }
    }

    return {
      id: curtainId,
      destroy: curtainInst.destroy,
      fire: (toastOpts: ToastOptions) => curtainInst.fire(toastOpts),
      getOptions: () => ({
        id: curtainId,
        backgroundColor: curtainInst.backgroundColor,
        backgroundOpacity: curtainInst.backgroundOpacity,
        backgroundImage: curtainInst.backgroundImage,
        autoDestroy: curtainInst.autoDestroy,
      }),
    };
  }

  function fire(options: ToastOptions): ToastHandle {
    ensureCurtainInjected();
    // Finds the latest transparent curtain, or creates one
    let target = [...curtainsList.value]
      .reverse()
      .find((c) => c.backgroundOpacity === 0 && !c.backgroundImage);

    if (!target) {
      show({
        backgroundOpacity: 0,
        autoDestroy: true,
      });
      target = curtainsList.value[curtainsList.value.length - 1];
    }

    return target.fire(options);
  }

  function destroyAll() {
    for (const c of [...curtainsList.value]) {
      c.destroy();
    }
    leavingCurtainIds.clear();
    updateScrollLock();
  }

  return {
    show,
    fire,
    destroyAll,
    curtains: computed(() => curtainsList.value),
  };
}

export const useCurtain = useCurtains;
export default useCurtain;
