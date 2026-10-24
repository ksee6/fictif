<template>
  <div ref="mountHostRef" class="fictif-persist-host" :data-persist-id="persistId">
    <div ref="shellRef" class="fictif-persist-shell">
      <slot :props="currentProps" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useAttrs, onMounted, onBeforeUnmount, watch } from "vue";
import { getPersistEntry } from "./persist.js";

interface PersistProps {
  id?: string;
  name?: string;
}

const props = withDefaults(defineProps<PersistProps>(), {
  id: "default",
  name: undefined,
});

const attrs = useAttrs();
const mountHostRef = ref<HTMLElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);

const persistId = computed(() => props.name || props.id || "default");
const entry = getPersistEntry(persistId.value);
const currentProps = computed(() => ({ ...attrs, ...entry.props }));

// Sync incoming props into persistent store
watch(
  () => attrs,
  (newAttrs) => {
    Object.assign(entry.props, newAttrs);
  },
  { immediate: true, deep: true }
);

onMounted(() => {
  if (entry.domContainer && mountHostRef.value && shellRef.value) {
    if (entry.domContainer !== shellRef.value) {
      // Re-adopt preserved DOM shell from cache without re-creating
      mountHostRef.value.replaceChild(entry.domContainer, shellRef.value);
      shellRef.value = entry.domContainer;
    }
  } else if (shellRef.value) {
    entry.domContainer = shellRef.value;
  }
});

onBeforeUnmount(() => {
  if (shellRef.value) {
    entry.domContainer = shellRef.value;
  }
});
</script>

<style scoped>
.fictif-persist-host {
  display: contents;
}

.fictif-persist-shell {
  display: contents;
}
</style>
