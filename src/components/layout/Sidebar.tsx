import React from 'react';
import { useApp, NavigationTab } from '../../context/AppContext';
import {
  BarChartIcon,
  PhoneCallIcon,
  ClipboardListIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  UsersIcon,
  PieChartIcon,
  UploadCloudIcon,
  ShieldIcon,
  SettingsIcon,
  ClockIcon,
} from '../icons/SvgIcons';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  badge?: number;
  badgeAlert?: boolean;
  roles?: Array<'admin' | 'manager' | 'customer_service'>;
}

export const Sidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    orders,
    voidOrders,
    problems,
  } = useApp();

  const isPendingStatus = (o: { status: string }) =>
    o.status === 'pending' || o.status === 'callback_requested' || o.status === 'no_answer';

  const todayIso = new Date().toISOString().split('T')[0];

  const pendingCallsCount = orders.filter(
    (o) => isPendingStatus(o) && o.orderDate === todayIso
  ).length;

  // Orders that are still pending contact but fell outside today's date -
  // these used to be invisible once the day rolled over; now they have
  // their own page (see 'previous_pending') so they don't get stranded.
  const previousPendingCount = orders.filter(
    (o) => isPendingStatus(o) && o.orderDate < todayIso
  ).length;

  const openProblemsCount = problems.filter(
    (p) => p.status === 'open' || p.status === 'in_progress'
  ).length;

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'لوحة المؤشرات',
      icon: BarChartIcon,
    },
    {
      id: 'queue',
      label: 'طابور متابعة العملاء',
      icon: PhoneCallIcon,
      badge: pendingCallsCount,
      badgeAlert: pendingCallsCount > 0,
    },
    {
      id: 'previous_pending',
      label: 'الطلبات السابقة المعلقة',
      icon: ClockIcon,
      badge: previousPendingCount > 0 ? previousPendingCount : undefined,
      badgeAlert: previousPendingCount > 0,
    },
    {
      id: 'orders',
      label: 'سجل الطلبات والعملاء',
      icon: ClipboardListIcon,
    },
    {
      id: 'voids',
      label: 'الأوردرات الملغية (VOID)',
      icon: AlertTriangleIcon,
      badge: voidOrders.length > 0 ? voidOrders.length : undefined,
    },
    {
      id: 'problems',
      label: 'تذاكر وإدارة المشاكل',
      icon: AlertCircleIcon,
      badge: openProblemsCount > 0 ? openProblemsCount : undefined,
      badgeAlert: openProblemsCount > 0,
    },
    {
      id: 'customers',
      label: 'ملفات العملاء',
      icon: UsersIcon,
    },
    {
      id: 'assignment',
      label: 'توزيع العملاء على الفريق',
      icon: UsersIcon,
      roles: ['admin', 'manager'],
    },
    {
      id: 'reports',
      label: 'التقارير الإحصائية',
      icon: PieChartIcon,
      roles: ['admin', 'manager'],
    },
    {
      id: 'import',
      label: 'محرك قراءة تقارير POS',
      icon: UploadCloudIcon,
      roles: ['admin', 'manager'],
    },
    {
      id: 'audit',
      label: 'سجل العمليات والرقابة',
      icon: ShieldIcon,
      roles: ['admin'],
    },
    {
      id: 'settings',
      label: 'المستخدمين والإعدادات',
      icon: SettingsIcon,
      roles: ['admin'],
    },
  ];

  const allowedItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return currentUser ? item.roles.includes(currentUser.role) : false;
  });

  return (
    <aside className="w-full lg:w-60 bg-white lg:min-h-[calc(100vh-4rem)] border-b lg:border-b-0 lg:border-l border-slate-200/80 p-3 lg:p-4 shrink-0 flex flex-col justify-between">
      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0 scrollbar-none">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 lg:shrink ${
                isActive
                  ? 'bg-red-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={17} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-md text-2xs font-mono tabular-nums font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : item.badgeAlert
                      ? 'bg-red-50 text-red-700 border border-red-100'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mahmoud Ezzat Signature Card */}
      <div className="hidden lg:block pt-4 mt-auto border-t border-slate-100">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/80 border border-slate-200/70 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center text-white font-black text-xs shadow-xs shrink-0">
            م
          </div>
          <div className="min-w-0">
            <p className="text-3xs text-slate-400 font-medium leading-none">إشراف وتطوير</p>
            <p className="text-xs font-black text-slate-800 truncate mt-0.5">م/ محمود عزت</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
