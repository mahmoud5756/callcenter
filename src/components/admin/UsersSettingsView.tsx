import { PasswordManager } from './PasswordManager';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  UsersIcon,
  PlusIcon,
  SettingsIcon,
  PhoneCallIcon,
  LockIcon,
  TrashIcon,
  CheckIcon,
  AlertCircleIcon,
} from '../icons/SvgIcons';
import { UserRole } from '../../types';

export const UsersSettingsView: React.FC = () => {
  const {
    users,
    addUser,
    updateUserRole,
    toggleUserActive,
    settings,
    updateSettings,
    clearAllData,
  } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('customer_service');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);
  const [userErrorMsg, setUserErrorMsg] = useState<string | null>(null);

  const [callProtocol, setCallProtocol] = useState<'tel' | 'sip'>(settings.callProtocol || 'tel');
  const [sipServerUrl, setSipServerUrl] = useState(settings.sipServerUrl || '');
  const [agentLockTimeoutMinutes, setAgentLockTimeoutMinutes] = useState(settings.agentLockTimeoutMinutes || 5);
  const [restaurantName, setRestaurantName] = useState(settings.restaurantName || 'Customer Service Management');
  const [savedSettingsMsg, setSavedSettingsMsg] = useState(false);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setUserErrorMsg('يرجى ملء جميع الحقول بما في ذلك كلمة المرور');
      return;
    }
    setIsSubmittingUser(true);
    setUserSuccessMsg(null);
    setUserErrorMsg(null);

    const result = await addUser(name, email, role, password.trim());
    setIsSubmittingUser(false);

    if (result.success) {
      setUserSuccessMsg(`تمت إضافة المستخدم (${name}) بنجاح وتفعيل ملفه في قاعدة البيانات`);
      setName('');
      setEmail('');
      setPassword('');
      setTimeout(() => setUserSuccessMsg(null), 3000);
    } else {
      setUserErrorMsg(result.error || 'تعذر إضافة المستخدم في Supabase');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      callProtocol,
      sipServerUrl: sipServerUrl.trim(),
      agentLockTimeoutMinutes: Number(agentLockTimeoutMinutes) || 5,
      restaurantName: restaurantName.trim(),
    });
    setSavedSettingsMsg(true);
    setTimeout(() => setSavedSettingsMsg(false), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h1 className="text-base sm:text-lg font-bold text-slate-900">
          إدارة المستخدمين وإعدادات النظام
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
          التحكم في صلاحيات فريق العمل، بروتوكولات الاتصال الهاتفي (MicroSIP / Tel)، وقفل التضارب.
        </p>
      </div>

      {/* Grid: Users on Left/Top, System Settings on Right/Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Management (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Add User Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <PlusIcon size={18} className="text-red-600" />
              <span>إضافة مستخدم جديد إلى قاعدة البيانات</span>
            </h3>

            {userSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckIcon size={16} />
                <span>{userSuccessMsg}</span>
              </div>
            )}

            {userErrorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircleIcon size={16} />
                <span>{userErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="الاسم الكامل للموظف..."
                  required
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="البريد الإلكتروني..."
                  required
                  dir="ltr"
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="كلمة المرور..."
                  required
                  dir="ltr"
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                />

                <div className="flex gap-2">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="customer_service">خدمة عملاء (Agent)</option>
                    <option value="manager">مشرف (Manager)</option>
                    <option value="admin">مدير عام (Admin)</option>
                  </select>

                  <button
                    type="submit"
                    disabled={isSubmittingUser}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSubmittingUser ? 'جاري الإضافة...' : 'إضافة'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Users List Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <UsersIcon size={16} className="text-slate-600" />
                <span>المستخدمين المسجلين في جدول Profiles ({users.length})</span>
              </h3>
              <span className="text-2xs text-slate-400 font-mono">Live Sync</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">الاسم والبريد</th>
                    <th className="p-3">الدور / الصلاحية</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-2xs text-slate-400 font-mono" dir="ltr">{user.email}</div>
                      </td>

                      <td className="p-3">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                          className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                        >
                          <option value="customer_service">خدمة عملاء (Agent)</option>
                          <option value="manager">مشرف (Manager)</option>
                          <option value="admin">مدير عام (Admin)</option>
                        </select>
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs font-extrabold ${
                            user.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.isActive ? 'مفعل' : 'معطل'}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleUserActive(user.id)}
                          className={`px-3 py-1 rounded-lg text-2xs font-bold transition-colors cursor-pointer ${
                            user.isActive
                              ? 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700'
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                        >
                          {user.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* System Settings Column (1 col) */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <SettingsIcon size={18} className="text-red-600" />
              <span>إعدادات الاتصال والمنظومة</span>
            </h3>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اسم سلسلة المطاعم:
                </label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  بروتوكول النقر للاتصال (Click-to-Call):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCallProtocol('tel')}
                    className={`p-2.5 rounded-xl font-bold border transition-colors cursor-pointer ${
                      callProtocol === 'tel'
                        ? 'bg-red-600 text-white border-red-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    tel: (الموبايل & MicroSIP)
                  </button>

                  <button
                    type="button"
                    onClick={() => setCallProtocol('sip')}
                    className={`p-2.5 rounded-xl font-bold border transition-colors cursor-pointer ${
                      callProtocol === 'sip'
                        ? 'bg-red-600 text-white border-red-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    sip: (سيرفر SIP مباشر)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  مدة قفل العميل لمنع تضارب الاتصال (بالدقائق):
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={agentLockTimeoutMinutes}
                  onChange={(e) => setAgentLockTimeoutMinutes(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                />
                <span className="text-2xs text-slate-400 mt-0.5 block">
                  يتم فك القفل تلقائياً بعد انقضاء هذه المدة إذا لم ينه الموظف المكالمة.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow cursor-pointer transition-colors"
              >
                حفظ الإعدادات
              </button>

              {savedSettingsMsg && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-center font-bold text-xs flex items-center justify-center gap-1.5">
                  <CheckIcon size={14} />
                  <span>تم حفظ الإعدادات بنجاح</span>
                </div>
              )}
            </form>
          </div>

          {/* Database Reset Danger Zone */}
          <div className="bg-red-50/50 rounded-2xl border border-red-200 p-5 space-y-3 text-xs">
            <h4 className="font-bold text-red-900 flex items-center gap-1.5">
              <TrashIcon size={16} className="text-red-600" />
              <span>منطقة التحكم بالبيانات</span>
            </h4>
            <p className="text-red-700 leading-relaxed">
              تفريغ كافة سجلات الأوردرات والمكالمات والمشاكل المرفوعة والعودة لـ Zero State بالكامل.
            </p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('هل أنت متأكد من رغبتك في تفريغ وتصفير جميع بيانات الأوردرات والمكالمات في قاعدة البيانات؟')) {
                  clearAllData();
                }
              }}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow cursor-pointer transition-colors"
            >
              تصفير قاعدة البيانات
            </button>
          </div>
        </div>
      </div>
      <PasswordManager />
    </div>
  );
};
