import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabase';

export const ChangePasswordModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { currentUser, updateOwnPassword } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setMsg(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) return setMsg({ ok: false, text: 'كلمتا المرور الجديدتان غير متطابقتين' });
    if (next === current) return setMsg({ ok: false, text: 'كلمة المرور الجديدة لازم تختلف عن الحالية' });
    setBusy(true);
    // Re-verify the current password first
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: currentUser?.email || '',
      password: current,
    });
    if (verifyErr) {
      setBusy(false);
      return setMsg({ ok: false, text: 'كلمة المرور الحالية غير صحيحة' });
    }
    const res = await updateOwnPassword(next);
    setBusy(false);
    if (!res.success) return setMsg({ ok: false, text: res.error || 'تعذر تغيير كلمة المرور' });
    setMsg({ ok: true, text: 'تم تغيير كلمة المرور بنجاح' });
    setTimeout(close, 1200);
  };

  const cls =
    'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-bold text-slate-900 text-base">تغيير كلمة المرور</h2>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="كلمة المرور الحالية" required dir="ltr" className={cls} />
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="كلمة المرور الجديدة (8 حروف على الأقل)" required minLength={8} dir="ltr" className={cls} />
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="أعد كتابة كلمة المرور الجديدة" required dir="ltr" className={cls} />
        {msg && <p className={`text-xs font-bold ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">
            إلغاء
          </button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 cursor-pointer">
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </div>
  );
};
