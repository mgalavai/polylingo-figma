"use client"

import { useState } from "react"
import { useRef } from "react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Upload, Search, Filter, Link, Unlink, Plus, MoreHorizontal, AlertCircle, Loader2, FileText, ChevronLeft, ChevronRight, Type as TypeIcon } from 'lucide-react'

type PluginState = 'start' | 'empty' | 'loading' | 'error' | 'success'
type StringStatus = 'translated' | 'missing' | 'edited' | 'unused'

type FrameSummary = {
  frameId: string
  totalText: number
  bound: number
  unbound: number
  updatedAt: number
}

type TranslationBundle = {
  baseLang: string
  translations: Record<string, Record<string, string>>
}

interface StringEntry {
  key: string
  base: string
  translated: string
  status: StringStatus
  bound: boolean
}

export default function Component() {
  const [currentState, setCurrentState] = useState<PluginState>('start')
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([])
  const [baseLanguage, setBaseLanguage] = useState('en')
  const [translationBundle, setTranslationBundle] = useState<TranslationBundle | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateLocaleCount, setTemplateLocaleCount] = useState(2)
  const [templateLocales, setTemplateLocales] = useState<string[]>(['en', 'sv'])
  const [templateKey, setTemplateKey] = useState('app_name')
  const [templateEnglishValue, setTemplateEnglishValue] = useState('')
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  type FilterMode = 'all' | 'bound' | 'unbound' | 'missing' | 'quality'
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [activeTab, setActiveTab] = useState('table-view') // Changed default tab
  // Binding flow state
  const [pendingBindKey, setPendingBindKey] = useState<string | null>(null)
  const [pendingUnbindKey, setPendingUnbindKey] = useState<string | null>(null)
  const [currentSelectionKey, setCurrentSelectionKey] = useState<string | null>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)

  // Frame summary + selection state
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [lastActiveFrameId, setLastActiveFrameId] = useState<string | null>(null) // Remember last frame context
  const [summaryByFrame, setSummaryByFrame] = useState<Record<string, FrameSummary>>({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  // No canvas highlight overlays
  const [boundKeysByFrame, setBoundKeysByFrame] = useState<Record<string, string[]>>({})
  const [boundKeyCountsByFrame, setBoundKeyCountsByFrame] = useState<Record<string, Record<string, number>>>({})
  // Keep track of which string is actively edited in Card view to avoid dropping it under filters like "missing"
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const lastActiveFrameIdRef = useRef<string | null>(null)
  const summaryByFrameRef = useRef<Record<string, FrameSummary>>({})
  const pendingBindKeyRef = useRef<string | null>(null)
  const pendingUnbindKeyRef = useRef<string | null>(null)

  const [strings, setStrings] = useState<StringEntry[]>([])

  function buildStringEntries(bundle: TranslationBundle, lang: string): StringEntry[] {
    const baseMap = bundle.translations[bundle.baseLang] || {}
    const langMap = bundle.translations[lang] || {}
    const keys = new Set([...Object.keys(baseMap), ...Object.keys(langMap)])
    return Array.from(keys).sort().map((key) => {
      const base = baseMap[key] || ''
      const translated = langMap[key] || ''
      return { key, base, translated, status: translated ? 'translated' : 'missing', bound: false }
    })
  }

  function loadTranslationBundle(bundle: TranslationBundle, nextLang?: string, status?: string) {
    const langs = Object.keys(bundle.translations)
    const lang = nextLang && langs.includes(nextLang)
      ? nextLang
      : (langs.includes(selectedLanguage) ? selectedLanguage : (langs.find(item => item !== bundle.baseLang) || bundle.baseLang))
    setTranslationBundle(bundle)
    setAvailableLanguages(langs)
    setBaseLanguage(bundle.baseLang)
    setSelectedLanguage(lang)
    setStrings(buildStringEntries(bundle, lang))
    if (status) setImportStatus(status)
    setCurrentState('success')
  }

  // When language changes, swap translations and immediately apply to canvas.
  useEffect(() => {
    if (!translationBundle) return

    const langMap = translationBundle.translations[selectedLanguage]
    const baseMap = translationBundle.translations[translationBundle.baseLang] || {}

    if (!langMap) {
      return
    }

    setStrings(buildStringEntries(translationBundle, selectedLanguage))

    // Immediately apply language to bound layers in the active frame
    try {
      if (selectedFrameId) {
        const payload = { type: 'applyLanguage', frameId: selectedFrameId, lang: selectedLanguage, translations: langMap, base: baseMap }
        post(payload)
      }
    } catch (_) {}
  }, [selectedLanguage, translationBundle, selectedFrameId])

  // Removed preview toggle and related effect

  const getStatusColor = (status: StringStatus) => {
    switch (status) {
      case 'translated': return 'bg-green-100 text-green-800'
      case 'missing': return 'bg-red-100 text-red-800'
      case 'edited': return 'bg-yellow-100 text-yellow-800'
      case 'unused': return 'bg-gray-100 text-gray-800'
    }
  }

  // Flag emoji for language code
  function flagForLanguage(langCode: string | undefined | null): string {
    if (!langCode) return '🏳️'
    const code = String(langCode)
    // Extract region if present (e.g., sv-rSE, is-rIS, lv-rLV)
    let region: string | undefined
    const match = code.match(/-r([A-Za-z]{2})/)
    if (match) region = match[1].toUpperCase()
    // Map common language codes to default regions when region missing
    const lang = code.split('-')[0].toLowerCase()
    const defaultRegion: Record<string, string> = {
      en: 'US', de: 'DE', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', br: 'BR',
      sv: 'SE', nb: 'NO', da: 'DK', fi: 'FI', nl: 'NL', cs: 'CZ', sk: 'SK', sl: 'SI',
      sr: 'RS', ro: 'RO', hu: 'HU', bg: 'BG', el: 'GR', lt: 'LT', lv: 'LV', et: 'EE',
      pl: 'PL', ru: 'RU', uk: 'UA', tr: 'TR', he: 'IL', ar: 'SA', fa: 'IR', id: 'ID',
      ja: 'JP', ko: 'KR', zh: 'CN', is: 'IS'
    }
    const country = (region || defaultRegion[lang] || 'US').toUpperCase()
    // Convert country code to flag emoji
    const A = 127462 // 'A' regional indicator
    const flag = country
      .slice(0, 2)
      .split('')
      .map(c => String.fromCodePoint(A + (c.charCodeAt(0) - 65)))
      .join('')
    return flag
  }

  // Cycle language helper
  function cycleLanguage(direction: 1 | -1) {
    if (!availableLanguages || availableLanguages.length === 0) return
    const idx = availableLanguages.indexOf(selectedLanguage)
    const current = idx >= 0 ? idx : 0
    const next = (current + direction + availableLanguages.length) % availableLanguages.length
    setSelectedLanguage(availableLanguages[next])
  }

  function normalizeLocaleCode(value: string): string {
    const normalized = value.trim().replace('_', '-')
    const match = normalized.match(/^([A-Za-z]{2,3})(?:-r([A-Za-z]{2}))?$/)
    if (!match) return normalized
    return match[2] ? `${match[1].toLowerCase()}-r${match[2].toUpperCase()}` : match[1].toLowerCase()
  }

  function updateTemplateLocaleCount(value: number) {
    const count = Math.min(12, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1))
    const defaults = ['en', 'sv', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ja', 'ko', 'zh']
    setTemplateLocaleCount(count)
    setTemplateLocales(prev => Array.from({ length: count }, (_, index) => {
      if (index === 0) return 'en'
      return prev[index] || defaults[index] || `lang-${index + 1}`
    }))
  }

  function downloadTextFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function createTemplateJson() {
    const key = templateKey.trim()
    const englishValue = templateEnglishValue.trim()
    const locales = templateLocales.slice(0, templateLocaleCount).map(normalizeLocaleCode)
    const uniqueLocales = Array.from(new Set(locales))

    if (!key) {
      setTemplateError('Add a string name.')
      return
    }
    if (!/^[A-Za-z0-9_.]+$/.test(key)) {
      setTemplateError('Use only letters, numbers, underscores, or dots in the string name.')
      return
    }
    if (!englishValue) {
      setTemplateError('Add the English value.')
      return
    }
    if (!uniqueLocales.includes('en')) {
      setTemplateError('English must be included as the base locale.')
      return
    }
    if (uniqueLocales.length !== locales.length || uniqueLocales.some(locale => !/^[a-z]{2,3}(-r[A-Z]{2})?$/.test(locale))) {
      setTemplateError('Use unique locale codes like en, sv, de, or pt-rBR.')
      return
    }

    const translations: Record<string, Record<string, string>> = {}
    for (const locale of uniqueLocales) {
      translations[locale] = { [key]: locale === 'en' ? englishValue : '' }
    }
    const bundle = { baseLang: 'en', translations }

    downloadTextFile('polylingo-template.json', JSON.stringify(bundle, null, 2), 'application/json;charset=utf-8')

    loadTranslationBundle(
      bundle,
      uniqueLocales.find(locale => locale !== 'en') || 'en',
      `Created template with ${uniqueLocales.length} locale${uniqueLocales.length === 1 ? '' : 's'}`
    )
    setTemplateOpen(false)
    setTemplateError(null)
  }

  function normalizeJsonImport(value: unknown): TranslationBundle {
    const root = value as any
    const translations = root?.translations && typeof root.translations === 'object'
      ? root.translations
      : root
    if (!translations || typeof translations !== 'object' || Array.isArray(translations)) {
      throw new Error('JSON must be a language map or include a translations object')
    }
    const normalized: Record<string, Record<string, string>> = {}
    for (const [lang, entries] of Object.entries(translations)) {
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
      normalized[String(lang)] = Object.fromEntries(
        Object.entries(entries as Record<string, unknown>).map(([key, val]) => [key, val == null ? '' : String(val)])
      )
    }
    const langs = Object.keys(normalized)
    if (langs.length === 0) throw new Error('JSON did not contain any string maps')
    const baseLang = typeof root?.baseLang === 'string' && normalized[root.baseLang] ? root.baseLang : (normalized.en ? 'en' : langs[0])
    return { baseLang, translations: normalized }
  }

  async function importTranslationFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    try {
      setImportStatus('Importing...')
      const jsonFiles = list.filter(file => file.name.toLowerCase().endsWith('.json'))

      let bundle: TranslationBundle
      if (jsonFiles.length > 0) {
        const raw = await jsonFiles[0].text()
        bundle = normalizeJsonImport(JSON.parse(raw))
      } else {
        throw new Error('Upload a JSON language map')
      }

      const langs = Object.keys(bundle.translations)
      const nextLang = langs.includes(selectedLanguage) ? selectedLanguage : (langs.find(lang => lang !== bundle.baseLang) || bundle.baseLang)
      loadTranslationBundle(bundle, nextLang, `Imported ${langs.length} language${langs.length === 1 ? '' : 's'}`)
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed')
      setCurrentState('error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FileText className="w-12 h-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No strings imported</h3>
      <p className="text-sm text-gray-500 mb-4">Import a JSON language map or create a starter template.</p>
      <div className="flex gap-2">
        <Button onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />
          Import strings
        </Button>
        <Button variant="outline" onClick={() => setTemplateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create template
        </Button>
      </div>
      {importStatus && <p className="text-xs text-gray-500 mt-3">{importStatus}</p>}
    </div>
  )

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">Processing strings</h3>
      <p className="text-sm text-gray-500">Reading your uploaded translation files...</p>
    </div>
  )

  const ErrorState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">Import failed</h3>
      <p className="text-sm text-gray-500 mb-4">{importStatus || 'Unable to read the selected file.'}</p>
      <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Try Again</Button>
    </div>
  )
  
  const StartState = () => (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-gray-500">Select a frame to start</p>
    </div>
  )

  // Helper to post messages to controller
  function post(msg: any) {
    try { parent.postMessage({ pluginMessage: msg }, '*') } catch (err) {}
  }

  useEffect(() => {
    lastActiveFrameIdRef.current = lastActiveFrameId
  }, [lastActiveFrameId])

  useEffect(() => {
    summaryByFrameRef.current = summaryByFrame
  }, [summaryByFrame])

  useEffect(() => {
    pendingBindKeyRef.current = pendingBindKey
  }, [pendingBindKey])

  useEffect(() => {
    pendingUnbindKeyRef.current = pendingUnbindKey
  }, [pendingUnbindKey])

  // Listen to messages from the Figma controller to detect frame selection and receive summaries
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = (event.data && (event.data as any).pluginMessage) ? (event.data as any).pluginMessage : event.data
      try {
        console.log('[UI] window message', { raw: event.data, parsed: data })
      } catch (err) {}
      if (!data || typeof data !== 'object') return
      if (data.type === 'selection') {
        console.log('[UI] selection message received; hasFrame =', data.hasFrame, 'frameId=', data.frameId)
        
        if (data.hasFrame && data.frameId) {
          // We have a frame context - either frame selected or child of frame selected
          setCurrentState('success')
          setSelectedFrameId(data.frameId)
          setLastActiveFrameId(data.frameId) // Remember this frame
          const cached = summaryByFrameRef.current[data.frameId]
          if (!cached) {
            setSummaryLoading(true)
          }
          post({ type: 'requestSummary', frameId: data.frameId })
          // Also read current selection binding for the debug indicator
          post({ type: 'getBinding' })
        } else if (lastActiveFrameIdRef.current && summaryByFrameRef.current[lastActiveFrameIdRef.current]) {
          // No frame context but we remember a previous frame - stay in that context
          console.log('[UI] No frame selected, but maintaining context of frame:', lastActiveFrameIdRef.current)
          setCurrentState('success')
          setSelectedFrameId(lastActiveFrameIdRef.current)
          // Don't reload summary, use cached
        } else {
          // No frame context and no previous frame - go to start state
          setCurrentState('start')
          setSelectedFrameId(null)
          setSummaryLoading(false)
          setCurrentSelectionKey(null)
        }
      } else if (data.type === 'summary') {
        if (data.error) {
          console.warn('[UI] summary error', data)
          setSummaryLoading(false)
          return
        }
        const summary: FrameSummary | undefined = data.summary
        if (summary && summary.frameId) {
          setSummaryByFrame(prev => ({ ...prev, [summary.frameId]: summary }))
        }
        if (data.frameId && Array.isArray((data as any).boundKeys)) {
          setBoundKeysByFrame(prev => ({ ...prev, [data.frameId]: (data as any).boundKeys as string[] }))
        }
        if (data.frameId && (data as any).boundKeyCounts) {
          setBoundKeyCountsByFrame(prev => ({ ...prev, [data.frameId]: (data as any).boundKeyCounts as Record<string, number> }))
        }
        setSummaryLoading(false)
      } else if (data.type === 'bindResult') {
        console.log('[UI] bindResult', data)
        if (data.success) {
          post({ type: 'getBinding' })
        }
      } else if (data.type === 'unbindResult') {
        console.log('[UI] unbindResult', data)
        post({ type: 'getBinding' })
      } else if (data.type === 'bindingInfo') {
        console.log('[UI] bindingInfo', data)
        const key: string = (data && (data as any).key) || ''
        setCurrentSelectionKey(key || null)
        // Track current selection node id for unbound navigation context
        const nodeId = (data as any).nodeId
        if (nodeId) {
          try { (window as any).POLY_LAST_NODE_ID = String(nodeId) } catch (_) {}
        }
        if (key) {
          setFlashKey(key)
          // Clear flash shortly after
          setTimeout(() => setFlashKey(prev => (prev === key ? null : prev)), 1200)
        }
        if (pendingBindKeyRef.current && key === pendingBindKeyRef.current) setPendingBindKey(null)
        if (pendingUnbindKeyRef.current && !key) setPendingUnbindKey(null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Actions
  const requestRescan = () => {
    if (!selectedFrameId) return
    setSummaryLoading(true)
    post({ type: 'requestSummary', frameId: selectedFrameId, forceRescan: true })
  }
  // Focus next/prev unbound text layer without creating any overlay
  const focusUnbound = (direction: 'next' | 'prev') => {
    if (!selectedFrameId) return
    const fromNodeId = (window as any).POLY_LAST_NODE_ID || null
    post({ type: 'focusUnbound', frameId: selectedFrameId, direction, fromNodeId })
  }
  const bindMissing = () => {
    setFilterMode('missing')
    setActiveTab('table-view')
  }

  const updateTranslation = (key: string, newTranslation: string) => {
    setStrings(prev => prev.map((string) =>
      string.key === key
        ? { ...string, translated: newTranslation, status: newTranslation ? 'translated' : 'missing' }
        : string
    ))
    setTranslationBundle(prev => {
      if (!prev) return prev
      const currentLang = prev.translations[selectedLanguage] || {}
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [selectedLanguage]: {
            ...currentLang,
            [key]: newTranslation,
          },
        },
      }
    })
  }

  // Helpers for binding from rows
  function requestBindForKey(row: StringEntry) {
    const payload: any = { type: 'bind', key: row.key }
    // Always set text from the keypair (translated falls back to base)
    const text = row.translated || row.base || ''
    if (text) payload.text = text
    // Force formatting override to ensure text update
    payload.forceText = true
    console.log('[UI] Row bind', payload)
    setPendingBindKey(row.key)
    post(payload)
  }
  function requestUnbindForKey(row: StringEntry) {
    console.log('[UI] Row unbind request for key', row.key)
    setPendingUnbindKey(row.key)
    post({ type: 'unbind', key: row.key, frameId: selectedFrameId })
  }

  // Lightweight quality checks
  function hasQualityIssues(baseText: string, translatedText: string, isBaseLang: boolean): boolean {
    if (!translatedText) return false
    const base = String(baseText || '')
    const tr = String(translatedText || '')
    // 1) Too long (relative and absolute)
    const tooLong = tr.length > 200 || (base.length > 0 && tr.length > Math.ceil(base.length * 1.3))
    // 2) Placeholder mismatch
    const ph = (s: string) => Array.from(new Set((s.match(/%[sd]|\{[^}]+\}/g) || []))).sort().join('|')
    const placeholdersMismatch = ph(base) !== ph(tr)
    // 3) Leading/trailing whitespace or double spaces
    const hasEdgeWs = tr.trim().length !== tr.length
    const multiSpace = / {2,}/.test(tr)
    // 4) End punctuation mismatch
    const endPunc = (s: string) => (s.match(/[.!?:…]$/) || [''])[0]
    const puncMismatch = endPunc(base) !== endPunc(tr)
    // 5) Identical to base when not base language
    const identicalToBase = !isBaseLang && base.length > 0 && tr.length > 0 && base === tr
    return tooLong || placeholdersMismatch || hasEdgeWs || multiSpace || puncMismatch || identicalToBase
  }

  const isBaseLang = (selectedLanguage || '').toLowerCase() === (baseLanguage || '').toLowerCase()

  const frameBoundKeys = selectedFrameId ? (boundKeysByFrame[selectedFrameId] || []) : []
  const normalizedQuery = (searchQuery || '').trim().toLowerCase()
  const hasQuery = normalizedQuery.length > 0
  const visibleStrings = strings.filter((s) => {
    if (hasQuery) {
      const inKey = s.key.toLowerCase().includes(normalizedQuery)
      const inBase = (s.base || '').toLowerCase().includes(normalizedQuery)
      const inTranslated = (s.translated || '').toLowerCase().includes(normalizedQuery)
      if (!inKey && !inBase && !inTranslated) return false
    }
    if (filterMode === 'all') return true
    if (filterMode === 'missing') return (!s.translated) || (editingKey === s.key)
    if (filterMode === 'bound') return frameBoundKeys.includes(s.key)
    if (filterMode === 'unbound') return !frameBoundKeys.includes(s.key)
    if (filterMode === 'quality') return hasQualityIssues(s.base, s.translated, isBaseLang)
    return true
  })

  // When selection changes to a bound layer, scroll to the matching key row
  useEffect(() => {
    if (!flashKey) return
    // Delay to ensure DOM updated
    const t = setTimeout(() => {
      const nodes = Array.from(document.querySelectorAll('[data-key-row]')) as HTMLElement[]
      const el = nodes.find(n => n.dataset.keyRow === flashKey)
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (_) {}
      }
    }, 50)
    return () => clearTimeout(t)
  }, [flashKey, activeTab, filterMode])

  const MultiCardListView = () => ( // Renamed from CardListView
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            ref={searchInputRef as any}
            placeholder="Search strings..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); try { requestAnimationFrame(() => searchInputRef.current?.focus()) } catch(_) {} }}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" title="Filter">
              <span className="relative inline-block">
                <Filter className="w-4 h-4" />
                {filterMode !== 'all' && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
                )}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterMode('all')}>All strings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('bound')}>Bound</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('unbound')}>Unbound</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('missing')}>Missing translation</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('quality')}>Quality issues</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Strings List */}
      <div className="space-y-3">
        {visibleStrings.map((string, index) => {
          const boundOnSelection = (selectedFrameId ? (boundKeysByFrame[selectedFrameId] || []) : []).includes(string.key)
          const count = selectedFrameId ? (boundKeyCountsByFrame[selectedFrameId]?.[string.key] || 0) : 0
          return (
          <div
            key={index}
            data-key-row={string.key}
            className={`border rounded-lg p-3 space-y-2 bg-white hover:bg-gray-50 transition-colors ${flashKey === string.key ? 'ring-2 ring-blue-400/40 bg-blue-50/40' : ''}`}
          >
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${boundOnSelection ? 'bg-blue-100 text-blue-700 cursor-pointer' : 'bg-gray-100 text-gray-600 cursor-pointer'}`}
                  title={boundOnSelection ? 'Select bound layer(s)' : 'Bind selection to this key'}
                  onClick={(e) => {
                    e.preventDefault()
                        const target = e.currentTarget
                        try { target.classList.remove('pl-pulse'); void target.offsetWidth; target.classList.add('pl-pulse') } catch (_) {}
                    if (boundOnSelection) {
                      if (!selectedFrameId) return
                      post({ type: 'selectByKey', key: string.key, frameId: selectedFrameId, mode: 'first' })
                    } else {
                      requestBindForKey(string)
                    }
                  }}
                >
                  {boundOnSelection ? <Link className="w-3 h-3 text-blue-500" /> : <Unlink className="w-3 h-3 text-gray-400" />}
                  {boundOnSelection && count > 0 ? count : ''}
                </span>
                <span className="font-mono text-xs text-gray-900 truncate">{string.key}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusColor(string.status)} text-xs px-2 py-0`}>
                  {string.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-6 h-6">
                      <MoreHorizontal className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.preventDefault(); boundOnSelection ? requestUnbindForKey(string) : requestBindForKey(string) }}>
                      {boundOnSelection ? (
                        <>
                          <Unlink className="w-4 h-4 mr-2" />
                          Unbind layer
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4 mr-2" />
                          Bind to layer
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Base Text */}
            <div className="text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
              <span className="text-xs text-gray-500 uppercase tracking-wide">{baseLanguage?.toUpperCase() || 'EN'}:</span> {string.base}
            </div>

            {/* Translation Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wide">{selectedLanguage?.toUpperCase() || 'SV'}:</span>
              </div>
              <Input
                value={string.translated}
                onChange={(e) => updateTranslation(string.key, e.target.value)}
                placeholder="Enter translation..."
                className="text-sm"
              />
            </div>
          </div>
        )})}
      </div>

      {/* Add New String */}
      <Button variant="outline" className="w-full mt-3 mb-3">
        <Plus className="w-4 h-4 mr-2" />
        Add new string
      </Button>
    </div>
  )

  const TableView = () => (
    <div className="space-y-4 p-0"> {/* Removed outer padding */}
      {/* Search and Filter */}
      <div className="flex gap-2 mb-4"> {/* Added mb-4 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            ref={searchInputRef as any}
            placeholder="Search strings..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); try { requestAnimationFrame(() => searchInputRef.current?.focus()) } catch(_) {} }}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" title="Filter">
              <span className="relative inline-block">
                <Filter className="w-4 h-4" />
                {filterMode !== 'all' && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
                )}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilterMode('all')}>All strings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('bound')}>Bound</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('unbound')}>Unbound</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('missing')}>Missing translation</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterMode('quality')}>Quality issues</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Strings Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead className="w-[140px] py-2 bg-white border-b">Key</TableHead>
              <TableHead className="py-2 bg-white border-b">Base ({baseLanguage?.toUpperCase() || 'EN'})</TableHead>
              <TableHead className="w-[200px] py-2 bg-white border-b">{selectedLanguage ? selectedLanguage.toUpperCase() : 'TRANSLATION'}</TableHead>
              <TableHead className="w-[80px] py-2 bg-white border-b">Status</TableHead>
              <TableHead className="w-[60px] py-2 bg-white border-b">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
        {visibleStrings.map((string, index) => {
              const boundOnSelection = (selectedFrameId ? (boundKeysByFrame[selectedFrameId] || []) : []).includes(string.key)
              const count = selectedFrameId ? (boundKeyCountsByFrame[selectedFrameId]?.[string.key] || 0) : 0
              return (
              <TableRow key={`${string.key}-${index}`} data-key-row={string.key} className={`${flashKey === string.key ? 'ring-1 ring-blue-400/40 bg-blue-50/40' : ''}`}>
                <TableCell className="font-mono text-xs py-2 max-w-[140px]">
                  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                    <span
                      className={`inline-flex items-center gap-1 px-1 py-0.5 rounded text-[10px] ${boundOnSelection ? 'bg-blue-100 text-blue-700 cursor-pointer' : 'bg-gray-100 text-gray-600 cursor-pointer'}`}
                      title={boundOnSelection ? 'Select bound layer(s)' : 'Bind selection to this key'}
                      onClick={(e) => {
                        e.preventDefault()
                        const target = e.currentTarget
                        try { target.classList.remove('pl-pulse'); void target.offsetWidth; target.classList.add('pl-pulse') } catch (_) {}
                        if (boundOnSelection) {
                          if (!selectedFrameId) return
                          post({ type: 'selectByKey', key: string.key, frameId: selectedFrameId, mode: 'first' })
                        } else {
                          requestBindForKey(string)
                        }
                      }}
                    >
                      {boundOnSelection ? <Link className="w-3 h-3 text-blue-500" /> : <Unlink className="w-3 h-3 text-gray-400" />}
                      {boundOnSelection && count > 0 ? count : ''}
                    </span>
                    <span className="truncate overflow-hidden text-ellipsis whitespace-nowrap" title={string.key}>{string.key}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs py-2">
                  <div className="truncate max-w-[200px]" title={string.base}>{string.base}</div>
                </TableCell>
                <TableCell className="py-2 w-[200px] max-w-[200px]">
                  <div className="space-y-1">
                    <div className="text-xs text-transparent opacity-0 h-0 overflow-hidden">DEBUG: "{string.translated}" ({string.translated?.length || 0})</div>
                    <textarea
                      key={`input-${string.key}-${selectedLanguage}`}
                      value={string.translated || ''}
                      onChange={(e) => updateTranslation(string.key, e.target.value)}
                      placeholder="Enter translation..."
                      className="w-full text-xs border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                      style={{
                        height: '48px',
                        maxHeight: '80px',
                        width: '100%',
                        maxWidth: '200px',
                        overflow: 'auto',
                        wordWrap: 'break-word',
                        whiteSpace: 'normal'
                      }}
                    />
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <Badge className={`${getStatusColor(string.status)} text-xs px-1 py-0`}>
                    {string.status}
                  </Badge>
                </TableCell>
                <TableCell className="py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-6 h-6">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.preventDefault(); boundOnSelection ? requestUnbindForKey(string) : requestBindForKey(string) }}>
                        {boundOnSelection ? (
                          <>
                            <Unlink className="w-4 h-4 mr-2" />
                            Unbind layer
                          </>
                        ) : (
                          <>
                            <Link className="w-4 h-4 mr-2" />
                            Bind to layer
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </div>

        {/* Add New String */}
        <Button variant="outline" className="w-full mt-4 mb-3"> {/* Added mt-4 */}
          <Plus className="w-4 h-4 mr-2" />
          Add new string
        </Button>
      </div>
    )

  const CardView = () => { // Renamed from SingleStringView
    const [currentIndex, setCurrentIndex] = useState(0)
    const currentString = visibleStrings[currentIndex]

    const handleNext = () => {
      if (currentIndex < visibleStrings.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }
    }

    const handlePrev = () => {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
      }
    }

    // Reset index when the result set changes (e.g., search or filters)
    useEffect(() => {
      setCurrentIndex(0)
    }, [searchQuery, filterMode, selectedLanguage, selectedFrameId])

    if (!currentString) {
      return <div className="text-center text-gray-500 py-12">No strings available.</div>
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto p-0 space-y-4">
          <div className="border rounded-lg p-4 space-y-3 bg-white">
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {(() => {
                  const boundOnSelection = (selectedFrameId ? (boundKeysByFrame[selectedFrameId] || []) : []).includes(currentString.key)
                  const count = selectedFrameId ? (boundKeyCountsByFrame[selectedFrameId]?.[currentString.key] || 0) : 0
                  return (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${boundOnSelection ? 'bg-blue-100 text-blue-700 cursor-pointer' : 'bg-gray-100 text-gray-600 cursor-pointer'}`}
                      title={boundOnSelection ? 'Select bound layer(s)' : 'Bind selection to this key'}
                      onClick={(e) => {
                        e.preventDefault()
                        const target = e.currentTarget
                        try { target.classList.remove('pl-pulse'); void target.offsetWidth; target.classList.add('pl-pulse') } catch (_) {}
                        if (boundOnSelection) {
                          if (!selectedFrameId) return
                          post({ type: 'selectByKey', key: currentString.key, frameId: selectedFrameId, mode: 'first' })
                        } else {
                          requestBindForKey(currentString)
                        }
                      }}
                    >
                      {boundOnSelection ? <Link className="w-4 h-4 text-blue-500" /> : <Unlink className="w-4 h-4 text-gray-400" />}
                      {boundOnSelection && count > 0 ? count : ''}
                    </span>
                  )
                })()}
                <span className="font-mono text-sm text-gray-900 truncate">{currentString.key}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusColor(currentString.status)} text-sm px-2 py-0`}>
                  {currentString.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-7 h-7">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                   <DropdownMenuContent align="end">
                    {(() => {
                      const boundOnSelection = selectedFrameId ? (boundKeysByFrame[selectedFrameId] || []).includes(currentString.key) : false
                      return (
                    <DropdownMenuItem onClick={(e) => { e.preventDefault(); boundOnSelection ? requestUnbindForKey(currentString) : requestBindForKey(currentString) }}>
                      {boundOnSelection ? (
                        <>
                          <Unlink className="w-4 h-4 mr-2" />
                          Unbind layer
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4 mr-2" />
                          Bind to layer
                        </>
                      )}
                    </DropdownMenuItem>
                      )
                    })()}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Base Text */}
            <div className="text-base text-gray-700 bg-gray-50 rounded px-3 py-2">
              <span className="text-sm text-gray-500 uppercase tracking-wide">{baseLanguage?.toUpperCase() || 'EN'}:</span> {currentString.base}
            </div>

            {/* Translation Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 uppercase tracking-wide">{selectedLanguage?.toUpperCase() || 'SV'}:</span>
              </div>
              <textarea
                key={`card-input-${currentString.key}-${selectedLanguage}`}
                value={currentString.translated || ''}
                onFocus={() => setEditingKey(currentString.key)}
                onBlur={() => setEditingKey((prev) => (prev === currentString.key ? null : prev))}
                onChange={(e) => updateTranslation(currentString.key, e.target.value)}
                placeholder="Enter translation..."
                className="w-full text-base border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                rows={4}
                style={{ minHeight: '96px' }}
              />
            </div>
          </div>
        </div>

        {/* Navigation Footer (lightweight so it doesn't conflict with sticky footer) */}
        <div className="p-3 flex items-center justify-between">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePrev} 
            disabled={currentIndex === 0}
            className="h-8 px-3"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Prev
          </Button>
          <span className="text-xs text-gray-600">
       {currentIndex + 1} / {visibleStrings.length}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleNext} 
            disabled={currentIndex === visibleStrings.length - 1}
            className="h-8 px-3"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => e.currentTarget.files && importTranslationFiles(e.currentTarget.files)}
      />
      {currentState === 'start' ? (
        <div className="flex-1 flex flex-col">
          <div className="py-2 px-0 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
          </div>
          <StartState />
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="py-2 px-0">
        <div className="flex items-center gap-2">
          {/* State selector temporarily removed */}
          {false && (
            <Select value={currentState} onValueChange={(value: PluginState) => setCurrentState(value)}>
              <SelectTrigger size="sm" className="h-6 w-6 p-0 [&>svg]:hidden">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="empty">⬜</SelectItem>
                <SelectItem value="loading">⏳</SelectItem>
                <SelectItem value="error">⚠️</SelectItem>
                <SelectItem value="success">✅</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Language Selector + cycle controls (tighter spacing) */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Previous language"
              onClick={() => cycleLanguage(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger size="sm" className="h-8 text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    <span>{flagForLanguage(lang)} {lang.toUpperCase()}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Next language"
              onClick={() => cycleLanguage(1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Unbound navigator + import grouped on the right */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="relative inline-flex items-center justify-center" aria-label="Unbound text layers" data-tooltip="Unbound text layers in current frame">
                <TypeIcon className="w-5 h-5 text-gray-700" />
                <Unlink className="w-3 h-3 text-gray-500 absolute -bottom-0 -right-0 bg-white rounded-full p-[1px]" />
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Previous missing layer"
                onClick={() => focusUnbound('prev')}
                disabled={!selectedFrameId}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-[11px] px-1 text-gray-600" title="Unbound text layers in frame">
                {(selectedFrameId && summaryByFrame[selectedFrameId]?.unbound) || 0}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Next missing layer"
                onClick={() => focusUnbound('next')}
                disabled={!selectedFrameId}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Create template"
              title="Create template"
              onClick={() => setTemplateOpen(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Import strings"
              title="Import strings"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Secondary action row to avoid overflow */}
      {false && currentState === 'success' && (
        <div className="px-2 pb-2 -mt-2" />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {currentState === 'success' && strings.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 rounded-md bg-muted p-1 h-10">
              <TabsTrigger value="table-view">Table</TabsTrigger>
              <TabsTrigger value="card-view">Card</TabsTrigger>
            </TabsList>
            <TabsContent value="table-view" className="flex-1 overflow-auto mt-0 min-h-0">
              <TableView />
            </TabsContent>
            <TabsContent value="card-view" className="flex-1 overflow-hidden mt-0 min-h-0">
              <CardView /> {/* Now renders the single-card view */}
            </TabsContent>
          </Tabs>
        )}
        {((currentState === 'success' && strings.length === 0) || currentState === 'empty') && <EmptyState />}
        {currentState === 'loading' && <LoadingState />}
        {currentState === 'error' && <ErrorState />}
      </div>

      {/* Footer Stats */}
      {currentState === 'success' && (
        <div className="py-2 px-3 -mx-3 -mb-3 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between text-xs text-gray-600">
            <span>{strings.length} strings total</span>
            {(() => {
              const missing = strings.filter(s => !s.translated).length
              const boundKeys = selectedFrameId ? (boundKeysByFrame[selectedFrameId]?.length || 0) : 0
              return <span>{missing} missing • {boundKeys} bound keys</span>
            })()}
          </div>
        </div>
      )}

      </>
      )}
      {templateOpen && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center p-3 z-50" onClick={() => setTemplateOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Create JSON template</h3>
                <p className="text-xs text-gray-500">Generate files and load them into Polylingo.</p>
              </div>
              <button className="text-gray-500 text-lg leading-none" onClick={() => setTemplateOpen(false)}>x</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-[1fr_88px] gap-2 items-end">
                <div>
                  <label className="text-xs font-medium text-gray-600">Supported locales</label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={templateLocaleCount}
                    onChange={(e) => updateTemplateLocaleCount(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <Button variant="outline" onClick={() => updateTemplateLocaleCount(templateLocaleCount + 1)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {templateLocales.slice(0, templateLocaleCount).map((locale, index) => (
                  <div key={index}>
                    <label className="text-xs font-medium text-gray-600">{index === 0 ? 'Base locale' : `Locale ${index + 1}`}</label>
                    <Input
                      value={locale}
                      disabled={index === 0}
                      onChange={(e) => {
                        const next = [...templateLocales]
                        next[index] = e.target.value
                        setTemplateLocales(next)
                      }}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">String name</label>
                <Input
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  placeholder="app_name"
                  className="mt-1 font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">English value</label>
                <Input
                  value={templateEnglishValue}
                  onChange={(e) => setTemplateEnglishValue(e.target.value)}
                  placeholder="My app"
                  className="mt-1"
                />
              </div>

              {templateError && <p className="text-xs text-red-600">{templateError}</p>}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button>
              <Button onClick={createTemplateJson}>
                <FileText className="w-4 h-4 mr-2" />
                Create and import
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
