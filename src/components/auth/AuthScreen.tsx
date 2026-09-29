import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  HeadsetIcon,
  ShieldIcon,
  LockIcon,
  AlertCircleIcon,
} from '../icons/SvgIcons';

export const AuthScreen: React.FC = () => {
  const { login, requestPasswordReset, authNotice, isConfigured } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (!result.success) {
        setErrorMessage(
          result.error ||
            'بيانات تسجيل الدخول غير صحيحة أو الحساب غير مفعل من قبل الإدارة.'
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء الدخول.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.success) {
        setInfoMessage('لو البريد ده مسجل عندنا، هيوصلك رابط لإعادة تعيين كلمة المرور. راجع صندوق الوارد والرسائل غير المرغوبة (Spam).');
      } else {
        setErrorMessage(result.error || 'تعذر إرسال رابط إعادة التعيين.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Luxury Header Hero */}
        <div className="bg-gradient-to-r from-red-900 via-red-700 to-rose-800 text-white p-7 text-center relative">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3.5 border border-white/20 shadow-inner">
            <HeadsetIcon size={28} className="text-white" />
          </div>
          <h1 className="font-display font-black text-xl sm:text-2xl tracking-tight text-white">
            Customer Service Management
          </h1>
          <p className="text-red-100 text-xs mt-1 font-medium">
            نظام إدارة ومتابعة مكالمات خدمة العملاء
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {!isConfigured && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold leading-relaxed">
              لم يتم ضبط الاتصال بقاعدة البيانات. أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env ثم أعد تشغيل السيرفر.
            </div>
          )}

          {authNotice && !errorMessage && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircleIcon size={16} className="shrink-0" />
              <span>{authNotice}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold leading-relaxed">
              {infoMessage}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircleIcon size={16} className="shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Live Supabase Login Form */}
          <form onSubmit={mode === 'login' ? handleLoginSubmit : handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                البريد الإلكتروني للموظف:
              </label>
              <div className="relative">
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  dir="ltr"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                />
              </div>
            </div>

            {mode === 'login' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    dir="ltr"
                    className="w-full p-3 pl-16 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-2xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-black text-sm rounded-xl shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <span>{mode === 'login' ? 'جاري التحقق من الصلاحيات وتأكيد الدخول...' : 'جاري الإرسال...'}</span>
              ) : mode === 'forgot' ? (
                <span>إرسال رابط إعادة تعيين كلمة المرور</span>
              ) : (
                <>
                  <ShieldIcon size={16} />
                  <span>دخول إلى منظومة المتابعة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'forgot' : 'login');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className="w-full text-center text-xs font-bold text-slate-500 hover:text-red-700 cursor-pointer"
            >
              {mode === 'login' ? 'نسيت كلمة المرور؟' : 'الرجوع لتسجيل الدخول'}
            </button>
          </form>

          {/* Security & Developer Signature */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5 text-center">
            <div className="inline-flex items-center gap-1.5 text-2xs text-slate-400 font-medium">
              <LockIcon size={12} className="text-slate-400" />
              <span>تسجيل دخول آمن ومشفّر</span>
            </div>

            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-50/80 via-slate-50 to-rose-50/80 border border-amber-200/60 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                <span className="text-2xs text-slate-500 font-semibold">إشراف وتطوير المنظومة:</span>
                <span className="text-xs font-black text-slate-900">م/ محمود عزت</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
