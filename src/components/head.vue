<template>
  <slot v-if="false" />
</template>

<script setup lang="ts">
import { useSlots } from "vue";
import { useHeadComponent } from "./head.js";

const slots = useSlots();
useHeadComponent(slots);
</script>
