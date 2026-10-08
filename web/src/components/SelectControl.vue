<script setup lang="ts">
defineProps<{ label: string; options: readonly { ms: number; label: string }[] }>()
const model = defineModel<number>({ required: true })
</script>

<template>
  <label class="flex flex-col gap-1">
    <span class="text-[11px] text-ink-3">{{ label }}</span>
    <select v-model.number="model" class="field cursor-pointer pr-8">
      <option v-for="option in options" :key="option.ms" :value="option.ms">{{ option.label }}</option>
    </select>
  </label>
</template>
