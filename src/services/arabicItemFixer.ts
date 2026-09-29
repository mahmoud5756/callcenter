/**
 * Utility for detecting, fixing, and normalizing reversed Arabic item names
 * commonly produced by POS reports, PDF printer spools, and thermal receipt layouts.
 */

// Regex to check for Arabic characters
export const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * Words that represent size, options, or modifiers in Arabic food/POS menus.
 * In natural Arabic, these ALWAYS follow the food item name (e.g. "مكس دوبل - عادي", not "عادي - مكس دوبل").
 */
export const ARABIC_MODIFIERS = [
  'عادى',
  'عادي',
  'وسط',
  'كبير',
  'صغير',
  'سمول',
  'لارج',
  'سنجل',
  'سينجل',
  'دبل',
  'دوبل',
  'تريبل',
  'تربل',
  'سبايسي',
  'حار',
  'شطة',
  'بارد',
  'كومبو',
  'صاروخ',
  'ميجا',
  'سوبر',
  'اكسترا',
  'إكسترا',
  'بدون',
  'اضافة',
  'إضافة',
];

const MODIFIER_PREFIX_REGEX = new RegExp(
  `^(?:${ARABIC_MODIFIERS.join('|')})\\s*[-/\\.]\\s*`,
  'i'
);

/**
 * Checks if a string contains Arabic characters
 */
export function hasArabic(text: string): boolean {
  return ARABIC_CHAR_REGEX.test(text);
}

/**
 * Reverses the words in a string while preserving hyphens and slashes.
 * Example: "عادى - رول جراند س" -> "س جراند رول - عادى"
 * Example: "عادى - مكس دوبل" -> "دوبل مكس - عادى"
 * Example: "عادى - دجاج تشيز دبل" -> "دبل تشيز دجاج - عادى"
 */
export function reverseItemWords(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();

  // Normalize delimiters to be standalone tokens
  const tokenized = trimmed
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ');

  const tokens = tokenized.split(' ').filter(Boolean);
  if (tokens.length <= 1) return trimmed;

  const reversed = tokens.slice().reverse().join(' ');

  return reversed
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects if an Arabic item name shows clear signatures of being reversed:
 * 1. Starts with a modifier before a hyphen (e.g. "عادى - مكس دوبل")
 * 2. Ends with the single-letter sandwich abbreviation "س" or "س." which belongs at the beginning
 * 3. Starts with trailing culinary adjectives before nouns (e.g. "مشوية كفتة")
 */
export function isItemNameReversed(name: string): boolean {
  if (!name || !hasArabic(name)) return false;

  const trimmed = name.trim();

  // 1. Modifier placed before hyphen at start (e.g. "عادى - ...", "سبايسي - ...")
  if (MODIFIER_PREFIX_REGEX.test(trimmed)) {
    return true;
  }

  // 2. Trailing "س" or "س." at the very end of an Arabic item name
  // In Egyptian POS: "س" = ساندوتش. It is always a prefix (e.g. "س فاهيتا").
  // If it's at the end ("... رول جراند س"), it was reversed by POS LTR reading.
  if (/\s+[س]\.?$/i.test(trimmed)) {
    return true;
  }

  // 3. Adjective before noun at start (e.g. "مشوية كفتة", "محمرة بطاطس")
  if (/^(?:مشوية|محمرة|مقلية|متبلة|مشكل|مشكلة)\s+(?:كفتة|فراخ|لحمة|بطاطس|جبنة|جبن)/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Intelligently cleans and normalizes a POS item name:
 * If it detects that words were reversed, it automatically flips them to the natural order.
 * If forceReverse is true, it unconditionally flips word order.
 */
export function fixReversedArabicItemName(name: string, forceReverse: boolean = false): string {
  if (!name) return '';
  const trimmed = name.trim();

  if (forceReverse) {
    return reverseItemWords(trimmed);
  }

  if (isItemNameReversed(trimmed)) {
    return reverseItemWords(trimmed);
  }

  // Basic normalization for already-correct names
  return trimmed
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Universal display formatter for order item names across all UI views
 */
export function formatItemName(rawName: string): string {
  if (!rawName) return '';
  return fixReversedArabicItemName(rawName);
}
