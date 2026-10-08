<script setup lang="ts" generic="T extends string">
defineProps<{ label: string; options: readonly { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-[11px] text-ink-3">{{ label }}</span>
    <div role="group" :aria-label="label" class="inline-flex h-9 overflow-hidden rounded-[5px] bg-surface">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :aria-pressed="model === option.value"
        class="cursor-pointer px-3 text-ink-2 transition-colors hover:bg-hover hover:text-white-ink"
        :class="model === option.value && 'text-white-ink shadow-[inset_0_-3px_0_var(--border-light)]'"
        @click="model = option.value"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
