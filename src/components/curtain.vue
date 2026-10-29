<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-0" style="z-index: 500;">
      <TransitionGroup name="curtain-fade" appear @after-leave="onCurtainAfterLeave">
        <div
          v-for="(cItem, index) in curtains"
          :key="cItem.id"
          :data-curtain-id="cItem.id"
          :data-opaque="!isTransparent(cItem)"
          class="fixed inset-0 w-screen h-screen flex flex-col items-center outline-none select-none overflow-hidden font-inherit"
          :class="{
            'pointer-events-none': isTransparent(cItem),
            'pointer-events-auto': !isTransparent(cItem),
          }"
          :style="getCurtainLayerStyle(cItem, index)"
          tabindex="-1"
          @keydown="handleKeydown($event, cItem)"
        >
          <!-- Background layers for non-transparent curtains -->
          <template v-if="!isTransparent(cItem)">
            <!-- Background image layer (underneath color layer) -->
            <div
              v-if="cItem.backgroundImage"
              class="absolute inset-0 bg-cover bg-center z-1"
              :style="{ backgroundImage: `url(${cItem.backgroundImage})` }"
            />

            <!-- Background color layer (higher than bg image) -->
            <div
              class="absolute inset-0 z-2"
              :style="{
                backgroundColor: cItem.backgroundColor,
                opacity: cItem.backgroundOpacity / 100,
              }"
            />
          </template>

          <!-- Top center toasts container -->
          <div
            v-if="getToastsByPosition(cItem, 'top').length > 0"
            class="fixed z-10 flex flex-col items-center pointer-events-none left-0 right-0 w-full overflow-visible top-5 gap-3"
          >
            <TransitionGroup name="mist-toast-top">
              <div
                v-for="toast in getToastsByPosition(cItem, 'top')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>

          <!-- Top-left toasts container: aligned by left, stacks downward -->
          <div
            v-if="getToastsByPosition(cItem, 'top-left').length > 0"
            class="fixed z-10 flex flex-col items-start pointer-events-none left-5 top-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="mist-toast-top-left">
              <div
                v-for="toast in getToastsByPosition(cItem, 'top-left')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>

          <!-- Top-right toasts container: aligned by right, stacks downward -->
          <div
            v-if="getToastsByPosition(cItem, 'top-right').length > 0"
            class="fixed z-10 flex flex-col items-end pointer-events-none right-5 top-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="mist-toast-top-right">
              <div
                v-for="toast in getToastsByPosition(cItem, 'top-right')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>

          <!-- Center toasts / dialogs container (only if opaque or explicit) -->
          <div
            v-if="!isTransparent(cItem) && getToastsByPosition(cItem, 'center').length > 0"
            class="fixed z-10 flex flex-col items-center pointer-events-none left-0 right-0 w-full overflow-visible top-1/2 -translate-y-1/2 gap-4"
          >
            <TransitionGroup name="mist-toast-center" appear>
              <div
                v-for="toast in getToastsByPosition(cItem, 'center')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>

          <!-- Bottom center toasts container -->
          <div
            v-if="getToastsByPosition(cItem, 'bottom').length > 0"
            class="fixed z-10 flex flex-col items-center pointer-events-none left-0 right-0 w-full overflow-visible bottom-5 gap-3"
          >
            <TransitionGroup name="mist-toast-bottom">
              <div
                v-for="toast in getToastsByPosition(cItem, 'bottom')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>

          <!-- Bottom-left toasts container: aligned by left, newer is most bottom -->
          <div
            v-if="getToastsByPosition(cItem, 'bottom-left').length > 0"
            class="fixed z-10 flex flex-col items-start pointer-events-none left-5 bottom-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="mist-toast-bottom-left">
              <div
                v-for="toast in getToastsByPosition(cItem, 'bottom-left')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>

          <!-- Bottom-right toasts container: aligned by right, newer is most bottom -->
          <div
            v-if="getToastsByPosition(cItem, 'bottom-right').length > 0"
            class="fixed z-10 flex flex-col items-end pointer-events-none right-5 bottom-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="mist-toast-bottom-right">
              <div
                v-for="toast in getToastsByPosition(cItem, 'bottom-right')"
                :key="toast.id"
                class="pointer-events-auto box-border"
              >
                <component
                  :is="toast.component"
                  v-bind="toast.props"
                  v-on="toast.events || {}"
                  :destroy="toast.destroy"
                />
              </div>
            </TransitionGroup>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from "vue";
import {
  curtains,
  notifyCurtainLeft,
  updateScrollLock,
  unlockScroll,
  markCurtainMounted,
  type CurtainInstance,
  type ToastInstance,
  type ToastPosition,
} from "./curtain";

function isTransparent(curtain: CurtainInstance): boolean {
  return curtain.backgroundOpacity === 0 && !curtain.backgroundImage;
}

function getCurtainLayerStyle(curtain: CurtainInstance, index: number) {
  if (isTransparent(curtain)) {
    return {
      zIndex: 100,
      pointerEvents: "none" as const,
    };
  }

  return {
    zIndex: 500 + index,
    pointerEvents: "auto" as const,
  };
}

function getToastsByPosition(curtain: CurtainInstance, position: ToastPosition): ToastInstance[] {
  return curtain.toasts.filter((t) => t.position === position);
}

function handleKeydown(event: KeyboardEvent, curtain: CurtainInstance) {
  if (!isTransparent(curtain)) {
    // Intercept keys when modal / opaque curtain is open
    if (event.key === "Escape") {
      curtain.destroy();
    }
  }
}

function onCurtainAfterLeave(el: Element) {
  const id = (el as HTMLElement).dataset.curtainId;
  if (id) {
    notifyCurtainLeft(id);
  } else {
    updateScrollLock();
  }
}

// Keep html/body scroll strictly locked whenever an opaque curtain exists or is fading out
watch(
  curtains,
  () => {
    updateScrollLock();
  },
  { deep: true, immediate: true }
);

onMounted(() => {
  markCurtainMounted(true);
  updateScrollLock();
});

onBeforeUnmount(() => {
  markCurtainMounted(false);
  unlockScroll();
});
</script>

<style scoped>
/* Strictly lock viewport scrollbars while any curtain or pre-curtain is active / fading */
:global(html.mist-no-scroll),
:global(body.mist-no-scroll),
:global(html:has(.pre-curtain)),
:global(body:has(.pre-curtain)) {
  overflow: hidden !important;
}

/* Animations */
:global(.curtain-fade-enter-active),
:global(.curtain-fade-appear-active),
:global(.curtain-fade-leave-active) {
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

:global(.curtain-fade-enter-from),
:global(.curtain-fade-appear-from),
:global(.curtain-fade-leave-to) {
  opacity: 0 !important;
}

:global(.curtain-fade-enter-to),
:global(.curtain-fade-appear-to),
:global(.curtain-fade-leave-from) {
  opacity: 1 !important;
}

/* Toast FLIP movement when siblings enter or leave */
.mist-toast-top-move,
.mist-toast-bottom-move,
.mist-toast-center-move,
.mist-toast-top-left-move,
.mist-toast-top-right-move,
.mist-toast-bottom-left-move,
.mist-toast-bottom-right-move {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Top center */
.mist-toast-top-enter-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-top-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: 90vw;
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-top-enter-from {
  opacity: 0;
  transform: translateY(-24px) scale(0.95);
}
.mist-toast-top-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

/* Top left */
.mist-toast-top-left-enter-active,
.mist-toast-top-left-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-top-left-leave-active {
  position: absolute;
}
.mist-toast-top-left-enter-from {
  opacity: 0;
  transform: translateX(-24px) translateY(-10px) scale(0.95);
}
.mist-toast-top-left-leave-to {
  opacity: 0;
  transform: translateX(-20px) translateY(-10px) scale(0.95);
}

/* Top right */
.mist-toast-top-right-enter-active,
.mist-toast-top-right-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-top-right-leave-active {
  position: absolute;
}
.mist-toast-top-right-enter-from {
  opacity: 0;
  transform: translateX(24px) translateY(-10px) scale(0.95);
}
.mist-toast-top-right-leave-to {
  opacity: 0;
  transform: translateX(20px) translateY(-10px) scale(0.95);
}

/* Center */
:global(.mist-toast-center-enter-active),
:global(.mist-toast-center-appear-active),
:global(.mist-toast-center-leave-active) {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
:global(.mist-toast-center-leave-active) {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: 90vw;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
:global(.mist-toast-center-enter-from),
:global(.mist-toast-center-appear-from),
:global(.mist-toast-center-leave-to) {
  opacity: 0 !important;
  transform: scale(0.92);
}
:global(.mist-toast-center-enter-to),
:global(.mist-toast-center-appear-to),
:global(.mist-toast-center-leave-from) {
  opacity: 1 !important;
  transform: scale(1);
}

/* Bottom center */
.mist-toast-bottom-enter-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-bottom-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: 90vw;
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-bottom-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.95);
}
.mist-toast-bottom-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

/* Bottom left: aligned by left, newer is most bottom */
.mist-toast-bottom-left-enter-active,
.mist-toast-bottom-left-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-bottom-left-leave-active {
  position: absolute;
}
.mist-toast-bottom-left-enter-from {
  opacity: 0;
  transform: translateX(-24px) translateY(12px) scale(0.95);
}
.mist-toast-bottom-left-leave-to {
  opacity: 0;
  transform: translateX(-20px) translateY(10px) scale(0.95);
}

/* Bottom right: aligned by right, newer is most bottom */
.mist-toast-bottom-right-enter-active,
.mist-toast-bottom-right-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.mist-toast-bottom-right-leave-active {
  position: absolute;
}
.mist-toast-bottom-right-enter-from {
  opacity: 0;
  transform: translateX(24px) translateY(12px) scale(0.95);
}
.mist-toast-bottom-right-leave-to {
  opacity: 0;
  transform: translateX(20px) translateY(10px) scale(0.95);
}
</style>
