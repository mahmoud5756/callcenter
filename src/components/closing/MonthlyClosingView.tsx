import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  CalendarIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  DownloadIcon,
  LockIcon,
  UnlockIcon,
  RefreshCwIcon,
  TrendingUpIcon,
} from '../icons/SvgIcons';
import type { MonthSnapshot, MonthlyClosing } from '../../types';
import {
  MonthData,
  computeCarriedOver,
  computeMonthSnapshot,
  currentMonthKey,
  downloadText,
  fetchMonthData,
  listClosings,
  monthDataToCsv,
  reopenMonth,
  saveClosing,
} from '../../services/monthlyClosing';
import { formatMonthLabel } from '../../services/archiveRules';

const num = (n: number) => n.toLocaleString('en-US');

/** the last 13 months, newest first */
const monthOptions = (): string[] => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 13; i++) {
    out.push(currentMonthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

interface MetricRow {
  id: string;
  label: string;
  get: (s: MonthSnapshot) => number;
  /** true = higher is better, false = lower is better, null = neutral */
  better: boolean | null;
  suffix?: string;
}

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

const METRICS: MetricRow[] = [
  { id: 'valid', label: 'الأوردرات (بدون VOID)', get: (s) => s.orders.valid, better: true },
  { id: 'sales', label: 'إجمالي المبيعات', get: (s) => s.orders.totalSales, better: true },
  { id: 'avg', label: 'متوسط قيمة الأوردر', get: (s) => s.orders.avgOrderValue, better: true },
  { id: 'calls', label: 'عدد المكالمات', get: (s) => s.calls.total, better: null },
  { id: 'reach', label: 'نسبة الوصول للعملاء', get: (s) => s.contactedRate, better: true, suffix: '%' },
  { id: 'voids', label: 'أوردرات VOID', get: (s) => s.voids.total, better: false },
  { id: 'voidAmt', label: 'قيمة الـ VOID', get: (s) => s.orders.voidAmount, better: false },
  { id: 'voidRate', label: 'نسبة الـ VOID من الأوردرات', get: (s) => pctOf(s.orders.voids, s.orders.total), better: false, suffix: '%' },
  { id: 'recovery', label: 'نسبة استرداد الـ VOID', get: (s) => s.voids.recoveryRate, better: true, suffix: '%' },
  { id: 'problems', label: 'عدد المشاكل', get: (s) => s.problems.total, better: false },
  { id: 'escalated', label: 'مشاكل مصعدة للإدارة', get: (s) => s.problems.escalated, better: false },
  { id: 'ccProblems', label: 'مشاكل سببها الكول سنتر', get: (s) => s.problems.callCenter, better: false },
  { id: 'restProblems', label: 'مشاكل سببها المطعم', get: (s) => s.problems.restaurant, better: false },
  { id: 'solveRate', label: 'نسبة حل المشاكل', get: (s) => pctOf(s.problems.resolved, s.problems.total), better: true, suffix: '%' },
  { id: 'solveHours', label: 'متوسط وقت الحل (ساعة)', get: (s) => s.problems.avgResolutionHours, better: false },
  { id: 'comp', label: 'التعويضات الممنوحة', get: (s) => s.compensation.total, better: null },
  { id: 'compPending', label: 'تعويضات لسه معلقة', get: (s) => s.compensation.pending, better: false },
];

const Delta: React.FC<{ cur: number; prev?: number; better: boolean | null }> = ({ cur, prev, better }) => {
  if (prev === undefined) return null;
  if (prev === 0 && cur === 0) return <span className="text-3xs text-slate-300 font-mono">—</span>;
  const diff = prev === 0 ? 100 : ((cur - prev) / Math.abs(prev)) * 100;
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return <span className="text-3xs text-slate-400 font-mono">0%</span>;
  const up = rounded > 0;
  const good = better === null ? null : up === better;
  const color = good === null ? 'text-slate-500' : good ? 'text-emerald-600' : 'text-red-600';
  return (
    <span className={`text-3xs font-black font-mono ${color}`} dir="ltr">
      {up ? '▲' : '▼'} {Math.abs(rounded)}%
    </span>
  );
};

const KpiCard: React.FC<{ label: string; value: string; tone?: 'default' | 'red' | 'amber' | 'green' }> = ({
  label,
  value,
  tone = 'default',
}) => {
  const tones = {
    default: 'bg-slate-50 border-slate-200 text-slate-900',
    red: 'bg-red-50 border-red-200 text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="text-2xs font-bold opacity-70">{label}</div>
      <div className="text-lg font-black font-mono tabular-nums mt-0.5">{value}</div>
    </div>
  );
};

const BucketList: React.FC<{ title: string; items: { label: string; count: number }[] }> = ({ title, items }) => {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-xs font-black text-slate-800 mb-3">{title}</h4>
      {items.length === 0 ? (
        <p className="text-2xs text-slate-400">لا توجد بيانات</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 8).map((i) => (
            <div key={i.label}>
              <div className="flex justify-between text-2xs font-bold text-slate-700 mb-0.5">
                <span className="truncate ml-2">{i.label}</span>
                <span className="font-mono tabular-nums">{i.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SnapshotDetails: React.FC<{ s: MonthSnapshot }> = ({ s }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="الأوردرات (بدون VOID)" value={num(s.orders.valid)} />
      <KpiCard label="إجمالي المبيعات" value={num(s.orders.totalSales)} tone="green" />
      <KpiCard label="أوردرات VOID" value={`${num(s.orders.voids)} (${num(s.orders.voidAmount)})`} tone="red" />
      <KpiCard label="نسبة استرداد الـ VOID" value={`${s.voids.recoveryRate}%`} tone="amber" />
      <KpiCard label="المكالمات" value={num(s.calls.total)} />
      <KpiCard label="نسبة الوصول للعملاء" value={`${s.contactedRate}%`} />
      <KpiCard label="المشاكل (محلولة / الكل)" value={`${s.problems.resolved} / ${s.problems.total}`} tone="amber" />
      <KpiCard label="التعويضات (منفذة / الكل)" value={`${s.compensation.applied} / ${s.compensation.total}`} />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <BucketList title="أنواع المشاكل" items={s.problems.byType} />
      <BucketList title="الـ VOID حسب المسؤول" items={s.voids.byResponsible} />
      <BucketList title="أسباب الـ VOID" items={s.voids.byReason} />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-2xs">
            <tr>
              <th className="p-2.5 text-right font-bold">الفرع</th>
              <th className="p-2.5 font-bold">أوردرات</th>
              <th className="p-2.5 font-bold">VOID</th>
              <th className="p-2.5 font-bold">مشاكل</th>
              <th className="p-2.5 font-bold">مبيعات</th>
            </tr>
          </thead>
          <tbody>
            {s.byBranch.map((b) => (
              <tr key={b.branch} className="border-t border-slate-100 text-center">
                <td className="p-2.5 text-right font-bold text-slate-800">{b.branch}</td>
                <td className="p-2.5 font-mono tabular-nums">{b.orders}</td>
                <td className="p-2.5 font-mono tabular-nums text-red-700">{b.voids}</td>
                <td className="p-2.5 font-mono tabular-nums text-amber-700">{b.problems}</td>
                <td className="p-2.5 font-mono tabular-nums">{num(b.sales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-2xs">
            <tr>
              <th className="p-2.5 text-right font-bold">الموظف</th>
              <th className="p-2.5 font-bold">مكالمات</th>
              <th className="p-2.5 font-bold">مشاكل سجلها</th>
            </tr>
          </thead>
          <tbody>
            {s.byAgent.map((a) => (
              <tr key={a.agent} className="border-t border-slate-100 text-center">
                <td className="p-2.5 text-right font-bold text-slate-800">{a.agent}</td>
                <td className="p-2.5 font-mono tabular-nums">{a.calls}</td>
                <td className="p-2.5 font-mono tabular-nums">{a.problemsLogged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export const MonthlyClosingView: React.FC = () => {
  const { currentUser, users } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const [tab, setTab] = useState<'close' | 'archive'>('archive');
  const [closings, setClosings] = useState<MonthlyClosing[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const reload = useCallback(async () => {
    setLoadingList(true);
    try {
      setClosings(await listClosings());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(
        /monthly_closings|relation|does not exist|schema cache/i.test(e.message || '')
          ? 'جدول التقفيل الشهري غير موجود. شغّل ملف db/month_closing.sql مرة واحدة في Supabase (SQL Editor) ثم حدّث الصفحة.'
          : e.message || 'تعذر تحميل الأرشيف'
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ------------------------------------------------------------ closing a month
  const options = useMemo(monthOptions, []);
  const [month, setMonth] = useState<string>(options[1]); // default: last month
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ snapshot: MonthSnapshot; carried: MonthlyClosing['carriedOver']; data: MonthData } | null>(null);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const existing = closings.find((c) => c.month === month);
  const isCurrentMonth = month === currentMonthKey();

  const handlePreview = async () => {
    setBusy(true);
    setMsg(null);
    setPreview(null);
    try {
      const data = await fetchMonthData(month, users);
      setPreview({ snapshot: computeMonthSnapshot(month, data), carried: computeCarriedOver(data), data });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر تحميل بيانات الشهر' });
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (!preview || !currentUser) return;
    const warn = isCurrentMonth ? 'الشهر الحالي لسه مخلصش، ممكن الأرقام تتغير بعد التقفيل. ' : '';
    const again = existing ? 'الشهر ده متقفل قبل كده وهيتم استبدال الأرقام المحفوظة. ' : '';
    if (!window.confirm(`${warn}${again}تأكيد تقفيل شهر ${formatMonthLabel(month)} وحفظ أرقامه في الأرشيف؟`)) return;
    setBusy(true);
    try {
      await saveClosing(preview.snapshot, preview.carried, notes, currentUser);
      setMsg({ ok: true, text: `تم تقفيل ${formatMonthLabel(month)} وحفظه في الأرشيف.` });
      setPreview(null);
      setNotes('');
      await reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر حفظ التقفيل' });
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async (m: string) => {
    if (!window.confirm(`فتح شهر ${formatMonthLabel(m)} من جديد؟ هيتم حذف لقطة الأرقام المحفوظة له (بيانات الأوردرات نفسها مش هتتأثر).`)) return;
    try {
      await reopenMonth(m);
      await reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر فتح الشهر' });
    }
  };

  const handleExportMonth = async (m: string) => {
    setBusy(true);
    try {
      const data = await fetchMonthData(m, users);
      downloadText(`month-${m}-voids-and-problems.csv`, monthDataToCsv(data));
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'تعذر التصدير' });
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ archive & comparison
  const sortedAsc = useMemo(() => [...closings].sort((a, b) => a.month.localeCompare(b.month)), [closings]);
  const [selected, setSelected] = useState<string[]>([]);
  const [trendMetric, setTrendMetric] = useState('sales');
  const [branchMetric, setBranchMetric] = useState<'orders' | 'voids' | 'problems'>('voids');
  const [detailMonth, setDetailMonth] = useState<string | null>(null);

  useEffect(() => {
    // default selection: the latest 3 closed months
    if (closings.length && selected.length === 0) {
      setSelected(sortedAsc.slice(-3).map((c) => c.month));
    }
  }, [closings]); // eslint-disable-line react-hooks/exhaustive-deps

  const compared = sortedAsc.filter((c) => selected.includes(c.month));
  const toggleSelected = (m: string) =>
    setSelected((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const trend = METRICS.find((m) => m.id === trendMetric) || METRICS[0];
  const trendMax = Math.max(1, ...compared.map((c) => trend.get(c.snapshot)));

  const branchNames = useMemo(() => {
    const set = new Set<string>();
    compared.forEach((c) => c.snapshot.byBranch.forEach((b) => set.add(b.branch)));
    return Array.from(set).sort();
  }, [compared]);

  const exportComparison = () => {
    let csv = '\uFEFF' + ['المؤشر', ...compared.map((c) => formatMonthLabel(c.month))].join(',') + '\n';
    METRICS.forEach((m) => {
      csv += [`"${m.label}"`, ...compared.map((c) => m.get(c.snapshot) + (m.suffix || ''))].join(',') + '\n';
    });
    downloadText(`months-comparison.csv`, csv);
  };

  const detail = closings.find((c) => c.month === detailMonth);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <CalendarIcon size={22} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">التقفيل الشهري وأرشيف المقارنة</h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                قفّل كل شهر بأرقامه الكاملة، وبعدها قارن الشهور ببعض (مبيعات، VOID، مشاكل، تعويضات، فروع، موظفين).
              </p>
            </div>
          </div>
          <div className="flex gap-2 self-start md:self-auto">
            <button
              onClick={() => setTab('archive')}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                tab === 'archive' ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              الأرشيف والمقارنة ({closings.length})
            </button>
            {isAdmin && (
              <button
                onClick={() => setTab('close')}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  tab === 'close' ? 'bg-red-600 text-white' : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                }`}
              >
                تقفيل شهر
              </button>
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold leading-relaxed">
          {loadError}
        </div>
      )}
      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold border ${
            msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ---------------------------------------------------------------- CLOSE TAB */}
      {tab === 'close' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-bold text-slate-700 mb-1">الشهر المراد تقفيله</label>
                <select
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setPreview(null);
                    setMsg(null);
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                >
                  {options.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)}
                      {closings.some((c) => c.month === m) ? ' ✓ متقفل' : ''}
                      {m === currentMonthKey() ? ' (الشهر الحالي)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handlePreview}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <RefreshCwIcon size={15} className={busy ? 'animate-spin' : ''} />
                <span>{busy ? 'جاري الحساب…' : 'احسب ومعاينة الأرقام'}</span>
              </button>
            </div>
            {existing && (
              <p className="text-2xs font-bold text-amber-700">
                الشهر ده متقفل بالفعل بواسطة {existing.closedByName} - لو قفلته تاني الأرقام المحفوظة هتتحدّث.
              </p>
            )}
            {isCurrentMonth && (
              <p className="text-2xs font-bold text-amber-700">الشهر الحالي لسه شغال - الأفضل تقفله بعد ما يخلص.</p>
            )}
          </div>

          {preview && (
            <div className="space-y-4">
              {(preview.carried.openProblems > 0 || preview.carried.pendingVoids > 0 || preview.carried.pendingCompensations > 0) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3">
                  <AlertTriangleIcon size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <div className="font-black mb-1">في حاجات لسه متحلتش وهتفضل مفتوحة في الشغل الجديد:</div>
                    <ul className="list-disc pr-5 space-y-0.5 font-medium">
                      <li>{preview.carried.openProblems} مشكلة مفتوحة</li>
                      <li>{preview.carried.pendingVoids} أوردر VOID لسه من غير حل</li>
                      <li>{preview.carried.pendingCompensations} تعويض معلق التنفيذ</li>
                    </ul>
                    <div className="mt-1.5 text-2xs">التقفيل مبيمسحش حاجة - الأرقام دي بتتسجل كـ "مرحّل" وتفضل ظاهرة في التذاكر والـ VOID.</div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-black text-slate-900 mb-4">معاينة {formatMonthLabel(month)}</h3>
                <SnapshotDetails s={preview.snapshot} />
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                <label className="block text-xs font-bold text-slate-700">ملاحظات التقفيل (اختياري)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: فرع المنصورة كان مقفول أسبوع بسبب صيانة"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleClose}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black rounded-xl cursor-pointer"
                  >
                    <LockIcon size={15} />
                    <span>{existing ? 'إعادة تقفيل الشهر' : 'تقفيل الشهر وحفظه في الأرشيف'}</span>
                  </button>
                  <button
                    onClick={() => downloadText(`month-${month}-voids-and-problems.csv`, monthDataToCsv(preview.data))}
                    className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    <DownloadIcon size={15} />
                    <span>نسخة CSV من VOID والمشاكل</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- ARCHIVE TAB */}
      {tab === 'archive' && (
        <div className="space-y-5">
          {loadingList ? (
            <div className="p-10 text-center text-xs font-bold text-slate-400">جاري تحميل الأرشيف…</div>
          ) : closings.length === 0 && !loadError ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <CalendarIcon size={26} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">مفيش شهور متقفلة لسه</h3>
              <p className="text-xs text-slate-500 mt-1">
                {isAdmin ? 'اضغط "تقفيل شهر" واختار أول شهر علشان يبدأ الأرشيف.' : 'المدير العام هو اللي بيقفل الشهور.'}
              </p>
            </div>
          ) : (
            <>
              {/* Month picker chips */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="text-xs font-black text-slate-800 mb-3">اختار الشهور اللي عاوز تقارنها</div>
                <div className="flex flex-wrap gap-2">
                  {sortedAsc.map((c) => {
                    const on = selected.includes(c.month);
                    return (
                      <button
                        key={c.month}
                        onClick={() => toggleSelected(c.month)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-all ${
                          on ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {formatMonthLabel(c.month)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {compared.length >= 1 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 flex items-center justify-between border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <TrendingUpIcon size={17} className="text-red-600" />
                      المقارنة الشهرية
                    </h3>
                    <button
                      onClick={exportComparison}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-2xs font-bold rounded-lg cursor-pointer"
                    >
                      <DownloadIcon size={13} />
                      <span>تصدير المقارنة CSV</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 text-2xs">
                        <tr>
                          <th className="p-3 text-right font-bold">المؤشر</th>
                          {compared.map((c) => (
                            <th key={c.month} className="p-3 font-bold whitespace-nowrap">
                              {formatMonthLabel(c.month)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map((m) => (
                          <tr key={m.id} className="border-t border-slate-100 text-center hover:bg-slate-50/60">
                            <td className="p-3 text-right font-bold text-slate-700 whitespace-nowrap">{m.label}</td>
                            {compared.map((c, i) => {
                              const v = m.get(c.snapshot);
                              const prev = i > 0 ? m.get(compared[i - 1].snapshot) : undefined;
                              return (
                                <td key={c.month} className="p-3">
                                  <div className="font-mono tabular-nums font-bold text-slate-900">
                                    {num(v)}
                                    {m.suffix || ''}
                                  </div>
                                  <Delta cur={v} prev={prev} better={m.better} />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-3xs text-slate-400 border-t border-slate-100">
                    النسبة تحت كل رقم = التغيّر عن الشهر اللي قبله في الجدول (أخضر = أحسن، أحمر = أسوأ).
                  </p>
                </div>
              )}

              {compared.length >= 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Trend bars */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <h3 className="text-sm font-black text-slate-900">اتجاه مؤشر عبر الشهور</h3>
                      <select
                        value={trendMetric}
                        onChange={(e) => setTrendMetric(e.target.value)}
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-2xs font-bold"
                      >
                        {METRICS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-3 h-40">
                      {compared.map((c) => {
                        const v = trend.get(c.snapshot);
                        return (
                          <div key={c.month} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                            <div className="text-3xs font-black font-mono text-slate-700 mb-1">
                              {num(v)}
                              {trend.suffix || ''}
                            </div>
                            <div
                              className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-red-700 to-red-500"
                              style={{ height: `${Math.max(3, (v / trendMax) * 100)}%` }}
                            />
                            <div className="text-3xs font-bold text-slate-500 mt-1.5 truncate max-w-full">
                              {formatMonthLabel(c.month)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Branch comparison */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <h3 className="text-sm font-black text-slate-900">مقارنة الفروع</h3>
                      <select
                        value={branchMetric}
                        onChange={(e) => setBranchMetric(e.target.value as any)}
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-2xs font-bold"
                      >
                        <option value="voids">أوردرات VOID</option>
                        <option value="problems">المشاكل</option>
                        <option value="orders">الأوردرات</option>
                      </select>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-slate-500 text-2xs">
                          <tr>
                            <th className="p-2 text-right font-bold">الفرع</th>
                            {compared.map((c) => (
                              <th key={c.month} className="p-2 font-bold whitespace-nowrap">
                                {formatMonthLabel(c.month)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {branchNames.map((name) => (
                            <tr key={name} className="border-t border-slate-100 text-center">
                              <td className="p-2 text-right font-bold text-slate-800">{name}</td>
                              {compared.map((c, i) => {
                                const val = c.snapshot.byBranch.find((b) => b.branch === name)?.[branchMetric] ?? 0;
                                const prev =
                                  i > 0
                                    ? compared[i - 1].snapshot.byBranch.find((b) => b.branch === name)?.[branchMetric] ?? 0
                                    : undefined;
                                return (
                                  <td key={c.month} className="p-2">
                                    <div className="font-mono tabular-nums font-bold">{val}</div>
                                    <Delta cur={val} prev={prev} better={branchMetric === 'orders' ? true : false} />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Closed months list */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-black text-slate-900 mb-3">الشهور المتقفلة</h3>
                <div className="space-y-2">
                  {closings.map((c) => (
                    <div
                      key={c.month}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/60"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircleIcon size={18} className="text-emerald-600 shrink-0" />
                        <div>
                          <div className="text-xs font-black text-slate-900">{formatMonthLabel(c.month)}</div>
                          <div className="text-2xs text-slate-500">
                            اتقفل بواسطة {c.closedByName || '—'} - {new Date(c.closedAt).toLocaleDateString('ar-EG')}
                            {c.carriedOver.openProblems + c.carriedOver.pendingVoids > 0 &&
                              ` - مرحّل: ${c.carriedOver.openProblems} مشكلة، ${c.carriedOver.pendingVoids} VOID`}
                          </div>
                          {c.notes && <div className="text-2xs text-slate-600 mt-0.5">📝 {c.notes}</div>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setDetailMonth(detailMonth === c.month ? null : c.month)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-2xs font-bold rounded-lg cursor-pointer"
                        >
                          {detailMonth === c.month ? 'إخفاء التفاصيل' : 'التفاصيل'}
                        </button>
                        <button
                          onClick={() => handleExportMonth(c.month)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-2xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
                        >
                          <DownloadIcon size={12} />
                          <span>CSV</span>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleReopen(c.month)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-700 text-2xs font-bold rounded-lg cursor-pointer"
                          >
                            <UnlockIcon size={12} />
                            <span>فتح الشهر</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {detail && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-4">تفاصيل {formatMonthLabel(detail.month)}</h3>
                  <SnapshotDetails s={detail.snapshot} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
