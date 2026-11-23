import type { EraserMode } from './eraser'

export const INK_WIDTHS = [1.8, 2.4, 3.6] as const
export type InkWidth = typeof INK_WIDTHS[number]
export const INK_MODES = ['hold', 'immediate', 'free'] as const
export type InkMode = typeof INK_MODES[number]
export const ERASER_SIZES = ['small', 'medium', 'large'] as const
export type EraserSize = typeof ERASER_SIZES[number]

export const MAX_CUSTOM_INKS = 4
export type InkPrefs = {
  color: string
  customInks: string[]
  width: InkWidth
  mode: InkMode
  eraserMode: EraserMode
  eraserSize: EraserSize
  eraserReturn: boolean
}

export const DEFAULT_INK_PREFS: InkPrefs = {
  color: '#ff5a5a',
  customInks: [],
  width: 2.4,
  mode: 'hold',
  eraserMode: 'stroke',
  eraserSize: 'medium',
  eraserReturn: false,
}

const STORAGE_KEY = 'physiclab.ink-prefs.v1'
const colorPattern = /^#[0-9a-fA-F]{6}$/

function isWidth(value: unknown): value is InkWidth {
  return INK_WIDTHS.includes(value as InkWidth)
}
function isMode(value: unknown): value is InkMode {
  return INK_MODES.includes(value as InkMode)
}
function isEraserSize(value: unknown): value is EraserSize {
  return ERASER_SIZES.includes(value as EraserSize)
}

export function normalizeInkPrefs(value: unknown): InkPrefs {
  const source = value && typeof value === 'object' ? value as Partial<InkPrefs> : {}
  const customInks = Array.isArray(source.customInks)
    ? [...new Set(source.customInks
        .filter((color): color is string => typeof color === 'string' && colorPattern.test(color))
        .map(color => color.toLowerCase()))].slice(-MAX_CUSTOM_INKS)
    : []
  return {
    color: typeof source.color === 'string' && colorPattern.test(source.color) ? source.color.toLowerCase() : DEFAULT_INK_PREFS.color,
    customInks,
    width: isWidth(source.width) ? source.width : DEFAULT_INK_PREFS.width,
    mode: isMode(source.mode) ? source.mode : DEFAULT_INK_PREFS.mode,
    eraserMode: source.eraserMode === 'drag' ? 'drag' : 'stroke',
    eraserSize: isEraserSize(source.eraserSize) ? source.eraserSize : DEFAULT_INK_PREFS.eraserSize,
    eraserReturn: typeof source.eraserReturn === 'boolean' ? source.eraserReturn : false,
  }
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}

export function loadInkPrefs(storage = browserStorage()): InkPrefs {
  if (!storage) return normalizeInkPrefs(DEFAULT_INK_PREFS)
  try {
    const stored = storage.getItem(STORAGE_KEY)
    return normalizeInkPrefs(stored ? JSON.parse(stored) : undefined)
  } catch {
    return normalizeInkPrefs(DEFAULT_INK_PREFS)
  }
}

export function saveInkPrefs(prefs: InkPrefs, storage = browserStorage()): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeInkPrefs(prefs)))
  } catch {
    // Private browsing or a full quota must not block editing.
  }
}