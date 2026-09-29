import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { HeadsetIcon, AlertCircleIcon } from '../icons/SvgIcons';

// Shown after the user opens the "reset password" link from their email
export const ResetPasswordScreen: React.FC = () => {
  const { updateOwnPassword, finishRecovery } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('كلمتا المرور غير متطابقتين');
    setBusy(true);
    const res = await updateOwnPassword(password);
    setBusy(false);
    if (!res.success) return setError(res.error || 'تعذر تغيير كلمة المرور');
    // Clean the recovery token from the URL and continue into the app
    window.history.replaceState(null, '', window.location.pathname);
    finishRecovery();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-900 via-red-700 to-rose-800 text-white p-7 text-center">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3.5 border border-white/20">
            <HeadsetIcon size={28} className="text-white" />
          </div>
          <h1 className="font-black text-xl">تعيين كلمة مرور جديدة</h1>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8 space-y-4">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircleIcon size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور الجديدة (8 حروف على الأقل)"
            required
            minLength={8}
            dir="ltr"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="أعد كتابة كلمة المرور"
            required
            dir="ltr"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 bg-gradient-to-r from-red-600 to-rose-700 text-white font-black text-sm rounded-xl shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'جاري الحفظ...' : 'حفظ كلمة المرور والدخول'}
          </button>
        </form>
      </div>
    </div>
  );
};
