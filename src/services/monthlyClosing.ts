import { supabase, transformOrderFromDb, transformProblemFromDb, transformCallFromDb } from './supabase';
import { cleanBranchName, formatProblemType } from './problemLabels';
import { formatCompensationType } from './compensationHelpers';
import { buildLinkedReorderSet, isProblemResolved, isVoidResolved } from './archiveRules';
import type {
  ClosingBucket,
  CustomerCall,
  MonthSnapshot,
  MonthlyClosing,
  Order,
  Problem,
  User,
} from '../types';

export interface MonthData {
  orders: Order[];
  problems: Problem[];
  calls: CustomerCall[];
}

const pad = (n: number) => String(n).padStart(2, '0');

export const currentMonthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** [start, nextStart) for a YYYY-MM key, both as local-date strings and as ISO timestamps */
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    startDate: `${y}-${pad(m)}-01`,
    nextDate: `${nextY}-${pad(nextM)}-01`,
    startTs: new Date(y, m - 1, 1).toISOString(),
    nextTs: new Date(nextY, nextM - 1, 1).toISOString(),
  };
};

const fetchPaged = async (build: () => any, batch = 1000): Promise<any[]> => {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + batch - 1);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < batch) break;
    from += batch;
  }
  return all;
};

/** Loads one whole month straight from the database (not from the 45-day in-memory window). */
export const fetchMonthData = async (month: string, users: User[]): Promise<MonthData> => {
  const r = monthRange(month);
  const pMap = new Map<string, string>();
  users.forEach((u) => pMap.set(u.id, u.name));

  const orderRows = await fetchPaged(() =>
    supabase
      .from('orders')
      .select('*')
      .gte('order_date', r.startDate)
      .lt('order_date', r.nextDate)
      .order('id', { ascending: true })
  );
  const orders = orderRows.map((row) => transformOrderFromDb(row, pMap));
  const oMap = new Map<string, Order>();
  orders.forEach((o) => oMap.set(o.id, o));

  const problemRows = await fetchPaged(() =>
    supabase
      .from('problems')
      .select('*')
      .gte('created_at', r.startTs)
      .lt('created_at', r.nextTs)
      .order('id', { ascending: true })
  );
  const problems = problemRows.map((row) => transformProblemFromDb(row, pMap, oMap));

  const callRows = await fetchPaged(() =>
    supabase
      .from('customer_calls')
      .select('*')
      .gte('created_at', r.startTs)
      .lt('created_at', r.nextTs)
      .order('id', { ascending: true })
  );
  const calls = callRows.map((row) => transformCallFromDb(row, pMap, oMap));

  return { orders, problems, calls };
};

const bucketize = (
  map: Map<string, { count: number; amount: number }>,
  labelOf: (k: string) => string = (k) => k
): ClosingBucket[] =>
  Array.from(map.entries())
    .map(([key, v]) => ({ key, label: labelOf(key), count: v.count, amount: v.amount }))
    .sort((a, b) => b.count - a.count);

const bump = (m: Map<string, { count: number; amount: number }>, key: string, amount = 0) => {
  const cur = m.get(key) || { count: 0, amount: 0 };
  cur.count += 1;
  cur.amount += amount;
  m.set(key, cur);
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

const IGNORED_BRANCH = /TOTAL|المجموع|الاجمالي|الإجمالي/i;

const VOID_RESPONSIBLE_LABEL: Record<string, string> = {
  restaurant: 'المطعم / الفرع',
  call_center: 'الكول سنتر',
  courier: 'الدليفري',
  customer: 'العميل',
};

export const computeMonthSnapshot = (month: string, data: MonthData): MonthSnapshot => {
  const { orders, problems, calls } = data;
  const valid = orders.filter((o) => !o.isVoid);
  const voids = orders.filter((o) => o.isVoid);
  const totalSales = valid.reduce((a, o) => a + (o.totalAmount || 0), 0);
  const voidAmount = voids.reduce((a, o) => a + (o.totalAmount || 0), 0);

  const contacted = valid.filter((o) => o.status !== 'pending' && o.status !== 'in_progress').length;

  // ---- problems
  const resolvedProblems = problems.filter(isProblemResolved);
  const resolvedWithTime = resolvedProblems.filter((p) => p.resolvedAt && p.createdAt);
  const avgResolutionHours = resolvedWithTime.length
    ? Math.round(
        (resolvedWithTime.reduce(
          (a, p) => a + Math.max(0, new Date(p.resolvedAt!).getTime() - new Date(p.createdAt).getTime()),
          0
        ) /
          resolvedWithTime.length /
          3_600_000) *
          10
      ) / 10
    : 0;
  const byType = new Map<string, { count: number; amount: number }>();
  problems.forEach((p) => bump(byType, p.type || 'other'));

  // ---- compensation
  const comps = problems.filter((p) => p.hasCompensation || p.compensationType);
  const compByType = new Map<string, { count: number; amount: number }>();
  comps.forEach((p) => bump(compByType, p.compensationType || 'custom'));

  // ---- voids
  const linked = buildLinkedReorderSet(orders);
  const voidsResolved = voids.filter((o) => isVoidResolved(o, linked));
  const voidsRecovered = voids.filter((o) => o.voidFollowUpStatus === 'recovered' || linked.has(o.id));
  const byResponsible = new Map<string, { count: number; amount: number }>();
  const byReason = new Map<string, { count: number; amount: number }>();
  voids.forEach((o) => {
    bump(byResponsible, o.voidResponsible || 'restaurant', o.totalAmount || 0);
    bump(byReason, (o.voidReason || 'غير محدد').trim() || 'غير محدد', o.totalAmount || 0);
  });

  // ---- branches
  const branchMap = new Map<string, { orders: number; voids: number; problems: number; sales: number }>();
  const branchRow = (name: string) => {
    const k = cleanBranchName(name);
    if (!branchMap.has(k)) branchMap.set(k, { orders: 0, voids: 0, problems: 0, sales: 0 });
    return branchMap.get(k)!;
  };
  orders.forEach((o) => {
    if (IGNORED_BRANCH.test(o.branchName)) return;
    const b = branchRow(o.branchName);
    if (o.isVoid) b.voids += 1;
    else {
      b.orders += 1;
      b.sales += o.totalAmount || 0;
    }
  });
  problems.forEach((p) => {
    if (IGNORED_BRANCH.test(p.branchName)) return;
    branchRow(p.branchName).problems += 1;
  });

  // ---- agents
  const agentMap = new Map<string, { calls: number; problemsLogged: number }>();
  const agentRow = (name: string) => {
    if (!agentMap.has(name)) agentMap.set(name, { calls: 0, problemsLogged: 0 });
    return agentMap.get(name)!;
  };
  calls.forEach((c) => (agentRow(c.userName || 'موظف').calls += 1));
  problems.forEach((p) => (agentRow(p.reportedByUserName || 'خدمة العملاء').problemsLogged += 1));

  const callCount = (r: string) => calls.filter((c) => c.callResult === r).length;

  return {
    month,
    orders: {
      total: orders.length,
      valid: valid.length,
      voids: voids.length,
      totalSales: Math.round(totalSales),
      voidAmount: Math.round(voidAmount),
      avgOrderValue: valid.length ? Math.round(totalSales / valid.length) : 0,
    },
    calls: {
      total: calls.length,
      ok: callCount('tamam'),
      problem: callCount('problem'),
      noAnswer: callCount('no_answer'),
      unavailable: callCount('unavailable'),
      callback: callCount('callback_requested'),
    },
    contactedRate: pct(contacted, valid.length),
    problems: {
      total: problems.length,
      open: problems.length - resolvedProblems.length,
      resolved: resolvedProblems.length,
      escalated: problems.filter((p) => p.status === 'escalated' || p.isEscalated).length,
      callCenter: problems.filter((p) => p.source === 'call_center').length,
      restaurant: problems.filter((p) => p.source === 'restaurant').length,
      avgResolutionHours,
      byType: bucketize(byType, formatProblemType),
    },
    compensation: {
      total: comps.length,
      pending: comps.filter((p) => p.compensationStatus === 'pending_compensation').length,
      applied: comps.filter((p) => p.compensationStatus === 'compensated').length,
      byType: bucketize(compByType, formatCompensationType),
    },
    voids: {
      total: voids.length,
      resolved: voidsResolved.length,
      pending: voids.length - voidsResolved.length,
      recovered: voidsRecovered.length,
      recoveryRate: pct(voidsRecovered.length, voids.length),
      byResponsible: bucketize(byResponsible, (k) => VOID_RESPONSIBLE_LABEL[k] || k),
      byReason: bucketize(byReason).slice(0, 10),
    },
    byBranch: Array.from(branchMap.entries())
      .map(([branch, v]) => ({ branch, ...v, sales: Math.round(v.sales) }))
      .sort((a, b) => b.orders - a.orders),
    byAgent: Array.from(agentMap.entries())
      .map(([agent, v]) => ({ agent, ...v }))
      .sort((a, b) => b.calls - a.calls),
  };
};

export const computeCarriedOver = (data: MonthData) => {
  const linked = buildLinkedReorderSet(data.orders);
  return {
    openProblems: data.problems.filter((p) => !isProblemResolved(p)).length,
    pendingVoids: data.orders.filter((o) => o.isVoid && !isVoidResolved(o, linked)).length,
    pendingCompensations: data.problems.filter((p) => p.compensationStatus === 'pending_compensation').length,
  };
};

// ---------------------------------------------------------------- persistence

const fromRow = (row: any): MonthlyClosing => ({
  id: row.id,
  month: row.month,
  status: 'closed',
  snapshot: row.snapshot as MonthSnapshot,
  carriedOver: {
    openProblems: row.carried_over?.openProblems ?? 0,
    pendingVoids: row.carried_over?.pendingVoids ?? 0,
    pendingCompensations: row.carried_over?.pendingCompensations ?? 0,
  },
  notes: row.notes || undefined,
  closedByName: row.closed_by_name || '',
  closedAt: row.closed_at,
});

export const listClosings = async (): Promise<MonthlyClosing[]> => {
  const { data, error } = await supabase
    .from('monthly_closings')
    .select('*')
    .order('month', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
};

export const saveClosing = async (
  snapshot: MonthSnapshot,
  carriedOver: MonthlyClosing['carriedOver'],
  notes: string,
  user: User
): Promise<void> => {
  const { error } = await supabase.from('monthly_closings').upsert(
    {
      month: snapshot.month,
      status: 'closed',
      snapshot,
      carried_over: carriedOver,
      notes: notes.trim() || null,
      closed_by: user.id,
      closed_by_name: user.name,
      closed_at: new Date().toISOString(),
    },
    { onConflict: 'month' }
  );
  if (error) throw new Error(error.message);
};

export const reopenMonth = async (month: string): Promise<void> => {
  const { error } = await supabase.from('monthly_closings').delete().eq('month', month);
  if (error) throw new Error(error.message);
};

// ---------------------------------------------------------------- CSV export (Excel-friendly, UTF-8 BOM)

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export const monthDataToCsv = (data: MonthData): string => {
  let csv = '\uFEFF';
  csv += 'نوع,رقم الأوردر,العميل,الهاتف,الفرع,التاريخ,الحالة,التفاصيل\n';
  const linked = buildLinkedReorderSet(data.orders);
  data.orders
    .filter((o) => o.isVoid)
    .forEach((o) => {
      csv +=
        ['VOID', o.orderNumber, o.customerName, o.customerPhone, cleanBranchName(o.branchName), o.orderDate,
          isVoidResolved(o, linked) ? 'محلول' : 'غير محلول', `${o.voidReason || ''} ${o.voidNotes || ''}`.trim()]
          .map(csvCell)
          .join(',') + '\n';
    });
  data.problems.forEach((p) => {
    csv +=
      ['مشكلة', p.orderNumber, p.customerName, p.customerPhone, cleanBranchName(p.branchName),
        p.createdAt.slice(0, 10), isProblemResolved(p) ? 'محلولة' : 'مفتوحة',
        `${formatProblemType(p.type)} - ${p.details}`]
        .map(csvCell)
        .join(',') + '\n';
  });
  return csv;
};

export const downloadText = (filename: string, content: string, mime = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
