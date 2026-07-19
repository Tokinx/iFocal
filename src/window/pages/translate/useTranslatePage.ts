import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
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
import { modelIdFromSpec } from '@/shared/model-utils'
import { LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY, buildModelCatalogPairs } from '@/shared/model-catalog'
import { probeLocalGeminiNanoVisible } from '@/window/composables/useModelCatalog'

const STORAGE_KEY = 'translatePageState'
export const TRANSLATE_HISTORY_STORAGE_KEY = 'translateHistoryRecords'
export const TRANSLATE_HISTORY_UPDATED_EVENT = 'ifocal:translate-history-updated'
export const TRANSLATE_HISTORY_RESTORE_EVENT = 'ifocal:translate-history-restore'
const HISTORY_STORAGE_KEY = TRANSLATE_HISTORY_STORAGE_KEY

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

export interface TranslateHistoryCardSnapshot {
  cardId: string
  kind: TranslateCardKind
  ref: string
  title: string
  subtitle: string
  result: string
  error: string
  durationMs: number
}

export interface TranslateHistoryRecord {
  id: string
  createdAt: number
  sourceText: string
  sourceLang: string
  targetLang: string
  cards: TranslateCardItem[]
  results: Record<string, TranslateHistoryCardSnapshot>
}

export interface TranslateLanguageOption {
  value: string
  label: string
}

interface PersistedState {
  cards?: TranslateCardItem[]
  sourceLang?: string
  targetLang?: string
  watchClipboard?: boolean
  autoTranslate?: boolean
}

type AiChannel = {
  name: string
  type?: string
  models?: string[]
}

type TranslateHistoryRun = {
  runId: string
  recordId: string
  startedAt: number
  sourceText: string
  sourceLang: string
  targetLang: string
  cards: TranslateCardItem[]
  limit: number
}

type HistoryPreviewSnapshot = {
  cards: TranslateCardItem[]
  sourceLang: string
  targetLang: string
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

function readHistoryFromLocalStorage(): unknown {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function writeHistoryToLocalStorage(records: TranslateHistoryRecord[]) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records))
    window.dispatchEvent(new CustomEvent(TRANSLATE_HISTORY_UPDATED_EVENT, { detail: records }))
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
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

type LangGroup = 'zh' | 'ja' | 'ko' | 'latin' | ''

function detectLangGroup(text: string): LangGroup {
  const sample = text.slice(0, 400)
  if (!sample) return ''
  const hiragana = (sample.match(/[぀-ゟ]/g) || []).length
  const katakana = (sample.match(/[゠-ヿ]/g) || []).length
  if (hiragana + katakana > 0) return 'ja'
  const hangul = (sample.match(/[가-힯]/g) || []).length
  if (hangul > 0) return 'ko'
  const cjk = (sample.match(/[一-鿿]/g) || []).length
  if (cjk > 0) return 'zh'
  const latin = (sample.match(/[A-Za-z]/g) || []).length
  if (latin > 0) return 'latin'
  return ''
}

function langGroupOf(code: string): LangGroup {
  const c = String(code || '').toLowerCase()
  if (!c || c === 'auto') return ''
  if (c.startsWith('zh')) return 'zh'
  if (c === 'ja') return 'ja'
  if (c === 'ko') return 'ko'
  if (['en', 'fr', 'es', 'de'].includes(c)) return 'latin'
  return ''
}

function decideDirection(
  text: string,
  srcLang: string,
  tgtLang: string,
): { src: string; tgt: string } {
  const detected = detectLangGroup(text)
  if (!detected) return { src: srcLang, tgt: tgtLang }
  const tgtGroup = langGroupOf(tgtLang)

  if (srcLang === 'auto') {
    if (tgtGroup && detected === tgtGroup) {
      const fallback = tgtLang === 'en' ? 'zh-CN' : 'en'
      return { src: tgtLang, tgt: fallback }
    }
    return { src: srcLang, tgt: tgtLang }
  }

  const srcGroup = langGroupOf(srcLang)
  if (tgtGroup && detected === tgtGroup && detected !== srcGroup) {
    return { src: tgtLang, tgt: srcLang }
  }
  return { src: srcLang, tgt: tgtLang }
}

export function useTranslatePage() {
  const sourceLang = ref<string>('auto')
  const targetLang = ref<string>('zh-CN')
  const sourceText = ref<string>('')

  const cards = ref<TranslateCardItem[]>([])
  const runtime = reactive<Record<string, TranslateCardRuntime>>({})
  const historyRecords = ref<TranslateHistoryRecord[]>([])
  const activeHistoryId = ref<string>('')
  const historyPreviewSnapshot = ref<HistoryPreviewSnapshot | null>(null)
  const titleOverrides = reactive<Record<string, string>>({})
  const subtitleOverrides = reactive<Record<string, string>>({})

  const aiChannels = ref<AiChannel[]>([])
  const machineChannels = ref<MachineTranslateChannel[]>([])
  const mtDefaultChannelId = ref<string>(DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID)
  const defaultAiPairKey = ref<string>('')
  const localGeminiNanoVisible = ref<boolean>(false)
  const localGeminiNanoEnabled = ref<boolean>(true)

  const watchClipboard = ref<boolean>(false)
  const autoTranslate = ref<boolean>(false)

  const initializing = ref(true)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let autoTranslateTimer: ReturnType<typeof setTimeout> | null = null
  let suppressAutoTranslateUntil = 0
  let lastClipboardText = ''
  let activeTranslateRunId = ''
  let restoringHistoryPreview = false

  const sourceLangOptions = computed<TranslateLanguageOption[]>(() => {
    return [{ value: 'auto', label: '自动检测' }, ...SUPPORTED_LANGUAGES]
  })

  const targetLangOptions = computed<TranslateLanguageOption[]>(() => SUPPORTED_LANGUAGES)

  const aiPairOptions = computed(() => {
    return buildModelCatalogPairs(aiChannels.value, {
      includeLocalGeminiNano: localGeminiNanoVisible.value && localGeminiNanoEnabled.value,
    }).map((pair) => ({
      key: pair.key,
      channel: pair.channel,
      modelId: pair.modelId,
      modelLabel: pair.model,
    }))
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
      map[card.id] = titleOverrides[card.id] || resolveCardTitle(card)
    }
    return map
  })

  const cardSubtitleMap = computed(() => {
    const map: Record<string, string> = {}
    for (const card of cards.value) {
      map[card.id] = subtitleOverrides[card.id] || resolveCardSubtitle(card)
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

  function cloneCards(list: TranslateCardItem[]): TranslateCardItem[] {
    return list.map((card) => ({ ...card }))
  }

  function clearRuntime() {
    for (const key of Object.keys(runtime)) delete runtime[key]
  }

  function exitHistoryPreview(options: { restoreLanguages?: boolean } = {}): boolean {
    const snapshot = historyPreviewSnapshot.value
    if (!snapshot) return false
    historyPreviewSnapshot.value = null
    activeTranslateRunId = ''
    activeHistoryId.value = ''
    clearHistoryTitleOverrides()
    if (options.restoreLanguages !== false) {
      sourceLang.value = snapshot.sourceLang || 'auto'
      targetLang.value = snapshot.targetLang || 'zh-CN'
    }
    cards.value = cloneCards(snapshot.cards)
    clearRuntime()
    return true
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
      const [globalConfig, syncData, localData, localVisible] = await Promise.all([
        loadConfig(),
        syncGet<{ channels?: AiChannel[]; defaultModel?: any; activeModel?: any; localGeminiNanoEnabled?: boolean }>(['channels', 'defaultModel', 'activeModel', LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]),
        localGet<{ [k: string]: any }>([STORAGE_KEY, HISTORY_STORAGE_KEY]),
        probeLocalGeminiNanoVisible(),
      ])

      aiChannels.value = Array.isArray(syncData.channels) ? syncData.channels : []
      localGeminiNanoVisible.value = !!localVisible
      localGeminiNanoEnabled.value = syncData.localGeminiNanoEnabled !== false

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
      if (typeof persisted.watchClipboard === 'boolean') watchClipboard.value = persisted.watchClipboard
      if (typeof persisted.autoTranslate === 'boolean') autoTranslate.value = persisted.autoTranslate
      const localStorageHistory = readHistoryFromLocalStorage()
      historyRecords.value = normalizeHistoryRecords(localStorageHistory ?? localData?.[HISTORY_STORAGE_KEY])
      if (localStorageHistory === undefined && historyRecords.value.length) {
        writeHistoryToLocalStorage(historyRecords.value)
      }
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

  function normalizeHistoryRecords(raw: any): TranslateHistoryRecord[] {
    const list = Array.isArray(raw) ? raw : []
    return list.map((item) => normalizeHistoryRecord(item)).filter((item): item is TranslateHistoryRecord => !!item)
  }

  function normalizeHistoryRecord(raw: any): TranslateHistoryRecord | null {
    if (!raw || typeof raw !== 'object') return null
    const source = String(raw.sourceText || '').trim()
    if (!source) return null
    const cardList = (Array.isArray(raw.cards) ? raw.cards : [])
      .map(normalizeCard)
      .filter((item): item is TranslateCardItem => !!item)
    const rawResults = raw.results && typeof raw.results === 'object' ? raw.results as Record<string, any> : {}
    const results: Record<string, TranslateHistoryCardSnapshot> = {}
    for (const [key, value] of Object.entries(rawResults)) {
      if (!value || typeof value !== 'object') continue
      const cardId = String((value as any).cardId || key || '').trim()
      const kind = (value as any).kind === 'ai' ? 'ai' : (value as any).kind === 'machine' ? 'machine' : null
      const ref = String((value as any).ref || '').trim()
      if (!cardId || !kind || !ref) continue
      results[cardId] = {
        cardId,
        kind,
        ref,
        title: String((value as any).title || ''),
        subtitle: String((value as any).subtitle || ''),
        result: String((value as any).result || ''),
        error: String((value as any).error || ''),
        durationMs: Math.max(0, Number((value as any).durationMs) || 0),
      }
    }
    return {
      id: String(raw.id || randomId()),
      createdAt: Number(raw.createdAt) || Date.now(),
      sourceText: source,
      sourceLang: String(raw.sourceLang || 'auto'),
      targetLang: String(raw.targetLang || 'zh-CN'),
      cards: cardList,
      results,
    }
  }

  function schedulePersist() {
    if (initializing.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      const persistedCards = historyPreviewSnapshot.value?.cards || cards.value
      const payload: PersistedState = {
        cards: persistedCards.map((c) => ({ id: c.id, kind: c.kind, ref: c.ref, collapsed: c.collapsed })),
        sourceLang: historyPreviewSnapshot.value?.sourceLang || sourceLang.value,
        targetLang: historyPreviewSnapshot.value?.targetLang || targetLang.value,
        watchClipboard: watchClipboard.value,
        autoTranslate: autoTranslate.value,
      }
      void localSet({ [STORAGE_KEY]: payload })
    }, 300)
  }

  watch(cards, schedulePersist, { deep: true })
  watch([sourceLang, targetLang], schedulePersist)
  watch([watchClipboard, autoTranslate], schedulePersist)

  function addCard(kind: TranslateCardKind, ref: string) {
    exitHistoryPreview()
    const trimmed = ref.trim()
    if (!trimmed) return
    if (cardForRef(kind, trimmed)) return
    const newCard: TranslateCardItem = { id: randomId(), kind, ref: trimmed, collapsed: false }
    cards.value.push(newCard)

    const text = sourceText.value.trim()
    if (!text) return
    const hasOtherResult = cards.value.some((c) => {
      if (c.id === newCard.id) return false
      const rt = runtime[c.id]
      return !!(rt && (rt.result || rt.error || rt.loading))
    })
    if (hasOtherResult) {
      void runCard(newCard)
    }
  }

  function removeCard(id: string) {
    if (exitHistoryPreview()) return
    cards.value = cards.value.filter((c) => c.id !== id)
    delete runtime[id]
  }

  function toggleCardCollapsed(id: string) {
    if (exitHistoryPreview()) return
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
    if (exitHistoryPreview()) return
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

    const { src: effSrc, tgt: effTgt } = decideDirection(text, sourceLang.value, targetLang.value)

    try {
      if (card.kind === 'machine') {
        await runMachineCard(card, rt, text, effSrc, effTgt)
      } else {
        await runAiCard(card, rt, text, effSrc, effTgt)
      }
      if (!rt.error) rt.lastText = text
    } catch (e: any) {
      rt.error = String(e?.message || e || '调用失败')
    } finally {
      rt.loading = false
      rt.durationMs = Date.now() - rt.startedAt
    }
  }

  function runMachineCard(
    card: TranslateCardItem,
    rt: TranslateCardRuntime,
    text: string,
    effSrc: string,
    effTgt: string,
  ) {
    return new Promise<void>((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            action: 'machineTranslateBatch',
            channelId: card.ref,
            texts: [text],
            sourceLang: effSrc === 'auto' ? '' : effSrc,
            targetLang: effTgt,
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

  function runAiCard(
    card: TranslateCardItem,
    rt: TranslateCardRuntime,
    text: string,
    effSrc: string,
    effTgt: string,
  ) {
    return new Promise<void>((resolve) => {
      const [channel, modelId] = card.ref.split('|')
      try {
        chrome.runtime.sendMessage(
          {
            action: 'performAiAction',
            task: 'translate',
            text,
            targetLang: effTgt,
            prevLang: effSrc === 'auto' ? 'en' : effSrc,
            channel,
            model: modelId,
            requestId: `translate-${card.id}-${Date.now()}`,
            enableReasoning: false,
            enabledMcpServers: [],
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

  function clearHistoryTitleOverrides() {
    for (const key of Object.keys(titleOverrides)) delete titleOverrides[key]
    for (const key of Object.keys(subtitleOverrides)) delete subtitleOverrides[key]
  }

  async function translateAll() {
    exitHistoryPreview()
    activeHistoryId.value = ''
    clearHistoryTitleOverrides()
    const activeCards = cards.value.filter((card) => !card.collapsed)
    const text = sourceText.value.trim()
    if (!text || !activeCards.length) return
    const config = await loadConfig()
    const run: TranslateHistoryRun = {
      runId: randomId(),
      recordId: '',
      startedAt: Date.now(),
      sourceText: text,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      cards: cards.value.map((card) => ({ ...card })),
      limit: normalizeHistoryLimit((config as any).maxSessionsCount),
    }
    activeTranslateRunId = run.runId
    for (const card of activeCards) {
      void runCard(card).then(() => saveHistoryRunSnapshot(run))
    }
  }

  function normalizeHistoryLimit(value: unknown): number {
    const n = Math.trunc(Number(value))
    return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 10
  }

  function buildHistoryResults(run: TranslateHistoryRun): Record<string, TranslateHistoryCardSnapshot> {
    const results: Record<string, TranslateHistoryCardSnapshot> = {}
    for (const card of run.cards) {
      const rt = runtime[card.id]
      if (!rt || rt.loading) continue
      if (rt.startedAt < run.startedAt) continue
      results[card.id] = {
        cardId: card.id,
        kind: card.kind,
        ref: card.ref,
        title: cardTitleMap.value[card.id] || resolveCardTitle(card),
        subtitle: cardSubtitleMap.value[card.id] || resolveCardSubtitle(card),
        result: String(rt.result || ''),
        error: String(rt.error || ''),
        durationMs: Math.max(0, Number(rt.durationMs) || 0),
      }
    }
    return results
  }

  function hasPersistableHistoryResult(results: Record<string, TranslateHistoryCardSnapshot>): boolean {
    return Object.values(results).some((item) => String(item.result || item.error || '').trim())
  }

  function saveHistoryRunSnapshot(run: TranslateHistoryRun) {
    if (activeTranslateRunId !== run.runId) return
    const results = buildHistoryResults(run)
    if (!hasPersistableHistoryResult(results)) return

    const existingIndex = run.recordId
      ? historyRecords.value.findIndex((item) => item.id === run.recordId)
      : -1

    const record: TranslateHistoryRecord = {
      id: run.recordId || randomId(),
      createdAt: existingIndex >= 0 ? historyRecords.value[existingIndex]!.createdAt : Date.now(),
      sourceText: run.sourceText,
      sourceLang: run.sourceLang,
      targetLang: run.targetLang,
      cards: run.cards.map((card) => ({ ...card })),
      results,
    }
    run.recordId = record.id
    if (existingIndex >= 0) {
      const next = historyRecords.value.slice()
      next[existingIndex] = record
      historyRecords.value = next.slice(0, run.limit)
    } else {
      historyRecords.value = [record, ...historyRecords.value].slice(0, run.limit)
    }
    activeHistoryId.value = record.id
    writeHistoryToLocalStorage(historyRecords.value)
  }

  function restoreHistory(recordId: string) {
    const record = historyRecords.value.find((item) => item.id === recordId)
    if (!record) return
    if (autoTranslateTimer) {
      clearTimeout(autoTranslateTimer)
      autoTranslateTimer = null
    }
    suppressAutoTranslateUntil = Date.now() + 1000
    activeTranslateRunId = ''
    if (!historyPreviewSnapshot.value) {
      historyPreviewSnapshot.value = {
        cards: cloneCards(cards.value),
        sourceLang: sourceLang.value,
        targetLang: targetLang.value,
      }
    }
    restoringHistoryPreview = true
    try {
      activeHistoryId.value = record.id
      sourceText.value = record.sourceText
      sourceLang.value = record.sourceLang || 'auto'
      targetLang.value = record.targetLang || 'zh-CN'
      cards.value = cloneCards(record.cards)
      clearHistoryTitleOverrides()
      clearRuntime()
      for (const card of cards.value) {
        const snapshot = record.results[card.id]
        const rt = ensureRuntime(card.id)
        rt.loading = false
        rt.result = snapshot?.result || ''
        rt.error = snapshot?.error || ''
        rt.durationMs = snapshot?.durationMs || 0
        rt.startedAt = 0
        rt.lastText = record.sourceText
        if (snapshot?.title) titleOverrides[card.id] = snapshot.title
        if (snapshot?.subtitle) subtitleOverrides[card.id] = snapshot.subtitle
      }
    } finally {
      void Promise.resolve().then(() => {
        restoringHistoryPreview = false
      })
    }
  }

  async function refreshChannelCatalog() {
    const [globalConfig, syncData, localVisible] = await Promise.all([
      loadConfig(),
      syncGet<{ channels?: AiChannel[]; defaultModel?: any; activeModel?: any; localGeminiNanoEnabled?: boolean }>(['channels', 'defaultModel', 'activeModel', LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]),
      probeLocalGeminiNanoVisible(),
    ])
    aiChannels.value = Array.isArray(syncData.channels) ? syncData.channels : []
    localGeminiNanoVisible.value = !!localVisible
    localGeminiNanoEnabled.value = syncData.localGeminiNanoEnabled !== false

    const mt = normalizeMachineTranslateChannels(globalConfig.mtChannels)
    machineChannels.value = mt
    mtDefaultChannelId.value = normalizeMachineTranslateDefaultChannelId(globalConfig.mtDefaultChannelId, mt)

    defaultAiPairKey.value = ''
    const prefer = syncData.activeModel || syncData.defaultModel
    if (prefer && prefer.channel && prefer.model) {
      const modelId = modelIdFromSpec(prefer.model)
      if (modelId) defaultAiPairKey.value = `${String(prefer.channel)}|${modelId}`
    }
    if (!defaultAiPairKey.value && aiPairOptions.value[0]) {
      defaultAiPairKey.value = aiPairOptions.value[0].key
    }

    const nextCards = pruneCards(cards.value)
    cards.value = nextCards.length || !cards.value.length ? nextCards : buildDefaultCards()
  }

  function refreshCard(id: string) {
    if (exitHistoryPreview()) return
    const card = cards.value.find((c) => c.id === id)
    if (card) void runCard(card)
  }

  function swapLanguages() {
    exitHistoryPreview()
    if (sourceLang.value === 'auto') return
    const next = sourceLang.value
    sourceLang.value = targetLang.value
    targetLang.value = next
  }

  async function readClipboardIntoSource() {
    if (!watchClipboard.value) return
    if (typeof document !== 'undefined' && !document.hasFocus()) return
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      if (text === lastClipboardText) return
      lastClipboardText = text
      if (text === sourceText.value) return
      sourceText.value = text
    } catch {
      // 用户未授权 / 不在焦点 / 浏览器不支持，忽略
    }
  }

  function onWindowFocus() {
    void readClipboardIntoSource()
  }

  watch(
    watchClipboard,
    (enabled) => {
      if (typeof window === 'undefined') return
      window.removeEventListener('focus', onWindowFocus)
      if (enabled) {
        window.addEventListener('focus', onWindowFocus)
        // 开启时立即读一次当前剪贴板
        void readClipboardIntoSource()
      } else {
        lastClipboardText = ''
      }
    },
    { immediate: true },
  )

  watch(sourceText, () => {
    if (initializing.value) return
    if (restoringHistoryPreview) return
    exitHistoryPreview()
  })

  watch([sourceLang, targetLang], () => {
    if (initializing.value) return
    if (restoringHistoryPreview) return
    exitHistoryPreview({ restoreLanguages: false })
  })

  watch([sourceText, sourceLang, targetLang], () => {
    if (initializing.value) return
    if (Date.now() < suppressAutoTranslateUntil) return
    if (!autoTranslate.value) return
    if (autoTranslateTimer) clearTimeout(autoTranslateTimer)
    autoTranslateTimer = setTimeout(() => {
      autoTranslateTimer = null
      if (!autoTranslate.value) return
      if (!sourceText.value.trim()) return
      translateAll()
    }, 600)
  })

  onScopeDispose(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onWindowFocus)
    }
    if (autoTranslateTimer) {
      clearTimeout(autoTranslateTimer)
      autoTranslateTimer = null
    }
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    try { chrome.storage.onChanged.removeListener(onStorageChanged) } catch { /* ignore */ }
  })

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
    if (area !== 'sync') return
    if (
      changes.channels
      || changes.mtChannels
      || changes.mtDefaultChannelId
      || changes.defaultModel
      || changes.activeModel
      || changes[LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY]
    ) {
      void refreshChannelCatalog()
    }
  }

  try { chrome.storage.onChanged.addListener(onStorageChanged) } catch { /* ignore */ }

  return {
    sourceLang,
    targetLang,
    sourceText,
    cards,
    runtime,
    historyRecords,
    activeHistoryId,
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
    watchClipboard,
    autoTranslate,
    ensureRuntime,
    loadAll,
    addCard,
    removeCard,
    toggleCardCollapsed,
    reorderCards,
    refreshCard,
    translateAll,
    restoreHistory,
    swapLanguages,
  }
}

export type TranslatePageStore = ReturnType<typeof useTranslatePage>
