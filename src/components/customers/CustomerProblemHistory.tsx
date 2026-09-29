import React, { useState } from 'react';
import { Problem } from '../../types';
import {
  formatProblemType,
  cleanBranchName,
  PROBLEM_STATUS_LABEL,
  isProblemUnresolved,
} from '../../services/problemLabels';
import { formatCompensationType } from '../../services/compensationHelpers';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

const statusStyle = (status: string): string => {
  if (status === 'compensated' || status === 'resolved' || status === 'resolved_on_call' || status === 'closed')
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'pending_compensation') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
};

const ProblemRow: React.FC<{ p: Problem }> = ({ p }) => {
  const unresolved = isProblemUnresolved(p.status);
  const details = (p.details || '').replace(/^\[شكوى واردة\]\s*/, '');
  const isInbound = (p.details || '').startsWith('[شكوى واردة]');

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-slate-900">{formatProblemType(p.type)}</span>
        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-2xs font-bold">
          {p.source === 'call_center' ? 'كول سنتر' : 'مطعم / فرع'}
        </span>
        {isInbound && (
          <span className="px-1.5 py-0.5 rounded-md bg-red-600 text-white text-2xs font-bold">شكوى واردة</span>
        )}
        <span className={`px-1.5 py-0.5 rounded-md border text-2xs font-bold ${statusStyle(p.status)}`}>
          {PROBLEM_STATUS_LABEL[p.status] || p.status}
        </span>
        <span className="text-2xs text-slate-400 mr-auto tabular-nums">{fmtDate(p.createdAt)}</span>
      </div>

      <div className="text-2xs text-slate-400">
        أوردر {p.orderNumber || '-'} · فرع {cleanBranchName(p.branchName)}
        {p.reportedByUserName ? ` · سجّلها ${p.reportedByUserName}` : ''}
      </div>

      {details && details !== 'بدون تفاصيل' && details !== 'بدون تفاصيل إضافية' && (
        <p className="text-slate-700 leading-relaxed">
          <span className="font-bold text-slate-500">التفاصيل: </span>
          {details}
        </p>
      )}

      {/* How it was handled */}
      {unresolved && !p.resolutionNotes ? (
        <p className="text-red-700 font-bold">لسه ماتحلتش — {PROBLEM_STATUS_LABEL[p.status] || p.status}</p>
      ) : (
        <p className="text-emerald-800 leading-relaxed">
          <span className="font-bold">اتحلّت إزاي: </span>
          {p.resolutionNotes || 'لا توجد تفاصيل حل مسجّلة'}
          {p.resolvedByUserName ? ` (${p.resolvedByUserName}${p.resolvedAt ? ` · ${fmtDate(p.resolvedAt)}` : ''})` : ''}
        </p>
      )}

      {p.hasCompensation && (
        <p className="text-amber-800 leading-relaxed">
          <span className="font-bold">التعويض: </span>
          {formatCompensationType(p.compensationType)}
          {p.compensationDetails ? ` — ${p.compensationDetails}` : ''}
          {' · '}
          {p.compensationStatus === 'compensated' ? 'اتنفّذ' : 'لسه معلّق'}
        </p>
      )}
    </div>
  );
};

interface Props {
  problems: Problem[];
  /** how many to show before "show all" */
  initialVisible?: number;
}

export const CustomerProblemHistory: React.FC<Props> = ({ problems, initialVisible = 3 }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? problems : problems.slice(0, initialVisible);

  return (
    <div className="space-y-2">
      {visible.map((p) => (
        <ProblemRow key={p.id} p={p} />
      ))}
      {problems.length > initialVisible && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-2xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
        >
          {showAll ? 'عرض أقل' : `عرض كل المشاكل (${problems.length})`}
        </button>
      )}
    </div>
  );
};
