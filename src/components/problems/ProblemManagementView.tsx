import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  AlertCircleIcon,
  SearchIcon,
  FilterIcon,
  DownloadIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  HeadsetIcon,
  UtensilsIcon,
  EditIcon,
  XIcon,
  AlertTriangleIcon,
  SparklesIcon,
  CheckIcon,
} from '../icons/SvgIcons';
import { normalizePhoneNumber } from '../../services/algorithms';
import { ZeroState } from '../common/ZeroState';
import { Problem, ProblemStatus } from '../../types';
import { formatCompensationType } from '../../services/compensationHelpers';
import { formatProblemType, cleanBranchName } from '../../services/problemLabels';

export const ProblemManagementView: React.FC = () => {
  const {
    problems,
    updateProblemStatus,
    confirmCompensationExecuted,
    exportCsvReport,
    currentUser,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const dualKeys = useMemo(() => {
    const m = new Map<string, Set<string>>();
    problems.forEach((p) => {
      const k = normalizePhoneNumber(p.customerPhone) || p.customerPhone;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(p.source);
    });
    return new Set(Array.from(m.entries()).filter(([, s]) => s.size > 1).map(([k]) => k));
  }, [problems]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const [resolvingProblem, setResolvingProblem] = useState<Problem | null>(null);
  const [targetStatus, setTargetStatus] = useState<ProblemStatus>('resolved');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');

  const [executingCompensationProblem, setExecutingCompensationProblem] = useState<Problem | null>(null);
  const [execAppliedOrderNumber, setExecAppliedOrderNumber] = useState<string>('');
  const [execNotes, setExecNotes] = useState<string>('');

  const escalatedCount = useMemo(() => {
    return problems.filter((p) => p.status === 'escalated' || (p.status === 'open' && p.isEscalated)).length;
  }, [problems]);

  const pendingCompensationsCount = useMemo(() => {
    return problems.filter((p) => p.compensationStatus === 'pending_compensation' || p.status === 'pending_compensation').length;
  }, [problems]);

  const compensatedCount = useMemo(() => {
    return problems.filter((p) => p.compensationStatus === 'compensated' || p.status === 'compensated').length;
  }, [problems]);

  if (problems.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center max-w-2xl mx-auto my-8">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircleIcon size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          لا توجد مشاكل مسجلة حتى الآن
        </h3>
        <p className="text-slate-500 text-xs">
          عند تسجيل أي مشكلة أثناء مكالمات المتابعة (سواء كول سنتر أو مطعم)، ستظهر هنا فوراً لمتابعة حلها مع الإدارة والفروع.
        </p>
      </div>
    );
  }

  const branches = useMemo(() => {
    const set = new Set<string>();
    problems.forEach((p) => {
      if (p.branchName && !/TOTAL|المجموع|الاجمالي|الإجمالي/i.test(p.branchName)) {
        set.add(cleanBranchName(p.branchName));
      }
    });
    return Array.from(set);
  }, [problems]);

  const filteredProblems = useMemo(() => {
    return problems.filter((problem) => {
      const matchSearch =
        problem.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        problem.customerPhone.includes(searchTerm) ||
        problem.orderNumber.includes(searchTerm) ||
        formatProblemType(problem.type).toLowerCase().includes(searchTerm.toLowerCase()) ||
        problem.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (problem.compensationDetails && problem.compensationDetails.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (problem.compensationType && formatCompensationType(problem.compensationType).toLowerCase().includes(searchTerm.toLowerCase()));

      const matchSource =
        sourceFilter === 'all'
          ? true
          : sourceFilter === 'both'
          ? dualKeys.has(normalizePhoneNumber(problem.customerPhone) || problem.customerPhone)
          : problem.source === sourceFilter;
      
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending_action'
          ? problem.status === 'open' || problem.status === 'escalated' || problem.status === 'in_progress'
          : statusFilter === 'pending_compensation'
          ? problem.status === 'pending_compensation' || problem.compensationStatus === 'pending_compensation'
          : statusFilter === 'compensated'
          ? problem.status === 'compensated' || problem.compensationStatus === 'compensated'
          : problem.status === statusFilter;

      const matchBranch =
        branchFilter === 'all' || cleanBranchName(problem.branchName) === branchFilter;

      return matchSearch && matchSource && matchStatus && matchBranch;
    });
  }, [problems, dualKeys, searchTerm, sourceFilter, statusFilter, branchFilter]);

  const openResolveModal = (problem: Problem) => {
    setResolvingProblem(problem);
    setTargetStatus(problem.status === 'open' || problem.status === 'escalated' ? 'in_progress' : 'resolved');
    setResolutionNotes(problem.resolutionNotes || '');
  };

  const handleSaveResolution = async () => {
    if (!resolvingProblem) return;
    const isFinal = targetStatus === 'resolved' || targetStatus === 'closed';
    if (isFinal && !resolutionNotes.trim()) {
      window.alert('اكتب تفاصيل الحل قبل الحفظ');
      return;
    }
    const ok = await updateProblemStatus(resolvingProblem.id, targetStatus, resolutionNotes.trim() || undefined);
    if (ok) setResolvingProblem(null);
  };

  const handleConfirmCompensation = () => {
    if (!executingCompensationProblem) return;
    confirmCompensationExecuted(
      executingCompensationProblem.id,
      execAppliedOrderNumber.trim() || undefined,
      execNotes.trim() || undefined
    );
    setExecutingCompensationProblem(null);
    setExecAppliedOrderNumber('');
    setExecNotes('');
  };

  const getStatusBadge = (status: ProblemStatus, isEscalated?: boolean) => {
    switch (status) {
      case 'escalated':
        return {
          label: 'مفتوحة / مصعدة للإدارة',
          class: 'bg-red-600 text-white font-black shadow-xs ring-2 ring-red-500/30',
        };
      case 'open':
        return isEscalated
          ? {
              label: 'مفتوحة / مصعدة للإدارة',
              class: 'bg-red-600 text-white font-black shadow-xs ring-2 ring-red-500/30',
            }
          : { label: 'مفتوحة', class: 'bg-red-100 text-red-800 border-red-200' };
      case 'in_progress':
        return { label: 'قيد المتابعة', class: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'resolved_on_call':
        return {
          label: 'محلولة فورياً أثناء المكالمة',
          class: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
        };
      case 'pending_compensation':
        return {
          label: 'تعويض معلق التنفيذ',
          class: 'bg-purple-700 text-white font-black shadow-xs ring-2 ring-purple-400/40',
        };
      case 'compensated':
        return {
          label: 'تم تنفيذ التعويض بنجاح',
          class: 'bg-emerald-600 text-white font-black shadow-xs',
        };
      case 'resolved':
        return { label: 'تم الحل والتعويض', class: 'bg-teal-100 text-teal-800 border-teal-200' };
      case 'closed':
        return { label: 'مغلقة', class: 'bg-slate-100 text-slate-700 border-slate-200' };
      default:
        return { label: status, class: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Urgent Escalated Problems Alert for Managers */}
      {escalatedCount > 0 && (
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg border border-red-500 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
              <AlertTriangleIcon size={22} />
            </div>
            <div>
              <div className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>تنبيه الإدارة: يوجد ({escalatedCount}) تذكرة مشكلة مصعدة للإدارة!</span>
                <span className="text-3xs bg-white text-red-700 px-2 py-0.5 rounded-full font-black">
                  عاجل
                </span>
              </div>
              <div className="text-xs text-red-100 mt-0.5">
                مشاكل مستعصية تم تصعيدها أثناء مكالمات المتابعة تتطلب تدخلاً مباشراً مع الفرع أو الإدارة العامة أو استرجاع مبالغ.
              </div>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter(statusFilter === 'escalated' ? 'all' : 'escalated')}
            className="px-4 py-2 bg-white hover:bg-red-50 text-red-700 rounded-xl text-xs font-black shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
          >
            {statusFilter === 'escalated' ? 'عرض جميع التذاكر' : 'عرض المصعدة فقط'}
          </button>
        </div>
      )}

      {/* Header and Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                إدارة ومتابعة تذاكر المشاكل
              </h1>
              <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-red-100 text-red-800 border border-red-200">
                {problems.length} مشكلة
              </span>
              {escalatedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-2xs font-black bg-red-600 text-white shadow-xs">
                  {escalatedCount} مصعدة
                </span>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              متابعة المشاكل المصعدة من خدمة العملاء وتوثيق الإجراءات التصحيحية المتخذة مع المطاعم والكول سنتر.
            </p>
          </div>

          <button
            onClick={() => exportCsvReport('problems')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer self-start md:self-auto"
          >
            <DownloadIcon size={16} />
            <span>تصدير تقرير المشاكل CSV</span>
          </button>
        </div>

        {/* Filter Tabs / Quick Selectors */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            جميع التذاكر ({problems.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('pending_action')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'pending_action'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
            }`}
          >
            المعلقة وقيد المتابعة
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('escalated')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'escalated'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
            }`}
          >
            <AlertTriangleIcon size={13} />
            <span>مصعدة للإدارة</span>
            {escalatedCount > 0 && (
              <span className="px-1.5 py-0.2 bg-white text-red-700 rounded-full font-black text-3xs">
                {escalatedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('pending_compensation')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'pending_compensation'
                ? 'bg-purple-700 text-white shadow-xs ring-2 ring-purple-400/40'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200'
            }`}
          >
            <SparklesIcon size={13} className="text-amber-500" />
            <span>تعويضات معلقة التنفيذ</span>
            {pendingCompensationsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-purple-700 text-white rounded-full font-black text-3xs">
                {pendingCompensationsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('compensated')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'compensated'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}
          >
            <CheckCircleIcon size={13} />
            <span>تم تنفيذ التعويض بنجاح ({compensatedCount})</span>
          </button>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100">
          <div className="relative">
            <SearchIcon
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالعميل، الهاتف، الأوردر، نوع المشكلة، تفاصيل التعويض..."
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">جميع المصادر</option>
            <option value="call_center">مشاكل الكول سنتر</option>
            <option value="restaurant">مشاكل المطعم / الفرع</option>
            <option value="both">عملاء مشاكلهم من المطعم والكول سنتر معاً</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">جميع الحالات ({problems.length})</option>
            <option value="pending_action">المعلقة والمصعدة (تتطلب تدخل الإدارة)</option>
            <option value="pending_compensation">تعويضات معلقة التنفيذ ({pendingCompensationsCount})</option>
            <option value="compensated">تم تنفيذ التعويض بنجاح ({compensatedCount})</option>
            <option value="escalated">مفتوحة / مصعدة للإدارة</option>
            <option value="in_progress">قيد المتابعة</option>
            <option value="resolved_on_call">محلولة فورياً أثناء المكالمة</option>
            <option value="resolved">تم الحل والتعويض</option>
            <option value="closed">مغلقة</option>
          </select>

          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">جميع الفروع</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  فرع {cleanBranchName(b)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Problems Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">الأوردر والعميل</th>
                <th className="p-3.5">الفرع</th>
                <th className="p-3.5">مصدر المشكلة</th>
                <th className="p-3.5">نوع المشكلة والتفاصيل</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">مسؤول الحل / الملاحظات</th>
                <th className="p-3.5">تاريخ التسجيل</th>
                <th className="p-3.5 text-center">تحديث الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProblems.map((problem) => {
                const statusBadge = getStatusBadge(problem.status, problem.isEscalated);

                return (
                  <tr key={problem.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{problem.customerName}</div>
                      <div className="text-2xs text-slate-500 font-mono">
                        #{problem.orderNumber} • <span dir="ltr">{problem.customerPhone}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-bold text-slate-700">
                      فرع {cleanBranchName(problem.branchName)}
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold ${
                          problem.source === 'call_center'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {problem.source === 'call_center' ? (
                          <>
                            <HeadsetIcon size={12} />
                            <span>كول سنتر</span>
                          </>
                        ) : (
                          <>
                            <UtensilsIcon size={12} />
                            <span>مطعم / فرع</span>
                          </>
                        )}
                      </span>
                    </td>

                    <td className="p-3.5 max-w-sm [overflow-wrap:anywhere]">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {formatProblemType(problem.type)}
                      </div>
                      <p className={`text-2xs mt-0.5 whitespace-pre-wrap ${problem.details === 'بدون تفاصيل' ? 'text-slate-400 italic' : 'text-slate-600'}`}>
                        {problem.details === 'بدون تفاصيل' ? 'لم تُسجَّل تفاصيل للمشكلة' : problem.details}
                      </p>

                      {problem.resolutionNotes && (
                        <div className="mt-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-2xs text-emerald-900">
                          <div className="font-black">تفاصيل الحل</div>
                          <div className="font-medium whitespace-pre-wrap [overflow-wrap:anywhere]">{problem.resolutionNotes}</div>
                          {problem.resolvedByUserName && (
                            <div className="text-3xs text-emerald-700 mt-0.5">
                              {problem.resolvedByUserName}
                              {problem.resolvedAt ? ` · ${new Date(problem.resolvedAt).toLocaleString('ar-EG')}` : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {(problem.oldOrderNumber || problem.newOrderNumber) && (
                        <div className="mt-1 text-3xs font-mono font-bold text-slate-600">
                          {problem.oldOrderNumber && `الأوردر القديم #${problem.oldOrderNumber}`}
                          {problem.newOrderNumber && ` ← الجديد #${problem.newOrderNumber}`}
                        </div>
                      )}

                      {/* Compensation Details Badge if present */}
                      {(problem.hasCompensation || problem.compensationType) && (
                        <div className="mt-1.5 p-2 bg-purple-50/90 border border-purple-200 rounded-xl text-2xs text-purple-900">
                          <div className="font-black flex items-center gap-1 text-purple-950">
                            <SparklesIcon size={12} className="text-purple-700 shrink-0" />
                            <span>التعويض: {formatCompensationType(problem.compensationType)}</span>
                          </div>
                          <div className="text-purple-800 mt-0.5 font-medium [overflow-wrap:anywhere]">
                            {problem.compensationDetails || 'بدون تفاصيل إضافية'}
                          </div>
                          {problem.compensationAppliedOrderNumber && (
                            <div className="text-3xs text-purple-700 font-mono mt-0.5 font-bold">
                              تم التطبيق على أوردر: #{problem.compensationAppliedOrderNumber}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`inline-block max-w-[9rem] text-center leading-snug px-2.5 py-1 rounded-2xl text-2xs font-extrabold border ${statusBadge.class}`}
                      >
                        {statusBadge.label}
                      </span>
                    </td>

                    <td className="p-3.5">
                      {problem.resolvedByUserName ? (
                        <div className="text-2xs text-slate-700">
                          <span className="font-bold">{problem.resolvedByUserName}</span>
                          {problem.resolvedAt && (
                            <p className="text-slate-500">
                              {new Date(problem.resolvedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-2xs text-slate-400">
                          {problem.compensationStatus === 'pending_compensation'
                            ? 'بانتظار تنفيذ التعويض'
                            : 'قيد المتابعة'}
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-2xs text-slate-500">
                      <div>{new Date(problem.createdAt).toLocaleDateString('ar-EG')}</div>
                      <div>بواسطة: {problem.compensationPromisedByUserName || problem.reportedByUserName}</div>
                    </td>

                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {(problem.status === 'pending_compensation' || problem.compensationStatus === 'pending_compensation') && (
                          <button
                            type="button"
                            onClick={() => setExecutingCompensationProblem(problem)}
                            className="px-2.5 py-1.5 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-slate-950 font-black text-3xs rounded-lg shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap border border-amber-300"
                            title="تأكيد استلام العميل للتعويض وإغلاق الدورة"
                          >
                            <CheckIcon size={12} />
                            <span>تأكيد استلام التعويض</span>
                          </button>
                        )}

                        <button
                          onClick={() => openResolveModal(problem)}
                          className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          title="تحديث حالة التذكرة والإجراء"
                        >
                          <EditIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolve / Update Modal */}
      {resolvingProblem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                تحديث حالة المشكلة (أوردر #{resolvingProblem.orderNumber})
              </h3>
              <button
                onClick={() => setResolvingProblem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <XIcon size={20} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                تغيير حالة التذكرة:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setTargetStatus('in_progress')}
                  className={`p-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                    targetStatus === 'in_progress'
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  قيد المتابعة
                </button>
                <button
                  type="button"
                  onClick={() => setTargetStatus('resolved')}
                  className={`p-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                    targetStatus === 'resolved'
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  تم الحل والتعويض
                </button>
                <button
                  type="button"
                  onClick={() => setTargetStatus('open')}
                  className={`p-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                    targetStatus === 'open'
                      ? 'bg-red-600 text-white border-red-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  مفتوحة
                </button>
                <button
                  type="button"
                  onClick={() => setTargetStatus('closed')}
                  className={`p-2 rounded-lg font-bold border transition-colors cursor-pointer ${
                    targetStatus === 'closed'
                      ? 'bg-slate-700 text-white border-slate-800'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  إغلاق التذكرة
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الإجراء المتخذ وتفاصيل الحل:
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="اكتب ما تم الاتفاق عليه مع الفرع / العميل (مثال: تم إرسال الصنف الناقص + حلوى مجاناً والعميل راضٍ)..."
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolvingProblem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveResolution}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
              >
                حفظ التحديث
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Executing Compensation (Closing the Loop) */}
      {executingCompensationProblem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
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
              <div><strong>الفرع:</strong> {cleanBranchName(executingCompensationProblem.branchName)}</div>
              <div><strong>نوع التعويض:</strong> {formatCompensationType(executingCompensationProblem.compensationType)}</div>
              <div><strong>تفاصيل التعويض:</strong> {executingCompensationProblem.compensationDetails || 'غير محدد'}</div>
              <div><strong>وعد به الموظف:</strong> {executingCompensationProblem.compensationPromisedByUserName || executingCompensationProblem.reportedByUserName}</div>
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
                ✓ تأكيد استلام العميل للتعويض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
