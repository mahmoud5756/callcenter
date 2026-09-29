import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import {
  LogOutIcon,
  PhoneCallIcon,
  HeadsetIcon,
  ChevronDownIcon,
  LockIcon,
  CheckIcon,
  FlameIcon,
} from '../icons/SvgIcons';

export const Navbar: React.FC<{ onNewComplaint?: () => void }> = ({ onNewComplaint }) => {
  const {
    currentUser,
    logout,
    settings,
    allOrders,
    orders,
    activeTab,
    setActiveTab,
  } = useApp();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  const activeLocksCount = allOrders.filter((o) => o.lockedByUserId).length;
  const criticalOrdersCount = orders.filter(
    (o) =>
      o.priorityLevel === 'critical' &&
      (o.status === 'pending' || o.status === 'callback_requested')
  ).length;

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'المدير العام';
      case 'manager':
        return 'مشرف الجودة';
      case 'customer_service':
        return 'خدمة العملاء';
      default:
        return 'مستخدم';
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return 'لوحة التحكم والمؤشرات';
      case 'queue':
        return 'طابور متابعة العملاء';
      case 'orders':
        return 'سجل الطلبات';
      case 'voids':
        return 'الأوردرات الملغية';
      case 'problems':
        return 'تذاكر المشاكل';
      case 'assignment':
        return 'توزيع العملاء';
      case 'reports':
        return 'التقارير التحليلية';
      case 'import':
        return 'رفع تقارير POS';
      case 'audit':
        return 'سجل الرقابة';
      case 'settings':
        return 'المستخدمين والإعدادات';
      default:
        return '';
    }
  };

  return (
    <header className="bg-white border-b border-slate-200/90 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Single text element wordmark in display font with restaurant emblem */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-xs">
              <HeadsetIcon size={20} />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-display font-black text-slate-900 text-lg tracking-tight">
                {settings.restaurantName || 'منظومة خدمة العملاء'}
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                {getTabLabel(activeTab)}
              </span>
            </div>
          </div>

          {/* Zone 2: Quiet Navigation shortcuts / breadcrumb indicator */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-500">
            <button
              onClick={() => setActiveTab('queue')}
              className={`hover:text-slate-900 transition-colors cursor-pointer ${
                activeTab === 'queue' ? 'text-red-600 font-bold' : ''
              }`}
            >
              طابور الاتصال
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`hover:text-slate-900 transition-colors cursor-pointer ${
                activeTab === 'dashboard' ? 'text-red-600 font-bold' : ''
              }`}
            >
              المؤشرات
            </button>
            <button
              onClick={() => setActiveTab('problems')}
              className={`hover:text-slate-900 transition-colors cursor-pointer ${
                activeTab === 'problems' ? 'text-red-600 font-bold' : ''
              }`}
            >
              المشاكل
            </button>
          </nav>

          {/* Zone 3: 1-2 Primary actions & Account menu */}
          <div className="flex items-center gap-3">
            {/* Inbound complaint: customer called in to complain */}
            {onNewComplaint && (
              <button
                type="button"
                onClick={onNewComplaint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <PhoneCallIcon size={14} />
                <span>شكوى واردة</span>
              </button>
            )}

            {/* Urgent Priority Cases indicator */}
            {criticalOrdersCount > 0 && (
              <button
                onClick={() => setActiveTab('queue')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <FlameIcon size={14} className="text-red-600" />
                <span className="tabular-nums font-mono font-bold">{criticalOrdersCount}</span>
                <span>حالات حرجة</span>
              </button>
            )}

            {/* Protocol Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 text-slate-500 text-xs font-mono">
              <PhoneCallIcon size={14} className="text-slate-400" />
              <span>{settings.callProtocol.toUpperCase()}</span>
            </div>

            {/* User Profile & Quick RBAC Switcher */}
            {currentUser && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200/80"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-600 text-white font-bold flex items-center justify-center text-xs">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div className="text-right hidden sm:block min-w-0">
                    <div className="text-xs font-bold text-slate-800 leading-tight whitespace-nowrap">
                      {currentUser.name}
                    </div>
                    <div className="text-2xs text-slate-400 font-medium whitespace-nowrap">
                      {getRoleLabel(currentUser.role)}
                    </div>
                  </div>
                  <ChevronDownIcon size={14} className="text-slate-400" />
                </button>

                {/* Switcher Dropdown */}
                {userDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-4 py-3 border-b border-slate-100 text-right">
                      <div className="text-xs font-bold text-slate-800">{currentUser.name}</div>
                      <div className="text-2xs text-slate-400 font-mono truncate" dir="ltr">{currentUser.email}</div>
                      <div className="text-2xs text-slate-500 font-medium mt-0.5">{getRoleLabel(currentUser.role)}</div>
                    </div>

                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setChangePwOpen(true);
                          setUserDropdownOpen(false);
                        }}
                        className="w-full py-2 px-3 flex items-center justify-center gap-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <LockIcon size={15} />
                        <span>تغيير كلمة المرور</span>
                      </button>
                    </div>

                    <div className="p-2 border-t border-slate-100 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          setUserDropdownOpen(false);
                        }}
                        className="w-full py-2 px-3 flex items-center justify-center gap-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <LogOutIcon size={15} />
                        <span>تسجيل الخروج</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <ChangePasswordModal open={changePwOpen} onClose={() => setChangePwOpen(false)} />
    </header>
  );
};
