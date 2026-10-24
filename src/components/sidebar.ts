import { ref } from "vue";

// Persistent hover state across view transitions
export const isRailHovered = ref(false);
export const hoveredItemKey = ref<string | null>(null);

let lastMouseX = -1;
let lastMouseY = -1;

if (typeof window !== "undefined") {
  window.addEventListener(
    "mousemove",
    (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    },
    { passive: true }
  );
}

export function getLastMousePos(): { x: number; y: number } {
  return { x: lastMouseX, y: lastMouseY };
}
