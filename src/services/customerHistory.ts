import { Problem } from '../types';
import { ParsedOrderDraft } from './pdfParser';

/** Arabic-Indic digits -> latin, digits only, compared by the last 10 digits so
 *  "0122...", "+20122..." and "20122..." all match the same customer. */
export const phoneKey = (phone?: string): string => {
  const digits = (phone || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

/** All previous problems of a customer (matched on any of the given phones), newest first. */
export const findCustomerProblems = (
  problems: Problem[],
  phones: Array<string | undefined>,
  excludeProblemIds: string[] = []
): Problem[] => {
  const keys = new Set(phones.map(phoneKey).filter((k) => k.length >= 8));
  if (keys.size === 0) return [];
  return problems
    .filter((p) => keys.has(phoneKey(p.customerPhone)) && !excludeProblemIds.includes(p.id))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
};

export interface ReturningCustomer {
  key: string;
  name: string;
  phone: string;
  orderNumbers: string[];
  problems: Problem[];
}

/** Customers in an uploaded file who already have problems on record. */
export const findReturningCustomers = (
  drafts: ParsedOrderDraft[],
  problems: Problem[]
): ReturningCustomer[] => {
  const byKey = new Map<string, ReturningCustomer>();
  for (const d of drafts) {
    const keys = [phoneKey(d.customerPhone), phoneKey(d.altPhone)].filter((k) => k.length >= 8);
    if (keys.length === 0) continue;
    const key = keys[0];
    const existing = byKey.get(key);
    if (existing) {
      existing.orderNumbers.push(d.orderNumber);
      continue;
    }
    const history = findCustomerProblems(problems, [d.customerPhone, d.altPhone]);
    if (history.length === 0) continue;
    byKey.set(key, {
      key,
      name: d.customerName,
      phone: d.customerPhone,
      orderNumbers: [d.orderNumber],
      problems: history,
    });
  }
  return Array.from(byKey.values()).sort((a, b) => b.problems.length - a.problems.length);
};
