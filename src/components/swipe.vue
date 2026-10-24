<template>
  <div
    ref="rootRef"
    class="fictif-swipe"
    tabindex="0"
    @keydown.left="prev"
    @keydown.right="next"
    @mousedown="handlePointerDown"
    @touchstart="handleTouchStart"
  >
    <!-- Animating viewport: smoothly transitions width and height -->
    <div
      ref="viewportRef"
      class="fictif-swipe-viewport"
      :style="viewportStyle"
    >
      <!-- All slides are kept permanently mounted: states are NEVER destroyed -->
      <div
        v-for="(name, idx) in slideNames"
        :key="name"
        :ref="(el) => setSlideRef(el as HTMLElement, idx)"
        class="fictif-swipe-slide"
        :class="{
          'fictif-swipe-slide--active': idx === resolvedIndex,
          'fictif-swipe-slide--prev': idx < resolvedIndex,
          'fictif-swipe-slide--next': idx > resolvedIndex,
          'fictif-swipe-slide--dragging': isDragging,
        }"
        :style="getSlideStyle(idx)"
      >
        <div class="fictif-swipe-slide-content">
          <slot
            :name="name"
            :parent-box="parentBoundingBox"
            :width="parentBoundingBox.width"
            :height="parentBoundingBox.height"
            :index="idx"
            :active="idx === resolvedIndex"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  useSlots,
  onMounted,
  onBeforeUnmount,
  watch,
  provide,
  nextTick,
  type CSSProperties,
} from "vue";

interface SwipeProps {
  current?: number | string;
  max?: number | string;
  min?: number | string;
  loop?: boolean;
}

const props = withDefaults(defineProps<SwipeProps>(), {
  current: 0,
  max: undefined,
  min: undefined,
  loop: false,
});

const emit = defineEmits<{
  (e: "update:current", val: number | string): void;
  (e: "change", val: number | string, index: number): void;
  (e: "swipe-left"): void;
  (e: "swipe-right"): void;
}>();

const slots: Record<string, any> = useSlots();
const rootRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const slideRefs = ref<HTMLElement[]>([]);

function setSlideRef(el: HTMLElement | null, idx: number) {
  if (el) slideRefs.value[idx] = el;
}

// Bounding box of the Swipe's real parent container
const parentBoundingBox = reactive({
  width: 0,
  height: 0,
  top: 0,
  left: 0,
});
provide("swipeParentBox", parentBoundingBox);

// Slide slots discovery
const slideNames = computed<string[]>(() => {
  const keys = Object.keys(slots).filter((k) => k !== "default");
  if (keys.length > 0) return keys;
  return ["default"];
});

// Resolve current index from either string or number
const resolvedIndex = computed<number>(() => {
  if (typeof props.current === "string") {
    const idx = slideNames.value.indexOf(props.current);
    return idx >= 0 ? idx : 0;
  }
  const n = Number(props.current);
  return Number.isNaN(n) ? 0 : n;
});

const minIndex = computed<number>(() => {
  if (props.min !== undefined && props.min !== "") return Number(props.min);
  return 0;
});

const maxIndex = computed<number>(() => {
  if (props.max !== undefined && props.max !== "") return Number(props.max);
  return Math.max(0, slideNames.value.length - 1);
});

// Animated viewport width & height
const currentWidth = ref<number | null>(null);
const currentHeight = ref<number | null>(null);

function updateActiveSlideDimensions() {
  const activeSlide = slideRefs.value[resolvedIndex.value];
  if (!activeSlide) return;

  const contentEl =
    (activeSlide.querySelector(".fictif-swipe-slide-content") as HTMLElement) ||
    activeSlide;
  const innerChild =
    (contentEl.firstElementChild as HTMLElement) || contentEl;

  // Measure the unconstrained child dimensions
  const rect = innerChild.getBoundingClientRect();
  const w = Math.ceil(rect.width || innerChild.offsetWidth || activeSlide.offsetWidth);
  const h = Math.ceil(rect.height || innerChild.offsetHeight || activeSlide.offsetHeight);

  if (w > 0) currentWidth.value = w;
  if (h > 0) currentHeight.value = h;
}

// Parent bounding box observer
let parentObserver: ResizeObserver | null = null;
let slideObserver: ResizeObserver | null = null;

function updateParentBounds() {
  const parent = rootRef.value?.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  parentBoundingBox.width = rect.width;
  parentBoundingBox.height = rect.height;
  parentBoundingBox.top = rect.top;
  parentBoundingBox.left = rect.left;
}

// Drag & Swipe gesture state
const isDragging = ref(false);
const dragDeltaX = ref(0);
let startX = 0;
let startY = 0;
let isHorizontalGesture: boolean | null = null;

function handlePointerDown(e: MouseEvent) {
  if (e.button !== 0) return;
  startX = e.clientX;
  startY = e.clientY;
  isDragging.value = true;
  dragDeltaX.value = 0;
  isHorizontalGesture = null;

  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("mouseup", handlePointerUp);
}

function handlePointerMove(e: MouseEvent) {
  if (!isDragging.value) return;
  const diffX = e.clientX - startX;
  const diffY = e.clientY - startY;

  if (isHorizontalGesture === null) {
    if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
      isHorizontalGesture = Math.abs(diffX) > Math.abs(diffY);
    }
  }

  if (isHorizontalGesture) {
    dragDeltaX.value = diffX;
  }
}

function handlePointerUp() {
  if (!isDragging.value) return;
  window.removeEventListener("mousemove", handlePointerMove);
  window.removeEventListener("mouseup", handlePointerUp);
  finishGesture();
}

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  isDragging.value = true;
  dragDeltaX.value = 0;
  isHorizontalGesture = null;

  window.addEventListener("touchmove", handleTouchMove, { passive: false });
  window.addEventListener("touchend", handleTouchEnd);
  window.addEventListener("touchcancel", handleTouchEnd);
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging.value || e.touches.length !== 1) return;
  const diffX = e.touches[0].clientX - startX;
  const diffY = e.touches[0].clientY - startY;

  if (isHorizontalGesture === null) {
    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
      isHorizontalGesture = Math.abs(diffX) > Math.abs(diffY);
    }
  }

  if (isHorizontalGesture) {
    e.preventDefault();
    dragDeltaX.value = diffX;
  }
}

function handleTouchEnd() {
  window.removeEventListener("touchmove", handleTouchMove);
  window.removeEventListener("touchend", handleTouchEnd);
  window.removeEventListener("touchcancel", handleTouchEnd);
  finishGesture();
}

function finishGesture() {
  const threshold = 45;
  const delta = dragDeltaX.value;
  isDragging.value = false;
  dragDeltaX.value = 0;

  if (delta < -threshold) {
    // Swiped left -> advance forward
    next();
  } else if (delta > threshold) {
    // Swiped right -> go backward
    prev();
  }
}

function goToIndex(newIdx: number) {
  let target = newIdx;
  if (props.loop) {
    const total = slideNames.value.length;
    target = ((target % total) + total) % total;
  } else {
    target = Math.max(minIndex.value, Math.min(maxIndex.value, target));
  }

  if (target === resolvedIndex.value) return;

  const targetName = slideNames.value[target];
  if (typeof props.current === "string") {
    emit("update:current", targetName);
    emit("change", targetName, target);
  } else {
    emit("update:current", target);
    emit("change", target, target);
  }

  nextTick(() => {
    updateActiveSlideDimensions();
  });
}

function next() {
  emit("swipe-left");
  goToIndex(resolvedIndex.value + 1);
}

function prev() {
  emit("swipe-right");
  goToIndex(resolvedIndex.value - 1);
}

defineExpose({
  next,
  prev,
  goTo: goToIndex,
  current: resolvedIndex,
});

watch(
  () => resolvedIndex.value,
  () => {
    nextTick(() => {
      updateActiveSlideDimensions();
    });
  },
  { immediate: true }
);

onMounted(() => {
  updateParentBounds();
  updateActiveSlideDimensions();

  if (typeof ResizeObserver !== "undefined") {
    const parent = rootRef.value?.parentElement;
    if (parent) {
      parentObserver = new ResizeObserver(() => {
        updateParentBounds();
      });
      parentObserver.observe(parent);
    }

    slideObserver = new ResizeObserver(() => {
      updateActiveSlideDimensions();
    });
    slideRefs.value.forEach((el) => {
      if (el) {
        slideObserver?.observe(el);
        const content = el.querySelector(".fictif-swipe-slide-content");
        if (content) slideObserver?.observe(content);
        if (content?.firstElementChild) slideObserver?.observe(content.firstElementChild);
      }
    });
  }

  window.addEventListener("resize", updateParentBounds);
});

onBeforeUnmount(() => {
  if (parentObserver) parentObserver.disconnect();
  if (slideObserver) slideObserver.disconnect();
  window.removeEventListener("resize", updateParentBounds);
});

const viewportStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {};
  if (currentWidth.value !== null) {
    style.width = `${currentWidth.value}px`;
  }
  if (currentHeight.value !== null) {
    style.height = `${currentHeight.value}px`;
  }
  return style;
});

function getSlideStyle(idx: number): CSSProperties {
  const offset = idx - resolvedIndex.value;
  const dragPx = isDragging.value ? dragDeltaX.value : 0;

  // Active slide
  if (offset === 0) {
    return {
      transform: isDragging.value
        ? `translate(-50%, -50%) translateX(${dragPx}px)`
        : "translate(-50%, -50%)",
      opacity: 1,
      pointerEvents: "auto",
      zIndex: 2,
    };
  }

  // Sibling slides
  return {
    transform: isDragging.value
      ? `translate(-50%, -50%) translateX(calc(${offset * 120}% + ${dragPx}px))`
      : `translate(-50%, -50%) translateX(${offset * 120}%)`,
    opacity: 0,
    pointerEvents: "none",
    zIndex: 1,
  };
}
</script>

<style scoped>
.fictif-swipe {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  user-select: none;
  touch-action: pan-y;
  cursor: grab;
  outline: none;
}

.fictif-swipe:active {
  cursor: grabbing;
}

.fictif-swipe-viewport {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    width 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    height 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.fictif-swipe-slide {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  transition:
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.3s ease;
  will-change: transform, opacity;
}

.fictif-swipe-slide--dragging {
  transition: none !important;
}

.fictif-swipe-slide-content {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  height: max-content;
}
</style>
