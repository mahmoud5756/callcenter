import React from 'react';
import { CheckIcon, SparklesIcon } from '../icons/SvgIcons';
import {
  CompensationChoice,
  useCompensationOptions,
} from '../../services/compensationCatalog';

interface Props {
  value: CompensationChoice;
  onChange: (v: CompensationChoice) => void;
  /** show a "no compensation" choice (default true) */
  allowNone?: boolean;
  title?: string;
}

/** The single compensation selector used by EVERY screen (call, inbound complaint, ticket update). */
export const CompensationPicker: React.FC<Props> = ({ value, onChange, allowNone = true, title }) => {
  const options = useCompensationOptions().filter((o) => o.active);

  const btn = (selected: boolean) =>
    `px-2.5 py-1.5 rounded-full border text-2xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
      selected
        ? 'bg-purple-700 text-white border-purple-800 shadow-xs ring-2 ring-purple-400/40'
        : 'bg-white hover:bg-purple-100/70 text-slate-800 border-purple-200'
    }`;

  return (
    <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-2">
      <div className="flex items-center gap-2 text-purple-950">
        <SparklesIcon size={16} className="text-purple-700" />
        <span className="font-black text-xs">{title || 'التعويض / الإرضاء'}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {allowNone && (
          <button type="button" onClick={() => onChange({ optionId: '', note: '' })} className={btn(value.optionId === '')}>
            <span>بدون تعويض</span>
            {value.optionId === '' && <CheckIcon size={12} className="shrink-0" />}
          </button>
        )}
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange({ ...value, optionId: o.id })} className={btn(value.optionId === o.id)}>
            <span>{o.label}</span>
            {value.optionId === o.id && <CheckIcon size={12} className="shrink-0" />}
          </button>
        ))}
      </div>

      {value.optionId !== '' && (
        <input
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="تفاصيل إضافية للتعويض (اختياري) — مثال: على الأوردر القادم فقط"
          className="w-full p-2.5 bg-white border border-purple-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
        />
      )}
    </div>
  );
};
