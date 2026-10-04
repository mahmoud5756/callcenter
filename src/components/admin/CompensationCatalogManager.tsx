import React, { useEffect, useState } from 'react';
import { SparklesIcon, PlusIcon, TrashIcon, CheckIcon } from '../icons/SvgIcons';
import { COMPENSATION_TYPES } from '../../services/compensationHelpers';
import {
  CompensationOption,
  DEFAULT_COMPENSATION_OPTIONS,
  saveCompensationOptions,
  useCompensationOptions,
} from '../../services/compensationCatalog';
import { CompensationType } from '../../types';

/** Admin-only: controls the compensation choices every agent/manager sees on every screen. */
export const CompensationCatalogManager: React.FC = () => {
  const saved = useCompensationOptions();
  const [rows, setRows] = useState<CompensationOption[]>(saved);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(saved); }, [saved]);

  const update = (id: string, patch: Partial<CompensationOption>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const add = () =>
    setRows((r) => [
      ...r,
      { id: `custom_${Date.now().toString(36)}`, label: '', type: 'discount_percentage', active: true },
    ]);

  const save = async () => {
    const cleaned = rows.filter((r) => r.label.trim()).map((r) => ({ ...r, label: r.label.trim() }));
    if (cleaned.length === 0) {
      setMsg({ ok: false, text: 'لازم يفضل خيار تعويض واحد على الأقل' });
      return;
    }
    setSaving(true);
    const { shared } = await saveCompensationOptions(cleaned);
    setSaving(false);
    setMsg({
      ok: true,
      text: shared
        ? 'تم الحفظ لكل المستخدمين'
        : 'اتحفظ على الجهاز ده بس — شغّل ملف db/compensation_options.sql في Supabase عشان يتشارك مع كل الموظفين',
    });
    setTimeout(() => setMsg(null), 6000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-xs">
      <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
        <SparklesIcon size={16} className="text-purple-700" />
        <span>خيارات التعويض (التحكم الكامل للأدمن)</span>
      </h4>
      <p className="text-slate-500 leading-relaxed">
        القايمة دي هي نفسها اللي بتظهر في المكالمة، والشكوى الواردة، وتحديث حالة التذكرة. الخيار المعطّل بيختفي من الاختيار
        لكن التذاكر القديمة بتفضل زي ما هي.
      </p>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="border border-slate-200 rounded-xl p-2.5 space-y-2 bg-slate-50/60">
            <input
              value={r.label}
              onChange={(e) => update(r.id, { label: e.target.value })}
              placeholder="اسم التعويض (مثال: خصم 50% على أي ساندويتش)"
              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
            />
            <div className="flex items-center gap-2">
              <select
                value={r.type}
                onChange={(e) => update(r.id, { type: e.target.value as CompensationType })}
                className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-2xs"
                title="التصنيف المحاسبي للتقارير"
              >
                {COMPENSATION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-2xs font-bold text-slate-700 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={r.active} onChange={(e) => update(r.id, { active: e.target.checked })} />
                مفعّل
              </label>
              <button
                type="button"
                onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                aria-label="حذف"
              >
                <TrashIcon size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} className="px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer">
          <PlusIcon size={14} /> إضافة تعويض
        </button>
        <button
          type="button"
          onClick={() => { if (window.confirm('إرجاع قايمة التعويضات للوضع الافتراضي؟')) setRows(DEFAULT_COMPENSATION_OPTIONS); }}
          className="px-3 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-bold cursor-pointer"
        >
          الافتراضي
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mr-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'جاري الحفظ…' : 'حفظ التعويضات'}
        </button>
      </div>

      {msg && (
        <div className={`p-2 rounded-lg text-center font-bold flex items-center justify-center gap-1.5 ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          <CheckIcon size={14} />
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
};
