import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BarChartIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  PhoneCallIcon,
  UtensilsIcon,
  HeadsetIcon,
  AlertTriangleIcon,
  ClockIcon,
  UsersIcon,
  FlameIcon,
} from '../icons/SvgIcons';
import { ZeroState } from '../common/ZeroState';

export const DashboardView: React.FC = () => {
  const { allOrders, voidOrders, problems, customerCalls, users, branchAnomalies } = useApp();

  const [dateFilter, setDateFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  const branches = useMemo(() => {
    const set = new Set<string>();
    allOrders.forEach((o) => {
      if (o.branchName) set.add(o.branchName);
    });
    return Array.from(set);
  }, [allOrders]);

  const validOrders = useMemo(() => allOrders.filter((o) => !o.isVoid), [allOrders]);

  const filteredOrders = useMemo(() => {
    return validOrders.filter((order) => {
      const matchDate = dateFilter === 'all' || order.orderDate === dateFilter;
      const matchBranch = branchFilter === 'all' || order.branchName === branchFilter;
      const matchUser = userFilter === 'all' || order.assignedToUserId === userFilter;
      return matchDate && matchBranch && matchUser;
    });
  }, [validOrders, dateFilter, branchFilter, userFilter]);

  const totalOrdersCount = filteredOrders.length;
  const contactedOrders = filteredOrders.filter(
    (o) => o.status !== 'pending' && o.status !== 'in_progress'
  );
  const tamamOrders = filteredOrders.filter((o) => o.status === 'contacted_tamam');
  const problemOrders = filteredOrders.filter((o) => o.status === 'contacted_problem');
  const noAnswerOrders = filteredOrders.filter(
    (o) => o.status === 'no_answer' || o.status === 'unavailable'
  );
  const callbackOrders = filteredOrders.filter((o) => o.status === 'callback_requested');
  const pendingOrders = filteredOrders.filter((o) => o.status === 'pending');

  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      const matchBranch = branchFilter === 'all' || p.branchName === branchFilter;
      return matchBranch;
    });
  }, [problems, branchFilter]);

  const callCenterProblems = filteredProblems.filter((p) => p.source === 'call_center');
  const restaurantProblems = filteredProblems.filter((p) => p.source === 'restaurant');
  const openProblems = filteredProblems.filter(
    (p) => p.status === 'open' || p.status === 'in_progress'
  );
  const resolvedProblems = filteredProblems.filter(
    (p) => p.status === 'resolved' || p.status === 'closed'
  );

  const tamamRate =
    contactedOrders.length > 0
      ? Math.round((tamamOrders.length / contactedOrders.length) * 100)
      : 0;
  const problemRate =
    contactedOrders.length > 0
      ? Math.round((problemOrders.length / contactedOrders.length) * 100)
      : 0;

  const criticalCount = filteredOrders.filter((o) => o.priorityLevel === 'critical').length;
  const highCount = filteredOrders.filter((o) => o.priorityLevel === 'high').length;
  const mediumCount = filteredOrders.filter((o) => o.priorityLevel === 'medium').length;

  if (allOrders.length === 0) {
    return <ZeroState title="لا توجد بيانات حتى الآن. ابدأ برفع ملف العملاء" />;
  }

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-base sm:text-lg text-slate-900 tracking-tight">
              لوحة التحكم والمؤشرات المباشرة
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              متابعة فورية لنسبة رضا العملاء، جودة الفروع، ورصد الخلل التشغيلي التلقائي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {branches.length > 0 && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-red-500"
              >
                <option value="all">جميع الفروع ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}

            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-red-500"
            >
              <option value="all">جميع الموظفين</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Operational Anomaly Alerts Section (If any detected) */}
      {branchAnomalies.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-amber-950 text-sm flex items-center gap-2">
              <AlertTriangleIcon size={17} className="text-amber-600" />
              <span>تنبيهات الخلل التشغيلي المرصودة بالفروع</span>
            </h3>
            <span className="text-xs font-mono font-bold text-amber-900">
              {branchAnomalies.length} تنبيهات
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {branchAnomalies.map((anom) => (
              <div
                key={anom.id}
                className="p-3.5 bg-white rounded-xl border border-amber-200/80 shadow-2xs space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">{anom.branchName}</span>
                  <span className="font-mono tabular-nums font-bold text-red-700">
                    {anom.ratePercentage}% معدل الخلل
                  </span>
                </div>
                <h4 className="font-bold text-xs text-red-700">{anom.title}</h4>
                <p className="text-2xs text-slate-600">{anom.description}</p>
                <p className="text-2xs text-slate-700 font-medium pt-1 border-t border-slate-100">
                  <strong>التوصية:</strong> {anom.recommendedAction}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>إجمالي العملاء المستهدفين</span>
            <UsersIcon size={16} />
          </div>
          <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-slate-900">
            {totalOrdersCount}
          </div>
          <div className="text-2xs text-slate-400 mt-2 font-mono tabular-nums">
            تم التواصل مع: <strong className="text-slate-700">{contactedOrders.length}</strong> (
            {totalOrdersCount > 0
              ? Math.round((contactedOrders.length / totalOrdersCount) * 100)
              : 0}
            %)
          </div>
        </div>

        {/* Tamam Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>العملاء الراضين (تمام)</span>
            <CheckCircleIcon size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-emerald-600">
            {tamamOrders.length}
          </div>
          <div className="text-2xs text-emerald-700 mt-2 font-medium font-mono tabular-nums">
            نسبة الرضا: <strong>{tamamRate}%</strong>
          </div>
        </div>

        {/* Problems Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>العملاء الذين لديهم شكاوى</span>
            <AlertCircleIcon size={16} className="text-red-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-red-600">
            {problemOrders.length}
          </div>
          <div className="text-2xs text-red-700 mt-2 font-medium font-mono tabular-nums">
            معدل الشكاوى: <strong>{problemRate}%</strong>
          </div>
        </div>

        {/* Void Orders */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
            <span>الأوردرات الملغية (VOID)</span>
            <AlertTriangleIcon size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-amber-700">
            {voidOrders.length}
          </div>
          <div className="text-2xs text-slate-400 mt-2">
            معزولة تلقائياً لتوثيق الأسباب
          </div>
        </div>
      </div>

      {/* Algorithmic Risk Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3">
        <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
          <FlameIcon size={16} className="text-red-600" />
          <span>توزيع طابور المكالمات حسب خوارزمية الأولويات</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 block">أولوية قصوى</span>
              <span className="text-2xs text-slate-500">أوردرات بديلة وشكاوى متكررة</span>
            </div>
            <span className="text-2xl font-mono tabular-nums font-bold text-red-700">{criticalCount}</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 block">أولوية مرتفعة</span>
              <span className="text-2xs text-slate-500">طلبات VIP ومعاودة اتصال</span>
            </div>
            <span className="text-2xl font-mono tabular-nums font-bold text-amber-700">{highCount}</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 block">أولوية عادية</span>
              <span className="text-2xs text-slate-500">متابعة روتينية للطلبات اليومية</span>
            </div>
            <span className="text-2xl font-mono tabular-nums font-bold text-slate-700">
              {mediumCount + (totalOrdersCount - criticalCount - highCount - mediumCount)}
            </span>
          </div>
        </div>
      </div>

      {/* Problem Sources Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Source Distribution: Call Center vs Restaurant */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
          <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
            <BarChartIcon size={16} className="text-red-600" />
            <span>توزيع مصدر المشاكل والشكاوى</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-2 text-slate-700 font-bold mb-1">
                <HeadsetIcon size={15} />
                <span>الكول سنتر</span>
              </div>
              <div className="text-2xl font-mono tabular-nums font-bold text-slate-900">
                {callCenterProblems.length}
              </div>
              <p className="text-2xs text-slate-400 mt-1">تسجيل خاطئ، صنف غير متاح، عنوان...</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-2 text-slate-700 font-bold mb-1">
                <UtensilsIcon size={15} />
                <span>المطعم والفرع</span>
              </div>
              <div className="text-2xl font-mono tabular-nums font-bold text-slate-900">
                {restaurantProblems.length}
              </div>
              <p className="text-2xs text-slate-400 mt-1">صنف ناقص، جودة، أكل بارد، تأخير...</p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
            <span>
              التذاكر: <strong className="text-red-700">{openProblems.length} مفتوحة</strong> ·{' '}
              <strong className="text-emerald-700">{resolvedProblems.length} تم حلها</strong>
            </span>
          </div>
        </div>

        {/* Contact Status Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
          <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
            <PhoneCallIcon size={16} className="text-red-600" />
            <span>موقف طابور الاتصال اليومي</span>
          </h3>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">بانتظار الاتصال (Pending)</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">{pendingOrders.length}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-emerald-800">تمام (Tamam)</span>
              <span className="font-mono tabular-nums font-bold text-emerald-700">{tamamOrders.length}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-red-800">عنده مشكلة (Problem)</span>
              <span className="font-mono tabular-nums font-bold text-red-700">{problemOrders.length}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-600">لم يرد / غير متاح</span>
              <span className="font-mono tabular-nums font-bold text-slate-700">{noAnswerOrders.length}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-purple-800">طلب معاودة الاتصال</span>
              <span className="font-mono tabular-nums font-bold text-purple-700">{callbackOrders.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Calls Feed */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
        <h3 className="font-display font-bold text-slate-900 text-sm mb-3.5 flex items-center gap-2">
          <ClockIcon size={16} className="text-slate-400" />
          <span>آخر المكالمات المسجلة حديثاً ({customerCalls.slice(0, 5).length})</span>
        </h3>

        {customerCalls.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">لم يتم تسجيل أي مكالمات حتى الآن.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {customerCalls.slice(0, 6).map((call) => (
              <div key={call.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-900">{call.customerName}</span>
                  <span className="text-slate-400 mx-2 font-mono tabular-nums" dir="ltr">
                    {call.customerPhone}
                  </span>
                  <span className="text-slate-400 font-mono">أوردر #{call.orderNumber}</span>
                  {call.notes && <p className="text-2xs text-slate-500 mt-0.5">{call.notes}</p>}
                </div>

                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${call.callResult === 'tamam' ? 'text-emerald-700' : call.callResult === 'problem' ? 'text-red-700' : 'text-slate-500'}`}>
                    {call.callResult === 'tamam'
                      ? 'تمام'
                      : call.callResult === 'problem'
                      ? 'مشكلة'
                      : call.callResult === 'no_answer'
                      ? 'لم يرد'
                      : call.callResult === 'unavailable'
                      ? 'غير متاح'
                      : 'معاودة الاتصال'}
                  </span>

                  <span className="text-2xs text-slate-400 font-mono tabular-nums">
                    {call.userName} · {new Date(call.createdAt).toLocaleTimeString('ar-EG')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
