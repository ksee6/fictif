<template>
  <div class="fictif-sidebar-container">
    <!-- Screen Backdrop (20% navy blue) -->
    <Transition name="fictif-backdrop-fade">
      <div
        v-if="isContentVisible"
        class="fictif-sidebar-backdrop"
        @click="handleBackdropClick"
      />
    </Transition>

    <!-- Far-left edge hover detector strip (16px) -->
    <div
      v-if="!isRailVisible"
      class="fictif-far-left-edge"
      @mouseenter="handleEdgeMouseEnter"
    />

    <!-- Interactive Shell containing Logo Anchor, Items Rail, and Content Drawer -->
    <div
      ref="shellRef"
      class="fictif-sidebar-shell"
      :class="{
        'fictif-sidebar-shell--visible': isRailVisible,
      }"
      @mouseleave="handleShellMouseLeave"
    >
      <!-- Persistent Logo Trigger (always at exact same position, z-index 300) -->
      <div
        class="fictif-logo-anchor"
        :class="{
          'fictif-logo-anchor--closed': !isRailVisible,
          'fictif-logo-anchor--active': isRailVisible,
        }"
        @mouseenter="handleLogoMouseEnter"
        @click="handleLogoClick"
      >
        <slot name="logo" />
      </div>

      <!-- Main Rail / Items Strip (Width 56px, navy blue #0d1b2a, z-index 250) -->
      <aside
        class="fictif-items-rail"
        :class="{
          'fictif-items-rail--visible': isRailVisible,
        }"
      >
        <!-- Top Spacer matching persistent logo size -->
        <div class="fictif-rail-top-spacer" />

        <!-- Center Items Section -->
        <nav class="fictif-rail-center" aria-label="Sidebar Center Navigation">
          <div
            v-for="item in centerItems"
            :key="item.key"
            class="fictif-rail-item-wrapper"
          >
            <!-- Active Marker (Square + Triangle pointing right, extends outside rail) -->
            <Transition name="fictif-marker-slide">
              <div
                v-if="isOpen && currentActiveKey === item.key"
                class="fictif-active-marker"
              />
            </Transition>

            <button
              type="button"
              class="fictif-rail-item-btn"
              :class="{
                'fictif-rail-item-btn--active': isOpen && currentActiveKey === item.key,
                'fictif-rail-item-btn--hovered': hoveredItemKey === item.key,
                'fictif-rail-item-btn--no-content': !item.hasContent,
              }"
              :disabled="!item.hasContent"
              @mouseenter="handleItemMouseEnter(item.key, item.hasContent)"
              @click="handleItemClick(item.key, item.hasContent)"
            >
              <slot :name="item.iconSlot" />
            </button>
          </div>
        </nav>

        <!-- Bottom Item Section (sticks to bottom) -->
        <div v-if="bottomItem" class="fictif-rail-bottom">
          <div class="fictif-rail-item-wrapper">
            <Transition name="fictif-marker-slide">
              <div
                v-if="isOpen && currentActiveKey === bottomItem.key"
                class="fictif-active-marker"
              />
            </Transition>

            <button
              type="button"
              class="fictif-rail-item-btn"
              :class="{
                'fictif-rail-item-btn--active': isOpen && currentActiveKey === bottomItem.key,
                'fictif-rail-item-btn--hovered': hoveredItemKey === bottomItem.key,
                'fictif-rail-item-btn--no-content': !bottomItem.hasContent,
              }"
              :disabled="!bottomItem.hasContent"
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
        class="fictif-content-drawer"
        :class="{
          'fictif-content-drawer--visible': isContentVisible,
          'fictif-content-drawer--animating': isContentTransitioning,
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
            class="fictif-content-inner"
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
.fictif-sidebar-container {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 250;
  display: flex;
  pointer-events: none;
  font-family: inherit;
}

/* 20% Navy Blue Full Screen Backdrop */
.fictif-sidebar-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(13, 27, 42, 0.2);
  z-index: 240;
  pointer-events: auto;
}

/* Far-left edge hover detector strip (16px wide along screen left edge) */
.fictif-far-left-edge {
  position: fixed;
  top: 0;
  left: 0;
  width: 16px;
  height: 100vh;
  z-index: 299;
  pointer-events: auto;
}

/* Shell is pointer-events: none when rail is not visible, preventing unwanted hover triggers */
.fictif-sidebar-shell {
  position: relative;
  display: flex;
  height: 100vh;
  pointer-events: none;
}

.fictif-sidebar-shell--visible {
  pointer-events: auto;
}

/* Persistent Logo Anchor on Top-Left */
.fictif-logo-anchor {
  position: fixed;
  top: 0;
  left: 0;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  cursor: pointer;
  pointer-events: auto;
  color: #ffffff;
  transition: opacity 0.25s ease, transform 0.2s ease;
  user-select: none;
}

.fictif-logo-anchor--closed {
  opacity: 0.4;
}

.fictif-logo-anchor--active {
  opacity: 0.9;
}

.fictif-logo-anchor:hover {
  opacity: 1;
}

/* Rail / Items Sidebar (56px, Navy Blue #0d1b2a, z-index 250) */
.fictif-items-rail {
  position: relative;
  width: 56px;
  height: 100vh;
  background-color: #0d1b2a;
  z-index: 250;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.fictif-items-rail--visible {
  transform: translateX(0);
}

.fictif-rail-top-spacer {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

/* Center Items Navigation */
.fictif-rail-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
}

.fictif-rail-bottom {
  margin-top: auto;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.fictif-rail-item-wrapper {
  position: relative;
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Active Marker: Really long width so most of it stays off-screen to the left */
.fictif-active-marker {
  position: absolute;
  right: -8px;
  width: 280px; /* extends 280px, with ~216px staying off-screen */
  height: 40px;
  background-color: #ffffff;
  clip-path: polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%);
  z-index: 1;
  pointer-events: none;
}

/* Rail Icon Buttons */
.fictif-rail-item-btn {
  position: relative;
  z-index: 2;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  opacity: 0.9;
  cursor: pointer;
  padding: 0;
  border-radius: 6px;
  transition: opacity 0.2s ease, color 0.25s ease;
}

.fictif-rail-item-btn:hover,
.fictif-rail-item-btn--hovered {
  opacity: 1;
}

.fictif-rail-item-btn--no-content {
  cursor: default;
}

/* Active Icon sits on top of marker and animates to dark navy */
.fictif-rail-item-btn--active {
  color: #0d1b2a;
  opacity: 1;
}

/* Content Drawer (Darker Navy Blue #081018, ~4x rail width, z-index 249) */
.fictif-content-drawer {
  position: relative;
  width: 240px;
  height: 100vh;
  background-color: #081018;
  z-index: 249;
  pointer-events: auto;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  color: #e2e8f0;
  box-sizing: border-box;
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.25s ease;
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.35);
}

.fictif-content-drawer--visible {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.fictif-content-drawer:not(.fictif-content-drawer--visible) {
  pointer-events: none !important;
}

/* Suppress all scrollbars during drawer and swap transitions to eliminate flicker */
.fictif-content-drawer--animating,
.fictif-content-drawer:not(.fictif-content-drawer--visible) {
  overflow: hidden !important;
}

.fictif-content-drawer::-webkit-scrollbar {
  width: 5px;
}

.fictif-content-drawer::-webkit-scrollbar-track {
  background: transparent;
}

.fictif-content-drawer::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.fictif-content-inner {
  padding: 1.25rem 1rem;
  width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

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

.fictif-marker-slide-enter-from {
  opacity: 0;
  transform: translateX(-36px);
}

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
