import type { Order, Problem } from '../types';

/**
 * What counts as "resolved" - resolved items leave the live lists and move to the archive tabs,
 * so the screens agents work on only show what still needs follow-up.
 */

const RESOLVED_PROBLEM_STATUSES = new Set(['resolved_on_call', 'resolved', 'closed', 'compensated']);

export const isProblemResolved = (p: Problem): boolean =>
  RESOLVED_PROBLEM_STATUSES.has(p.status) && p.compensationStatus !== 'pending_compensation';

const RESOLVED_VOID_STATUSES = new Set(['recovered', 'resolved', 'compensated']);

/** A void is finished when its follow-up was closed (recovered / resolved / compensated) or a re-order is linked to it. */
export const isVoidResolved = (o: Order, linkedReorderIds?: Set<string>): boolean =>
  Boolean(
    (o.voidFollowUpStatus && RESOLVED_VOID_STATUSES.has(o.voidFollowUpStatus)) ||
      (linkedReorderIds && linkedReorderIds.has(o.id))
  );

/** ids of void orders that already have a replacement (re-order) linked to them */
export const buildLinkedReorderSet = (orders: Order[]): Set<string> => {
  const s = new Set<string>();
  orders.forEach((o) => {
    if (!o.isVoid && o.replacementForOrderId) s.add(o.replacementForOrderId);
  });
  return s;
};

export const monthOf = (iso?: string): string => (iso ? iso.slice(0, 7) : '');

export const formatMonthLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return `${names[m - 1]} ${y}`;
};
