import { computed, ref } from 'vue'

export type WindowRouteName = 'assistant' | 'translate' | 'settings'

export interface WindowRoute {
  name: WindowRouteName
  path: string
  label: string
}

export const windowRoutes: WindowRoute[] = [
  { name: 'assistant', path: '/assistant', label: '助手' },
  { name: 'translate', path: '/translate', label: '翻译' },
  { name: 'settings', path: '/settings', label: '设置' },
]

const fallbackRoute = windowRoutes[0]
const routesByName = new Map(windowRoutes.map(route => [route.name, route]))
const routesByPath = new Map(windowRoutes.map(route => [route.path, route]))

export const hasInitialRoute = typeof window !== 'undefined' && !!window.location.hash

function normalizePath(raw: string) {
  const path = raw.replace(/^#/, '').trim()
  if (!path || path === '/') return fallbackRoute.path
  // 兼容旧路径：chat/summary 折叠到 assistant
  if (path === '/chat' || path === '/summary') return '/assistant'
  return path.startsWith('/') ? path : `/${path}`
}

function readRouteFromLocation() {
  if (typeof window === 'undefined') return fallbackRoute
  return routesByPath.get(normalizePath(window.location.hash)) || fallbackRoute
}

const route = ref<WindowRoute>(readRouteFromLocation())

function syncFromLocation() {
  route.value = readRouteFromLocation()
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', syncFromLocation)
  window.addEventListener('popstate', syncFromLocation)
}

export const currentRoute = computed(() => route.value)

export function navigateTo(name: WindowRouteName, options: { replace?: boolean } = {}) {
  const next = routesByName.get(name) || fallbackRoute
  route.value = next

  if (typeof window === 'undefined') return

  const nextHash = `#${next.path}`
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return

  if (options.replace) {
    window.history.replaceState(null, '', nextUrl)
  } else {
    window.history.pushState(null, '', nextUrl)
  }
}
