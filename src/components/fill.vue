<template>
  <div ref="containerRef" class="relative flex items-center justify-center w-full h-full box-border">
    <div
      ref="contentRef"
      class="box-border overflow-hidden origin-center transition-all duration-180 ease-out will-change-[width,height,transform,border-radius]"
      :style="contentStyle"
    >
      <slot
        :visible-ratio="visibleRatio"
        :factor="activeFactor"
        :min="minBound"
        :max="maxBound"
        :is-full="activeFactor >= maxBound - 0.01"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, type CSSProperties } from "vue";

interface FillProps {
  /**
   * The fraction of element visibility (0 - 1) above which it behaves like normal (scale 1, 0 radius).
   * Default: 0.8 (meaning when >= 80% is in viewport, it is fully expanded and sharp).
   */
  threshold?: number;
  /**
   * Minimum visibility/factor bound from 0 to 1.
   * Default: 0 (or lower boundary of transition).
   */
  min?: number | string;
  /**
   * Maximum visibility/factor bound from 0 to 1.
   * Default: 1 (or upper boundary of transition).
   */
  max?: number | string;
  /**
   * The minimum scale factor when fully scrolled away. Default: 0.88.
   */
  minScale?: number;
  /**
   * The minimum width percentage when scrolled away. Default: 82.
   */
  minWidth?: number;
  /**
   * The minimum height percentage when scrolled away. Default: 82.
   */
  minHeight?: number;
  /**
   * Maximum border radius (in px) applied as it leaves the visible region. Default: 32.
   */
  maxRadius?: number;
}

const props = withDefaults(defineProps<FillProps>(), {
  threshold: undefined,
  min: 0,
  max: 1,
  minScale: 0.88,
  minWidth: 84,
  minHeight: 84,
  maxRadius: 32,
});

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const visibleRatio = ref(1);
const activeFactor = ref(1);

let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;

const minBound = computed<number>(() => {
  const n = Number(props.min);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
});

const maxBound = computed<number>(() => {
  if (props.threshold !== undefined && props.max === 1) {
    return Math.max(0, Math.min(1, props.threshold));
  }
  const n = Number(props.max);
  return Number.isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
});

/**
 * Finds the effective visible viewport across all ancestor clipping containers,
 * regardless of how many levels of parenting or nested overflow-y/auto containers exist.
 */
function getClippingBounds(el: HTMLElement) {
  let clipTop = 0;
  let clipBottom = window.innerHeight || document.documentElement.clientHeight;
  let clipLeft = 0;
  let clipRight = window.innerWidth || document.documentElement.clientWidth;

  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const oy = style.overflowY;
    const ox = style.overflowX;
    const isClipping =
      oy === "auto" ||
      oy === "scroll" ||
      oy === "hidden" ||
      oy === "clip" ||
      ox === "auto" ||
      ox === "scroll" ||
      ox === "hidden" ||
      ox === "clip";

    if (isClipping) {
      const pRect = parent.getBoundingClientRect();
      clipTop = Math.max(clipTop, pRect.top);
      clipBottom = Math.min(clipBottom, pRect.bottom);
      clipLeft = Math.max(clipLeft, pRect.left);
      clipRight = Math.min(clipRight, pRect.right);
    }
    parent = parent.parentElement;
  }

  return {
    top: clipTop,
    bottom: Math.max(clipTop, clipBottom),
    left: clipLeft,
    right: Math.max(clipLeft, clipRight),
    height: Math.max(1, clipBottom - clipTop),
    width: Math.max(1, clipRight - clipLeft),
  };
}

function updateMetrics() {
  if (!containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  const clip = getClippingBounds(containerRef.value);

  // Outside the visible clipping bounds completely
  if (
    rect.bottom <= clip.top ||
    rect.top >= clip.bottom ||
    rect.right <= clip.left ||
    rect.left >= clip.right
  ) {
    visibleRatio.value = 0;
    activeFactor.value = minBound.value;
    return;
  }

  const visibleTop = Math.max(clip.top, rect.top);
  const visibleBottom = Math.min(clip.bottom, rect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const elementHeight = rect.height || 1;

  // Fraction of element currently visible within the parent clipping viewport
  const denominator = Math.min(elementHeight, clip.height);
  const ratio = Math.min(1, Math.max(0, visibleHeight / denominator));
  visibleRatio.value = ratio;

  const minV = minBound.value;
  const maxV = maxBound.value;

  if (maxV <= minV) {
    activeFactor.value = ratio >= maxV ? maxV : minV;
  } else {
    // Linear interpolation between min and max bounds
    const rawProgress = (ratio - minV) / (maxV - minV);
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));
    activeFactor.value = minV + clampedProgress * (maxV - minV);
  }
}

function onScroll() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    updateMetrics();
    rafId = null;
  });
}

onMounted(() => {
  updateMetrics();
  // Using capture: true catches scroll events on ANY ancestor container regardless of nesting depth!
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onScroll, { passive: true });

  if (typeof ResizeObserver !== "undefined" && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      onScroll();
    });
    resizeObserver.observe(containerRef.value);
    if (containerRef.value.parentElement) {
      resizeObserver.observe(containerRef.value.parentElement);
    }
  }
});

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  window.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", onScroll);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

const contentStyle = computed<CSSProperties>(() => {
  const f = activeFactor.value;

  // Linear interpolations
  const widthVal = props.minWidth + (100 - props.minWidth) * f;
  const heightVal = props.minHeight + (100 - props.minHeight) * f;
  const scaleVal = props.minScale + (1 - props.minScale) * f;
  const radiusVal = (1 - f) * props.maxRadius;

  return {
    width: `${widthVal}%`,
    height: `${heightVal}%`,
    transform: `scale(${scaleVal})`,
    borderRadius: `${radiusVal}px`,
  };
});
</script>
