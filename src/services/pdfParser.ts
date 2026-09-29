import { Order } from '../types';
import { normalizePhoneNumber } from './algorithms';
import { fixReversedArabicItemName, reverseItemWords } from './arabicItemFixer';

export { fixReversedArabicItemName, reverseItemWords };

export interface ParsedOrderDraft {
  orderNumber: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  altPhone?: string;
  orderDate: string;
  orderTime: string;
  totalAmount: number;
  subTotalAmount?: number;
  takerName?: string;
  isVoid: boolean;
  voidReason?: string;
  replacementForOrderId?: string;
  items: Array<{ itemName: string; quantity: number; price: number }>;
  rawBlock: string;
  confidenceScore?: number; // 0 - 100%
}

export interface ParseResult {
  orders: ParsedOrderDraft[];
  totalParsed: number;
  validCount: number;
  voidCount: number;
  reorderCount: number;
  warnings: string[];
}

/**
 * Converts Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to standard ASCII digits
 */
export function convertArabicNumeralsToAscii(str: string): string {
  if (!str) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), i.toString());
  }
  return result;
}

/**
 * Common service channel / order type tokens that are NOT branches
 */
const NON_BRANCH_TOKENS = new Set([
  'DELIVERY',
  'TAKEAWAY',
  'TAKE AWAY',
  'DINE IN',
  'DINE-IN',
  'CALL CENTER',
  'CALLCENTER',
  'POS',
  'CASH',
  'VISA',
  'CREDIT',
  'توصيل',
  'تيك اواي',
  'تيك أواي',
  'صالة',
  'كول سنتر',
  'كاش',
  'فيزا',
  'شبكة',
  'أونلاين',
  'ONLINE',
]);

/**
 * Well-known Egyptian restaurant chain branches for fuzzy recognition
 */
const KNOWN_BRANCH_NAMES = [
  'معاوية',
  'المعادي',
  'الدقي',
  'مدينة نصر',
  'المهندسين',
  'التجمع',
  'التجمع الخامس',
  'الشيخ زايد',
  'مصر الجديدة',
  'فيصل',
  'الهرم',
  'أكتوبر',
  '6 أكتوبر',
  'شيراتون',
  'العبور',
  'شبرا',
  'الإسكندرية',
  'سموحة',
  'ستانلي',
  'طنطا',
  'المنصورة',
  'الزقازيق',
  'المقطم',
  'حدائق الأهرام',
  'حلوان',
  'الرحاب',
  'مدينتي',
];

/**
 * Delimited field extractor that respects spatial POS column boundaries
 */
function extractDelimitedField(
  text: string,
  tagRegex: RegExp,
  additionalStopRegex?: RegExp
): string | undefined {
  const match = text.match(tagRegex);
  if (!match || match.index === undefined) return undefined;

  const startIndex = match.index + match[0].length;
  const remainder = text.slice(startIndex);

  // Standard POS tokens that mark the start of the next column or field
  const defaultStopRegex = /(?:\r?\n|(?=\b(?:TAKER|CASHIER|كاشير|المستلم|موظف|USER|CREATOR|OPERATOR|CLERK|WAITER|SERVER|BRANCH|الفرع|فرع|STORE|OUTLET|LOCATION|PHONE|TEL|MOBILE|هاتف|موبايل|تليفون|NAM|NAME|CUSTOMER|العميل|WORKING\s+DATE|DATE|تاريخ|CASH\s+TIME|TIME|وقت|TOTAL|SUB\.?\s*TOTAL|المجموع|الاجمالي|الإجمالي|ORDER\s+NUMBER|CHECK\s+NUMBER|ORD\s*#|طلب\s*رقم|SHORT\s*VOID|VOID|ملغي|DELIVERY|TAKEAWAY|DINE\s*IN|توصيل|صالة|تيك\s*اواي)\b)|(?=[:#=]))/i;

  const stopRegex = additionalStopRegex || defaultStopRegex;
  const boundaryMatch = remainder.match(stopRegex);

  let val = boundaryMatch && boundaryMatch.index !== undefined
    ? remainder.slice(0, boundaryMatch.index)
    : remainder;

  // Clean trailing punctuation and whitespace
  val = val.replace(/[:*#=|\/\\-]/g, ' ').trim();
  val = val.replace(/\s+/g, ' ').trim();

  return val || undefined;
}

/**
 * Extracts plain text from a PDF ArrayBuffer using pdfjs-dist
 */
/**
 * Groups PDF text fragments into visual lines.
 *
 * Fragments of the same printed row often differ by a fraction of a point
 * (Arabic text vs. digits have slightly different baselines). Bucketing by
 * rounding the Y coordinate splits such a row into two lines whenever the
 * values straddle a bucket edge, which used to drop item names. Instead we
 * cluster by tolerance: a fragment joins the current line when it is within
 * a few points of the line's first fragment. Real rows are ~12pt apart.
 */
export function groupTextItemsIntoLines(
  items: Array<{ str: string; transform: number[] }>,
  tolerance = 3
): string {
  const frags = items
    .filter((i) => i.str && i.str.trim() !== '')
    .map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
    .sort((a, b) => b.y - a.y);

  const lines: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = [];
  for (const f of frags) {
    const last = lines[lines.length - 1];
    if (last && last.y - f.y <= tolerance) {
      last.parts.push({ x: f.x, str: f.str });
    } else {
      lines.push({ y: f.y, parts: [{ x: f.x, str: f.str }] });
    }
  }

  return lines
    .map((l) =>
      l.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
    )
    .join('\n') + (lines.length ? '\n' : '');
}

export async function extractTextFromPdf(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${
        pdfjsLib.version || '4.10.38'
      }/pdf.worker.min.mjs`;
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });

    const pdfDoc = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = textContent.items as Array<{ str: string; transform: number[] }>;
      fullText += groupTextItemsIntoLines(items);
      fullText += '\n--- PAGE_BREAK ---\n';
    }

    return fullText;
  } catch (error) {
    console.error('Error parsing PDF with pdfjs:', error);
    throw new Error(
      'فشل استخراج النصوص من ملف الـ PDF. يرجى التأكد من صحة الملف أو استخدام خيار لصق النص المباشر.'
    );
  }
}

/** Unique identity of an order: order numbers restart per working day and per branch. */
export function orderIdentityKey(o: { branchName?: string; orderDate?: string; orderNumber: string }): string {
  return `${(o.branchName || '').trim()}|${o.orderDate || ''}|${String(o.orderNumber).trim()}`;
}

/**
 * Main Spatial POS Parser for "DETAIL ORDERS LIST / CALL CENTER"
 */
export function parsePosReportText(
  rawText: string,
  existingOrders: Order[] = []
): ParseResult {
  const warnings: string[] = [];
  const normalizedText = convertArabicNumeralsToAscii(
    rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  );

  // 1. Extract Global Document Header (Branch, Cashier, Date if printed once at top)
  const headerSlice = normalizedText.slice(0, 3000);
  
  let globalBranch: string | undefined = undefined;
  const rawGlobalBranch = extractDelimitedField(
    headerSlice,
    /(?:BRANCH|الفرع|فرع|STORE|OUTLET|LOCATION)\s*[:#-]?\s*/i
  );
  if (rawGlobalBranch) {
    const cleaned = cleanBranchString(rawGlobalBranch);
    if (cleaned && !isNonBranchToken(cleaned)) {
      globalBranch = cleaned;
    }
  }

  let globalCashier: string | undefined = undefined;
  const rawGlobalCashier = extractDelimitedField(
    headerSlice,
    /(?:CASHIER|كاشير|الكاشير|المستلم|USER)\s*[:#-]?\s*/i
  );
  if (rawGlobalCashier) {
    const cleaned = cleanCashierString(rawGlobalCashier);
    if (cleaned) {
      globalCashier = cleaned;
    }
  }

  // The business date is printed as "WORKING DATE" on every page header. The
  // bare "DATE :" at the top of each page is the PRINT date and must not be
  // used as the order date.
  const WORKING_DATE_RE = /WORKING\s+DATE\s*[:#-]?\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/gi;
  const lastWorkingDateIn = (text: string): string | undefined => {
    let last: string | undefined;
    for (const m of text.matchAll(WORKING_DATE_RE)) last = normalizeDateString(m[1]);
    return last;
  };

  let globalDate: string | undefined = undefined;
  const firstWorking = normalizedText.match(
    /WORKING\s+DATE\s*[:#-]?\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i
  );
  const hasWorkingDate = Boolean(firstWorking);
  if (firstWorking) {
    globalDate = normalizeDateString(firstWorking[1]);
  } else {
    const headerDateMatch = headerSlice.match(
      /(?:DATE|تاريخ|التاريخ)\s*[:#-]?\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i
    );
    if (headerDateMatch) globalDate = normalizeDateString(headerDateMatch[1]);
  }
  let currentDate = globalDate;

  // 2. Split into blocks by "ORDER NUMBER" or "CHECK NUMBER" or Arabic order tokens
  const orderSplitRegex = /(?:^|\n)(?=.*(?:ORDER\s+NUMBER|CHECK\s+NUMBER|ORD\s*#|طلب\s*رقم|رقم\s*الطلب|رقم\s*الأوردر|رقم\s*الشيك))/i;
  const rawSections = normalizedText.split(orderSplitRegex);

  const parsedOrders: ParsedOrderDraft[] = [];
  // Order numbers restart every working day (and per branch), so the number
  // alone is not unique. Identity = branch + working date + number.
  const existingOrderKeys = new Set(existingOrders.map((o) => orderIdentityKey(o)));
  const seenOrderNumbersInBatch = new Set<string>();

  for (const section of rawSections) {
    const trimmed = section.trim();
    const dateForThisBlock = currentDate;
    // A page header inside/before this section changes the date for the NEXT orders
    const sectionWorkingDate = lastWorkingDateIn(trimmed);
    if (sectionWorkingDate) currentDate = sectionWorkingDate;
    if (
      !trimmed ||
      (!/ORDER\s+NUMBER/i.test(trimmed) &&
        !/CHECK\s+NUMBER/i.test(trimmed) &&
        !/ORD\s*#/i.test(trimmed) &&
        !/طلب\s*رقم/i.test(trimmed) &&
        !/رقم\s*الطلب/i.test(trimmed) &&
        !/رقم\s*الأوردر/i.test(trimmed))
    ) {
      continue;
    }

    const orderData = parseSingleOrderBlock(trimmed, globalBranch, globalCashier, dateForThisBlock, hasWorkingDate);
    if (!orderData) {
      continue;
    }

    // Sanity checks so a mis-read order is flagged instead of silently imported
    if (orderData.items.length === 0) {
      warnings.push(`الأوردر رقم (${orderData.orderNumber}) لم يتم العثور على أصناف له في الملف.`);
    } else if (orderData.subTotalAmount !== undefined) {
      const itemsSum = orderData.items.reduce((sum, it) => sum + it.quantity * it.price, 0);
      if (itemsSum > 0 && Math.abs(itemsSum - orderData.subTotalAmount) > 0.5) {
        warnings.push(
          `الأوردر رقم (${orderData.orderNumber}): مجموع الأصناف (${itemsSum.toFixed(2)}) لا يطابق SUB TOTAL (${orderData.subTotalAmount.toFixed(2)}) - راجع الأصناف.`
        );
      }
    }

    // Check duplicate against DB
    if (existingOrderKeys.has(orderIdentityKey(orderData))) {
      warnings.push(`تم رصد الأوردر رقم (${orderData.orderNumber}) موجود مسبقاً في المنظومة.`);
    }

    const batchKey = orderIdentityKey(orderData);
    if (seenOrderNumbersInBatch.has(batchKey)) {
      warnings.push(`تم رصد تكرار للأوردر رقم (${orderData.orderNumber}) داخل نفس التقرير.`);
      continue;
    }

    seenOrderNumbersInBatch.add(batchKey);
    parsedOrders.push(orderData);
  }

  // 3. Smart Re-order detection:
  // If an order is VOID / SHORT VOID, look for a matching valid order for same normalized phone on same date
  const voidOrders = parsedOrders.filter((o) => o.isVoid);
  const validOrders = parsedOrders.filter((o) => !o.isVoid);

  let reorderCount = 0;
  for (const validOrder of validOrders) {
    if (!validOrder.customerPhone) continue;

    const matchingVoid = voidOrders.find(
      (vo) =>
        normalizePhoneNumber(vo.customerPhone) ===
          normalizePhoneNumber(validOrder.customerPhone) &&
        (vo.orderDate === validOrder.orderDate || !vo.orderDate || !validOrder.orderDate)
    );

    if (matchingVoid) {
      validOrder.replacementForOrderId = matchingVoid.orderNumber;
      reorderCount++;
    }
  }

  const validCount = parsedOrders.filter((o) => !o.isVoid).length;
  const voidCount = parsedOrders.filter((o) => o.isVoid).length;

  return {
    orders: parsedOrders,
    totalParsed: parsedOrders.length,
    validCount,
    voidCount,
    reorderCount,
    warnings,
  };
}

/**
 * Checks if a string is a service channel/payment token rather than a physical branch
 */
function isNonBranchToken(str: string): boolean {
  if (!str) return true;
  const upper = str.toUpperCase().trim();
  if (NON_BRANCH_TOKENS.has(upper)) return true;
  if (/TOTAL|SUB\.?\s*TOTAL|المجموع|الاجمالي|الإجمالي|NET|AMOUNT/i.test(upper)) return true;
  return false;
}

/**
 * Cleans extracted branch string, stripping out numeric codes and extra punctuation.
 * Strictly excludes any line or value containing TOTAL or totals tokens.
 */
function cleanBranchString(raw: string): string {
  if (!raw) return '';
  // Exclude any line or text containing TOTAL or totals
  if (/TOTAL|SUB\.?\s*TOTAL|المجموع|الاجمالي|الإجمالي/i.test(raw)) {
    return '';
  }
  let cleaned = raw.replace(/^[\d\s\-#.:/]+/, '').trim();
  cleaned = cleaned.replace(/[\d\s\-#.:/]+$/, '').trim();
  cleaned = cleaned.replace(/^(?:فرع|الفرع)\s+/i, '').trim();
  if (/TOTAL|SUB\.?\s*TOTAL|المجموع|الاجمالي|الإجمالي/i.test(cleaned)) {
    return '';
  }
  return cleaned || '';
}

/**
 * Cleans extracted cashier string, stripping staff IDs like "104 - أحمد سعيد"
 */
function cleanCashierString(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.replace(/^[\d\s\-#.:/]+/, '').trim();
  cleaned = cleaned.replace(/[\d\s\-#.:/]+$/, '').trim();
  cleaned = cleaned.replace(/^(?:كاشير|الكاشير|المستلم)\s+/i, '').trim();
  return cleaned || '';
}

/**
 * Normalizes YYYY-MM-DD or DD/MM/YYYY dates
 */
function normalizeDateString(rawDate: string): string {
  const clean = rawDate.replace(/\//g, '-').replace(/\./g, '-');
  const parts = clean.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Parses an individual order block text with spatial confidence metrics
 */
function parseSingleOrderBlock(
  block: string,
  globalBranch?: string,
  globalCashier?: string,
  globalDate?: string,
  dateIsWorkingDate = false
): ParsedOrderDraft | null {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  let confidencePoints = 0;

  // 1. Order Number
  const orderNumMatch = block.match(
    /(?:ORDER\s+NUMBER|CHECK\s+NUMBER|ORD\s*#|طلب\s*رقم|رقم\s*الطلب|رقم\s*الأوردر|رقم\s*الشيك)\s*[:#-]?\s*([A-Za-z0-9_-]+)/i
  );
  if (!orderNumMatch) {
    return null;
  }
  const orderNumber = orderNumMatch[1].trim();
  confidencePoints += 25;

  // 2. Void Check (SHORT VOID or VOID)
  const isVoid = /SHORT\s*VOID|(?:\bVOID\b)|(?:\bVOIDED\b)|ملغي|ملغية|إلغاء|الغاء/i.test(block);
  let voidReason: string | undefined = undefined;
  if (isVoid) {
    if (/SHORT\s*VOID/i.test(block)) {
      voidReason = 'SHORT VOID (إلغاء سريع)';
    } else {
      voidReason = 'VOID (طلب ملغي)';
    }
  }

  // 3. Phone Numbers (01XXXXXXXXX)
  // RULE: Read phones under PHONE / TEL. If two numbers, save the 2nd in altPhone, NEVER assign to takerName!
  const phoneMatches: string[] = [];

  // Look for section directly under PHONE / TEL
  const phoneSectionMatch = block.match(
    /(?:PHONE|TEL|MOBILE|هاتف|موبايل|تليفون)\s*[:#-]?\s*([\s\S]*?)(?=(?:NAM|NAME|العميل|TAKER|CASHIER|كاشير|BRANCH|الفرع|TOTAL|SUB|ORDER|CHECK|WORKING|CASH\s+TIME|$))/i
  );
  if (phoneSectionMatch) {
    const rawPhoneSection = phoneSectionMatch[1];
    const foundPhones = rawPhoneSection.match(/\b01[0125][0-9]{8}\b/g);
    if (foundPhones) {
      foundPhones.forEach((p) => {
        const norm = normalizePhoneNumber(p);
        if (!phoneMatches.includes(norm)) phoneMatches.push(norm);
      });
    }
  }

  // Also collect all valid phones in the block
  const allPhones = block.match(/\b01[0125][0-9]{8}\b/g);
  if (allPhones) {
    allPhones.forEach((p) => {
      const normalized = normalizePhoneNumber(p);
      if (!phoneMatches.includes(normalized)) phoneMatches.push(normalized);
    });
  }

  const customerPhone = phoneMatches[0] || '01000000000';
  const altPhone = phoneMatches.length > 1 ? phoneMatches[1] : undefined;
  if (customerPhone !== '01000000000') {
    confidencePoints += 25;
  }

  // 4. Taker Name (Cashier)
  // RULE: Cashier name taker_name is read exclusively from the Arabic text located below TAKER and station number.
  // PROHIBITIONS:
  // - NEVER assign a phone number (e.g. alt_phone) to taker_name.
  // - NEVER assign taker_name as customer_name.
  let takerName: string | undefined = undefined;
  const takerSectionMatch = block.match(
    /(?:TAKER|CASHIER|كاشير|الكاشير|المستلم)\s*[:#-]?\s*([\s\S]*?)(?=(?:PHONE|TEL|هاتف|موبايل|NAM|NAME|العميل|BRANCH|الفرع|TOTAL|SUB|ORDER|CHECK|WORKING|CASH\s+TIME|$))/i
  );

  if (takerSectionMatch) {
    const takerSectionText = takerSectionMatch[1].trim();
    const takerLines = takerSectionText.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of takerLines) {
      // Exclude station number alone (e.g. "104") or phone numbers
      if (/^\d+$/.test(line) || /01[0125]\d{8}/.test(line) || isNonBranchToken(line)) continue;
      // Strip leading station number e.g. "102 أحمد محمود" -> "أحمد محمود"
      const stripped = line.replace(/^[\d\s\-#.:/]+/, '').trim();
      const arabicMatch = stripped.match(/[\u0600-\u06FF\s]{2,}/g);
      if (arabicMatch) {
        const arabicText = arabicMatch.join(' ').replace(/\s+/g, ' ').trim();
        if (
          arabicText &&
          arabicText.length >= 2 &&
          !/^(?:كاشير|الكاشير|المستلم|موظف|الفرع|فرع|توصيل|صالة)$/i.test(arabicText) &&
          !phoneMatches.includes(normalizePhoneNumber(arabicText))
        ) {
          takerName = cleanCashierString(arabicText);
          confidencePoints += 20;
          break;
        }
      }
    }
  }

  if (!takerName && globalCashier) {
    takerName = globalCashier;
  }

  // Strict check: takerName must NEVER be a phone number or match altPhone or customerPhone
  if (
    takerName &&
    (phoneMatches.includes(normalizePhoneNumber(takerName)) ||
      /01[0125]\d{8}/.test(takerName) ||
      /^\d+$/.test(takerName) ||
      takerName === customerPhone ||
      takerName === altPhone)
  ) {
    takerName = undefined;
  }

  // 5. Branch Name (Read ONLY from line corresponding to BRANCH, strictly excluding TOTAL)
  let branchName: string | undefined = undefined;
  const branchMatch = block.match(/(?:BRANCH|الفرع|فرع)\s*[:#-]?\s*([^\n\r]+)/i);

  if (branchMatch) {
    let candidate = branchMatch[1].trim();
    // Exclude any line or text containing TOTAL
    if (!/TOTAL|SUB\.?\s*TOTAL|المجموع|الاجمالي|الإجمالي/i.test(candidate)) {
      // Cut off at any adjacent tag
      candidate = candidate.replace(/\b(?:TAKER|CASHIER|PHONE|TEL|NAM|NAME|ORDER|CHECK|CASH|TIME|DATE)\b.*/gi, '').trim();
      const cleaned = cleanBranchString(candidate);
      if (cleaned && !isNonBranchToken(cleaned) && !/TOTAL/i.test(cleaned)) {
        branchName = cleaned;
        confidencePoints += 15;
      }
    }
  }

  // If no branch on the BRANCH line, check known branches ONLY on non-TOTAL lines
  if (!branchName) {
    for (const known of KNOWN_BRANCH_NAMES) {
      const branchRegex = new RegExp(`\\b${known}\\b`, 'i');
      if (branchRegex.test(block)) {
        // Ensure the line containing this known name does NOT contain TOTAL
        const matchingLine = lines.find((l) => branchRegex.test(l));
        if (matchingLine && !/TOTAL|المجموع|الاجمالي|الإجمالي/i.test(matchingLine)) {
          branchName = known;
          confidencePoints += 15;
          break;
        }
      }
    }
  }

  // Fallback to global branch (which was also validated against TOTAL)
  if (!branchName && globalBranch && !/TOTAL|المجموع/i.test(globalBranch)) {
    branchName = globalBranch;
  }
  if (!branchName) {
    branchName = 'الفرع الرئيسي';
  }

  // 6. Working Date & Time
  let orderDate = globalDate || new Date().toISOString().split('T')[0];
  if (dateIsWorkingDate && globalDate) {
    // WORKING DATE is authoritative; never let the print date inside the block override it
    confidencePoints += 15;
  } else {
    const dateMatch = block.match(
      /(?:WORKING\s+DATE|DATE|تاريخ|التاريخ)\s*[:#-]?\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i
    );
    if (dateMatch) {
      orderDate = normalizeDateString(dateMatch[1]);
      confidencePoints += 15;
    }
  }

  let orderTime = '12:00';
  const timeMatch = block.match(
    /(?:CASH\s+TIME|TIME|وقت|الوقت)\s*[:#-]?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i
  );
  if (timeMatch) {
    orderTime = timeMatch[1].trim();
  }

  // 7. Customer Name: read strictly from NAM tag
  // RULE: NEVER set taker_name as customer_name
  let customerName = 'عميل بدون اسم';
  const rawCustomer = extractDelimitedField(
    block,
    /(?:NAM|NAME|العميل|اسم العميل|CUSTOMER)\s*[:#-]?\s*/i,
    /(?:\r?\n|(?=\b(?:PHONE|TEL|MOBILE|هاتف|موبايل|تليفون|BRANCH|الفرع|TAKER|CASHIER|كاشير|TOTAL|SUB|ORDER)\b))/i
  );

  if (rawCustomer) {
    let candidate = rawCustomer.replace(/[:*#=]/g, '').trim();
    candidate = candidate.replace(/\b(?:TOTAL|CASH|VISA|ORDER|BRANCH|TAKER)\b.*/gi, '').trim();
    if (
      candidate &&
      candidate.length >= 2 &&
      !/^(?:عميل|customer|delivery|takeaway)$/i.test(candidate) &&
      !/^\d+$/.test(candidate) &&
      !phoneMatches.includes(normalizePhoneNumber(candidate))
    ) {
      // NEVER set takerName as customerName
      if (!takerName || candidate.trim() !== takerName.trim()) {
        customerName = candidate;
        confidencePoints += 20;
      }
    }
  }

  // Double check: if customerName accidentally equals takerName, reset it
  if (takerName && customerName.trim() === takerName.trim()) {
    customerName = 'عميل بدون اسم';
  }

  // 8. Totals
  let totalAmount = 0;
  let subTotalAmount: number | undefined = undefined;

  const subTotalMatch = block.match(/SUB\.?\s*TOTAL\s*[:#-]?\s*(\d[\d,]*(?:\.\d+)?)/i);
  if (subTotalMatch) {
    subTotalAmount = parseFloat(subTotalMatch[1].replace(/,/g, '')) || undefined;
  }

  // The grand TOTAL is on its own line. A plain /TOTAL/ search would hit
  // "SUB. TOTAL" first, so anchor to the start of a line.
  const totalMatch = block.match(
    /^[ \t]*(?:TOTAL|الإجمالي|الاجمالي|المجموع)[ \t]*[:#-]?[ \t]*(\d[\d,]*(?:\.\d+)?)/im
  );
  if (totalMatch) {
    totalAmount = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
  } else if (subTotalAmount !== undefined) {
    totalAmount = subTotalAmount;
  }

  // 9. Items & Quantities
  // POS item rows look like:  "<qty> <name> <unit> <line> <net> <hh:mm AM>"
  const items: Array<{ itemName: string; quantity: number; price: number }> = [];
  const itemRowRegex =
    /^(\d+(?:\.\d+)?)\s+(.*?)\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*$/i;
  const headerLabelRegex =
    /^(?:ORDER|DELIVERY|TAKER|TIME|CASH|STATION|SUB|SALES|ITEMS|TOTAL|BRANCH|PHONE|CARD|NAM|CHANGES|BY|RESIRVATION|CALL|DETAIL|WORKING|DATE|PAGE)\b/i;
  let itemsSectionStart = 0;
  lines.forEach((l, idx) => {
    if (/^(?:TOTAL|الإجمالي|الاجمالي)\b/i.test(l)) itemsSectionStart = idx + 1;
  });

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i].match(itemRowRegex);
    if (!row) continue;

    const quantity = parseFloat(row[1]) || 1;
    const unitPrice = parseFloat(row[3].replace(/,/g, '')) || 0;
    let rawName = row[2].trim();
    const nameHasLetters = /[\u0600-\u06FFA-Za-z]/.test(rawName);

    // Safety net: if the name was printed on the line above, take it from there.
    if (!nameHasLetters && i - 1 >= itemsSectionStart) {
      const prev = lines[i - 1];
      if (
        prev &&
        !itemRowRegex.test(prev) &&
        !headerLabelRegex.test(prev) &&
        /[\u0600-\u06FFA-Za-z]/.test(prev)
      ) {
        rawName = prev.trim();
      }
    }
    if (!/[\u0600-\u06FFA-Za-z]/.test(rawName)) continue;

    items.push({ itemName: fixReversedArabicItemName(rawName), quantity, price: unitPrice });
  }

  // Fallback for pasted text in other layouts (no price/time columns)
  if (items.length === 0) {
    const itemLineRegex = /^(\d+(?:\.\d+)?)\s*(?:x|\*|\s)\s*([^\d\n]+?)\s+(\d+(?:\.\d+)?)$/i;
    for (const line of lines) {
      const match = line.match(itemLineRegex);
      if (match) {
        const itemName = match[2].trim();
        if (
          itemName &&
          !/TOTAL|SUB|CASH|TAKER|BRANCH|PHONE|ORDER|CHECK|VOID|NAM|DATE|TIME/i.test(itemName)
        ) {
          items.push({
            itemName: fixReversedArabicItemName(itemName),
            quantity: parseFloat(match[1]) || 1,
            price: parseFloat(match[3]) || 0,
          });
        }
      }
    }
  }

  return {
    orderNumber,
    branchName,
    customerName,
    customerPhone,
    altPhone,
    orderDate,
    orderTime,
    totalAmount,
    subTotalAmount,
    takerName,
    isVoid,
    voidReason,
    items,
    rawBlock: block,
    confidenceScore: Math.min(100, confidencePoints),
  };
}
