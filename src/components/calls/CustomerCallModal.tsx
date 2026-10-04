import { CopyButton } from '../common/PhoneNumber';
import { buildDialUri } from '../../services/dial';
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PhoneCallIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XIcon,
  ClockIcon,
  UtensilsIcon,
  HeadsetIcon,
  AlertTriangleIcon,
  CheckIcon,
  ArrowLeftIcon,
  LockIcon,
  FlameIcon,
  ZapIcon,
  StarIcon,
  SparklesIcon,
} from '../icons/SvgIcons';
import {
  CallResult,
  ProblemSource,
  Problem,
} from '../../types';
import { generateSmartCallScript } from '../../services/algorithms';
import { formatItemName } from '../../services/arabicItemFixer';
import { findCustomerProblems } from '../../services/customerHistory';
import { CustomerProblemHistory } from '../customers/CustomerProblemHistory';
import { formatCompensationType } from '../../services/compensationHelpers';
import { CompensationPicker } from '../common/CompensationPicker';
import { ProblemTypePicker, ProblemItem } from '../common/ProblemTypePicker';
import {
  CompensationChoice,
  EMPTY_COMPENSATION,
  resolveCompensation,
  useCompensationOptions,
} from '../../services/compensationCatalog';

export const CustomerCallModal: React.FC = () => {
  const {
    activeCallModalOrderId,
    setActiveCallModalOrderId,
    allOrders,
    triggerClickToCall,
    unlockOrder,
    submitCallResult,
    confirmCompensationExecuted,
    customerCalls,
    problems,
    currentUser,
    settings,
  } = useApp();

  const savingRef = useRef(false);
  const [callResult, setCallResult] = useState<CallResult | null>(null);
  const [problemItems, setProblemItems] = useState<ProblemItem[]>([]);
  const [resolutionHow, setResolutionHow] = useState<string>('');
  const [oldOrderNumber, setOldOrderNumber] = useState<string>('');
  const [newOrderNumber, setNewOrderNumber] = useState<string>('');
  const [problemDetails, setProblemDetails] = useState<string>('');
  const [problemResolutionMode, setProblemResolutionMode] = useState<'resolved_on_call' | 'escalated' | null>(null);
  const [compChoice, setCompChoice] = useState<CompensationChoice>(EMPTY_COMPENSATION);
  const compCatalog = useCompensationOptions();
  const [executingCompensationProblem, setExecutingCompensationProblem] = useState<Problem | null>(null);
  const [execAppliedOrderNumber, setExecAppliedOrderNumber] = useState<string>('');
  const [execNotes, setExecNotes] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [customerRating, setCustomerRating] = useState<number>(5);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callTimerSeconds, setCallTimerSeconds] = useState<number>(0);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showScriptDrawer, setShowScriptDrawer] = useState<boolean>(true);

  const order = allOrders.find((o) => o.id === activeCallModalOrderId);

  // Derived from the multi-select: which side(s) the selected problems belong to
  const hasCcProblem = problemItems.some((i) => i.source === 'call_center');
  const hasRestProblem = problemItems.some((i) => i.source === 'restaurant');
  const problemSource: ProblemSource | 'both' | null =
    hasCcProblem && hasRestProblem ? 'both' : hasCcProblem ? 'call_center' : hasRestProblem ? 'restaurant' : null;

  // Reset state when opening a new order - automatically activate live call timer
  useEffect(() => {
    if (order) {
      setCallResult(null);
      setProblemItems([]);
      setResolutionHow('');
      setNewOrderNumber('');
      setOldOrderNumber(allOrders.find((o) => o.id === order.replacementForOrderId)?.orderNumber || order.orderNumber);
      setProblemDetails('');
      setProblemResolutionMode(null);
      setCompChoice(EMPTY_COMPENSATION);
      setExecutingCompensationProblem(null);
      setExecAppliedOrderNumber('');
      setExecNotes('');
      setNotes('');
      setCustomerRating(5);
      setCallStartTime(Date.now());
      setCallTimerSeconds(0);
      setIsCalling(true);
      setConflictError(null);
      setValidationError(null);
      setShowScriptDrawer(Boolean(order.replacementForOrderId || (order.priorityScore || 0) >= 60));
    }
  }, [activeCallModalOrderId]);

  // Live timer interval while in call
  useEffect(() => {
    let interval: any = null;
    if (isCalling && callStartTime) {
      interval = setInterval(() => {
        setCallTimerSeconds(Math.floor((Date.now() - callStartTime) / 1000));
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isCalling, callStartTime]);

  // Fast keyboard shortcuts ([1] تمام، [2] مشكلة، [3] لم يرد)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === '1') {
        setCallResult('tamam');
      } else if (e.key === '2') {
        setCallResult('problem');
      } else if (e.key === '3') {
        setCallResult('no_answer');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!order) return null;

  const previousCalls = customerCalls.filter(
    (c) => c.orderId === order.id || c.customerPhone === order.customerPhone
  );

  // Every previous problem of this customer (either phone, any number format)
  const customerHistory = findCustomerProblems(problems, [order.customerPhone, order.altPhone]);

  const pendingCompensation = customerHistory.find(
    (p) => p.compensationStatus === 'pending_compensation'
  );

  const pastProblemsCount = customerHistory.length;

  const smartScript = generateSmartCallScript(order, pastProblemsCount);

  const handleCallClick = async (phone: string) => {
    setConflictError(null);
    const result = await triggerClickToCall(order.id, phone);
    if (!result.success) {
      setConflictError(result.conflictMessage || 'تعذر بدء الاتصال');
      return;
    }
    setIsCalling(true);
    setCallStartTime(Date.now());
  };

  const handleClose = () => {
    if (order) {
      unlockOrder(order.id);
    }
    setActiveCallModalOrderId(null);
  };

  const handleConfirmCompensation = async () => {
    if (!executingCompensationProblem) return;
    await confirmCompensationExecuted(
      executingCompensationProblem.id,
      execAppliedOrderNumber.trim() || undefined,
      execNotes.trim() || undefined
    );
    setExecutingCompensationProblem(null);
    setExecAppliedOrderNumber('');
    setExecNotes('');
  };

  const handleSaveResult = async (moveToNext: boolean, callNextImmediately: boolean = false) => {
    setValidationError(null);

    if (!callResult) {
      setValidationError('يرجى تحديد نتيجة التواصل أولاً (تمام أو مشكلة أو لم يرد)');
      return;
    }

    if (callResult === 'problem') {
      if (problemItems.length === 0) {
        setValidationError('يرجى اختيار مشكلة واحدة على الأقل (تقدر تختار أكتر من مشكلة)');
        return;
      }
      if (!problemResolutionMode) {
        setValidationError('يرجى تحديد إجراء معالجة المشكلة: (تم الحل فورياً وإرضاء العميل) أو (تصعيد المشكلة للإدارة)');
        return;
      }
      if (!problemDetails.trim()) {
        setValidationError('يرجى كتابة تفاصيل المشكلة في الحقل النصي');
        return;
      }
      if (problemResolutionMode === 'resolved_on_call') {
        if (!resolutionHow.trim()) {
          setValidationError('يرجى كتابة كيف تم حل المشكلة (إجباري)');
          return;
        }
        if (!compChoice.optionId) {
          setValidationError('يرجى اختيار التعويض والإرضاء المقدم للعميل (إجباري)');
          return;
        }
      }
    }

    const durationSeconds = callStartTime
      ? Math.round((Date.now() - callStartTime) / 1000)
      : 0;

    if (savingRef.current) return;
    savingRef.current = true;
    let nextId: string | null = null;
    try {
    const comp = problemResolutionMode === 'resolved_on_call' ? resolveCompensation(compChoice, compCatalog) : null;
    nextId = await submitCallResult(order.id, {
      result: callResult,
      notes: notes.trim() || undefined,
      problemSource: problemItems[0]?.source,
      problemItems,
      resolutionDetails: resolutionHow.trim() || undefined,
      oldOrderNumber: oldOrderNumber.trim() || undefined,
      newOrderNumber: newOrderNumber.trim() || undefined,
      problemType: problemItems[0]?.type,
      problemDetails: problemDetails.trim() || undefined,
      problemResolutionMode: problemResolutionMode || undefined,
      callDurationSeconds: durationSeconds,
      customerRating: callResult === 'tamam' ? customerRating : Math.min(2, customerRating),
      compensationType: comp ? comp.type : undefined,
      compensationDetails: comp ? comp.details : undefined,
      compensationStatus: problemResolutionMode === 'resolved_on_call' ? 'pending_compensation' : undefined,
    });
    } finally {
      savingRef.current = false;
    }

    if (moveToNext) {
      if (nextId) {
        const nextOrder = allOrders.find((o) => o.id === nextId);
        if (callNextImmediately && nextOrder) {
          await triggerClickToCall(nextOrder.id, nextOrder.customerPhone);
        }
        setActiveCallModalOrderId(nextId);
      } else {
        setActiveCallModalOrderId(null);
      }
    } else {
      setActiveCallModalOrderId(null);
    }
  };

  const isLockedByOther =
    order.lockedByUserId &&
    order.lockedByUserId !== currentUser?.id &&
    order.lockedAt &&
    Date.now() - new Date(order.lockedAt).getTime() <
      (settings.agentLockTimeoutMinutes || 5) * 60 * 1000;

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200/90 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Luxury Header Card */}
        <div className="bg-gradient-to-r from-red-800 via-red-600 to-rose-700 text-white p-5 sm:p-6 relative">
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="إغلاق"
          >
            <XIcon size={18} />
          </button>

          <div className="flex flex-wrap items-center justify-between gap-4 pr-1 pl-12">
            <div>
              {/* Unboxed breadcrumb metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-red-100 mb-1">
                <span className="font-mono font-bold bg-white/10 px-2 py-0.5 rounded-md">أوردر #{order.orderNumber}</span>
                <span className="text-white/40" aria-hidden="true">·</span>
                <span className="font-bold">فرع {order.branchName || 'الرئيسي'}</span>
                {order.priorityLevel === 'critical' && (
                  <>
                    <span className="text-white/40" aria-hidden="true">·</span>
                    <span className="font-bold text-white flex items-center gap-1 bg-red-900/40 px-2 py-0.5 rounded-md">
                      <FlameIcon size={13} />
                      <span>أولوية قصوى</span>
                    </span>
                  </>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-white mb-1">
                {order.customerName}
              </h2>

              <div className="flex flex-wrap items-center gap-2 text-red-100 text-xs">
                <span>{order.orderDate}</span>
                <span className="text-white/40" aria-hidden="true">·</span>
                <span>{order.orderTime}</span>
                <span className="text-white/40" aria-hidden="true">·</span>
                <span className="bg-white/15 px-2 py-0.5 rounded-md font-bold text-white">
                  الكاشير (TAKER): {order.takerName || 'كاشير الفرع'}
                </span>
              </div>
            </div>

            {/* Click-to-Call Primary Action with Live Stopwatch */}
            <div className="flex flex-col sm:items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCallClick(order.customerPhone)}
                  disabled={Boolean(isLockedByOther)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer ${
                    isLockedByOther
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-white text-red-600 hover:bg-red-50 hover:shadow-lg'
                  }`}
                >
                  <PhoneCallIcon
                    size={18}
                    className={isCalling ? 'animate-bounce text-red-600' : ''}
                  />
                  <span dir="ltr" className="tracking-wide font-mono tabular-nums">
                    {order.customerPhone}
                  </span>
                  <span className="text-2xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">
                    اتصال وبدء المتابعة
                  </span>
                </button>

                {order.altPhone && (
                  <button
                    onClick={() => handleCallClick(order.altPhone!)}
                    disabled={Boolean(isLockedByOther)}
                    className="px-3 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-mono text-xs cursor-pointer"
                    title="الاتصال بالرقم البديل"
                    dir="ltr"
                  >
                    2: {order.altPhone}
                  </button>
                )}
              </div>

              {/* Copy numbers + manual dial fallback */}
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton phone={order.customerPhone} label="نسخ الرقم" />
                {order.altPhone && <CopyButton phone={order.altPhone} label="نسخ الرقم 2" />}
                <a href={buildDialUri(settings.callProtocol || 'tel', order.customerPhone, settings.sipServerUrl)}
                  className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold">
                  فتح في MicroSIP
                </a>
              </div>
              {isCalling && (
                <div className="text-[11px] text-red-100">لو MicroSIP مفتحش: الرقم اتنسخ تلقائياً، الصقه (Ctrl+V) في MicroSIP.</div>
              )}

              {/* Live Call Duration Stopwatch with Soundwave Pulse */}
              {isCalling && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-black/25 text-white text-xs font-mono tabular-nums font-bold">
                  <div className="flex items-center gap-0.5">
                    <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="w-1 h-4 bg-emerald-300 rounded-full animate-pulse delay-75" />
                    <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-150" />
                  </div>
                  <span>المكالمة: {formatTimer(callTimerSeconds)}</span>
                </div>
              )}

              {/* Conflict Status */}
              {isLockedByOther && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold shadow-xs">
                  <LockIcon size={13} />
                  <span>العميل قيد التواصل حالياً بواسطة: {order.lockedByUserName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {conflictError && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-xs font-bold">
              <AlertTriangleIcon size={18} className="text-amber-600 shrink-0" />
              <span>{conflictError}</span>
            </div>
          )}

          {validationError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs font-bold">
              <AlertCircleIcon size={18} className="text-red-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Re-order Warning Banner if Replacement for Void */}
          {order.replacementForOrderId && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900">
              <AlertTriangleIcon size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-amber-950 mb-0.5">
                  تنبيه ذكي: أوردر بديل لأوردر سابق ملغي (#
                  {allOrders.find((o) => o.id === order.replacementForOrderId)?.orderNumber ||
                    order.replacementForOrderId}
                  )
                </h4>
                <p className="text-2xs text-amber-800 leading-relaxed">
                  تم رصد إلغاء سابق لنفس العميل في هذا اليوم وتم عمل هذا الأوردر كبديل. يرجى التركيز على التأكد من رضاه التام وتدارك أي انزعاج سابق.
                </p>
              </div>
            </div>
          )}

          {/* Prominent Pending Compensation Banner (Requirement 2.1) */}
          {pendingCompensation && (
            <div className="p-4 bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-900 text-white rounded-2xl shadow-lg border-2 border-amber-400/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-black shadow-sm mt-0.5 sm:mt-0">
                  <SparklesIcon size={22} className="text-slate-950" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1 text-3xs font-black uppercase tracking-wider text-amber-300 bg-black/40 px-2 py-0.5 rounded-md mb-1 border border-amber-400/30">
                    <span>★ تعويض مستحق للعميل</span>
                  </div>
                  <h4 className="font-black text-xs sm:text-sm text-amber-100 leading-snug">
                    تنبيه: العميل لديه تعويض مستحق: [{formatCompensationType(pendingCompensation.compensationType)}: {pendingCompensation.compensationDetails || 'غير محدد'}]
                  </h4>
                  <p className="text-2xs text-purple-200 mt-1">
                    مسجل بتاريخ ({new Date(pendingCompensation.compensationPromisedAt || pendingCompensation.createdAt).toLocaleDateString('ar-EG')}) • وعد به: {pendingCompensation.compensationPromisedByUserName || pendingCompensation.reportedByUserName} (فرع {pendingCompensation.branchName || 'الرئيسي'})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExecutingCompensationProblem(pendingCompensation)}
                className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-slate-950 font-black text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-95 shrink-0 whitespace-nowrap border border-amber-200"
              >
                ✓ تأكيد استلام العميل للتعويض
              </button>
            </div>
          )}

          {/* Smart Call Script Assistant */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <SparklesIcon size={15} className="text-amber-400" />
                <h4 className="font-bold text-xs text-white">
                  المساعد الذكي لسيناريو المكالمة
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowScriptDrawer(!showScriptDrawer)}
                className="text-2xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                {showScriptDrawer ? 'طي السيناريو' : 'عرض نص المكالمة المقترح'}
              </button>
            </div>

            {showScriptDrawer && (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <span className="text-2xs font-bold text-amber-300 block mb-0.5">
                    الافتتاحية المقترحة:
                  </span>
                  <p className="text-slate-200 leading-relaxed">
                    {smartScript.greeting}
                  </p>
                </div>

                <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                  <span className="text-2xs font-bold text-amber-300 block mb-0.5">
                    سؤال الاستقصاء:
                  </span>
                  <p className="text-slate-200 leading-relaxed">
                    {smartScript.openingPitch} {smartScript.keyQuestion}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Customer's previous problems: what happened and how it was resolved */}
          {customerHistory.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <AlertTriangleIcon size={15} className="text-amber-600" />
                <span>العميل ده عنده {customerHistory.length} مشكلة سابقة</span>
              </div>
              <CustomerProblemHistory problems={customerHistory} initialVisible={2} />
            </div>
          )}

          {/* Order Summary & Items List */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 mb-3">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                <UtensilsIcon size={15} className="text-red-600" />
                <span>تفاصيل أصناف الأوردر</span>
              </div>
              <div className="text-xs font-bold text-slate-800">
                الإجمالي:{' '}
                <span className="text-red-600 font-mono tabular-nums font-black">
                  {order.totalAmount.toFixed(2)} ج.م
                </span>
              </div>
            </div>

            {order.items && order.items.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {order.items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200/70 font-mono font-black text-2xs shrink-0 select-none">
                        {item.quantity}×
                      </span>
                      <span className="font-bold text-slate-800 truncate" title={formatItemName(item.itemName)}>
                        {formatItemName(item.itemName)}
                      </span>
                    </div>
                    {item.price > 0 && (
                      <span className="text-slate-600 font-mono tabular-nums font-bold text-2xs shrink-0 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                        {item.price.toFixed(2)} ج.م
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-1">
                تفاصيل الأصناف مسجلة في نظام الكاشير
              </p>
            )}
          </div>

          {/* Core Call Evaluation Question */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="text-center">
              <span className="text-2xs font-bold text-slate-400">
                اختصارات سريعة: [1] تمام · [2] مشكلة · [3] لم يرد
              </span>
              <h3 className="text-base sm:text-lg font-display font-bold text-slate-900 mt-1">
                هل كل شيء تمام مع الأوردر؟
              </h3>
            </div>

            {/* Segmented Result Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setCallResult('tamam');
                  setProblemItems([]);
                  setProblemDetails('');
                }}
                className={`p-3.5 rounded-xl border-2 flex items-center justify-center gap-2.5 font-display font-bold text-base transition-all cursor-pointer ${
                  callResult === 'tamam'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                <CheckCircleIcon size={22} />
                <span>[1] تمام والأوردر ممتاز</span>
              </button>

              <button
                type="button"
                onClick={() => setCallResult('problem')}
                className={`p-3.5 rounded-xl border-2 flex items-center justify-center gap-2.5 font-display font-bold text-base transition-all cursor-pointer ${
                  callResult === 'problem'
                    ? 'bg-red-600 text-white border-red-700 shadow-xs'
                    : 'bg-red-50/50 hover:bg-red-50 text-red-800 border-red-200'
                }`}
              >
                <AlertCircleIcon size={22} />
                <span>[2] عنده مشكلة أو شكوى</span>
              </button>
            </div>

            {/* Customer Satisfaction Rating (CSAT Stars) */}
            {callResult === 'tamam' && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
                <span className="font-bold text-emerald-900">
                  تقييم رضا العميل (CSAT Score):
                </span>
                <div className="flex items-center gap-1 text-amber-500">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setCustomerRating(star)}
                      className="p-1 hover:scale-125 transition-transform cursor-pointer"
                    >
                      <StarIcon size={18} filled={star <= customerRating} />
                    </button>
                  ))}
                  <span className="mr-2 font-black font-mono text-emerald-900">
                    {customerRating} / 5
                  </span>
                </div>
              </div>
            )}

            {/* Quick Unreached Buttons */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-2xs text-slate-400 font-semibold mb-2 text-center">
                في حال عدم الوصول للعميل:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCallResult('no_answer');
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    callResult === 'no_answer'
                      ? 'bg-slate-800 text-white border-slate-900'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  [3] لم يرد
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCallResult('unavailable');
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    callResult === 'unavailable'
                      ? 'bg-slate-800 text-white border-slate-900'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  الرقم غير متاح
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCallResult('callback_requested');
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    callResult === 'callback_requested'
                      ? 'bg-purple-700 text-white border-purple-800'
                      : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
                  }`}
                >
                  طلب معاودة الاتصال
                </button>
              </div>
            </div>

            {/* Problem Detailed Branching */}
            {callResult === 'problem' && (
              <div className="mt-3 p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-3.5 animate-in fade-in duration-150">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <AlertCircleIcon size={16} className="text-red-600" />
                  <span>إيه المشكلة؟ (اختار واحدة أو أكتر)</span>
                </h4>

                <ProblemTypePicker value={problemItems} onChange={setProblemItems} />

                {problemSource && (
                  <div className="pt-1.5">
                    <label className="block text-2xs font-bold text-slate-700 mb-1">
                      تفاصيل الشكوى وملاحظة العميل (إجباري):
                    </label>
                    <textarea
                      value={problemDetails}
                      onChange={(e) => setProblemDetails(e.target.value)}
                      placeholder="اكتب بالتفصيل ما ذكره العميل ليتم توجيهه لإدارة الفرع..."
                      rows={2}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                {/* 2 Decisive Problem Resolution Options */}
                {problemItems.length > 0 && (
                  <div className="pt-3 border-t border-red-200/90 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-black text-slate-900">
                        طريقة معالجة المشكلة (إجراء حاسم):
                      </label>
                      <span className="text-3xs text-red-600 font-bold bg-white px-2 py-0.5 rounded-full border border-red-200">
                        مطلوب تحديد خيار
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option 1: Instant resolution on call */}
                      <button
                        type="button"
                        onClick={() => setProblemResolutionMode('resolved_on_call')}
                        className={`p-3.5 rounded-xl border-2 text-right transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          problemResolutionMode === 'resolved_on_call'
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                            : 'bg-white hover:bg-emerald-50/40 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-700">
                            <CheckCircleIcon size={16} />
                            <span>تم حل المشكلة وإرضاء العميل فورياً</span>
                          </span>
                          {problemResolutionMode === 'resolved_on_call' && (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                          )}
                        </div>
                        <p className="text-2xs text-slate-600 leading-relaxed">
                          الاعتذار وقبله العميل، وعد بإرسال الصنف، أو تعويض فوري. تُسجل المشكلة بحالة <strong className="text-emerald-800">"محلولة فورياً أثناء المكالمة"</strong> ولا تذهب لطابور المشاكل المعلقة.
                        </p>
                      </button>

                      {/* Option 2: Escalated to Management */}
                      <button
                        type="button"
                        onClick={() => setProblemResolutionMode('escalated')}
                        className={`p-3.5 rounded-xl border-2 text-right transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          problemResolutionMode === 'escalated'
                            ? 'bg-red-50 border-red-600 text-red-950 ring-2 ring-red-500/20 shadow-xs'
                            : 'bg-white hover:bg-red-50/40 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs flex items-center gap-1.5 text-red-700">
                            <AlertTriangleIcon size={16} />
                            <span>تصعيد المشكلة للإدارة (مشكلة مستعصية)</span>
                          </span>
                          {problemResolutionMode === 'escalated' && (
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                          )}
                        </div>
                        <p className="text-2xs text-slate-600 leading-relaxed">
                          تتطلب تدخل الفرع أو الإدارة العامة أو استرجاع مبلغ. تُسجل بحالة <strong className="text-red-800">"مفتوحة / مصعدة للإدارة"</strong> وتظهر فوراً في تذاكر المشاكل للمدير مع إشعار أحمر.
                        </p>
                      </button>
                    </div>

                    {problemResolutionMode && (
                      <div className="mt-3 p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
                        <div>
                          <div className="font-black text-xs text-slate-900 mb-1.5">بيانات العميل (بتتسجل مع المشكلة)</div>
                          <div className="grid grid-cols-2 gap-1.5 text-2xs text-slate-700">
                            <div>الاسم: <b>{order.customerName}</b></div>
                            <div>الفرع: <b>{order.branchName}</b></div>
                            <div dir="ltr" className="text-right">الهاتف: <b>{order.customerPhone}</b></div>
                            {order.altPhone && <div dir="ltr" className="text-right">هاتف بديل: <b>{order.altPhone}</b></div>}
                          </div>
                        </div>

                        {problemResolutionMode === 'resolved_on_call' && (
                          <div>
                            <label className="block text-2xs font-black text-slate-900 mb-1">كيف تم حل المشكلة؟ (إجباري)</label>
                            <textarea
                              value={resolutionHow}
                              onChange={(e) => setResolutionHow(e.target.value)}
                              rows={2}
                              placeholder="مثال: اعتذرت للعميل ووعدته بإرسال الصنف الناقص مع الأوردر الجاي..."
                              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-2xs font-bold text-slate-700 mb-1">رقم الأوردر القديم (اللي فيه المشكلة)</label>
                            <input value={oldOrderNumber} onChange={(e) => setOldOrderNumber(e.target.value)} dir="ltr"
                              className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono" />
                          </div>
                          <div>
                            <label className="block text-2xs font-bold text-slate-700 mb-1">رقم الأوردر الجديد (لو اتعمل بديل)</label>
                            <input value={newOrderNumber} onChange={(e) => setNewOrderNumber(e.target.value)} dir="ltr" placeholder="اختياري"
                              className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Unified compensation (same catalog/picker as every other screen) */}
                    {problemResolutionMode === 'resolved_on_call' && (
                      <CompensationPicker
                        value={compChoice}
                        onChange={setCompChoice}
                        allowNone={false}
                        title="تعويض وإرضاء العميل (إجباري)"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* General Notes Field */}
            <div>
              <label className="block text-2xs font-bold text-slate-500 mb-1">
                ملاحظات عامة حول المكالمة (اختياري):
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: العميل راضٍ تماماً ويطلب زيادة الصوص في المرات القادمة..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Call History Timeline */}
          {previousCalls.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-2.5">
                <ClockIcon size={14} className="text-slate-500" />
                <span>المحاولات السابقة لهذا العميل ({previousCalls.length})</span>
              </h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
                {previousCalls.map((call) => (
                  <div
                    key={call.id}
                    className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-800">
                        {call.callResult === 'tamam'
                          ? 'تمام'
                          : call.callResult === 'problem'
                          ? `مشكلة (${call.problemSource === 'call_center' ? 'كول سنتر' : 'مطعم'})`
                          : call.callResult === 'no_answer'
                          ? 'لم يرد'
                          : call.callResult === 'unavailable'
                          ? 'غير متاح'
                          : 'معاودة الاتصال'}
                      </span>
                      {call.notes && <p className="text-slate-500 text-2xs mt-0.5">{call.notes}</p>}
                    </div>
                    <div className="text-left text-slate-400 text-2xs">
                      <div>بواسطة: {call.userName}</div>
                      <div>{new Date(call.createdAt).toLocaleTimeString('ar-EG')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Sticky Actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-xl cursor-pointer hover:bg-slate-200/50 transition-colors"
          >
            إلغاء وإغلاق
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSaveResult(false, false)}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
            >
              حفظ وإغلاق
            </button>

            <button
              type="button"
              onClick={() => handleSaveResult(true, true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer ring-2 ring-emerald-600/20"
              title="حفظ النتيجة وبدء الاتصال بالعميل التالي فوراً دون أي نقرات زائدة"
            >
              <PhoneCallIcon size={16} />
              <span>حفظ والاتصال بالعميل التالي</span>
              <ArrowLeftIcon size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Executing Compensation (Closing the Loop) */}
      {executingCompensationProblem && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-purple-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircleIcon size={20} className="text-emerald-600" />
                <h3 className="font-black text-slate-900 text-sm sm:text-base">
                  تأكيد استلام العميل للتعويض
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExecutingCompensationProblem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
              <div><strong>العميل:</strong> {executingCompensationProblem.customerName} ({executingCompensationProblem.customerPhone})</div>
              <div><strong>نوع التعويض:</strong> {formatCompensationType(executingCompensationProblem.compensationType)}</div>
              <div><strong>تفاصيل التعويض:</strong> {executingCompensationProblem.compensationDetails || 'غير محدد'}</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-2xs font-bold text-slate-700 mb-1">
                  رقم الأوردر الجديد الذي تم تطبيق التعويض عليه (اختياري):
                </label>
                <input
                  type="text"
                  value={execAppliedOrderNumber}
                  onChange={(e) => setExecAppliedOrderNumber(e.target.value)}
                  placeholder="مثال: 45892"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold text-slate-700 mb-1">
                  ملاحظة تأكيد الاستلام:
                </label>
                <textarea
                  value={execNotes}
                  onChange={(e) => setExecNotes(e.target.value)}
                  placeholder="مثال: تم إرسال الصنف واستلمه العميل وهو راضي تماماً..."
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExecutingCompensationProblem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmCompensation}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
              >
                ✓ تأكيد التنفيذ وإغلاق التعويض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
