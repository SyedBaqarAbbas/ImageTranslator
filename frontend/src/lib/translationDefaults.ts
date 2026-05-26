import type { ReadingDirection, ReplacementMode } from "../types/api";

export type QualityMode = "balanced" | "high";

export interface TranslationDefaults {
  sourceLanguage: string;
  targetLanguage: string;
  tone: string;
  replacementMode: ReplacementMode;
  readingDirection: ReadingDirection;
  preserveSfx: boolean;
  autoStartProcessing: boolean;
  qualityMode: QualityMode;
}

export interface LanguageOption {
  value: string;
  label: string;
}

export const TRANSLATION_DEFAULTS_STORAGE_KEY = "imageTranslator.translationDefaults";

export const SOURCE_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "auto", label: "Auto detect" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

export const TARGET_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

export const DEFAULT_TRANSLATION_DEFAULTS: TranslationDefaults = {
  sourceLanguage: "auto",
  targetLanguage: "en",
  tone: "natural",
  replacementMode: "replace",
  readingDirection: "rtl",
  preserveSfx: true,
  autoStartProcessing: true,
  qualityMode: "balanced",
};

const TONE_OPTIONS = ["natural", "dramatic", "literal", "localized"] as const;
const REPLACEMENT_MODE_OPTIONS = ["replace", "overlay", "bilingual"] as const;
const READING_DIRECTION_OPTIONS = ["rtl", "ltr", "ttb"] as const;
const QUALITY_MODE_OPTIONS = ["balanced", "high"] as const;

function getStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickAllowedString(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function pickLanguage(value: unknown, options: LanguageOption[], fallback: string): string {
  return typeof value === "string" && options.some((option) => option.value === value) ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeTranslationDefaults(value: unknown): TranslationDefaults {
  if (!isRecord(value)) {
    return DEFAULT_TRANSLATION_DEFAULTS;
  }

  return {
    sourceLanguage: pickLanguage(value.sourceLanguage, SOURCE_LANGUAGE_OPTIONS, DEFAULT_TRANSLATION_DEFAULTS.sourceLanguage),
    targetLanguage: pickLanguage(value.targetLanguage, TARGET_LANGUAGE_OPTIONS, DEFAULT_TRANSLATION_DEFAULTS.targetLanguage),
    tone: pickAllowedString(value.tone, TONE_OPTIONS, DEFAULT_TRANSLATION_DEFAULTS.tone),
    replacementMode: pickAllowedString(value.replacementMode, REPLACEMENT_MODE_OPTIONS, DEFAULT_TRANSLATION_DEFAULTS.replacementMode) as ReplacementMode,
    readingDirection: pickAllowedString(value.readingDirection, READING_DIRECTION_OPTIONS, DEFAULT_TRANSLATION_DEFAULTS.readingDirection) as ReadingDirection,
    preserveSfx: pickBoolean(value.preserveSfx, DEFAULT_TRANSLATION_DEFAULTS.preserveSfx),
    autoStartProcessing: pickBoolean(value.autoStartProcessing, DEFAULT_TRANSLATION_DEFAULTS.autoStartProcessing),
    qualityMode: pickAllowedString(value.qualityMode, QUALITY_MODE_OPTIONS, DEFAULT_TRANSLATION_DEFAULTS.qualityMode) as QualityMode,
  };
}

export function readTranslationDefaults(storage?: Storage): TranslationDefaults {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return DEFAULT_TRANSLATION_DEFAULTS;
  }

  const rawDefaults = resolvedStorage.getItem(TRANSLATION_DEFAULTS_STORAGE_KEY);
  if (!rawDefaults) {
    return DEFAULT_TRANSLATION_DEFAULTS;
  }

  return normalizeTranslationDefaults(JSON.parse(rawDefaults));
}

export function saveTranslationDefaults(defaults: TranslationDefaults, storage?: Storage): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    throw new Error("Browser storage is not available.");
  }
  resolvedStorage.setItem(TRANSLATION_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));
}

export function clearTranslationDefaults(storage?: Storage): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    throw new Error("Browser storage is not available.");
  }
  resolvedStorage.removeItem(TRANSLATION_DEFAULTS_STORAGE_KEY);
}
