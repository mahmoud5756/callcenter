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

const digits = (v?: string) => (v || '').replace(/\D/g, '').slice(-10);
const stamp = (o: Order) => `${o.orderDate} ${o.orderTime || '00:00'}`;

/**
 * A void counts as "recovered" when a replacement order exists: either explicitly linked
 * (replacementForOrderId) or the same customer phone ordered again AFTER the void.
 */
export const findReorderFor = (voidOrder: Order, orders: Order[]): Order | undefined => {
  const phone = digits(voidOrder.customerPhone);
  return orders.find(
    (o) =>
      !o.isVoid &&
      o.id !== voidOrder.id &&
      (o.replacementForOrderId === voidOrder.id ||
        (phone.length >= 8 && digits(o.customerPhone) === phone && stamp(o) >= stamp(voidOrder)))
  );
};

/** ids of void orders that already have a replacement (re-order) */
export const buildLinkedReorderSet = (orders: Order[]): Set<string> => {
  const s = new Set<string>();
  const byPhone = new Map<string, Order[]>();
  orders.forEach((o) => {
    if (o.isVoid) return;
    if (o.replacementForOrderId) s.add(o.replacementForOrderId);
    const k = digits(o.customerPhone);
    if (k.length >= 8) (byPhone.get(k) || byPhone.set(k, []).get(k)!).push(o);
  });
  orders.forEach((v) => {
    if (!v.isVoid || s.has(v.id)) return;
    const k = digits(v.customerPhone);
    if (k.length < 8) return;
    if ((byPhone.get(k) || []).some((o) => stamp(o) >= stamp(v))) s.add(v.id);
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
