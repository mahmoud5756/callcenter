import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Problem, ProblemStatus } from '../../types';
import {
  XIcon,
  HeadsetIcon,
  UtensilsIcon,
  SparklesIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  PhoneCallIcon,
  AlertTriangleIcon,
} from '../icons/SvgIcons';
import { formatProblemType, cleanBranchName, PROBLEM_STATUS_LABEL } from '../../services/problemLabels';
import { groupProblems } from '../../services/problemGroups';
import { formatCompensationType } from '../../services/compensationHelpers';
import { formatItemName } from '../../services/arabicItemFixer';
import { CompensationPicker } from '../common/CompensationPicker';
import {
  CompensationChoice,
  EMPTY_COMPENSATION,
  resolveCompensation,
  useCompensationOptions,
} from '../../services/compensationCatalog';
import {
  FollowUp,
  FollowUpKind,
  FOLLOWUP_KIND_LABEL,
  addFollowUp,
  listFollowUps,
} from '../../services/problemFollowUps';

interface Props {
  problemId: string;
  onClose: () => void;
  onConfirmCompensation: (p: Problem) => void;
  getBadge: (status: ProblemStatus, isEscalated?: boolean) => { label: string; class: string };
}

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const digits = (v: string) => (v || '').replace(/\D/g, '');

const Section: React.FC<{ title: string; children: React.ReactNode; tone?: 'plain' | 'purple' | 'green' }> = ({
  title,
  children,
  tone = 'plain',
}) => {
  const cls =
    tone === 'purple'
      ? 'bg-purple-50/70 border-purple-200'
      : tone === 'green'
      ? 'bg-emerald-50/70 border-emerald-200'
      : 'bg-white border-slate-200';
  return (
    <section className={`rounded-2xl border p-4 space-y-2.5 ${cls}`}>
      <h4 className="text-xs font-black text-slate-900">{title}</h4>
      {children}
    </section>
  );
};

const Row: React.FC<{ k: string; v?: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-start justify-between gap-3 text-xs">
    <span className="text-slate-500 shrink-0">{k}</span>
    <span className="font-bold text-slate-900 text-left [overflow-wrap:anywhere]">{v || '-'}</span>
  </div>
);

export const ProblemDetailModal: React.FC<Props> = ({ problemId, onClose, onConfirmCompensation, getBadge }) => {
  const { problems, allOrders, customerCalls, currentUser, updateProblemStatus } = useApp();
  const compCatalog = useCompensationOptions();

  const group = useMemo(
    () => groupProblems(problems).find((g) => g.items.some((p) => p.id === problemId)),
    [problems, problemId]
  );
  const problem = group?.primary;
  const items = group?.items || [];
  const compItem = group?.compItem;
  const order = useMemo(
    () => (problem?.orderId ? allOrders.find((o) => o.id === problem.orderId) : undefined),
    [problem?.orderId, allOrders]
  );

  // ---- follow-up log ----
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [fuError, setFuError] = useState('');
  const [fuKind, setFuKind] = useState<FollowUpKind>('note');
  const [fuNote, setFuNote] = useState('');
  const [fuNext, setFuNext] = useState('');
  const [fuSaving, setFuSaving] = useState(false);

  // ---- status update ----
  const [targetStatus, setTargetStatus] = useState<ProblemStatus>('in_progress');
  const [resolution, setResolution] = useState('');
  const [compChoice, setCompChoice] = useState<CompensationChoice>(EMPTY_COMPENSATION);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    if (!problem) return;
    setTargetStatus(problem.status === 'open' || problem.status === 'escalated' ? 'in_progress' : 'resolved');
    setResolution(problem.resolutionNotes || '');
    setCompChoice(EMPTY_COMPENSATION);
    setFuNote('');
    setFuNext('');
    setFuKind('note');
    setFuError('');
    let alive = true;
    listFollowUps(problem.id).then((r) => {
      if (!alive) return;
      setFollowUps(r.items);
      if (r.error) setFuError(/problem_followups/.test(r.error) ? 'جدول المتابعات غير موجود — شغّل db/problem_followups.sql في Supabase' : r.error);
    });
    return () => { alive = false; };
  }, [problemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const orderCalls = useMemo(
    () =>
      customerCalls
        .filter((c) => problem && ((problem.orderId && c.orderId === problem.orderId)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [customerCalls, problem]
  );

  const siblings = useMemo(
    () => (problem ? problems.filter((p) => !items.some((i) => i.id === p.id) && problem.orderId && p.orderId === problem.orderId) : []),
    [problems, problem, group]
  );

  const customerHistory = useMemo(() => {
    if (!problem) return [];
    const ph = digits(problem.customerPhone);
    if (ph.length < 6) return [];
    return problems
      .filter((p) => !items.some((i) => i.id === p.id) && p.orderId !== problem.orderId && digits(p.customerPhone) === ph)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [problems, problem, group]);

  if (!problem) return null;

  const badge = getBadge(problem.status, problem.isEscalated);
  const compShown = compItem || problem;
  const compPending = compShown.status === 'pending_compensation' || compShown.compensationStatus === 'pending_compensation';
  const nextFollowUp = followUps.find((f) => f.nextFollowUpAt)?.nextFollowUpAt;
  const nextOverdue = nextFollowUp ? new Date(nextFollowUp).getTime() < Date.now() : false;

  const saveFollowUp = async () => {
    if (!fuNote.trim() || fuSaving) return;
    setFuSaving(true);
    setFuError('');
    const res = await addFollowUp({
      problemId: problem.id,
      userId: currentUser?.id,
      userName: currentUser?.name,
      kind: fuKind,
      note: fuNote.trim(),
      nextFollowUpAt: fuNext ? new Date(fuNext).toISOString() : undefined,
    });
    setFuSaving(false);
    if (res.error || !res.item) {
      setFuError(/problem_followups/.test(res.error || '') ? 'جدول المتابعات غير موجود — شغّل db/problem_followups.sql في Supabase' : res.error || 'تعذر الحفظ');
      return;
    }
    setFollowUps((prev) => [res.item!, ...prev]);
    setFuNote('');
    setFuNext('');
    setFuKind('note');
  };

  const saveStatus = async () => {
    const isFinal = targetStatus === 'resolved' || targetStatus === 'closed';
    if (isFinal && !resolution.trim()) {
      window.alert('اكتب تفاصيل الحل قبل الحفظ');
      return;
    }
    setStatusSaving(true);
    const compensation =
      targetStatus === 'resolved' && !compItem
        ? resolveCompensation(compChoice, compCatalog) || undefined
        : undefined;
    // The whole complaint moves together: every problem inside it gets the same status.
    // A newly added compensation is attached to the primary row only.
    let ok = true;
    for (const it of items) {
      const done = await updateProblemStatus(
        it.id,
        targetStatus,
        resolution.trim() || undefined,
        it.id === problem.id ? compensation : undefined
      );
      if (!done) ok = false;
    }
    if (ok) {
      const r = await addFollowUp({
        problemId: problem.id,
        userId: currentUser?.id,
        userName: currentUser?.name,
        kind: 'status',
        note: `تغيير الحالة إلى: ${PROBLEM_STATUS_LABEL[compensation ? 'pending_compensation' : targetStatus] || targetStatus}${
          compensation ? ` (تعويض: ${compensation.details})` : ''
        }`,
      });
      if (r.item) setFollowUps((prev) => [r.item!, ...prev]);
    }
    setStatusSaving(false);
  };

  const statusBtn = (id: ProblemStatus, label: string, on: string) => (
    <button
      type="button"
      onClick={() => setTargetStatus(id)}
      className={`p-2 rounded-lg font-bold text-xs border transition-colors cursor-pointer ${
        targetStatus === id ? on : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  const inputCls =
    'w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-2 sm:p-5 overflow-y-auto"
      dir="rtl"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-6xl bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 my-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-white rounded-t-2xl border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black text-slate-900 text-base sm:text-lg">
                {items.length > 1 ? `شكوى بها ${items.length} مشاكل` : formatProblemType(problem.type)}
              </h2>
              <span className={`px-2.5 py-1 rounded-2xl text-2xs font-extrabold border ${badge.class}`}>{badge.label}</span>
            </div>
            <p className="text-2xs text-slate-500 mt-1">
              {problem.customerName || 'عميل'} · <span dir="ltr">{problem.customerPhone}</span>
              {problem.orderNumber ? ` · أوردر #${problem.orderNumber}` : ' · بدون أوردر (شكوى واردة)'} · فرع{' '}
              {cleanBranchName(problem.branchName)} · اتسجلت {fmt(problem.createdAt)} بواسطة {problem.reportedByUserName}
            </p>
            {nextFollowUp && (
              <p className={`mt-1.5 inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-full ${nextOverdue ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-800'}`}>
                <ClockIcon size={12} />
                المتابعة القادمة: {fmt(nextFollowUp)} {nextOverdue ? '(متأخرة)' : ''}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0" aria-label="إغلاق">
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* MAIN COLUMN */}
          <div className="lg:col-span-3 space-y-4">
            <Section title={`المشاكل المسجلة (${items.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {items.map((i) => (
                  <span
                    key={i.id}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                      i.source === 'call_center' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-orange-50 text-orange-800 border-orange-200'
                    }`}
                  >
                    {i.source === 'call_center' ? <HeadsetIcon size={12} /> : <UtensilsIcon size={12} />}
                    {formatProblemType(i.type)}
                  </span>
                ))}
              </div>
            </Section>

            <Section title="تفاصيل الشكوى">
              <p className="text-xs text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {problem.details === 'بدون تفاصيل' ? 'لم تُسجَّل تفاصيل للمشكلة' : problem.details}
              </p>
              {(problem.oldOrderNumber || problem.newOrderNumber) && (
                <div className="text-2xs font-mono font-bold text-slate-600">
                  {problem.oldOrderNumber && `الأوردر القديم #${problem.oldOrderNumber}`}
                  {problem.newOrderNumber && ` ← الأوردر الجديد #${problem.newOrderNumber}`}
                </div>
              )}
              {problem.resolutionNotes && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  <div className="font-black">تفاصيل الحل</div>
                  <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{problem.resolutionNotes}</div>
                  {problem.resolvedByUserName && (
                    <div className="text-3xs text-emerald-700 mt-0.5">
                      {problem.resolvedByUserName}{problem.resolvedAt ? ` · ${fmt(problem.resolvedAt)}` : ''}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {compItem && (
              <Section title="التعويض" tone="purple">
                <div className="flex items-center gap-1.5 text-xs font-black text-purple-950">
                  <SparklesIcon size={14} className="text-purple-700" />
                  {formatCompensationType(compShown.compensationType)}
                </div>
                <p className="text-xs text-purple-900 [overflow-wrap:anywhere]">{compShown.compensationDetails || 'بدون تفاصيل إضافية'}</p>
                <div className="text-2xs text-purple-800">
                  {compShown.compensationStatus === 'compensated'
                    ? `اتنفّذ${compShown.compensationExecutedAt ? ` ${fmt(compShown.compensationExecutedAt)}` : ''}${
                        compShown.compensationAppliedOrderNumber ? ` على أوردر #${compShown.compensationAppliedOrderNumber}` : ''
                      }`
                    : 'لسه معلّق لحين استلام العميل'}
                </div>
                {compPending && (
                  <button
                    type="button"
                    onClick={() => onConfirmCompensation(compShown)}
                    className="px-3 py-2 bg-amber-300 hover:bg-amber-200 text-slate-950 font-black text-xs rounded-xl border border-amber-400 cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckIcon size={14} />
                    تأكيد استلام العميل للتعويض
                  </button>
                )}
              </Section>
            )}

            {/* Follow-up */}
            <Section title="متابعة الشكوى">
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex flex-wrap gap-1.5">
                  {(['note', 'call_customer', 'call_branch', 'no_answer'] as FollowUpKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFuKind(k)}
                      className={`px-2.5 py-1 rounded-full text-2xs font-bold border cursor-pointer ${
                        fuKind === k ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {FOLLOWUP_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={fuNote}
                  onChange={(e) => setFuNote(e.target.value)}
                  rows={2}
                  placeholder="اكتب اللي حصل في المتابعة (اتصلت بالعميل، رد الفرع، اتفقنا على إيه…)"
                  className={inputCls}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-2xs font-bold text-slate-600">المتابعة القادمة (اختياري):</label>
                  <input type="datetime-local" value={fuNext} onChange={(e) => setFuNext(e.target.value)} className="p-1.5 bg-white border border-slate-200 rounded-lg text-2xs" />
                  <button
                    type="button"
                    onClick={saveFollowUp}
                    disabled={!fuNote.trim() || fuSaving}
                    className="mr-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs disabled:opacity-40 cursor-pointer"
                  >
                    {fuSaving ? 'جاري الحفظ…' : 'إضافة للمتابعة'}
                  </button>
                </div>
                {fuError && <p className="text-2xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">{fuError}</p>}
              </div>

              {followUps.length === 0 ? (
                <p className="text-2xs text-slate-400">لا توجد متابعات مسجلة بعد.</p>
              ) : (
                <ol className="space-y-2 border-r-2 border-slate-200 pr-3">
                  {followUps.map((f) => (
                    <li key={f.id} className="text-xs">
                      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-slate-500">
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">{FOLLOWUP_KIND_LABEL[f.kind]}</span>
                        <span className="font-bold text-slate-700">{f.userName}</span>
                        <span>{fmt(f.createdAt)}</span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">{f.note}</p>
                      {f.nextFollowUpAt && <p className="text-2xs text-sky-700 font-bold">متابعة قادمة: {fmt(f.nextFollowUpAt)}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {/* Status */}
            <Section title="تحديث حالة التذكرة">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {statusBtn('open', 'مفتوحة', 'bg-red-600 text-white border-red-700')}
                {statusBtn('in_progress', 'قيد المتابعة', 'bg-amber-500 text-white border-amber-600')}
                {statusBtn('resolved', 'تم الحل والتعويض', 'bg-emerald-600 text-white border-emerald-700')}
                {statusBtn('closed', 'إغلاق التذكرة', 'bg-slate-700 text-white border-slate-800')}
              </div>
              {targetStatus === 'resolved' && !compItem && (
                <CompensationPicker value={compChoice} onChange={setCompChoice} title="تعويض العميل (اختياري)" />
              )}
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={3}
                placeholder="الإجراء المتخذ وتفاصيل الحل…"
                className={inputCls}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveStatus}
                  disabled={statusSaving}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {statusSaving ? 'جاري الحفظ…' : 'حفظ الحالة'}
                </button>
              </div>
            </Section>
          </div>

          {/* SIDE COLUMN */}
          <div className="lg:col-span-2 space-y-4">
            <Section title="العميل">
              <Row k="الاسم" v={problem.customerName} />
              <Row k="الهاتف" v={<span dir="ltr">{problem.customerPhone}</span>} />
              {order?.altPhone && <Row k="هاتف بديل" v={<span dir="ltr">{order.altPhone}</span>} />}
              <Row k="الفرع" v={`فرع ${cleanBranchName(problem.branchName)}`} />
            </Section>

            {order ? (
              <Section title={`الأوردر #${order.orderNumber}`}>
                <Row k="التاريخ" v={`${order.orderDate} ${order.orderTime}`} />
                <Row k="الكاشير" v={order.takerName} />
                <Row k="الإجمالي" v={`${order.totalAmount} ج`} />
                {order.isVoid && <Row k="الحالة" v={`ملغي${order.voidReason ? ` — ${order.voidReason}` : ''}`} />}
                <Row k="الموظف المسؤول" v={order.assignedToUserName} />
                <div className="pt-1.5 border-t border-slate-100 space-y-1">
                  <div className="text-2xs font-black text-slate-700">الأصناف ({order.items.length})</div>
                  {order.items.length === 0 ? (
                    <p className="text-2xs text-slate-400">لا توجد أصناف مسجلة.</p>
                  ) : (
                    order.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-800 [overflow-wrap:anywhere]">{it.quantity}× {formatItemName(it.itemName)}</span>
                        {it.price > 0 && <span className="text-slate-500 tabular-nums shrink-0">{it.price * it.quantity} ج</span>}
                      </div>
                    ))
                  )}
                </div>
              </Section>
            ) : (
              <Section title="الأوردر">
                <p className="text-2xs text-slate-500">شكوى واردة من عميل غير مرتبط بأوردر.</p>
              </Section>
            )}

            {orderCalls.length > 0 && (
              <Section title="مكالمات هذا الأوردر">
                {orderCalls.slice(0, 6).map((c) => (
                  <div key={c.id} className="text-xs flex items-start gap-2">
                    <PhoneCallIcon size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800">
                        {({ tamam: 'تمام', problem: 'مشكلة', no_answer: 'لم يرد', unavailable: 'الرقم غير متاح', callback_requested: 'طلب معاودة الاتصال' } as Record<string, string>)[c.callResult] || c.callResult}
                        <span className="font-normal text-slate-500"> · {c.userName} · {fmt(c.createdAt)}</span>
                      </div>
                      {c.notes && <div className="text-2xs text-slate-600 [overflow-wrap:anywhere]">{c.notes}</div>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {siblings.length > 0 && (
              <Section title={`مشاكل أخرى على نفس الأوردر (${siblings.length})`}>
                {siblings.map((s) => {
                  const b = getBadge(s.status, s.isEscalated);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800">{formatProblemType(s.type)}</span>
                      <span className={`px-2 py-0.5 rounded-2xl text-3xs font-extrabold border ${b.class}`}>{b.label}</span>
                    </div>
                  );
                })}
              </Section>
            )}

            {customerHistory.length > 0 && (
              <Section title="شكاوى سابقة لنفس العميل">
                <div className="flex items-center gap-1 text-2xs font-bold text-red-700">
                  <AlertTriangleIcon size={12} /> العميل ده عنده {customerHistory.length} شكوى على أوردرات تانية
                </div>
                {customerHistory.map((h) => (
                  <div key={h.id} className="text-xs flex items-center justify-between gap-2">
                    <span className="text-slate-800">{formatProblemType(h.type)}{h.orderNumber ? ` · #${h.orderNumber}` : ''}</span>
                    <span className="text-2xs text-slate-500 shrink-0">{new Date(h.createdAt).toLocaleDateString('ar-EG')}</span>
                  </div>
                ))}
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemDetailModal;
