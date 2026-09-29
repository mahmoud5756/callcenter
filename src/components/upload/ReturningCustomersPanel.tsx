import React, { useState } from 'react';
import { ReturningCustomer } from '../../services/customerHistory';
import { CustomerProblemHistory } from '../customers/CustomerProblemHistory';
import { AlertTriangleIcon, ChevronDownIcon } from '../icons/SvgIcons';

interface Props {
  customers: ReturningCustomer[];
  title?: string;
}

/** Customers in the uploaded file who already had problems: what, details, and how it was resolved. */
export const ReturningCustomersPanel: React.FC<Props> = ({
  customers,
  title = 'عملاء في الملف عندهم مشاكل سابقة',
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (customers.length === 0) return null;

  return (
    <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
        <AlertTriangleIcon size={16} className="text-amber-600" />
        <span>
          {title} ({customers.length})
        </span>
      </div>

      <div className="space-y-2">
        {customers.map((c) => {
          const open = openKey === c.key;
          return (
            <div key={c.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : c.key)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-right hover:bg-slate-50 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {c.name || 'عميل'} · <span className="font-mono">{c.phone}</span>
                  </div>
                  <div className="text-2xs text-slate-400">
                    أوردر {c.orderNumbers.slice(0, 4).join('، ')}
                    {c.orderNumbers.length > 4 ? ` +${c.orderNumbers.length - 4}` : ''} في الملف
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-2xs font-bold">
                    {c.problems.length} مشكلة سابقة
                  </span>
                  <ChevronDownIcon
                    size={14}
                    className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
              {open && (
                <div className="px-3 pb-3 bg-slate-50/60 border-t border-slate-100 pt-3">
                  <CustomerProblemHistory problems={c.problems} initialVisible={3} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
