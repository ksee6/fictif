<template>
  <div class="fictif-persist-host" :data-persist-id="persistId">
    <div class="fictif-persist-shell">
      <slot :props="currentProps" :state="entry.state" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs, watch } from "vue";
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
</script>

<style scoped>
.fictif-persist-host {
  display: contents;
}

.fictif-persist-shell {
  display: contents;
}
</style>
