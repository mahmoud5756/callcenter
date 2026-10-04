import { Problem } from '../types';

export interface ProblemGroup {
  /** id of the primary row - used as the ticket id in the UI */
  id: string;
  primary: Problem;
  /** every problem row logged in the same complaint / call */
  items: Problem[];
  /** the row that carries the compensation (if any) */
  compItem?: Problem;
}

const digits = (v: string) => (v || '').replace(/\D/g, '');
// Rows of one complaint are inserted one after another, so their created_at differ by milliseconds.
const WINDOW_MS = 2 * 60 * 1000;

const customerKey = (p: Problem) => (p.orderId ? `o:${p.orderId}` : `p:${digits(p.customerPhone) || p.customerName}`);

/**
 * One complaint (a single call / single "تسجيل شكوى") can contain several problems.
 * They are stored as separate rows, so we merge them back into ONE ticket here:
 * same order (or same phone for orders-less complaints) + same agent + logged within 2 minutes.
 */
export const groupProblems = (problems: Problem[]): ProblemGroup[] => {
  const sorted = [...problems].sort(
    (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id)
  );
  const groups: Problem[][] = [];
  const open = new Map<string, Problem[]>(); // key -> most recent group for that key

  for (const p of sorted) {
    const key = `${customerKey(p)}|${p.reportedByUserId}`;
    const g = open.get(key);
    const t = new Date(p.createdAt).getTime();
    if (g && Math.abs(new Date(g[0].createdAt).getTime() - t) <= WINDOW_MS) {
      g.push(p);
    } else {
      const ng = [p];
      groups.push(ng);
      open.set(key, ng);
    }
  }

  return groups.map((items) => {
    // oldest first inside the ticket = the order the agent picked them
    items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    const compItem = items.find((i) => i.hasCompensation || i.compensationType);
    const primary = compItem || items[0];
    return { id: primary.id, primary, items, compItem };
  });
};
