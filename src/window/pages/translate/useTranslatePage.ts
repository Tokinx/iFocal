import { computed, reactive, ref, watch } from 'vue'
import {
  SUPPORTED_LANGUAGES,
  loadConfig,
} from '@/shared/config'
import {
  DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID,
  normalizeMachineTranslateChannels,
  normalizeMachineTranslateDefaultChannelId,
  type MachineTranslateChannel,
} from '@/shared/machine-translation'
import { modelIdFromSpec, parseModelSpec } from '@/shared/model-utils'

const STORAGE_KEY = 'translatePageState'

export type TranslateCardKind = 'machine' | 'ai'

export interface TranslateCardItem {
  id: string
  kind: TranslateCardKind
  /** machine: MachineTranslateChannel.id；ai: `${channelName}|${modelId}` */
  ref: string
  collapsed: boolean
}

export interface TranslateCardRuntime {
  loading: boolean
  result: string
  error: string
  durationMs: number
  startedAt: number
  lastText: string
}

export interface TranslateLanguageOption {
  value: string
  label: string
}

interface PersistedState {
  cards?: TranslateCardItem[]
  sourceLang?: string
  targetLang?: string
}

type AiChannel = {
  name: string
  type?: string
  models?: string[]
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function localGet<T = any>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (data) => resolve(data as T))
    } catch {
      resolve({} as T)
    }
  })
}

function localSet(payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(payload, () => resolve())
    } catch {
      resolve()
    }
  })
}

function syncGet<T = any>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(keys, (data) => resolve(data as T))
    } catch {
      resolve({} as T)
    }
  })
}

export function useTranslatePage() {
  const sourceLang = ref<string>('auto')
  const targetLang = ref<string>('zh-CN')
  const sourceText = ref<string>('')

  const cards = ref<TranslateCardItem[]>([])
  const runtime = reactive<Record<string, TranslateCardRuntime>>({})

  const aiChannels = ref<AiChannel[]>([])
  const machineChannels = ref<MachineTranslateChannel[]>([])
  const mtDefaultChannelId = ref<string>(DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID)
  const defaultAiPairKey = ref<string>('')

  const initializing = ref(true)
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const sourceLangOptions = computed<TranslateLanguageOption[]>(() => {
    return [{ value: 'auto', label: '自动检测' }, ...SUPPORTED_LANGUAGES]
  })

  const targetLangOptions = computed<TranslateLanguageOption[]>(() => SUPPORTED_LANGUAGES)

  const aiPairOptions = computed(() => {
    const out: { key: string; channel: string; modelId: string; modelLabel: string }[] = []
    for (const ch of aiChannels.value) {
      const channelName = String(ch.name || '').trim()
      if (!channelName) continue
      for (const m of ch.models || []) {
        const { modelId, displayName } = parseModelSpec(m)
        if (!modelId) continue
        out.push({
          key: `${channelName}|${modelId}`,
          channel: channelName,
          modelId,
          modelLabel: displayName || modelId,
        })
      }
    }
    return out
  })

  const groupedAiModels = computed(() => {
    const groups: Record<string, { key: string; channel: string; model: string }[]> = {}
    for (const item of aiPairOptions.value) {
      const group = groups[item.channel] || (groups[item.channel] = [])
      group.push({ key: item.key, channel: item.channel, model: item.modelLabel })
    }
    return groups
  })

  const cardTitleMap = computed(() => {
    const map: Record<string, string> = {}
    for (const card of cards.value) {
      map[card.id] = resolveCardTitle(card)
    }
    return map
  })

  const cardSubtitleMap = computed(() => {
    const map: Record<string, string> = {}
    for (const card of cards.value) {
      map[card.id] = resolveCardSubtitle(card)
    }
    return map
  })

  function resolveCardTitle(card: TranslateCardItem): string {
    if (card.kind === 'machine') {
      const channel = machineChannels.value.find((c) => c.id === card.ref)
      return channel ? `${channel.name}` : '未配置'
    }
    const pair = aiPairOptions.value.find((p) => p.key === card.ref)
    if (pair) return pair.modelLabel
    return '未配置'
  }

  function resolveCardSubtitle(card: TranslateCardItem): string {
    if (card.kind === 'ai') {
      const pair = aiPairOptions.value.find((p) => p.key === card.ref)
      return pair ? pair.channel : ''
    }
    return ''
  }

  function ensureRuntime(id: string): TranslateCardRuntime {
    if (!runtime[id]) {
      runtime[id] = { loading: false, result: '', error: '', durationMs: 0, startedAt: 0, lastText: '' }
    }
    return runtime[id]
  }

  function cardForRef(kind: TranslateCardKind, ref: string): TranslateCardItem | null {
    return cards.value.find((c) => c.kind === kind && c.ref === ref) || null
  }

  function buildDefaultCards(): TranslateCardItem[] {
    const list: TranslateCardItem[] = []
    if (mtDefaultChannelId.value) {
      list.push({ id: randomId(), kind: 'machine', ref: mtDefaultChannelId.value, collapsed: false })
    } else if (machineChannels.value[0]) {
      list.push({ id: randomId(), kind: 'machine', ref: machineChannels.value[0].id, collapsed: false })
    }
    if (defaultAiPairKey.value) {
      list.push({ id: randomId(), kind: 'ai', ref: defaultAiPairKey.value, collapsed: false })
    } else if (aiPairOptions.value[0]) {
      list.push({ id: randomId(), kind: 'ai', ref: aiPairOptions.value[0].key, collapsed: false })
    }
    return list
  }

  function pruneCards(list: TranslateCardItem[]): TranslateCardItem[] {
    return list.filter((card) => {
      if (card.kind === 'machine') {
        return machineChannels.value.some((c) => c.id === card.ref)
      }
      return aiPairOptions.value.some((p) => p.key === card.ref)
    })
  }

  async function loadAll() {
    initializing.value = true
    try {
      const [globalConfig, syncData, localData] = await Promise.all([
        loadConfig(),
        syncGet<{ channels?: AiChannel[]; defaultModel?: any; activeModel?: any }>(['channels', 'defaultModel', 'activeModel']),
        localGet<{ [k: string]: any }>([STORAGE_KEY]),
      ])

      aiChannels.value = Array.isArray(syncData.channels) ? syncData.channels : []

      const mt = normalizeMachineTranslateChannels(globalConfig.mtChannels)
      machineChannels.value = mt
      mtDefaultChannelId.value = normalizeMachineTranslateDefaultChannelId(globalConfig.mtDefaultChannelId, mt)

      const prefer = syncData.activeModel || syncData.defaultModel
      if (prefer && prefer.channel && prefer.model) {
        const modelId = modelIdFromSpec(prefer.model)
        if (modelId) defaultAiPairKey.value = `${String(prefer.channel)}|${modelId}`
      }
      if (!defaultAiPairKey.value && aiPairOptions.value[0]) {
        defaultAiPairKey.value = aiPairOptions.value[0].key
      }

      const persisted = (localData?.[STORAGE_KEY] || {}) as PersistedState
      const persistedCards = Array.isArray(persisted.cards) ? persisted.cards.map(normalizeCard).filter(Boolean) as TranslateCardItem[] : []
      const filtered = pruneCards(persistedCards)
      cards.value = filtered.length ? filtered : buildDefaultCards()

      if (typeof persisted.sourceLang === 'string' && persisted.sourceLang) sourceLang.value = persisted.sourceLang
      if (typeof persisted.targetLang === 'string' && persisted.targetLang) targetLang.value = persisted.targetLang
    } finally {
      initializing.value = false
    }
  }

  function normalizeCard(raw: any): TranslateCardItem | null {
    if (!raw || typeof raw !== 'object') return null
    const kind = raw.kind === 'ai' ? 'ai' : raw.kind === 'machine' ? 'machine' : null
    if (!kind) return null
    const refStr = String(raw.ref || '').trim()
    if (!refStr) return null
    return {
      id: String(raw.id || randomId()),
      kind,
      ref: refStr,
      collapsed: !!raw.collapsed,
    }
  }

  function schedulePersist() {
    if (initializing.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      const payload: PersistedState = {
        cards: cards.value.map((c) => ({ id: c.id, kind: c.kind, ref: c.ref, collapsed: c.collapsed })),
        sourceLang: sourceLang.value,
        targetLang: targetLang.value,
      }
      void localSet({ [STORAGE_KEY]: payload })
    }, 300)
  }

  watch(cards, schedulePersist, { deep: true })
  watch([sourceLang, targetLang], schedulePersist)

  function addCard(kind: TranslateCardKind, ref: string) {
    const trimmed = ref.trim()
    if (!trimmed) return
    if (cardForRef(kind, trimmed)) return
    cards.value.push({ id: randomId(), kind, ref: trimmed, collapsed: false })
  }

  function removeCard(id: string) {
    cards.value = cards.value.filter((c) => c.id !== id)
    delete runtime[id]
  }

  function toggleCardCollapsed(id: string) {
    const card = cards.value.find((c) => c.id === id)
    if (!card) return
    card.collapsed = !card.collapsed
    if (!card.collapsed) {
      const rt = ensureRuntime(card.id)
      const text = sourceText.value.trim()
      const hasFreshResult = !!rt.result && rt.lastText === text && text.length > 0
      if (!hasFreshResult) {
        void runCard(card)
      }
    }
  }

  function reorderCards(next: TranslateCardItem[]) {
    cards.value = [...next]
  }

  async function runCard(card: TranslateCardItem) {
    const rt = ensureRuntime(card.id)
    const text = sourceText.value.trim()
    if (!text) {
      rt.result = ''
      rt.error = ''
      rt.loading = false
      rt.lastText = ''
      return
    }
    if (card.collapsed) return

    rt.loading = true
    rt.error = ''
    rt.startedAt = Date.now()

    try {
      if (card.kind === 'machine') {
        await runMachineCard(card, rt, text)
      } else {
        await runAiCard(card, rt, text)
      }
      if (!rt.error) rt.lastText = text
    } catch (e: any) {
      rt.error = String(e?.message || e || '调用失败')
    } finally {
      rt.loading = false
      rt.durationMs = Date.now() - rt.startedAt
    }
  }

  function runMachineCard(card: TranslateCardItem, rt: TranslateCardRuntime, text: string) {
    return new Promise<void>((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            action: 'machineTranslateBatch',
            channelId: card.ref,
            texts: [text],
            sourceLang: sourceLang.value === 'auto' ? '' : sourceLang.value,
            targetLang: targetLang.value,
            format: 'plain',
          },
          (resp: any) => {
            try { void chrome.runtime.lastError } catch { }
            if (!resp) {
              rt.error = '无响应，请确认扩展可用'
              resolve()
              return
            }
            if (resp.ok) {
              const arr = Array.isArray(resp.translations) ? resp.translations : Array.isArray(resp.results) ? resp.results : []
              const first = arr[0]
              rt.result = typeof first === 'string' ? first : String(first?.text || first?.translation || '')
              rt.error = ''
            } else {
              rt.result = ''
              rt.error = String(resp.error || '翻译失败')
            }
            resolve()
          }
        )
      } catch (e: any) {
        rt.error = String(e?.message || e || '调用失败')
        resolve()
      }
    })
  }

  function runAiCard(card: TranslateCardItem, rt: TranslateCardRuntime, text: string) {
    return new Promise<void>((resolve) => {
      const [channel, modelId] = card.ref.split('|')
      try {
        chrome.runtime.sendMessage(
          {
            action: 'performAiAction',
            task: 'translate',
            text,
            targetLang: targetLang.value,
            prevLang: sourceLang.value === 'auto' ? 'en' : sourceLang.value,
            channel,
            model: modelId,
            requestId: `translate-${card.id}-${Date.now()}`,
          },
          (resp: any) => {
            try { void chrome.runtime.lastError } catch { }
            if (!resp) {
              rt.error = '无响应，请确认扩展可用'
              resolve()
              return
            }
            if (resp.ok) {
              rt.result = String(resp.result || '')
              rt.error = ''
            } else {
              rt.result = ''
              rt.error = String(resp.error || '翻译失败')
            }
            resolve()
          }
        )
      } catch (e: any) {
        rt.error = String(e?.message || e || '调用失败')
        resolve()
      }
    })
  }

  function translateAll() {
    for (const card of cards.value) {
      if (!card.collapsed) void runCard(card)
    }
  }

  function refreshCard(id: string) {
    const card = cards.value.find((c) => c.id === id)
    if (card) void runCard(card)
  }

  function swapLanguages() {
    if (sourceLang.value === 'auto') return
    const next = sourceLang.value
    sourceLang.value = targetLang.value
    targetLang.value = next
  }

  return {
    sourceLang,
    targetLang,
    sourceText,
    cards,
    runtime,
    machineChannels,
    aiPairOptions,
    groupedAiModels,
    sourceLangOptions,
    targetLangOptions,
    cardTitleMap,
    cardSubtitleMap,
    initializing,
    defaultAiPairKey,
    mtDefaultChannelId,
    ensureRuntime,
    loadAll,
    addCard,
    removeCard,
    toggleCardCollapsed,
    reorderCards,
    refreshCard,
    translateAll,
    swapLanguages,
  }
}

export type TranslatePageStore = ReturnType<typeof useTranslatePage>
