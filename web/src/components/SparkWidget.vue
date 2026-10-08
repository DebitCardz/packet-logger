<script setup lang="ts">
export interface WidgetValue {
  value: string
  label: string
  /** Extra classes for the value, e.g. a good/bad colour. */
  tone?: string
  title?: string
}

defineProps<{ title: string; subtitle?: string; values: WidgetValue[] }>()
</script>

<template>
  <div class="min-w-0 flex-1 basis-56 rounded-[5px] bg-surface px-2 pt-1 pb-2.5 text-ink-2">
    <h3 class="truncate pt-1.5 pb-2 text-center text-[15px] text-white-ink">
      {{ title }}<span v-if="subtitle" class="pl-1.5 text-[13px] text-ink-2">{{ subtitle }}</span>
    </h3>
    <div class="flex">
      <div v-for="v in values" :key="v.label" class="flex min-w-0 flex-1 flex-col text-center" :title="v.title">
        <div class="truncate text-[19px] text-white-ink tabular-nums" :class="v.tone">{{ v.value }}</div>
        <div class="truncate text-ink-2">{{ v.label }}</div>
      </div>
    </div>
  </div>
</template>
