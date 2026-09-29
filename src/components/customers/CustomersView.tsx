import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SearchIcon, PhoneCallIcon } from '../icons/SvgIcons';
import { PhoneNumber } from '../common/PhoneNumber';
import { STATUS_LABEL, SOURCE_LABEL, noDetails, download, problemRow, HEAD } from '../reports/ProblemReports';
import { normalizePhoneNumber } from '../../services/algorithms';
import { formatProblemType } from '../../services/problemLabels';
import { Order, CustomerCall, Problem } from '../../types';

interface CustomerProfile {
  key: string;
  name: string;
  phone: string;
  orders: Order[];
  calls: CustomerCall[];
  problems: Problem[];
  restaurant: number;
  callCenter: number;
  totalSpent: number;
  openProblems: number;
  problemRate: number;
  lastContact?: string;
  tags: string[];
}

const CALL_LABEL: Record<string, string> = { tamam: 'تمام', problem: 'مشكلة', no_answer: 'لم يرد', unavailable: 'الرقم غير متاح', callback_requested: 'طلب معاودة الاتصال' };
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

export const CustomersView: React.FC = () => {
  const { allOrders, customerCalls, problems, setActiveCallModalOrderId } = useApp();
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [onlyProblem, setOnlyProblem] = useState(false);
  const [onlyDual, setOnlyDual] = useState(false);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerProfile>();
    const get = (phone: string, name: string) => {
      const key = normalizePhoneNumber(phone) || phone;
      if (!map.has(key)) map.set(key, { key, name, phone, orders: [], calls: [], problems: [], restaurant: 0, callCenter: 0, totalSpent: 0, openProblems: 0, problemRate: 0, tags: [] });
      return map.get(key)!;
    };
    allOrders.forEach((o) => { const c = get(o.customerPhone, o.customerName); c.orders.push(o); if (!o.isVoid) c.totalSpent += o.totalAmount; });
    customerCalls.forEach((x) => get(x.customerPhone, x.customerName).calls.push(x));
    problems.forEach((p) => get(p.customerPhone, p.customerName).problems.push(p));
    return Array.from(map.values()).map((c) => {
      c.openProblems = c.problems.filter((p) => !['resolved', 'closed', 'compensated', 'resolved_on_call'].includes(p.status)).length;
      c.restaurant = c.problems.filter((p) => p.source === 'restaurant').length;
      c.callCenter = c.problems.length - c.restaurant;
      // share of this customer's orders that had at least one problem (never above 100%)
      c.problemRate = c.orders.length ? Math.min(100, Math.round((new Set(c.problems.map((p) => p.orderId)).size / c.orders.length) * 100)) : 0;
      c.lastContact = c.calls.map((x) => x.createdAt).sort().pop();
      if (c.orders.length >= 5) c.tags.push('عميل متكرر');
      if (c.totalSpent >= 5000) c.tags.push('VIP');
      if (c.problems.length >= 3) c.tags.push('كثير الشكاوى');
      if (c.restaurant > 0 && c.callCenter > 0) c.tags.push('مشاكل من المطعم والكول سنتر');
      if (c.problems.some((p) => p.status === 'pending_compensation')) c.tags.push('تعويض معلّق');
      return c;
    }).sort((a, b) => b.openProblems - a.openProblems || b.orders.length - a.orders.length);
  }, [allOrders, customerCalls, problems]);

  const filtered = customers.filter((c) => {
    const q = query.trim();
    const match = !q || c.name.includes(q) || c.phone.includes(q) || c.key.includes(normalizePhoneNumber(q) || q);
    return match && (!onlyProblem || c.openProblems > 0) && (!onlyDual || (c.restaurant > 0 && c.callCenter > 0));
  });

  const selected = customers.find((c) => c.key === selectedKey);

  const timeline = useMemo(() => {
    if (!selected) return [];
    return [
      ...selected.orders.map((o) => ({ at: o.createdAt, type: 'طلب', text: `طلب #${o.orderNumber} - ${o.branchName} - ${o.totalAmount} ج${o.isVoid ? ' (فويد)' : ''}` })),
      ...selected.calls.map((x) => ({ at: x.createdAt, type: 'مكالمة', text: `${x.userName}: ${CALL_LABEL[x.callResult] || x.callResult}${x.notes ? ' - ' + x.notes : ''}` })),
      ...selected.problems.map((p) => ({ at: p.createdAt, type: 'مشكلة', text: `${SOURCE_LABEL[p.source] || ''} - ${formatProblemType(p.type)} (${STATUS_LABEL[p.status] || p.status})${noDetails(p.details) ? ' - ' + p.details : ''}` })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [selected]);

  const badge = { 'طلب': 'bg-blue-100 text-blue-700', 'مكالمة': 'bg-green-100 text-green-700', 'مشكلة': 'bg-red-100 text-red-700' } as Record<string, string>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <SearchIcon size={16} className="absolute right-3 top-3 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم التليفون"
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={onlyProblem} onChange={(e) => setOnlyProblem(e.target.checked)} /> عندهم مشاكل مفتوحة فقط
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-amber-800">
          <input type="checkbox" checked={onlyDual} onChange={(e) => setOnlyDual(e.target.checked)} /> مشاكل من المطعم والكول سنتر معاً
        </label>
        <span className="text-xs text-slate-500">{filtered.length} عميل</span>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
          {filtered.slice(0, 200).map((c) => (
            <button key={c.key} onClick={() => setSelectedKey(c.key)}
              className={`w-full text-right p-3 rounded-xl border bg-white transition ${selectedKey === c.key ? 'border-red-500 ring-1 ring-red-200' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex justify-between items-start">
                <div className="font-bold text-sm">{c.name}</div>
                {c.openProblems > 0 && <span className="text-[11px] font-bold bg-red-500 text-white rounded-full px-2">{c.openProblems} مفتوحة</span>}
              </div>
              <div className="font-mono text-xs text-slate-500" dir="ltr">{c.phone}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {c.tags.map((t) => <span key={t} className="text-[10px] font-bold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">{t}</span>)}
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {!selected ? (
            <div className="p-10 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">اختار عميل من القايمة لعرض ملفه</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h2 className="font-black text-lg">{selected.name}</h2>
                  <div className="text-sm text-slate-500"><PhoneNumber phone={selected.phone} /></div>
                </div>
                <button disabled={!selected.orders.length}
                  onClick={() => setActiveCallModalOrderId([...selected.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].id)}
                  className="flex items-center gap-2 bg-red-600 text-white text-sm font-bold rounded-xl px-3 py-2 disabled:opacity-40">
                  <PhoneCallIcon size={16} /> اتصال بالعميل
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[['الطلبات', selected.orders.length], ['إجمالي الإنفاق', `${selected.totalSpent} ج`], ['أوردرات فيها مشاكل', `${selected.problemRate}%`], ['آخر تواصل', selected.lastContact ? fmt(selected.lastContact) : '-']].map(([l, v]) => (
                  <div key={l as string} className="bg-slate-50 rounded-lg p-2"><div className="text-[11px] text-slate-500">{l}</div><div className="font-black text-sm">{v}</div></div>
                ))}
              </div>
              {selected.problems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm">مشاكل العميل ({selected.problems.length})</h3>
                    <button onClick={() => download([HEAD, ...selected.problems.map(problemRow)], `customer-${selected.key}`)}
                      className="text-xs font-bold bg-slate-900 text-white rounded-lg px-3 py-1.5">تصدير مشاكل العميل CSV</button>
                  </div>
                  {selected.restaurant > 0 && selected.callCenter > 0 && (
                    <div className="text-xs font-bold bg-amber-100 text-amber-900 rounded-lg p-2">
                      ⚠ العميل عنده مشاكل من المطعم ({selected.restaurant}) ومن الكول سنتر ({selected.callCenter}) معاً
                    </div>
                  )}
                  {selected.problems.map((p) => (
                    <div key={p.id} className="border border-slate-200 rounded-lg p-2 text-xs [overflow-wrap:anywhere]">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${p.source === 'restaurant' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{SOURCE_LABEL[p.source]}</span>
                        <span className="font-bold">{formatProblemType(p.type)}</span>
                        <span className="mr-auto font-bold">{STATUS_LABEL[p.status] || p.status}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">فرع {p.branchName} · #{p.orderNumber} · {fmt(p.createdAt)}{p.oldOrderNumber && ` · الأوردر القديم #${p.oldOrderNumber}`}{p.newOrderNumber && ` ← الجديد #${p.newOrderNumber}`}</div>
                      {noDetails(p.details) && <div className="text-slate-700 whitespace-pre-wrap mt-1">{p.details}</div>}
                      {p.resolutionNotes && <div className="text-emerald-800 whitespace-pre-wrap mt-1">الحل: {p.resolutionNotes}</div>}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <h3 className="font-bold text-sm mb-2">السجل الزمني</h3>
                <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                  {timeline.map((e, i) => (
                    <div key={i} className="flex gap-2 text-xs items-start">
                      <span className={`shrink-0 rounded px-2 py-0.5 font-bold ${badge[e.type]}`}>{e.type}</span>
                      <div className="flex-1">{e.text}<div className="text-[10px] text-slate-400">{fmt(e.at)}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
