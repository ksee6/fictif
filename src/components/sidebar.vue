<template>
  <div class="fictif-sidebar-container fixed top-0 left-0 h-screen z-250 flex pointer-events-none font-inherit">
    <!-- Screen Backdrop (20% navy blue) -->
    <Transition name="fictif-backdrop-fade">
      <div
        v-if="isContentVisible"
        class="fictif-sidebar-backdrop fixed inset-0 bg-[#0d1b2a]/20 z-240 pointer-events-auto"
        @click="handleBackdropClick"
      />
    </Transition>

    <!-- Far-left edge hover detector strip (16px) -->
    <div
      v-if="!isRailVisible"
      class="fictif-far-left-edge fixed top-0 left-0 w-4 h-screen z-299 pointer-events-auto"
      @mouseenter="handleEdgeMouseEnter"
    />

    <!-- Interactive Shell containing Logo Anchor, Items Rail, and Content Drawer -->
    <div
      ref="shellRef"
      class="fictif-sidebar-shell relative flex h-screen pointer-events-none"
      :class="{
        'pointer-events-auto': isRailVisible,
      }"
      @mouseleave="handleShellMouseLeave"
    >
      <!-- Persistent Logo Trigger (always at exact same position, z-index 300) -->
      <div
        class="fictif-logo-anchor fixed top-0 left-0 w-14 h-14 flex items-center justify-center z-300 cursor-pointer pointer-events-auto text-white select-none transition-opacity,transform duration-250 ease hover:opacity-100"
        :class="{
          'opacity-40': !isRailVisible,
          'opacity-90': isRailVisible,
        }"
        @mouseenter="handleLogoMouseEnter"
        @click="handleLogoClick"
      >
        <slot name="logo" />
      </div>

      <!-- Main Rail / Items Strip (Width 56px, navy blue #0d1b2a, z-index 250) -->
      <aside
        class="fictif-items-rail relative w-14 h-screen bg-[#00071b] z-250 flex flex-col items-center pointer-events-auto box-border transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        :class="{
          'translate-x-0': isRailVisible,
          '-translate-x-full': !isRailVisible,
        }"
      >
        <!-- Top Spacer matching persistent logo size -->
        <div class="fictif-rail-top-spacer w-14 h-14 shrink-0" />

        <!-- Center Items Section -->
        <nav class="fictif-rail-center flex-1 flex flex-col items-center justify-center gap-3 w-full" aria-label="Sidebar Center Navigation">
          <div
            v-for="item in centerItems"
            :key="item.key"
            class="fictif-rail-item-wrapper relative w-full h-11 flex items-center justify-center"
          >
            <!-- Active Marker (Square + Triangle pointing right, extends outside rail) -->
            <Transition name="fictif-marker-slide">
              <div
                v-if="isOpen && currentActiveKey === item.key"
                class="fictif-active-marker absolute -right-2 w-70 h-10 bg-white z-1 pointer-events-none [clip-path:polygon(0%_0%,calc(100%-10px)_0%,100%_50%,calc(100%-10px)_100%,0%_100%)]"
              />
            </Transition>

            <button
              type="button"
              class="fictif-rail-item-btn relative z-2 w-10 h-10 border-none bg-transparent flex items-center justify-center text-white cursor-pointer p-0 rounded-md transition-opacity,color duration-200 ease hover:opacity-100"
              :class="{
                'text-[#0d1b2a]! opacity-100!': isOpen && currentActiveKey === item.key,
                'opacity-100': hoveredItemKey === item.key && !(isOpen && currentActiveKey === item.key),
                'opacity-90': hoveredItemKey !== item.key && !(isOpen && currentActiveKey === item.key),
                'cursor-default': !item.hasContent,
              }"
              @mouseenter="handleItemMouseEnter(item.key, item.hasContent)"
              @click="handleItemClick(item.key, item.hasContent)"
            >
              <slot :name="item.iconSlot" />
            </button>
          </div>
        </nav>

        <!-- Bottom Item Section (sticks to bottom) -->
        <div v-if="bottomItem" class="fictif-rail-bottom mt-auto mb-4 flex flex-col items-center w-full">
          <div class="fictif-rail-item-wrapper relative w-full h-11 flex items-center justify-center">
            <Transition name="fictif-marker-slide">
              <div
                v-if="isOpen && currentActiveKey === bottomItem.key"
                class="fictif-active-marker absolute -right-2 w-70 h-10 bg-white z-1 pointer-events-none [clip-path:polygon(0%_0%,calc(100%-10px)_0%,100%_50%,calc(100%-10px)_100%,0%_100%)]"
              />
            </Transition>

            <button
              type="button"
              class="fictif-rail-item-btn relative z-2 w-10 h-10 border-none bg-transparent flex items-center justify-center text-white cursor-pointer p-0 rounded-md transition-opacity,color duration-200 ease hover:opacity-100"
              :class="{
                'text-[#0d1b2a]! opacity-100!': isOpen && currentActiveKey === bottomItem.key,
                'opacity-100': hoveredItemKey === bottomItem.key && !(isOpen && currentActiveKey === bottomItem.key),
                'opacity-90': hoveredItemKey !== bottomItem.key && !(isOpen && currentActiveKey === bottomItem.key),
                'cursor-default': !bottomItem.hasContent,
              }"
              @mouseenter="handleItemMouseEnter(bottomItem.key, bottomItem.hasContent)"
              @click="handleItemClick(bottomItem.key, bottomItem.hasContent)"
            >
              <slot :name="bottomItem.iconSlot" />
            </button>
          </div>
        </div>
      </aside>

      <!-- Content Drawer (Darker navy blue #081018, z-index 249, ~4x rail width) -->
      <section
        ref="contentContainerRef"
        class="fictif-content-drawer relative w-60 h-screen bg-[#081224] z-249 text-slate-200 box-border shadow-[4px_0_16px_rgba(0,0,0,0.35)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]"
        :class="{
          'translate-x-0 opacity-100 pointer-events-auto overflow-y-auto overflow-x-hidden': isContentVisible,
          '-translate-x-full opacity-0 pointer-events-none overflow-hidden': !isContentVisible,
          'overflow-hidden!': isContentTransitioning,
        }"
        @transitionstart="handleDrawerTransitionStart"
        @transitionend="handleDrawerTransitionEnd"
        @mouseenter="handleContentMouseEnter"
      >
        <Transition
          name="fictif-content-swap"
          mode="out-in"
          @before-leave="handleContentSwapStart"
          @before-enter="handleContentSwapStart"
          @after-enter="handleContentSwapEnd"
        >
          <div
            v-if="displayedContentKey"
            :key="displayedContentKey"
            class="fictif-content-inner py-5 px-4 w-full box-border overflow-x-hidden"
          >
            <slot :name="displayedContentKey" />
          </div>
        </Transition>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, useSlots, nextTick, onMounted, onBeforeUnmount } from "vue";
import { isRailHovered, hoveredItemKey, getLastMousePos } from "./sidebar.js";

interface SidebarProps {
  open?: boolean;
  defaultActiveItem?: string | null;
  activeItem?: string | null;
  focusOnItem?: string | null;
}

const props = withDefaults(defineProps<SidebarProps>(), {
  open: false,
  defaultActiveItem: null,
  activeItem: null,
  focusOnItem: null,
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "update:activeItem", value: string | null): void;
}>();

const slots = useSlots();
const contentContainerRef = ref<HTMLElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);

function onWindowMouseMove(e: MouseEvent) {
  if (isOpen.value) return;
  if (!isRailHovered.value) return;

  // Rail (56px) + Content Drawer (240px) = 296px width
  if (e.clientX > 300) {
    isRailHovered.value = false;
    hoveredItemKey.value = null;
  }
}

function handleContentMouseEnter() {
  isRailHovered.value = true;
  if (!hoveredItemKey.value && displayedContentKey.value) {
    hoveredItemKey.value = displayedContentKey.value;
  }
}

// Transition state to completely eliminate scrollbar flickers
const isContentTransitioning = ref(false);

const internalOpen = ref(props.open);
const internalActiveItem = ref(props.activeItem);

watch(
  () => props.open,
  (val) => {
    internalOpen.value = val;
  }
);

watch(
  () => props.activeItem,
  (val) => {
    internalActiveItem.value = val;
  }
);

const isOpen = computed({
  get: () => internalOpen.value,
  set: (val: boolean) => {
    internalOpen.value = val;
    emit("update:open", val);
  },
});

const currentActiveKey = computed({
  get: () => internalActiveItem.value,
  set: (val: string | null) => {
    internalActiveItem.value = val;
    emit("update:activeItem", val);
  },
});

let isExplicitItemClick = false;

function applyDefaultActiveItem() {
  if (
    props.defaultActiveItem &&
    typeof props.defaultActiveItem === "string" &&
    props.defaultActiveItem.trim() !== ""
  ) {
    currentActiveKey.value = props.defaultActiveItem;
  }
}

// Identify items from slot names
interface SidebarItemDef {
  key: string;
  iconSlot: string;
  contentSlot: string;
  hasContent: boolean;
}

const allItemDefs = computed<SidebarItemDef[]>(() => {
  const slotNames = Object.keys(slots);
  const items: SidebarItemDef[] = [];

  for (const name of slotNames) {
    if (name === "logo") continue;
    if (name.endsWith("-icon")) {
      const key = name.slice(0, -5);
      const hasContent = !!slots[key];
      items.push({
        key,
        iconSlot: name,
        contentSlot: key,
        hasContent,
      });
    }
  }
  return items;
});

const centerItems = computed(() => {
  return allItemDefs.value.filter((item) => item.key !== "bottom");
});

const bottomItem = computed(() => {
  return allItemDefs.value.find((item) => item.key === "bottom") || null;
});

// Determine which item content should currently be shown
const targetContentKey = computed<string | null>(() => {
  // If user is hovering an item (or the drawer for that hovered item), preview it
  if (hoveredItemKey.value) {
    const item = allItemDefs.value.find((i) => i.key === hoveredItemKey.value);
    if (item && item.hasContent) {
      return item.key;
    }
  }

  // Otherwise, if open, show the committed active item
  if (isOpen.value && currentActiveKey.value) {
    const item = allItemDefs.value.find((i) => i.key === currentActiveKey.value);
    if (item && item.hasContent) {
      return item.key;
    }
  }

  return null;
});

const displayedContentKey = ref<string | null>(null);

watch(
  targetContentKey,
  (newKey) => {
    displayedContentKey.value = newKey;
  },
  { immediate: true }
);

// Rail visibility: shown if open, or if hovering logo / far-left edge / rail
const isRailVisible = computed(() => {
  return isOpen.value || isRailHovered.value;
});

// Content strip visibility: shown if rail is visible and an item is targetted
const isContentVisible = computed(() => {
  if (!isRailVisible.value) return false;
  return Boolean(displayedContentKey.value);
});

// Handlers for Hover Triggers
function handleEdgeMouseEnter() {
  isRailHovered.value = true;
}

function handleLogoMouseEnter() {
  isRailHovered.value = true;
}

function handleShellMouseLeave() {
  isRailHovered.value = false;
  hoveredItemKey.value = null;
}

function handleLogoClick() {
  if (!isOpen.value) {
    applyDefaultActiveItem();
    isOpen.value = true;
  } else {
    isOpen.value = false;
    hoveredItemKey.value = null;
    isRailHovered.value = false;
  }
}

function handleItemMouseEnter(key: string, hasContent: boolean) {
  if (hasContent) {
    hoveredItemKey.value = key;
  }
}

function handleItemClick(key: string, hasContent: boolean) {
  if (!hasContent) return;
  isExplicitItemClick = true;
  currentActiveKey.value = key;
  isOpen.value = true;
  hoveredItemKey.value = key;
  nextTick(() => {
    isExplicitItemClick = false;
  });
}

function handleBackdropClick() {
  isOpen.value = false;
  hoveredItemKey.value = null;
  isRailHovered.value = false;
}

// Transition handlers to suppress scrollbar flicker
function handleDrawerTransitionStart() {
  isContentTransitioning.value = true;
}

function handleDrawerTransitionEnd() {
  isContentTransitioning.value = false;
  scrollToFocusTarget();
}

function handleContentSwapStart() {
  isContentTransitioning.value = true;
}

function handleContentSwapEnd() {
  isContentTransitioning.value = false;
  scrollToFocusTarget();
}

function scrollToFocusTarget() {
  if (props.focusOnItem && contentContainerRef.value) {
    nextTick(() => {
      const el = contentContainerRef.value?.querySelector(`#${props.focusOnItem}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
}

// Watch for focusOnItem prop changes
watch(
  () => props.focusOnItem,
  () => {
    scrollToFocusTarget();
  }
);

// When open becomes true, populate activeItem from defaultActiveItem if not an explicit item click
watch(
  () => props.open,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      if (!isExplicitItemClick) {
        applyDefaultActiveItem();
      }
    }
  }
);

// Keyboard handling: Escape closes sidebar, / keypress opens sidebar
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && (isOpen.value || isRailHovered.value)) {
    isOpen.value = false;
    isRailHovered.value = false;
    hoveredItemKey.value = null;
    return;
  }

  // / keypress opens the sidebar (when not currently focused in an input/textarea)
  if (e.key === "/" && !isOpen.value) {
    const target = e.target as HTMLElement | null;
    const isEditing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    if (!isEditing) {
      e.preventDefault();
      applyDefaultActiveItem();
      isOpen.value = true;
    }
  }
}

// Mobile swipe handling
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
}

function handleTouchEnd(e: TouchEvent) {
  if (e.changedTouches.length !== 1) return;
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  const dt = Date.now() - touchStartTime;

  // Swipe must be reasonably quick (within 600ms) and predominantly horizontal
  if (dt > 600 || Math.abs(dx) < Math.abs(dy) * 1.25) return;

  // Swipe from left edge (within 50px or on sidebar) to right: open sidebar
  if (!isOpen.value && touchStartX <= 50 && dx > 35) {
    applyDefaultActiveItem();
    isOpen.value = true;
  }
  // Swipe left when open or hovered: close sidebar
  else if ((isOpen.value || isRailHovered.value) && dx < -35) {
    isOpen.value = false;
    isRailHovered.value = false;
    hoveredItemKey.value = null;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("mousemove", onWindowMouseMove, { passive: true });

  if (!isOpen.value && isRailHovered.value) {
    const { x } = getLastMousePos();
    if (x > 300) {
      isRailHovered.value = false;
      hoveredItemKey.value = null;
    }
  }

  if (props.open && !currentActiveKey.value) {
    applyDefaultActiveItem();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("touchstart", handleTouchStart);
  window.removeEventListener("touchend", handleTouchEnd);
  window.removeEventListener("mousemove", onWindowMouseMove);
});
</script>

<style scoped>
/* Backdrop Animation */
.fictif-backdrop-fade-enter-active,
.fictif-backdrop-fade-leave-active {
  transition: opacity 0.25s ease;
}

.fictif-backdrop-fade-enter-from,
.fictif-backdrop-fade-leave-to {
  opacity: 0;
}

/* Marker Animation */
.fictif-marker-slide-enter-active,
.fictif-marker-slide-leave-active {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
}

.fictif-marker-slide-enter-from,
.fictif-marker-slide-leave-to {
  opacity: 0;
  transform: translateX(-36px);
}

/* Content Swap Animation */
.fictif-content-swap-enter-active,
.fictif-content-swap-leave-active {
  transition: opacity 0.12s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.fictif-content-swap-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.fictif-content-swap-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
