import React, { useState } from 'react';
import { copyText, cleanPhone } from '../../services/dial';

export const PhoneNumber: React.FC<{ phone: string }> = ({ phone }) => {
  const [done, setDone] = useState(false);
  const copy = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (await copyText(cleanPhone(phone))) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5" dir="ltr">
      <span className="select-all font-mono">{phone}</span>
      <span role="button" tabIndex={0} title="نسخ الرقم" onClick={copy}
        onKeyDown={(e) => e.key === 'Enter' && copy(e)}
        className={`cursor-pointer text-[10px] font-bold rounded px-1.5 py-0.5 border transition ${done ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
        {done ? 'تم النسخ ✓' : 'نسخ'}
      </span>
    </span>
  );
};

export const CopyButton: React.FC<{ phone: string; label: string }> = ({ phone, label }) => {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={async () => { if (await copyText(cleanPhone(phone))) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
      className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold cursor-pointer">
      {done ? 'تم النسخ ✓' : label}
    </button>
  );
};
