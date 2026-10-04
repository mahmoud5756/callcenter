import React from 'react';
import { CheckIcon } from '../icons/SvgIcons';
import { ProblemSource } from '../../types';
import { CALL_CENTER_PROBLEM_OPTIONS, RESTAURANT_PROBLEM_OPTIONS } from '../../services/problemLabels';

export interface ProblemItem {
  source: ProblemSource;
  type: string;
}

interface Props {
  value: ProblemItem[];
  onChange: (v: ProblemItem[]) => void;
}

/** Multi-select: pick as many problems as needed, from the call center and/or the restaurant. */
export const ProblemTypePicker: React.FC<Props> = ({ value, onChange }) => {
  const has = (source: ProblemSource, type: string) => value.some((v) => v.source === source && v.type === type);
  const toggle = (source: ProblemSource, type: string) =>
    onChange(has(source, type) ? value.filter((v) => !(v.source === source && v.type === type)) : [...value, { source, type }]);

  const group = (title: string, source: ProblemSource, list: { id: string; label: string }[]) => {
    const count = value.filter((v) => v.source === source).length;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-2xs font-black text-slate-700">{title}</label>
          {count > 0 && <span className="text-3xs font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5">{count}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {list.map((item) => {
            const on = has(source, item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(source, item.id)}
                aria-pressed={on}
                className={`px-2.5 py-1.5 rounded-full text-2xs font-semibold border transition-all cursor-pointer inline-flex items-center gap-1 ${
                  on ? 'bg-red-700 text-white border-red-800' : 'bg-white hover:bg-red-50 text-slate-700 border-slate-200'
                }`}
              >
                {on && <CheckIcon size={11} />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-3xs text-slate-500">اختار أكتر من مشكلة لو لزم — كل واحدة تذكرة منفصلة، والتعويض على أول تذكرة.</p>
      {group('خطأ الكول سنتر', 'call_center', CALL_CENTER_PROBLEM_OPTIONS)}
      <div className="border-t border-red-100" />
      {group('مشكلة المطعم / التحضير', 'restaurant', RESTAURANT_PROBLEM_OPTIONS)}
    </div>
  );
};
