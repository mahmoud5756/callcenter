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

  const group = (title: string, source: ProblemSource, list: { id: string; label: string }[]) => (
    <div className="space-y-1.5 pt-2 border-t border-red-200 first:border-t-0 first:pt-0">
      <label className="block text-2xs font-bold text-slate-700">{title}</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {list.map((item) => {
          const on = has(source, item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(source, item.id)}
              aria-pressed={on}
              className={`p-2 text-right rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                on ? 'bg-red-700 text-white border-red-800' : 'bg-white hover:bg-red-50 text-slate-800 border-slate-200'
              }`}
            >
              <span>{item.label}</span>
              {on && <CheckIcon size={13} />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        تقدر تختار أكتر من مشكلة (ومن الجهتين لو لزم). كل مشكلة بتتسجل كتذكرة منفصلة، والتعويض بيتسجل مرة واحدة على أول تذكرة.
      </p>
      {group('حدد نوع خطأ الكول سنتر:', 'call_center', CALL_CENTER_PROBLEM_OPTIONS)}
      {group('حدد نوع مشكلة المطعم / التحضير:', 'restaurant', RESTAURANT_PROBLEM_OPTIONS)}
      {value.length > 0 && (
        <div className="text-2xs font-bold text-slate-600">تم اختيار {value.length} مشكلة</div>
      )}
    </div>
  );
};
