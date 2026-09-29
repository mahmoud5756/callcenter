import React, { useState, useMemo } from 'react';
import { PhoneNumber } from '../common/PhoneNumber';
import { useApp } from '../../context/AppContext';
import {
  PhoneCallIcon,
  SearchIcon,
  ClockIcon,
  LockIcon,
  FlameIcon,
  SparklesIcon,
  LayoutGridIcon,
  LayoutListIcon,
  BuildingIcon,
  UserIcon,
  UtensilsIcon,
  PhoneIcon,
  EyeIcon,
} from '../icons/SvgIcons';
import { ZeroState } from '../common/ZeroState';
import { OrderItemsList } from '../common/OrderItemsList';
import { OrderStatus, Order } from '../../types';
import { formatItemName } from '../../services/arabicItemFixer';
import { formatCompensationType } from '../../services/compensationHelpers';

interface CallQueueViewProps {
  // 'today' = the live active queue (today's orders only, per spec).
  // 'previous' = backlog of still-pending orders from earlier days that
  // fell outside the daily queue and need a dedicated page to work through.
  scope?: 'today' | 'previous';
}

export const CallQueueView: React.FC<CallQueueViewProps> = ({ scope = 'today' }) => {
  const {
    orders,
    allOrders,
    problems,
    setActiveCallModalOrderId,
    triggerClickToCall,
    currentUser,
    settings,
  } = useApp();

  const handleCallAndStart = (order: Order) => {
    // 1. Instantly trigger click-to-call for MicroSIP / softphone / mobile
    triggerClickToCall(order.id, order.customerPhone);
    // 2. Open call assessment & logging modal immediately
    setActiveCallModalOrderId(order.id);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending_all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'algorithm' | 'time' | 'amount'>('algorithm');
  const [viewLayout, setViewLayout] = useState<'cards' | 'table'>('cards');

  // Active Call Queue scope (spec): today's orders only that still need a
  // call - "لم يتم التواصل" or "طلب معاودة الاتصال". Older orders that are
  // still pending don't just disappear though - they show up in the
  // "previous" scope of this same view (a separate page/tab) so they stay
  // actionable instead of being stranded in the read-only archive log.
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const scopedActionableOrders = useMemo(
    () =>
      orders.filter((order) =>
        scope === 'today' ? order.orderDate === todayIso : order.orderDate < todayIso
      ),
    [orders, todayIso, scope]
  );

  const branches = useMemo(() => {
    const set = new Set<string>();
    scopedActionableOrders.forEach((o) => {
      if (o.branchName && !/TOTAL|المجموع|الاجمالي|الإجمالي/i.test(o.branchName)) {
        set.add(o.branchName.replace(/[\[\]]/g, '').trim());
      }
    });
    return Array.from(set);
  }, [scopedActionableOrders]);

  const filteredOrders = useMemo(() => {
    let result = scopedActionableOrders.filter((order) => {
      const matchSearch =
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerPhone.includes(searchTerm) ||
        order.orderNumber.includes(searchTerm) ||
        order.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.takerName && order.takerName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending_all'
          ? order.status === 'pending' ||
            order.status === 'callback_requested' ||
            order.status === 'no_answer'
          : order.status === statusFilter;

      const matchBranch = branchFilter === 'all' ? true : order.branchName === branchFilter;
      const matchPriority =
        priorityFilter === 'all' ? true : order.priorityLevel === priorityFilter;

      return matchSearch && matchStatus && matchBranch && matchPriority;
    });

    if (sortMode === 'algorithm') {
      result.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    } else if (sortMode === 'time') {
      result.sort((a, b) => b.orderTime.localeCompare(a.orderTime));
    } else if (sortMode === 'amount') {
      result.sort((a, b) => b.totalAmount - a.totalAmount);
    }

    return result;
  }, [scopedActionableOrders, searchTerm, statusFilter, branchFilter, priorityFilter, sortMode]);

  if (orders.length === 0) {
    return <ZeroState title="لا توجد بيانات حتى الآن. ابدأ برفع ملف العملاء" />;
  }

  if (scopedActionableOrders.length === 0) {
    return scope === 'today' ? (
      <ZeroState
        title="لا توجد طلبات اليوم تحتاج اتصال حالياً"
        description="طابور المكالمات النشط يعرض فقط طلبات اليوم الحالي. لو لسه محدش رفع تقرير POS بتاع النهاردة، ارفعه الأول، أو راجع صفحة الطلبات السابقة المعلقة لمتابعة الطلبات القديمة."
        actionText="رفع تقرير طلبات POS اليوم"
      />
    ) : (
      <ZeroState
        title="لا توجد طلبات سابقة معلقة حالياً"
        description="كل الطلبات من الأيام اللي فاتت اتقفلت بالكامل (تمام أو مشكلة). أي طلب قديم يفضل بانتظار الاتصال أو معاودة الاتصال هيظهر هنا تلقائياً."
        hideAction
      />
    );
  }

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'contacted_tamam':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            تم التواصل - تمام
          </span>
        );
      case 'contacted_problem':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            عنده مشكلة
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            قيد الاتصال
          </span>
        );
      case 'no_answer':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            لم يرد
          </span>
        );
      case 'unavailable':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            غير متاح
          </span>
        );
      case 'callback_requested':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            معاودة الاتصال
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            بانتظار الاتصال
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Search Bar */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <SearchIcon
              size={17}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث باسم العميل، رقم الموبايل (01...)، رقم الأوردر، اسم الكاشير، أو الفرع..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
            />
          </div>

          {/* Layout Toggle (Cards vs Table) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-end lg:self-auto border border-slate-200/80">
            <button
              onClick={() => setViewLayout('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewLayout === 'cards'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGridIcon size={15} />
              <span>كروت المتابعة</span>
            </button>
            <button
              onClick={() => setViewLayout('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewLayout === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutListIcon size={15} />
              <span>جدول تفصيلي</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 ml-1">تصفية:</span>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            >
              <option value="all">جميع الحالات ({orders.length})</option>
              <option value="pending_all">المتبقي للمتابعة</option>
              <option value="pending">بانتظار الاتصال</option>
              <option value="contacted_tamam">تم التواصل - تمام</option>
              <option value="contacted_problem">عنده مشكلة</option>
              <option value="no_answer">لم يرد</option>
              <option value="unavailable">غير متاح</option>
              <option value="callback_requested">معاودة الاتصال</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            >
              <option value="all">كافة مستويات الأولوية</option>
              <option value="critical">أولوية قصوى</option>
              <option value="high">أولوية مرتفعة</option>
              <option value="medium">أولوية متوسطة</option>
              <option value="normal">عادية</option>
            </select>

            {branches.length > 0 && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              >
                <option value="all">جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    فرع {b}
                  </option>
                ))}
              </select>
            )}

            {(searchTerm || statusFilter !== 'all' || branchFilter !== 'all' || priorityFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setBranchFilter('all');
                  setPriorityFilter('all');
                }}
                className="px-2.5 py-1 text-xs font-bold text-red-600 hover:text-red-800 transition-colors cursor-pointer"
              >
                إلغاء التصفية
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold text-xs">ترتيب:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-50 text-slate-800 border border-slate-200 rounded-xl font-bold text-xs focus:outline-none"
            >
              <option value="algorithm">الخوارزمية الذكية</option>
              <option value="time">توقيت الطلب (الأحدث)</option>
              <option value="amount">قيمة الطلب (الأعلى)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Queue Container */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              {scope === 'today' ? 'طابور متابعة العملاء' : 'الطلبات السابقة المعلقة'} ({filteredOrders.length})
            </h2>
            <span className="text-xs text-slate-500">
              {currentUser?.role === 'customer_service'
                ? 'العملاء المسندين إليك'
                : 'جميع عملاء المنظومة'}
            </span>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 text-sm font-semibold">
            لا توجد طلبات مطابقة لشروط البحث والتصفية.
          </div>
        ) : viewLayout === 'cards' ? (
          /* Cards Grid View: Compact, High-Density, Prominent Hierarchy */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {filteredOrders.map((order) => {
              const isLockedByOther =
                order.lockedByUserId &&
                order.lockedByUserId !== currentUser?.id &&
                order.lockedAt &&
                Date.now() - new Date(order.lockedAt).getTime() <
                  (settings.agentLockTimeoutMinutes || 5) * 60 * 1000;

              const pendingCompensation = problems.find(
                (p) =>
                  p.customerPhone === order.customerPhone &&
                  p.compensationStatus === 'pending_compensation'
              );

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all duration-150 flex flex-col justify-between overflow-hidden p-3.5 sm:p-4 space-y-2.5 ${
                    order.priorityLevel === 'critical' ? 'ring-2 ring-red-400/60' : ''
                  }`}
                >
                  {/* Re-order Top Banner (Prominent and distinct) */}
                  {order.replacementForOrderId && (
                    <div className="-mt-3.5 -mx-3.5 sm:-mt-4 sm:-mx-4 mb-1 bg-amber-500 text-slate-950 px-3 py-1 flex items-center justify-between text-2xs font-black tracking-wide border-b border-amber-600/30">
                      <div className="flex items-center gap-1.5">
                        <SparklesIcon size={12} className="text-slate-950" />
                        <span>أوردر بديل لطلب ملغي</span>
                      </div>
                      <span className="font-mono text-3xs bg-amber-600/30 px-1.5 py-0.5 rounded font-black">
                        #
                        {allOrders.find((o) => o.id === order.replacementForOrderId)
                          ?.orderNumber || order.replacementForOrderId}
                      </span>
                    </div>
                  )}

                  {/* Pending Compensation Top Banner (Requirement 2.1) */}
                  {pendingCompensation && (
                    <div className="-mt-3.5 -mx-3.5 sm:-mt-4 sm:-mx-4 mb-1 bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-900 text-white px-3 py-1.5 flex items-center justify-between text-2xs font-bold border-b border-amber-400/40">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                        <SparklesIcon size={12} className="text-amber-300 shrink-0" />
                        <span className="truncate">
                          تنبيه: العميل لديه تعويض مستحق: [{formatCompensationType(pendingCompensation.compensationType)}: {pendingCompensation.compensationDetails || 'تعويض'}] مسجل بتاريخ ({new Date(pendingCompensation.compensationPromisedAt || pendingCompensation.createdAt).toLocaleDateString('ar-EG')})
                        </span>
                      </div>
                      <span className="font-black text-3xs bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded shrink-0 mr-1.5">
                        تعويض مستحق
                      </span>
                    </div>
                  )}

                  {/* Header Hierarchy: Prominent Customer Name & Monospace Phone Number */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3
                        className="text-base sm:text-lg font-black text-slate-900 leading-snug truncate"
                        title={order.customerName}
                      >
                        {order.customerName}
                      </h3>

                      <div className="flex items-center gap-2" dir="ltr">
                        <div className="flex items-center gap-1.5 text-slate-900 font-mono text-sm sm:text-base font-black tracking-wider bg-slate-100 hover:bg-slate-200/80 px-2 py-0.5 rounded-lg border border-slate-200 transition-colors w-fit">
                          <PhoneIcon size={14} className="text-emerald-600 shrink-0" />
                          <span className="select-all"><PhoneNumber phone={order.customerPhone} /></span>
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-400">
                          #{order.orderNumber}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getStatusBadge(order.status)}
                      {order.priorityLevel === 'critical' && (
                        <span className="inline-flex items-center gap-1 text-3xs font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-200">
                          <FlameIcon size={11} />
                          <span>أولوية قصوى</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata Strip: Branch, Cashier, Time, Amount */}
                  <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2 text-2xs bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/70 text-slate-600">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 font-bold text-slate-700">
                        <BuildingIcon size={11} className="text-slate-400 shrink-0" />
                        <span>فرع {order.branchName || 'الرئيسي'}</span>
                      </div>
                      <span className="text-slate-300">|</span>
                      <div className="flex items-center gap-1 text-slate-600">
                        <UserIcon size={11} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">الكاشير:</span>
                        <span className="font-bold text-slate-800">
                          {order.takerName || 'كاشير الفرع'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-3xs text-slate-400 font-mono">
                        <ClockIcon size={10} />
                        <span>{order.orderTime}</span>
                      </div>
                      <span className="text-slate-300">|</span>
                      <div className="font-mono font-black text-slate-900 text-xs sm:text-sm">
                        {order.totalAmount.toFixed(2)}{' '}
                        <span className="text-3xs font-bold text-slate-500">ج.م</span>
                      </div>
                    </div>
                  </div>

                  {/* Compact Items Summary Line (No bulky list on card face) */}
                  <div className="flex items-center justify-between text-2xs text-slate-500 px-0.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                      <UtensilsIcon size={12} className="text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-700 shrink-0">
                        الأصناف ({order.items?.length || 0}):
                      </span>
                      <span
                        className="text-slate-500 truncate"
                        title={order.items?.map((i) => formatItemName(i.itemName)).join('، ')}
                      >
                        {order.items && order.items.length > 0
                          ? order.items
                              .slice(0, 2)
                              .map((i) => formatItemName(i.itemName))
                              .join('، ') +
                            (order.items.length > 2 ? ` (+${order.items.length - 2})` : '')
                          : 'تفاصيل الأصناف مسجلة'}
                      </span>
                    </div>
                    <span className="text-3xs text-slate-400 font-medium shrink-0 mr-1.5">
                      التفاصيل داخل شاشة المكالمة
                    </span>
                  </div>

                  {/* Conflict lock warning */}
                  {isLockedByOther && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-1.5 text-2xs text-amber-800 font-bold">
                      <LockIcon size={13} className="text-amber-600" />
                      <span>جاري الاتصال بواسطة الزميل: {order.lockedByUserName}</span>
                    </div>
                  )}

                  {/* Single Unified High-Speed Call & Follow-up Action */}
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCallAndStart(order)}
                      disabled={Boolean(isLockedByOther)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
                        isLockedByOther
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-emerald-600/20'
                      }`}
                      title="اتصال مباشر عبر MicroSIP وفتح شاشة تسجيل النتيجة بضغطة واحدة"
                    >
                      <PhoneCallIcon size={16} />
                      <span>اتصال وبدء المتابعة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCallModalOrderId(order.id)}
                      disabled={Boolean(isLockedByOther)}
                      className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                      title="عرض وتعديل النتيجة يدوياً بدون إجراء اتصال هاتفي"
                    >
                      <EyeIcon size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View: Fast, Compact, High-Volume Layout */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200/80">
                  <tr>
                    <th className="p-3">رقم الأوردر</th>
                    <th className="p-3">العميل والموبايل</th>
                    <th className="p-3">الفرع والكاشير</th>
                    <th className="p-3">الأصناف والمبلغ</th>
                    <th className="p-3">الحالة والأولوية</th>
                    <th className="p-3">الوقت</th>
                    <th className="p-3 text-center">إجراء المتابعة السريع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => {
                    const isLockedByOther =
                      order.lockedByUserId &&
                      order.lockedByUserId !== currentUser?.id &&
                      order.lockedAt &&
                      Date.now() - new Date(order.lockedAt).getTime() <
                        (settings.agentLockTimeoutMinutes || 5) * 60 * 1000;

                    const pendingCompensation = problems.find(
                      (p) =>
                        p.customerPhone === order.customerPhone &&
                        p.compensationStatus === 'pending_compensation'
                    );

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <div className="font-mono font-black text-slate-900">
                            #{order.orderNumber}
                          </div>
                          {order.replacementForOrderId && (
                            <span className="inline-block mt-0.5 text-3xs font-black text-amber-800 bg-amber-100 px-1 py-0.2 rounded">
                              بديل #
                              {allOrders.find((o) => o.id === order.replacementForOrderId)
                                ?.orderNumber || order.replacementForOrderId}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm">
                            {order.customerName}
                          </div>
                          <div
                            className="font-mono tabular-nums text-emerald-700 font-bold text-xs"
                            dir="ltr"
                          >
                            <PhoneNumber phone={order.customerPhone} />
                          </div>
                          {pendingCompensation && (
                            <div className="mt-1 inline-flex items-center gap-1 text-3xs font-black bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded-md">
                              <SparklesIcon size={10} className="text-purple-700" />
                              <span>تعويض مستحق: {formatCompensationType(pendingCompensation.compensationType)}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">
                            فرع {order.branchName || 'الرئيسي'}
                          </div>
                          <div className="text-2xs text-slate-500">
                            الكاشير: {order.takerName || 'كاشير الفرع'}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-mono tabular-nums font-black text-slate-900">
                            {order.totalAmount.toFixed(2)} ج.م
                          </div>
                          <div className="text-2xs text-slate-500">
                            {order.items?.length || 0} أصناف
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col items-start gap-1">
                            {getStatusBadge(order.status)}
                            {order.priorityLevel === 'critical' && (
                              <span className="inline-flex items-center gap-0.5 text-3xs font-black text-red-600 bg-red-50 px-1 py-0.2 rounded border border-red-200">
                                <FlameIcon size={10} />
                                <span>أولوية قصوى</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-500 text-2xs">
                          {order.orderTime}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCallAndStart(order)}
                              disabled={Boolean(isLockedByOther)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-2xs font-bold cursor-pointer disabled:opacity-40 shadow-xs transition-all active:scale-95"
                              title="اتصال مباشر ومتابعة بضغطة واحدة"
                            >
                              <PhoneCallIcon size={13} />
                              <span>اتصال وبدء المتابعة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveCallModalOrderId(order.id)}
                              disabled={Boolean(isLockedByOther)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-2xs border border-slate-200 cursor-pointer disabled:opacity-40"
                              title="فتح المودال بدون طلب هاتف"
                            >
                              <EyeIcon size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
