<template>
  <div
    class="fictif-youtube"
    :style="containerStyle"
    :class="{ 'fictif-youtube--active': isActivated }"
  >
    <!-- Before Loading Phase -->
    <template v-if="!isActivated">
      <!-- 1. Custom slot provided: render slot, loads upon clicking -->
      <div
        v-if="hasCustomSlot"
        class="fictif-youtube-custom-slot"
        role="button"
        tabindex="0"
        :aria-label="title || 'Play YouTube Video'"
        @click="activatePlayer"
        @keydown.enter.space.prevent="activatePlayer"
      >
        <slot
          :load="activatePlayer"
          :is-activated="isActivated"
          :video-id="resolvedVideoId"
          :poster-url="resolvedPosterUrl"
        />
      </div>

      <!-- 2. Slot is empty: thumbnail + backdrop + simple & beautiful navy blue YT icon in center -->
      <div
        v-else
        class="fictif-youtube-poster"
        :style="{ backgroundImage: `url(${resolvedPosterUrl})` }"
        role="button"
        tabindex="0"
        :aria-label="title || 'Play YouTube Video'"
        @click="activatePlayer"
        @keydown.enter.space.prevent="activatePlayer"
      >
        <!-- Fallback image error detector for maxresdefault -> hqdefault -->
        <img
          v-if="isAutoPoster"
          :src="resolvedPosterUrl"
          alt=""
          style="display: none;"
          @error="handlePosterError"
        />

        <!-- Backdrop overlay on top of thumbnail -->
        <div class="fictif-youtube-backdrop" />

        <!-- Simple and beautiful navy blue YouTube icon in center -->
        <div class="fictif-youtube-navy-icon" aria-hidden="true">
          <svg viewBox="0 0 68 48" class="fictif-youtube-svg">
            <path
              d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"
              fill="#0d1b2a"
            />
            <path d="M 45,24 27,14 27,34" fill="#ffffff" />
          </svg>
        </div>

        <div v-if="title" class="fictif-youtube-title">
          {{ title }}
        </div>
      </div>
    </template>

    <!-- Embedded YouTube Iframe (Loaded after clicking or via autoLoad) -->
    <iframe
      v-if="isActivated"
      ref="iframeRef"
      class="fictif-youtube-iframe"
      :src="embedUrl"
      :title="title || 'YouTube video player'"
      :loading="loading"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      :allowfullscreen="fs"
      frameborder="0"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  useSlots,
  onMounted,
  onBeforeUnmount,
  watch,
  type CSSProperties,
} from "vue";

interface YouTubeProps {
  /**
   * YouTube video ID or full URL (e.g. "dQw4w9WgXcQ", "https://youtu.be/...", "https://www.youtube.com/watch?v=...").
   */
  src?: string;
  id?: string;
  videoId?: string;

  /**
   * Accessible video title.
   */
  title?: string;

  /**
   * Automatically load the iframe directly without waiting for a click. Default: false.
   */
  autoLoad?: boolean | string | number;

  /**
   * Autoplay when rendered or clicked. Default: false.
   */
  autoplay?: boolean | string | number;

  /**
   * Mute video audio. Default: false.
   */
  mute?: boolean | string | number;
  muted?: boolean | string | number;

  /**
   * Show YouTube native player controls. Default: true.
   */
  controls?: boolean | string | number;

  /**
   * Loop video. Default: false.
   */
  loop?: boolean | string | number;

  /**
   * Start time in seconds (or "1m30s").
   */
  start?: number | string;

  /**
   * End time in seconds.
   */
  end?: number | string;

  /**
   * Show related videos from the same channel only (false/0) or all (true/1). Default: false.
   */
  rel?: boolean | string | number;

  /**
   * Minimal YouTube branding. Default: true.
   */
  modestbranding?: boolean | string | number;

  /**
   * Play inline on mobile iOS instead of forcing native fullscreen. Default: true.
   */
  playsinline?: boolean | string | number;

  /**
   * Allow fullscreen. Default: true.
   */
  fs?: boolean;
  fullscreen?: boolean;

  /**
   * Disable keyboard controls. Default: false.
   */
  disablekb?: boolean | string | number;

  /**
   * Force closed captions. Default: false.
   */
  captions?: boolean | string | number;
  cc_load_policy?: boolean | string | number;

  /**
   * Interface language (e.g. 'en', 'fr').
   */
  hl?: string;
  lang?: string;

  /**
   * Progress bar color ('red' | 'white'). Default: 'red'.
   */
  color?: "red" | "white";

  /**
   * Use enhanced privacy domain (youtube-nocookie.com). Default: true.
   */
  nocookie?: boolean;
  privacy?: boolean;

  /**
   * Enable YouTube JS API for programmatic postMessage control. Default: true.
   */
  enablejsapi?: boolean | string | number;

  /**
   * Origin for JS API security. Default: current window origin.
   */
  origin?: string;

  /**
   * Poster image URL, or true/"auto" for automatic high-res thumbnail, or false to skip facade.
   * Default: true ("auto").
   */
  poster?: string | boolean;

  /**
   * Aspect ratio of the player container. Default: "16/9".
   */
  aspectRatio?: string | number;

  /**
   * Width of the player container. Default: "100%".
   */
  width?: string | number;

  /**
   * Height of the player container. Default: "auto".
   */
  height?: string | number;

  /**
   * Border radius of the player container. Default: "0px" (sharp edges).
   */
  radius?: string | number;
  rounded?: string | number;

  /**
   * Iframe loading attribute. Default: "lazy".
   */
  loading?: "lazy" | "eager";
}

const props = withDefaults(defineProps<YouTubeProps>(), {
  src: undefined,
  id: undefined,
  videoId: undefined,
  title: undefined,
  autoLoad: false,
  autoplay: false,
  mute: false,
  muted: false,
  controls: true,
  loop: false,
  start: undefined,
  end: undefined,
  rel: false,
  modestbranding: true,
  playsinline: true,
  fs: true,
  fullscreen: true,
  disablekb: false,
  captions: false,
  cc_load_policy: false,
  hl: undefined,
  lang: undefined,
  color: "red",
  nocookie: true,
  privacy: true,
  enablejsapi: true,
  origin: undefined,
  poster: true,
  aspectRatio: "16/9",
  width: "100%",
  height: "auto",
  radius: "0px",
  rounded: undefined,
  loading: "lazy",
});

const emit = defineEmits<{
  (e: "ready"): void;
  (e: "play"): void;
  (e: "pause"): void;
  (e: "ended"): void;
  (e: "state-change", state: number): void;
}>();

const slots = useSlots();
const hasCustomSlot = computed<boolean>(() => Boolean(slots.default));

const iframeRef = ref<HTMLIFrameElement | null>(null);

const isTruthy = (v: any) => v === true || v === "true" || v === 1 || v === "1";

const isActivated = ref(isTruthy(props.autoLoad));
const posterFallback = ref(false);

watch(
  () => props.autoLoad,
  (val) => {
    if (isTruthy(val)) {
      isActivated.value = true;
    }
  },
);

/**
 * Extracts clean 11-character YouTube video ID from various URL formats or plain ID.
 */
function extractVideoId(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // If already standard 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const regExp =
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : trimmed;
}

const resolvedVideoId = computed<string>(() => {
  return extractVideoId(props.src || props.id || props.videoId || "");
});

const isAutoPoster = computed<boolean>(() => {
  return props.poster === true || props.poster === "auto" || props.poster === undefined;
});

const resolvedPosterUrl = computed<string>(() => {
  if (typeof props.poster === "string" && props.poster !== "auto" && props.poster !== "true") {
    return props.poster;
  }
  const id = resolvedVideoId.value;
  if (!id) return "";
  if (posterFallback.value) {
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
});

function handlePosterError() {
  posterFallback.value = true;
}

function parseSeconds(val?: string | number): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "number") return val;
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  let total = 0;
  const hours = val.match(/(\d+)\s*h/i);
  const minutes = val.match(/(\d+)\s*m/i);
  const seconds = val.match(/(\d+)\s*s/i);
  if (hours) total += parseInt(hours[1], 10) * 3600;
  if (minutes) total += parseInt(minutes[1], 10) * 60;
  if (seconds) total += parseInt(seconds[1], 10);
  return total > 0 ? total : undefined;
}

const embedUrl = computed<string>(() => {
  const id = resolvedVideoId.value;
  if (!id) return "";

  const domain = props.nocookie && props.privacy ? "www.youtube-nocookie.com" : "www.youtube.com";
  const params = new URLSearchParams();

  // Autoplay: If activated via clicking poster, force autoplay = 1
  const shouldAutoplay = isActivated.value || isTruthy(props.autoplay);
  if (shouldAutoplay) params.set("autoplay", "1");

  // Mute
  if (isTruthy(props.mute) || isTruthy(props.muted)) params.set("mute", "1");

  // Controls
  params.set("controls", isTruthy(props.controls) ? "1" : "0");

  // Loop
  if (isTruthy(props.loop)) {
    params.set("loop", "1");
    params.set("playlist", id);
  }

  // Start & End
  const startSec = parseSeconds(props.start);
  if (startSec !== undefined) params.set("start", String(startSec));
  const endSec = parseSeconds(props.end);
  if (endSec !== undefined) params.set("end", String(endSec));

  // Rel
  params.set("rel", isTruthy(props.rel) ? "1" : "0");

  // Modestbranding
  if (isTruthy(props.modestbranding)) params.set("modestbranding", "1");

  // Playsinline
  if (isTruthy(props.playsinline)) params.set("playsinline", "1");

  // Fullscreen
  params.set("fs", isTruthy(props.fs) && isTruthy(props.fullscreen) ? "1" : "0");

  // Disable keyboard
  if (isTruthy(props.disablekb)) params.set("disablekb", "1");

  // Closed Captions
  if (isTruthy(props.captions) || isTruthy(props.cc_load_policy)) {
    params.set("cc_load_policy", "1");
  }

  // Language
  const langVal = props.hl || props.lang;
  if (langVal) params.set("hl", langVal);

  // Color
  if (props.color === "white") params.set("color", "white");

  // JS API
  if (isTruthy(props.enablejsapi)) {
    params.set("enablejsapi", "1");
    if (typeof window !== "undefined") {
      params.set("origin", props.origin || window.location.origin);
    }
  }

  return `https://${domain}/embed/${id}?${params.toString()}`;
});

function activatePlayer() {
  isActivated.value = true;
}

// Programmatic postMessage command helpers (no external libraries needed)
function postCommand(func: string, args: any = "") {
  if (!iframeRef.value?.contentWindow) return;
  iframeRef.value.contentWindow.postMessage(
    JSON.stringify({
      event: "command",
      func,
      args: Array.isArray(args) ? args : [args],
    }),
    "*",
  );
}

function play() {
  if (!isActivated.value) {
    activatePlayer();
  } else {
    postCommand("playVideo");
  }
}

function pause() {
  postCommand("pauseVideo");
}

function stop() {
  postCommand("stopVideo");
}

function mute() {
  postCommand("mute");
}

function unMute() {
  postCommand("unMute");
}

function seekTo(seconds: number) {
  postCommand("seekTo", [seconds, true]);
}

function setVolume(volume: number) {
  postCommand("setVolume", [Math.max(0, Math.min(100, volume))]);
}

function handleWindowMessage(event: MessageEvent) {
  if (!event.data || typeof event.data !== "string") return;
  try {
    const data = JSON.parse(event.data);
    if (data.event === "onReady") {
      emit("ready");
    } else if (data.event === "onStateChange") {
      const state = data.info;
      emit("state-change", state);
      if (state === 1) emit("play");
      else if (state === 2) emit("pause");
      else if (state === 0) emit("ended");
    }
  } catch {
    // Non-JSON messages from other sources ignored
  }
}

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("message", handleWindowMessage);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("message", handleWindowMessage);
  }
});

defineExpose({
  play,
  pause,
  stop,
  mute,
  unMute,
  seekTo,
  setVolume,
  activate: activatePlayer,
  isActivated,
  iframe: iframeRef,
});

const containerStyle = computed<CSSProperties>(() => {
  const rad = props.rounded !== undefined ? props.rounded : props.radius;
  const rVal = typeof rad === "number" ? `${rad}px` : (rad || "0px");
  const wVal = typeof props.width === "number" ? `${props.width}px` : props.width;
  const hVal = typeof props.height === "number" ? `${props.height}px` : props.height;
  const ar = typeof props.aspectRatio === "number" ? `${props.aspectRatio}` : props.aspectRatio;

  return {
    width: wVal,
    height: hVal,
    borderRadius: rVal,
    aspectRatio: ar,
  };
});
</script>

<style scoped>
.fictif-youtube {
  position: relative;
  display: block;
  overflow: hidden;
  box-sizing: border-box;
  background-color: #000000;
  max-width: 100%;
  border-radius: 0; /* Sharp edges by default */
}

.fictif-youtube-custom-slot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fictif-youtube-poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Backdrop on top of the thumbnail */
.fictif-youtube-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(13, 27, 42, 0.45);
}

/* Simple and beautiful navy blue YouTube icon in center */
.fictif-youtube-navy-icon {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.5));
}

.fictif-youtube-svg {
  width: 68px;
  height: 48px;
  display: block;
}

.fictif-youtube-title {
  position: absolute;
  top: 1rem;
  left: 1.25rem;
  right: 1.25rem;
  z-index: 2;
  color: #f8fafc;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.35;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fictif-youtube-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
