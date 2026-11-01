import { onBeforeUnmount, ref } from 'vue'

export type Route = 'overview' | 'compare' | 'capture'

const ROUTES: Record<string, Route> = { '#/compare': 'compare', '#/capture': 'capture' }
const parse = (): Route => ROUTES[location.hash] ?? 'overview'

/** A few pages don't need a router; the hash keeps links shareable and the back button working. */
export function useRoute() {
  const route = ref<Route>(parse())
  const update = () => (route.value = parse())
  window.addEventListener('hashchange', update)
  onBeforeUnmount(() => window.removeEventListener('hashchange', update))
  return route
}
