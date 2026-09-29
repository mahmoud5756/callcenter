import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../services/supabase';

export const PasswordManager: React.FC = () => {
  const { users } = useApp();
  const [userId, setUserId] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    if (!userId) return setMsg({ ok: false, text: 'اختار المستخدم' });
    if (pass.length < 8) return setMsg({ ok: false, text: 'كلمة المرور لازم 8 حروف أو أكتر' });
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_password', { target_user: userId, new_password: pass });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: `تعذر التغيير: ${error.message}` });
    setPass('');
    setMsg({ ok: true, text: 'تم تغيير كلمة المرور. أبلغ المستخدم بيها بشكل خاص.' });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <h2 className="font-bold text-sm text-slate-900">تغيير كلمة مرور مستخدم</h2>
      <div className="flex flex-wrap gap-2">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">اختار المستخدم</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} - {u.email}</option>)}
        </select>
        <input type="text" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} dir="ltr"
          placeholder="كلمة المرور الجديدة" className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono" />
        <button onClick={submit} disabled={busy} className="bg-slate-900 text-white text-sm font-bold rounded-xl px-4 py-2 disabled:opacity-50">
          {busy ? 'جاري التغيير...' : 'تغيير'}
        </button>
      </div>
      {msg && <div className={`text-xs font-bold ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</div>}
    </div>
  );
};
