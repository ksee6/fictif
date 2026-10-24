<template>
  <div
    class="fictif-placeholder"
    :class="{
      'is-loading': clampedProgress === 0,
      'is-reconstructing': clampedProgress > 0 && clampedProgress < 100,
      'is-complete': clampedProgress >= 100,
    }"
    :style="wrapperStyle"
  >
    <!-- 1. Real Slot Content (reconstructed from left to right) -->
    <div
      class="fictif-placeholder-real"
      :style="realStyle"
    >
      <slot />
    </div>

    <!-- 2. Silhouette & Shimmer Layer (visible when progress < 100) -->
    <div
      v-if="!isFullyComplete"
      class="fictif-placeholder-silhouette"
      :class="{ 'shimmer-active': clampedProgress === 0 }"
      :style="silhouetteStyle"
      aria-hidden="true"
    >
      <slot />
    </div>

    <!-- 3. Reconstruction Scanner Beam (glowing edge at progress dividing line) -->
    <div
      v-if="clampedProgress > 0 && clampedProgress < 100 && beam"
      class="fictif-placeholder-beam"
      :style="{ left: `${clampedProgress}%` }"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";

export interface PlaceholderProps {
  progress?: number | string;
  beam?: boolean;
  color?: string;
}

const props = withDefaults(defineProps<PlaceholderProps>(), {
  progress: 0,
  beam: true,
  color: "rgba(255, 255, 255, 0.75)",
});

const clampedProgress = computed(() => {
  const val = Number(props.progress ?? 0);
  if (isNaN(val) || val < 0) return 0;
  if (val > 100) return 100;
  return val;
});

const isFullyComplete = ref(clampedProgress.value >= 100);
let completeTimer: any = null;

watch(
  clampedProgress,
  (newVal) => {
    if (newVal >= 100) {
      if (completeTimer) clearTimeout(completeTimer);
      // Wait for transitions to finish before removing silhouette from DOM
      completeTimer = setTimeout(() => {
        isFullyComplete.value = true;
      }, 400);
    } else {
      if (completeTimer) {
        clearTimeout(completeTimer);
        completeTimer = null;
      }
      isFullyComplete.value = false;
    }
  },
  { immediate: true }
);

const wrapperStyle = computed(() => {
  return {
    opacity: clampedProgress.value >= 100 ? "1" : "0.9",
  };
});

const realStyle = computed(() => {
  const p = clampedProgress.value;
  if (p === 0) {
    return {
      clipPath: "inset(0 100% 0 0)",
      opacity: "0",
    };
  }
  if (p >= 100) {
    return {
      clipPath: "none",
      opacity: "1",
    };
  }
  return {
    clipPath: `inset(0 ${100 - p}% 0 0)`,
    opacity: "1",
  };
});

const silhouetteStyle = computed(() => {
  const p = clampedProgress.value;
  return {
    color: props.color,
    clipPath: p === 0 ? "inset(0 0 0 0)" : `inset(0 0 0 ${p}%)`,
    opacity: p >= 100 ? "0" : "1",
  };
});
</script>

<style scoped>
.fictif-placeholder {
  display: inline-grid;
  position: relative;
  align-items: center;
  justify-items: center;
  box-sizing: border-box;
  max-width: 100%;
  transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: visible;
}

.fictif-placeholder-real,
.fictif-placeholder-silhouette {
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.fictif-placeholder-real {
  transition: clip-path 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.35s ease;
}

.fictif-placeholder-silhouette {
  pointer-events: none;
  user-select: none;
  filter: grayscale(80%) brightness(0.9);
  transition: clip-path 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.35s ease,
              filter 0.35s ease;
}

/* YouTube Thumbnail-Style Loading Skeleton Animation (progress === 0) */
.fictif-placeholder-silhouette.shimmer-active {
  -webkit-mask-image: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0.6) 20%,
    rgba(0, 0, 0, 1) 50%,
    rgba(0, 0, 0, 0.6) 80%,
    rgba(0, 0, 0, 0.6) 100%
  );
  mask-image: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0.6) 20%,
    rgba(0, 0, 0, 1) 50%,
    rgba(0, 0, 0, 0.6) 80%,
    rgba(0, 0, 0, 0.6) 100%
  );
  -webkit-mask-size: 250% 100%;
  mask-size: 250% 100%;
  animation:
    fictif-placeholder-shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite,
    fictif-placeholder-pulse 2.2s ease-in-out infinite;
}

@keyframes fictif-placeholder-shimmer {
  0% {
    -webkit-mask-position: 150% 0;
    mask-position: 150% 0;
  }
  100% {
    -webkit-mask-position: -50% 0;
    mask-position: -50% 0;
  }
}

@keyframes fictif-placeholder-pulse {
  0%,
  100% {
    opacity: 0.75;
  }
  50% {
    opacity: 1;
  }
}

/* Reconstruction Glowing Beam Line (0 < progress < 100) */
.fictif-placeholder-beam {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  pointer-events: none;
  transform: translateX(-50%);
  transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(56, 189, 248, 0.7) 20%,
    #ffffff 50%,
    rgba(56, 189, 248, 0.7) 80%,
    transparent 100%
  );
  box-shadow:
    0 0 8px rgba(56, 189, 248, 0.9),
    0 0 16px rgba(56, 189, 248, 0.5),
    0 0 24px rgba(56, 189, 248, 0.25);
  animation: fictif-placeholder-beam-pulse 1.2s ease-in-out infinite alternate;
}

@keyframes fictif-placeholder-beam-pulse {
  0% {
    opacity: 0.85;
    filter: drop-shadow(0 0 2px #38bdf8);
  }
  100% {
    opacity: 1;
    filter: drop-shadow(0 0 6px #38bdf8);
  }
}
</style>
