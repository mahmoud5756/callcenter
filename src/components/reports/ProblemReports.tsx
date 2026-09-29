import React, { useMemo, useState } from 'react';
import { Problem } from '../../types';
import { normalizePhoneNumber } from '../../services/algorithms';
import { formatProblemType } from '../../services/problemLabels';
import { PhoneNumber } from '../common/PhoneNumber';

export const STATUS_LABEL: Record<string, string> = {
  open: 'مفتوحة', escalated: 'مصعّدة للإدارة', in_progress: 'قيد المتابعة',
  resolved_on_call: 'تم الحل في المكالمة', pending_compensation: 'تعويض معلّق',
  compensated: 'تم التعويض', resolved: 'تم الحل', closed: 'مغلقة',
};
export const SOURCE_LABEL: Record<string, string> = { restaurant: 'مطعم / فرع', call_center: 'كول سنتر' };
export const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-');
export const noDetails = (d?: string) => (!d || d === 'بدون تفاصيل' ? '' : d);

interface Group { key: string; name: string; phone: string; items: Problem[]; restaurant: number; callCenter: number; }

export const buildGroups = (problems: Problem[]): Group[] => {
  const map = new Map<string, Group>();
  problems.forEach((p) => {
    const key = normalizePhoneNumber(p.customerPhone) || p.customerPhone || p.customerName;
    if (!map.has(key)) map.set(key, { key, name: p.customerName, phone: p.customerPhone, items: [], restaurant: 0, callCenter: 0 });
    const g = map.get(key)!;
    g.items.push(p);
    if (p.source === 'restaurant') g.restaurant++; else g.callCenter++;
  });
  return Array.from(map.values());
};

export const download = (rows: (string | number | undefined)[][], name: string) => {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const problemRow = (p: Problem) => [
  fmt(p.createdAt), p.orderNumber, p.customerName, p.customerPhone, p.branchName, SOURCE_LABEL[p.source] || p.source,
  formatProblemType(p.type), noDetails(p.details), STATUS_LABEL[p.status] || p.status, p.resolutionNotes, p.resolvedByUserName,
  p.compensationDetails || p.compensationType, p.reportedByUserName, p.oldOrderNumber, p.newOrderNumber,
];
export const HEAD = ['التاريخ', 'الأوردر', 'العميل', 'الهاتف', 'الفرع', 'المصدر', 'نوع المشكلة', 'التفاصيل', 'الحالة', 'تفاصيل الحل', 'تم الحل بواسطة', 'التعويض', 'سجّلها', 'الأوردر القديم', 'الأوردر الجديد'];

export const exportAllProblemsCsv = (problems: Problem[]) => download([HEAD, ...problems.map(problemRow)], 'all-problems');
export const exportDualSourceCsv = (problems: Problem[]) =>
  download([HEAD, ...buildGroups(problems).filter((g) => g.restaurant && g.callCenter).flatMap((g) => g.items.map(problemRow))], 'dual-source-customers');

export const AllProblemsReport: React.FC<{ problems: Problem[] }> = ({ problems }) => {
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const dualKeys = useMemo(() => new Set(buildGroups(problems).filter((g) => g.restaurant && g.callCenter).map((g) => g.key)), [problems]);
  const rows = useMemo(() => problems
    .filter((p) => (source === 'all' || p.source === source) &&
      (!q || [p.customerName, p.customerPhone, p.orderNumber, p.details, p.resolutionNotes, formatProblemType(p.type)].some((v) => (v || '').includes(q))))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [problems, q, source]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h3 className="font-bold text-slate-900 text-base">سجل كل المشاكل ({rows.length})</h3>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="border border-slate-200 rounded-xl px-3 py-2 text-xs" />
          <select value={source} onChange={(e) => setSource(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white">
            <option value="all">كل المصادر</option><option value="restaurant">مطعم / فرع</option><option value="call_center">كول سنتر</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs min-w-[900px]">
          <thead><tr className="text-slate-500 border-b border-slate-100">
            {['التاريخ', 'الأوردر / العميل', 'الفرع', 'المصدر', 'نوع المشكلة والتفاصيل', 'الحالة', 'تفاصيل الحل'].map((h) => <th key={h} className="p-2 font-bold">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const key = normalizePhoneNumber(p.customerPhone) || p.customerPhone || p.customerName;
              return (
                <tr key={p.id} className="border-b border-slate-50 align-top">
                  <td className="p-2 whitespace-nowrap text-slate-500">{fmt(p.createdAt)}</td>
                  <td className="p-2"><div className="font-bold">{p.customerName}</div><div className="text-slate-500">#{p.orderNumber}</div><PhoneNumber phone={p.customerPhone} />
                    {dualKeys.has(key) && <div className="mt-1 inline-block bg-amber-100 text-amber-800 font-bold rounded px-1.5 py-0.5 text-[10px]">⚠ مشاكل من المطعم والكول سنتر</div>}</td>
                  <td className="p-2">{p.branchName}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-0.5 font-bold ${p.source === 'restaurant' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{SOURCE_LABEL[p.source]}</span></td>
                  <td className="p-2 max-w-xs"><div className="font-bold">{formatProblemType(p.type)}</div><div className="whitespace-pre-wrap text-slate-600">{noDetails(p.details) || <span className="text-slate-400 italic">لم تُسجَّل تفاصيل</span>}</div></td>
                  <td className="p-2 whitespace-nowrap">{STATUS_LABEL[p.status] || p.status}</td>
                  <td className="p-2 max-w-xs whitespace-pre-wrap text-emerald-800">{p.resolutionNotes || '-'}{p.resolvedByUserName && <div className="text-slate-500">{p.resolvedByUserName}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-slate-400">لا توجد مشاكل</div>}
      </div>
    </div>
  );
};

export const DualSourceReport: React.FC<{ problems: Problem[] }> = ({ problems }) => {
  const groups = useMemo(() => buildGroups(problems).filter((g) => g.restaurant && g.callCenter).sort((a, b) => b.items.length - a.items.length), [problems]);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div>
        <h3 className="font-bold text-slate-900 text-base">عملاء عندهم مشاكل من المطعم والكول سنتر ({groups.length})</h3>
        <p className="text-xs text-slate-500 mt-0.5">العميل هنا اتضرر من الفرع وكمان من طريقة التعامل معاه، فهو الأولى بالمتابعة الإدارية.</p>
      </div>
      {groups.length === 0 && <div className="p-8 text-center text-slate-400">مفيش عملاء عندهم مشاكل من الجهتين</div>}
      {groups.map((g) => (
        <div key={g.key} className="border border-amber-200 bg-amber-50/40 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div><span className="font-black text-sm">{g.name}</span> <span className="text-xs"><PhoneNumber phone={g.phone} /></span></div>
            <div className="flex gap-2 text-[11px] font-bold">
              <span className="bg-orange-100 text-orange-800 rounded-full px-2 py-0.5">مطعم: {g.restaurant}</span>
              <span className="bg-red-100 text-red-800 rounded-full px-2 py-0.5">كول سنتر: {g.callCenter}</span>
            </div>
          </div>
          {[...g.items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map((p) => (
            <div key={p.id} className="text-xs bg-white rounded-lg border border-slate-100 p-2 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`rounded-full px-2 py-0.5 font-bold ${p.source === 'restaurant' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{SOURCE_LABEL[p.source]}</span>
                <span className="font-bold">{formatProblemType(p.type)}</span>
                <span className="text-slate-500">فرع {p.branchName} · #{p.orderNumber} · {fmt(p.createdAt)}</span>
                <span className="mr-auto font-bold">{STATUS_LABEL[p.status] || p.status}</span>
              </div>
              {noDetails(p.details) && <div className="text-slate-600 whitespace-pre-wrap mt-1">{p.details}</div>}
              {p.resolutionNotes && <div className="text-emerald-800 whitespace-pre-wrap mt-1">الحل: {p.resolutionNotes}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const exportCustomerProblemsCsv = (problems: Problem[]) => {
  const groups = buildGroups(problems).sort((a, b) => b.items.length - a.items.length);
  download([['إجمالي مشاكل العميل', 'مشاكل مطعم', 'مشاكل كول سنتر', ...HEAD],
    ...groups.flatMap((g) => g.items.map((p) => [g.items.length, g.restaurant, g.callCenter, ...problemRow(p)]))], 'customers-problems');
};

export const CustomerProblemsReport: React.FC<{ problems: Problem[] }> = ({ problems }) => {
  const [onlyDual, setOnlyDual] = useState(false);
  const [q, setQ] = useState('');
  const groups = useMemo(() => buildGroups(problems)
    .filter((g) => (!onlyDual || (g.restaurant && g.callCenter)) && (!q || g.name.includes(q) || g.phone.includes(q)))
    .sort((a, b) => b.items.length - a.items.length), [problems, onlyDual, q]);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900 text-base">مشاكل كل عميل ({groups.length} عميل)</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم" className="border border-slate-200 rounded-xl px-3 py-2 text-xs" />
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={onlyDual} onChange={(e) => setOnlyDual(e.target.checked)} /> مشاكل من المطعم والكول سنتر معاً
          </label>
        </div>
      </div>
      {groups.map((g) => {
        const dual = g.restaurant > 0 && g.callCenter > 0;
        return (
          <details key={g.key} className={`rounded-xl border ${dual ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
            <summary className="cursor-pointer p-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-black text-sm">{g.name}</span>
              <span className="font-mono text-slate-500" dir="ltr">{g.phone}</span>
              <span className="bg-slate-100 rounded-full px-2 py-0.5 font-bold">{g.items.length} مشكلة</span>
              <span className="bg-orange-100 text-orange-800 rounded-full px-2 py-0.5 font-bold">مطعم: {g.restaurant}</span>
              <span className="bg-red-100 text-red-800 rounded-full px-2 py-0.5 font-bold">كول سنتر: {g.callCenter}</span>
              {dual && <span className="bg-amber-200 text-amber-900 rounded-full px-2 py-0.5 font-bold">⚠ من الجهتين</span>}
            </summary>
            <div className="p-3 pt-0 space-y-2">
              {[...g.items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map((p) => (
                <div key={p.id} className="text-xs bg-white rounded-lg border border-slate-100 p-2 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${p.source === 'restaurant' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{SOURCE_LABEL[p.source]}</span>
                    <span className="font-bold">{formatProblemType(p.type)}</span>
                    <span className="text-slate-500">فرع {p.branchName} · #{p.orderNumber} · {fmt(p.createdAt)}</span>
                    <span className="mr-auto font-bold">{STATUS_LABEL[p.status] || p.status}</span>
                  </div>
                  {noDetails(p.details) && <div className="text-slate-600 whitespace-pre-wrap mt-1">{p.details}</div>}
                  {p.resolutionNotes && <div className="text-emerald-800 whitespace-pre-wrap mt-1">الحل: {p.resolutionNotes}</div>}
                </div>
              ))}
            </div>
          </details>
        );
      })}
      {groups.length === 0 && <div className="p-8 text-center text-slate-400">لا يوجد عملاء</div>}
    </div>
  );
};
