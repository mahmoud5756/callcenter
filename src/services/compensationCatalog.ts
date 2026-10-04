import { useEffect, useSyncExternalStore } from 'react';
import { CompensationType } from '../types';
import { supabase } from './supabase';

/**
 * ONE compensation system for the whole app.
 * Every screen (call modal, inbound complaint, ticket status update) picks from this same
 * admin-managed catalog. `type` is the base category that is stored in the database
 * (so reports/filters keep working); `label` is what the agent sees and is also written
 * into compensation_details, so the exact offer (e.g. "خصم 50% على أي ساندويتش") is never lost.
 */
export interface CompensationOption {
  id: string;
  label: string;
  type: CompensationType;
  active: boolean;
}

export const DEFAULT_COMPENSATION_OPTIONS: CompensationOption[] = [
  { id: 'sandwich_50', label: 'خصم 50% على أي ساندويتش', type: 'discount_percentage', active: true },
  { id: 'free_item_next_order', label: 'صنف مجاني / بديل مع الأوردر القادم', type: 'free_item_next_order', active: true },
  { id: 'instant_replacement_delivery', label: 'إرسال صنف بديل فوراً مع دليفري سريع', type: 'instant_replacement_delivery', active: true },
  { id: 'discount_percentage', label: 'خصم نسبة مئوية (حدد النسبة في التفاصيل)', type: 'discount_percentage', active: true },
  { id: 'cash_refund', label: 'استرداد نقدي (Cash Refund)', type: 'cash_refund', active: true },
  { id: 'wallet_credit', label: 'إضافة رصيد للمحفظة / نقاط', type: 'custom', active: true },
  { id: 'free_delivery', label: 'توصيل مجاني', type: 'custom', active: true },
  { id: 'verbal_apology', label: 'اعتذار شفهي فقط وقبله العميل', type: 'verbal_apology', active: true },
];

const LS_KEY = 'compensation_options_v1';
const CONFIG_KEY = 'compensation_options';

const sanitize = (raw: unknown): CompensationOption[] | null => {
  if (!Array.isArray(raw)) return null;
  const out: CompensationOption[] = [];
  for (const r of raw) {
    if (r && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.type === 'string' && r.label.trim()) {
      // admin-created entries have no meaningful category: always 'custom' (fixes ones saved with a wrong default)
      const type = String(r.id).startsWith('custom_') ? 'custom' : (r.type as CompensationType);
      out.push({ id: r.id, label: r.label.trim(), type, active: r.active !== false });
    }
  }
  return out.length ? out : null;
};

let options: CompensationOption[] = (() => {
  try {
    const parsed = sanitize(JSON.parse(localStorage.getItem(LS_KEY) || 'null'));
    if (parsed) return parsed;
  } catch { /* ignore */ }
  return DEFAULT_COMPENSATION_OPTIONS;
})();

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => options;

let serverLoaded = false;
const loadFromServer = async () => {
  if (serverLoaded) return;
  serverLoaded = true;
  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', CONFIG_KEY).maybeSingle();
    if (error || !data) return; // table missing / no row yet -> keep local/defaults
    const parsed = sanitize(data.value);
    if (parsed) {
      options = parsed;
      try { localStorage.setItem(LS_KEY, JSON.stringify(parsed)); } catch { /* ignore */ }
      emit();
    }
  } catch { /* ignore */ }
};

/** Admin only (enforced by the UI + RLS). Returns whether it was also saved to the shared database. */
export const saveCompensationOptions = async (input: CompensationOption[]): Promise<{ shared: boolean }> => {
  const next = input.map((o) => (o.id.startsWith('custom_') ? { ...o, type: 'custom' as CompensationType } : o));
  options = next;
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  emit();
  try {
    const { error } = await supabase
      .from('app_config')
      .upsert({ key: CONFIG_KEY, value: next, updated_at: new Date().toISOString() });
    return { shared: !error };
  } catch {
    return { shared: false };
  }
};

export const useCompensationOptions = (): CompensationOption[] => {
  useEffect(() => { void loadFromServer(); }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

// ----- selection helpers used by the picker and by every screen that saves a compensation -----
export interface CompensationChoice {
  optionId: string; // '' = no compensation
  note: string;
}
export const EMPTY_COMPENSATION: CompensationChoice = { optionId: '', note: '' };

export const resolveCompensation = (
  choice: CompensationChoice,
  catalog: CompensationOption[]
): { type: CompensationType; details: string } | null => {
  if (!choice.optionId) return null;
  const opt = catalog.find((o) => o.id === choice.optionId);
  if (!opt) return null;
  const note = choice.note.trim();
  return { type: opt.type, details: note ? `${opt.label} — ${note}` : opt.label };
};
