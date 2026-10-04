import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Order } from '../../types';
import { cleanBranchName } from '../../services/problemLabels';
import { CompensationPicker } from '../common/CompensationPicker';
import { ProblemTypePicker, ProblemItem } from '../common/ProblemTypePicker';
import {
  CompensationChoice,
  EMPTY_COMPENSATION,
  resolveCompensation,
  useCompensationOptions,
} from '../../services/compensationCatalog';
import { XIcon, SearchIcon, PhoneCallIcon, CheckCircleIcon, AlertTriangleIcon } from '../icons/SvgIcons';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Arabic-Indic / Persian digits -> latin, then keep digits only
const digitsOnly = (v: string): string =>
  (v || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');

type CustomerMode = 'existing' | 'new';

export const InboundComplaintModal: React.FC<Props> = ({ open, onClose }) => {
  const { allOrders, problems, logInboundComplaint } = useApp();
  const compCatalog = useCompensationOptions();

  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // New customer (not in our orders at all)
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestBranch, setGuestBranch] = useState('');

  const [items, setItems] = useState<ProblemItem[]>([]);
  const [details, setDetails] = useState('');
  const [mode, setMode] = useState<'resolved_on_call' | 'escalated'>('escalated');
  const [resolutionDetails, setResolutionDetails] = useState('');
  const [compChoice, setCompChoice] = useState<CompensationChoice>(EMPTY_COMPENSATION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Reset everything each time the modal is opened
  useEffect(() => {
    if (open) {
      setCustomerMode('existing');
      setQuery('');
      setSelectedId(null);
      setGuestPhone('');
      setGuestName('');
      setGuestBranch('');
      setItems([]);
      setDetails('');
      setMode('escalated');
      setResolutionDetails('');
      setCompChoice(EMPTY_COMPENSATION);
      setSaving(false);
      setError('');
      setDone(false);
    }
  }, [open]);

  const matches = useMemo<Order[]>(() => {
    const raw = query.trim();
    const q = digitsOnly(raw);
    if (raw.length < 3) return [];
    return allOrders
      .filter((o) => {
        const byPhone =
          q.length >= 4 &&
          (digitsOnly(o.customerPhone).includes(q) || digitsOnly(o.altPhone || '').includes(q));
        const byNumber = (o.orderNumber || '').toLowerCase().includes(raw.toLowerCase());
        return byPhone || byNumber;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 8);
  }, [query, allOrders]);

  const selected = useMemo(
    () => allOrders.find((o) => o.id === selectedId) || null,
    [allOrders, selectedId]
  );

  const previousProblems = useMemo(() => {
    const phone = customerMode === 'existing' ? digitsOnly(selected?.customerPhone || '') : digitsOnly(guestPhone);
    if (!phone || phone.length < 6) return 0;
    return problems.filter((p) => digitsOnly(p.customerPhone) === phone).length;
  }, [problems, selected, guestPhone, customerMode]);

  if (!open) return null;

  const hasCustomer =
    customerMode === 'existing' ? Boolean(selected) : digitsOnly(guestPhone).length >= 6;
  const canSave = Boolean(hasCustomer && items.length > 0 && details.trim().length >= 3) && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    const comp = resolveCompensation(compChoice, compCatalog);
    const res = await logInboundComplaint(customerMode === 'existing' && selected ? selected.id : null, {
      guest:
        customerMode === 'new'
          ? { phone: guestPhone, name: guestName, branch: guestBranch }
          : undefined,
      items,
      details,
      mode,
      resolutionDetails: mode === 'resolved_on_call' ? resolutionDetails : undefined,
      compensationType: comp ? comp.type : undefined,
      compensationDetails: comp ? comp.details : undefined,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || 'تعذر حفظ الشكوى، حاول مرة أخرى');
      return;
    }
    setDone(true);
    setTimeout(onClose, 1200);
  };

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400';

  const tabCls = (active: boolean) =>
    `rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${
      active ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-3 overflow-y-auto"
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 my-4 flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center">
              <PhoneCallIcon size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">تسجيل شكوى واردة</h2>
              <p className="text-2xs text-slate-400">عميل اتصل بنفسه لتقديم شكوى — منفصل تماماً عن متابعة الفيد باك</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
            aria-label="إغلاق"
          >
            <XIcon size={18} />
          </button>
        </div>

        {done ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <CheckCircleIcon size={44} className="text-emerald-600" />
            <p className="font-bold text-slate-900">تم تسجيل الشكوى</p>
            <p className="text-xs text-slate-500">
              {mode === 'escalated'
                ? 'ظهرت فوراً في تذاكر المشاكل عند الإدارة.'
                : 'اتسجلت كمشكلة اتحلّت أثناء المكالمة.'}
            </p>
          </div>
        ) : (
          <>
          <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-4">
            {/* Step 1: who is the customer */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-700">١. العميل</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCustomerMode('existing')} className={tabCls(customerMode === 'existing')}>
                  عميل عنده أوردر (بحث)
                </button>
                <button type="button" onClick={() => setCustomerMode('new')} className={tabCls(customerMode === 'new')}>
                  + عميل جديد (مش مسجل)
                </button>
              </div>

              {customerMode === 'existing' && (
                <>
                  <div className="relative">
                    <SearchIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedId(null);
                      }}
                      placeholder="رقم التليفون أو رقم الأوردر"
                      inputMode="tel"
                      className={`${inputCls} pr-9`}
                    />
                  </div>

                  {!selected && query.trim().length >= 3 && matches.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      مفيش أوردر بالرقم ده في آخر 45 يوم. راجع الرقم، أو اختار «عميل جديد» وسجّل الشكوى من غير أوردر.
                    </p>
                  )}

                  {!selected && matches.length > 0 && (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {matches.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedId(o.id)}
                          className="w-full text-right px-3 py-2.5 hover:bg-red-50/50 flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 truncate">
                              {o.customerName || 'عميل'} · <span className="font-mono">{o.customerPhone}</span>
                            </div>
                            <div className="text-2xs text-slate-400">
                              أوردر {o.orderNumber} · فرع {cleanBranchName(o.branchName)}
                            </div>
                          </div>
                          <div className="text-2xs text-slate-500 shrink-0 tabular-nums">
                            {o.orderDate} {o.orderTime}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selected && (
                    <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {selected.customerName || 'عميل'} · <span className="font-mono">{selected.customerPhone}</span>
                        </div>
                        <div className="text-2xs text-slate-500">
                          أوردر {selected.orderNumber} · فرع {cleanBranchName(selected.branchName)} · {selected.orderDate}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="text-2xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                      >
                        تغيير
                      </button>
                    </div>
                  )}
                </>
              )}

              {customerMode === 'new' && (
                <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
                  <p className="text-2xs text-slate-500">
                    الشكوى بتتسجل لوحدها على بيانات العميل ده، ومش بتدخل طابور المتابعة ولا الفيد باك.
                  </p>
                  <input
                    autoFocus
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="رقم التليفون *"
                    inputMode="tel"
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="اسم العميل (اختياري)"
                      className={inputCls}
                    />
                    <input
                      value={guestBranch}
                      onChange={(e) => setGuestBranch(e.target.value)}
                      placeholder="الفرع (اختياري)"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              {previousProblems > 0 && hasCustomer && (
                <div className="inline-flex items-center gap-1 text-2xs font-bold text-red-700">
                  <AlertTriangleIcon size={12} />
                  العميل ده عنده {previousProblems} مشكلة سابقة
                </div>
              )}
            </div>

            {/* what the customer said + how it was handled */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700">٢. كلام العميل والإجراء</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                placeholder="اكتب اللي العميل قاله بالتفصيل…"
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['escalated', 'تصعيد للإدارة'],
                  ['resolved_on_call', 'اتحلّت أثناء المكالمة'],
                ] as ['escalated' | 'resolved_on_call', string][]).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${
                      mode === id
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'resolved_on_call' && (
                <textarea
                  value={resolutionDetails}
                  onChange={(e) => setResolutionDetails(e.target.value)}
                  rows={2}
                  placeholder="اتحلّت إزاي؟ (اختياري)"
                  className={inputCls}
                />
              )}
            </div>
          </div>

          {/* LEFT column: problems + compensation */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">٣. المشكلة (اختار واحدة أو أكتر)</label>
              <div className="p-3 bg-red-50/60 border border-red-200 rounded-xl">
                <ProblemTypePicker value={items} onChange={setItems} />
              </div>
            </div>
            <CompensationPicker value={compChoice} onChange={setCompChoice} />
          </div>
          </div>

          {/* sticky footer */}
          <div className="shrink-0 border-t border-slate-100 px-5 py-3 space-y-2 bg-white rounded-b-2xl">
            {error && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {!canSave && !saving && (
              <p className="text-2xs text-slate-400">
                لازم: {!hasCustomer ? 'بيانات العميل' : ''}{!hasCustomer && (items.length === 0 || details.trim().length < 3) ? ' + ' : ''}
                {items.length === 0 ? 'مشكلة واحدة على الأقل' : ''}{items.length === 0 && details.trim().length < 3 ? ' + ' : ''}
                {details.trim().length < 3 ? 'كلام العميل' : ''}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? 'جاري الحفظ…' : 'تسجيل الشكوى'}
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
};
