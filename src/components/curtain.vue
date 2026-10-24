<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-0" style="z-index: 500;">
      <TransitionGroup name="curtain-fade" appear @after-leave="onCurtainAfterLeave">
        <div
          v-for="(curtain, index) in curtains"
          :key="curtain.id"
          :data-curtain-id="curtain.id"
          :data-opaque="!isTransparent(curtain)"
          class="fixed inset-0 w-screen h-screen flex flex-col items-center outline-none select-none overflow-hidden font-inherit"
          :class="{
            'pointer-events-none': isTransparent(curtain),
            'pointer-events-auto': !isTransparent(curtain),
          }"
          :style="getCurtainLayerStyle(curtain, index)"
          tabindex="-1"
          @keydown="handleKeydown($event, curtain)"
        >
          <!-- Background layers for non-transparent curtains -->
          <template v-if="!isTransparent(curtain)">
            <!-- Background image layer (underneath color layer) -->
            <div
              v-if="curtain.backgroundImage"
              class="absolute inset-0 bg-cover bg-center z-1"
              :style="{ backgroundImage: `url(${curtain.backgroundImage})` }"
            />

            <!-- Background color layer (higher than bg image) -->
            <div
              class="absolute inset-0 z-2"
              :style="{
                backgroundColor: curtain.backgroundColor,
                opacity: curtain.backgroundOpacity / 100,
              }"
            />
          </template>

          <!-- Top center toasts container -->
          <div
            v-if="getToastsByPosition(curtain, 'top').length > 0"
            class="fixed z-10 flex flex-col items-center pointer-events-none left-0 right-0 w-full overflow-visible top-5 gap-3"
          >
            <TransitionGroup name="fictif-toast-top">
              <div
                v-for="toast in getToastsByPosition(curtain, 'top')"
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
            v-if="getToastsByPosition(curtain, 'top-left').length > 0"
            class="fixed z-10 flex flex-col items-start pointer-events-none left-5 top-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="fictif-toast-top-left">
              <div
                v-for="toast in getToastsByPosition(curtain, 'top-left')"
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
            v-if="getToastsByPosition(curtain, 'top-right').length > 0"
            class="fixed z-10 flex flex-col items-end pointer-events-none right-5 top-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="fictif-toast-top-right">
              <div
                v-for="toast in getToastsByPosition(curtain, 'top-right')"
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
            v-if="!isTransparent(curtain) && getToastsByPosition(curtain, 'center').length > 0"
            class="fixed z-10 flex flex-col items-center pointer-events-none left-0 right-0 w-full overflow-visible top-1/2 -translate-y-1/2 gap-4"
          >
            <TransitionGroup name="fictif-toast-center" appear>
              <div
                v-for="toast in getToastsByPosition(curtain, 'center')"
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
            v-if="getToastsByPosition(curtain, 'bottom').length > 0"
            class="fixed z-10 flex flex-col items-center pointer-events-none left-0 right-0 w-full overflow-visible bottom-5 gap-3"
          >
            <TransitionGroup name="fictif-toast-bottom">
              <div
                v-for="toast in getToastsByPosition(curtain, 'bottom')"
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
            v-if="getToastsByPosition(curtain, 'bottom-left').length > 0"
            class="fixed z-10 flex flex-col items-start pointer-events-none left-5 bottom-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="fictif-toast-bottom-left">
              <div
                v-for="toast in getToastsByPosition(curtain, 'bottom-left')"
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
            v-if="getToastsByPosition(curtain, 'bottom-right').length > 0"
            class="fixed z-10 flex flex-col items-end pointer-events-none right-5 bottom-5 gap-3 overflow-visible max-w-sm w-max"
          >
            <TransitionGroup name="fictif-toast-bottom-right">
              <div
                v-for="toast in getToastsByPosition(curtain, 'bottom-right')"
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
  useCurtains,
  notifyCurtainLeft,
  updateScrollLock,
  unlockScroll,
  markCurtainMounted,
  type CurtainInstance,
  type ToastInstance,
  type ToastPosition,
} from "./curtain";

const { curtains } = useCurtains();

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
:global(html.fictif-no-scroll),
:global(body.fictif-no-scroll),
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
.fictif-toast-top-move,
.fictif-toast-bottom-move,
.fictif-toast-center-move,
.fictif-toast-top-left-move,
.fictif-toast-top-right-move,
.fictif-toast-bottom-left-move,
.fictif-toast-bottom-right-move {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Top center */
.fictif-toast-top-enter-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-top-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: 90vw;
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-top-enter-from {
  opacity: 0;
  transform: translateY(-24px) scale(0.95);
}
.fictif-toast-top-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

/* Top left */
.fictif-toast-top-left-enter-active,
.fictif-toast-top-left-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-top-left-leave-active {
  position: absolute;
}
.fictif-toast-top-left-enter-from {
  opacity: 0;
  transform: translateX(-24px) translateY(-10px) scale(0.95);
}
.fictif-toast-top-left-leave-to {
  opacity: 0;
  transform: translateX(-20px) translateY(-10px) scale(0.95);
}

/* Top right */
.fictif-toast-top-right-enter-active,
.fictif-toast-top-right-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-top-right-leave-active {
  position: absolute;
}
.fictif-toast-top-right-enter-from {
  opacity: 0;
  transform: translateX(24px) translateY(-10px) scale(0.95);
}
.fictif-toast-top-right-leave-to {
  opacity: 0;
  transform: translateX(20px) translateY(-10px) scale(0.95);
}

/* Center */
:global(.fictif-toast-center-enter-active),
:global(.fictif-toast-center-appear-active),
:global(.fictif-toast-center-leave-active) {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
:global(.fictif-toast-center-leave-active) {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: 90vw;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
:global(.fictif-toast-center-enter-from),
:global(.fictif-toast-center-appear-from),
:global(.fictif-toast-center-leave-to) {
  opacity: 0 !important;
  transform: scale(0.92);
}
:global(.fictif-toast-center-enter-to),
:global(.fictif-toast-center-appear-to),
:global(.fictif-toast-center-leave-from) {
  opacity: 1 !important;
  transform: scale(1);
}

/* Bottom center */
.fictif-toast-bottom-enter-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-bottom-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: max-content;
  max-width: 90vw;
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-bottom-enter-from {
  opacity: 0;
  transform: translateY(24px) scale(0.95);
}
.fictif-toast-bottom-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

/* Bottom left: aligned by left, newer is most bottom */
.fictif-toast-bottom-left-enter-active,
.fictif-toast-bottom-left-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-bottom-left-leave-active {
  position: absolute;
}
.fictif-toast-bottom-left-enter-from {
  opacity: 0;
  transform: translateX(-24px) translateY(12px) scale(0.95);
}
.fictif-toast-bottom-left-leave-to {
  opacity: 0;
  transform: translateX(-20px) translateY(10px) scale(0.95);
}

/* Bottom right: aligned by right, newer is most bottom */
.fictif-toast-bottom-right-enter-active,
.fictif-toast-bottom-right-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.fictif-toast-bottom-right-leave-active {
  position: absolute;
}
.fictif-toast-bottom-right-enter-from {
  opacity: 0;
  transform: translateX(24px) translateY(12px) scale(0.95);
}
.fictif-toast-bottom-right-leave-to {
  opacity: 0;
  transform: translateX(20px) translateY(10px) scale(0.95);
}
</style>
