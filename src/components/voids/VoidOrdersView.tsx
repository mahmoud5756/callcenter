import React, { useState, useMemo } from 'react';
import { PhoneNumber } from '../common/PhoneNumber';
import { useApp } from '../../context/AppContext';
import {
  AlertTriangleIcon,
  SearchIcon,
  DownloadIcon,
  EditIcon,
  CheckIcon,
  XIcon,
  PhoneCallIcon,
  PhoneIcon,
  BuildingIcon,
  UserIcon,
  UtensilsIcon,
  ClockIcon,
  CheckCircleIcon,
  LayoutGridIcon,
  LayoutListIcon,
  SparklesIcon,
  AlertCircleIcon,
} from '../icons/SvgIcons';
import { Order, VoidFollowUpStatus } from '../../types';
import { OrderItemsList } from '../common/OrderItemsList';
import { buildLinkedReorderSet, findReorderFor, isVoidResolved, formatMonthLabel, monthOf } from '../../services/archiveRules';

export const VoidOrdersView: React.FC = () => {
  const {
    voidOrders: allVoidOrders,
    updateVoidDetails,
    exportCsvReport,
    allOrders,
    triggerClickToCall,
    currentUser,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [viewLayout, setViewLayout] = useState<'cards' | 'table'>('cards');

  // Active = still needs follow-up. Archive = resolved (moved out of the live list).
  const [scope, setScope] = useState<'active' | 'archive'>('active');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const linkedReorders = useMemo(() => buildLinkedReorderSet(allOrders), [allOrders]);
  const activeVoids = useMemo(
    () => allVoidOrders.filter((o) => !isVoidResolved(o, linkedReorders)),
    [allVoidOrders, linkedReorders]
  );
  const archivedVoids = useMemo(
    () => allVoidOrders.filter((o) => isVoidResolved(o, linkedReorders)),
    [allVoidOrders, linkedReorders]
  );
  const archiveMonths = useMemo(
    () => Array.from(new Set(archivedVoids.map((o) => monthOf(o.orderDate)).filter(Boolean))).sort().reverse(),
    [archivedVoids]
  );
  const voidOrders = useMemo(
    () =>
      scope === 'active'
        ? activeVoids
        : archivedVoids.filter((o) => monthFilter === 'all' || monthOf(o.orderDate) === monthFilter),
    [scope, activeVoids, archivedVoids, monthFilter]
  );

  // Modal State for Investigating & Following up with Customer
  const [investigatingOrder, setInvestigatingOrder] = useState<Order | null>(null);
  const [formReason, setFormReason] = useState<string>('');
  const [formResponsible, setFormResponsible] = useState<
    'restaurant' | 'call_center' | 'courier' | 'customer'
  >('restaurant');
  const [formStatus, setFormStatus] = useState<VoidFollowUpStatus>('pending');
  const [formNotes, setFormNotes] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Extract all unique branches in void orders
  const branches = useMemo(() => {
    const set = new Set<string>();
    voidOrders.forEach((o) => {
      if (o.branchName) set.add(o.branchName);
    });
    return Array.from(set);
  }, [voidOrders]);

  // Find if recovered by a re-order
  const getReorderInfo = (voidOrder: Order) => findReorderFor(voidOrder, allOrders);

  // KPIs
  // KPIs are computed over ALL voids (active + archive) so recovered customers never "disappear"
  const totalVoidCount = allVoidOrders.length;
  const totalLostAmount = allVoidOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const recoveredCount = allVoidOrders.filter(
    (o) => linkedReorders.has(o.id) || o.voidFollowUpStatus === 'recovered'
  ).length;
  const pendingFollowUpCount = activeVoids.length;

  // Filtered voids
  const filteredVoids = useMemo(() => {
    return voidOrders.filter((order) => {
      const matchSearch =
        order.orderNumber.includes(searchTerm) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerPhone.includes(searchTerm) ||
        order.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.takerName && order.takerName.toLowerCase().includes(searchTerm.toLowerCase()));

      const orderFollowUp = order.voidFollowUpStatus || 'pending';
      const isRecovered = getReorderInfo(order) || orderFollowUp === 'recovered';

      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'recovered'
          ? isRecovered
          : statusFilter === 'pending'
          ? orderFollowUp === 'pending' && !isRecovered
          : orderFollowUp === statusFilter;

      const matchResponsible =
        responsibleFilter === 'all' ? true : (order.voidResponsible || 'restaurant') === responsibleFilter;

      const matchBranch = branchFilter === 'all' ? true : order.branchName === branchFilter;

      return matchSearch && matchStatus && matchResponsible && matchBranch;
    });
  }, [voidOrders, searchTerm, statusFilter, responsibleFilter, branchFilter, allOrders]);

  // Open modal
  const openFollowUpModal = (order: Order) => {
    setInvestigatingOrder(order);
    const reorder = getReorderInfo(order);
    setFormReason(order.voidReason || 'SHORT VOID (إلغاء سريع)');
    setFormResponsible(order.voidResponsible || 'restaurant');
    setFormStatus(order.voidFollowUpStatus || (reorder ? 'recovered' : 'pending'));
    setFormNotes(order.voidNotes || '');
    setSaveSuccessMsg(false);
  };

  // Click to call and open modal
  const handleCallCustomer = (order: Order) => {
    triggerClickToCall(order.id, order.customerPhone);
    openFollowUpModal(order);
  };

  // Save follow-up
  const handleSaveFollowUp = () => {
    if (!investigatingOrder) return;
    updateVoidDetails(
      investigatingOrder.id,
      formReason.trim() || 'SHORT VOID',
      formResponsible,
      formStatus,
      formNotes.trim()
    );
    setSaveSuccessMsg(true);
    setTimeout(() => {
      setInvestigatingOrder(null);
      setSaveSuccessMsg(false);
    }, 800);
  };

  const getStatusChip = (order: Order) => {
    const reorder = getReorderInfo(order);
    const status = order.voidFollowUpStatus || (reorder ? 'recovered' : 'pending');

    switch (status) {
      case 'recovered':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <SparklesIcon size={13} className="text-emerald-600" />
            <span>مسترجع بأوردر بديل</span>
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircleIcon size={13} className="text-blue-600" />
            <span>تم التواصل وتوثيق السبب</span>
          </span>
        );
      case 'compensated':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <CheckCircleIcon size={13} className="text-purple-600" />
            <span>تم تعويض العميل</span>
          </span>
        );
      case 'no_answer':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span>لم يرد / غير متاح</span>
          </span>
        );
      case 'escalated':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircleIcon size={13} className="text-rose-600" />
            <span>تم التصعيد للإدارة</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <ClockIcon size={13} className="text-amber-600" />
            <span>بانتظار المتابعة</span>
          </span>
        );
    }
  };

  const getResponsibleLabel = (resp?: string) => {
    switch (resp) {
      case 'restaurant':
        return 'مطبخ / إدارة الفرع';
      case 'call_center':
        return 'الكول سنتر';
      case 'courier':
        return 'الطيار / الدليفري';
      case 'customer':
        return 'العميل';
      default:
        return 'المطعم';
    }
  };

  if (allVoidOrders.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-12 text-center max-w-xl mx-auto my-12">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
          <CheckCircleIcon size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          لا توجد أوردرات ملغية حتى الآن
        </h3>
        <p className="text-slate-500 text-sm leading-relaxed">
          جميع الطلبات الواردة في تقارير الكاشير والـ POS سليمة. عند رفع ملف يحتوي على وسوم SHORT VOID أو VOID، سيتم عزلها فوراً هنا لتتولى خدمة العملاء متابعتها كطابور مكالمات مستقل.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active / Archive switch - resolved voids move to the archive, away from new ones */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setScope('active')}
          className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
            scope === 'active' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          تحتاج متابعة ({activeVoids.length})
        </button>
        <button
          onClick={() => setScope('archive')}
          className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
            scope === 'archive' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          أرشيف المحلولة ({archivedVoids.length})
        </button>
        {scope === 'archive' && archiveMonths.length > 0 && (
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="mr-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            <option value="all">كل الشهور</option>
            {archiveMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>
      {/* Top Banner & KPI Cards */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <AlertTriangleIcon size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900">
                    طابور متابعة الأوردرات الملغية (VOID)
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    {voidOrders.length} طلب ملغي
                  </span>
                </div>
                <p className="text-slate-500 text-2xs sm:text-xs mt-0.5">
                  طابور مخصص لمتابعة العملاء الذين تم إلغاء طلباتهم، الاتصال المباشر بنقرة واحدة، ومعرفة الأسباب واسترجاعهم.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => exportCsvReport('voids')}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
            >
              <DownloadIcon size={14} />
              <span>تصدير تقرير الإلغاء CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Metric Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 pt-5">
          <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
            <span className="text-2xs font-bold text-slate-500">إجمالي الأوردرات الملغية</span>
            <div className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 font-mono">
              {totalVoidCount}
            </div>
            <span className="text-3xs text-slate-400 mt-0.5 block">SHORT VOID / VOID</span>
          </div>

          <div className="bg-rose-50/50 p-3.5 rounded-2xl border border-rose-100">
            <span className="text-2xs font-bold text-rose-700">قيمة المبيعات المفقودة</span>
            <div className="text-lg sm:text-xl font-bold text-rose-600 mt-0.5 font-mono">
              {totalLostAmount.toLocaleString()} <span className="text-2xs font-bold">ج.م</span>
            </div>
            <span className="text-3xs text-rose-400 mt-0.5 block">إجمالي مبالغ الطلبات</span>
          </div>

          <div
            onClick={() => { setScope('archive'); setStatusFilter('all'); }}
            className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/80 cursor-pointer hover:bg-emerald-50 transition-colors"
          >
            <span className="text-2xs font-bold text-emerald-800">عملاء تم استرجاعهم</span>
            <div className="text-lg sm:text-xl font-bold text-emerald-700 mt-0.5 font-mono">
              {recoveredCount}
            </div>
            <span className="text-3xs text-emerald-600 mt-0.5 block font-bold">
              طلبوا أوردر بديل - اضغط لعرضهم في الأرشيف
            </span>
          </div>

          <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/80">
            <span className="text-2xs font-bold text-amber-800">بانتظار التواصل والمتابعة</span>
            <div className="text-lg sm:text-xl font-bold text-amber-700 mt-0.5 font-mono">
              {pendingFollowUpCount}
            </div>
            <span className="text-3xs text-amber-600 mt-0.5 block">بحاجة لمكالمة هاتفية</span>
          </div>
        </div>
      </div>

      {/* Filter and View Mode Header */}
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
              placeholder="البحث برقم الأوردر، هاتف العميل (01...)، اسم العميل، اسم الكاشير، أو الفرع..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
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

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 ml-1">تصفية حسب:</span>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <option value="all">جميع الحالات ({voidOrders.length})</option>
            <option value="pending">بانتظار الاتصال والمتابعة</option>
            <option value="recovered">تم استرجاع العميل بأوردر بديل</option>
            <option value="resolved">تم التواصل وتوثيق السبب</option>
            <option value="compensated">تم تعويض العميل</option>
            <option value="no_answer">لم يرد / غير متاح</option>
            <option value="escalated">تم التصعيد للإدارة</option>
          </select>

          {/* Branch Filter */}
          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  فرع {b}
                </option>
              ))}
            </select>
          )}

          {/* Responsible Party Filter */}
          <select
            value={responsibleFilter}
            onChange={(e) => setResponsibleFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <option value="all">كل الجهات المسؤولة</option>
            <option value="restaurant">مطبخ / إدارة الفرع</option>
            <option value="call_center">الكول سنتر</option>
            <option value="courier">الطيار / الدليفري</option>
            <option value="customer">العميل</option>
          </select>

          {(searchTerm || statusFilter !== 'all' || branchFilter !== 'all' || responsibleFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setBranchFilter('all');
                setResponsibleFilter('all');
              }}
              className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer mr-auto"
            >
              إلغاء التصفية
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Cards or Table */}
      {filteredVoids.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500 text-sm font-semibold">
            لا توجد أوردرات ملغية تطابق خيارات التصفية الحالية.
          </p>
        </div>
      ) : viewLayout === 'cards' ? (
        /* Cards Grid Layout (Matching CallQueueView for smooth CS experience) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredVoids.map((order) => {
            const reorder = getReorderInfo(order);

            return (
              <div
                key={order.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
              >
                {/* Re-order Top Banner if customer placed replacement order */}
                {reorder && (
                  <div className="bg-emerald-500 text-white px-4 py-2 flex items-center justify-between text-xs font-black">
                    <div className="flex items-center gap-1.5">
                      <SparklesIcon size={14} />
                      <span>تم استرجاع العميل بأوردر بديل!</span>
                    </div>
                    <span className="font-mono underline">
                      #{reorder.orderNumber} ({reorder.totalAmount} ج.م)
                    </span>
                  </div>
                )}

                <div className="p-5 sm:p-6 space-y-4">
                  {/* Top Row: Order # + Void Tag + Branch */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-black text-slate-900">
                          #{order.orderNumber}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                          SHORT VOID
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <BuildingIcon size={13} className="text-slate-400" />
                        <span>فرع {order.branchName || 'الفرع الرئيسي'}</span>
                      </div>
                    </div>

                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-400 font-mono">
                        {order.orderTime}
                      </div>
                      <div className="text-2xs text-slate-400">{order.orderDate}</div>
                    </div>
                  </div>

                  {/* Customer Information & One-click Call */}
                  <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 truncate">
                        {order.customerName}
                      </span>
                      {getStatusChip(order)}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700" dir="ltr">
                        <PhoneIcon size={13} className="text-slate-400" />
                        <span><PhoneNumber phone={order.customerPhone} /></span>
                      </div>

                      {/* Cashier Name Display - directly answering user prompt */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                        <UserIcon size={13} className="text-slate-400" />
                        <span>الكاشير:</span>
                        <span className="text-slate-800 font-bold">
                          {order.takerName || 'كاشير الفرع'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Order Items Preview */}
                  <OrderItemsList items={order.items} theme="rose" maxVisible={2} />

                  {/* Reason & Responsible Tag */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-2xs">
                    <span className="text-slate-400 font-semibold">السبب:</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold">
                      {order.voidReason || 'SHORT VOID (إلغاء سريع)'}
                    </span>
                    <span className="text-slate-400 font-semibold mr-1">المسؤول:</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold">
                      {getResponsibleLabel(order.voidResponsible)}
                    </span>
                  </div>

                  {order.voidNotes && (
                    <div className="text-2xs bg-amber-50/70 border border-amber-100 text-amber-900 p-2 rounded-xl">
                      <span className="font-bold">ملاحظات المتابعة: </span>
                      {order.voidNotes}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2.5">
                  <button
                    onClick={() => handleCallCustomer(order)}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <PhoneCallIcon size={15} />
                    <span>اتصال ومتابعة العميل</span>
                  </button>

                  <button
                    onClick={() => openFollowUpModal(order)}
                    className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    title="تعديل وتوثيق الإلغاء"
                  >
                    <EditIcon size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Table Layout */
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">رقم الأوردر</th>
                  <th className="p-4">الفرع</th>
                  <th className="p-4">اسم العميل</th>
                  <th className="p-4">رقم الموبايل</th>
                  <th className="p-4">كاشير الفرع (TAKER)</th>
                  <th className="p-4">المبلغ المفقود</th>
                  <th className="p-4">حالة المتابعة</th>
                  <th className="p-4">سبب الإلغاء والمسؤول</th>
                  <th className="p-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVoids.map((order) => {
                  const reorder = getReorderInfo(order);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-mono font-black text-slate-900">
                        #{order.orderNumber}
                      </td>
                      <td className="p-4 font-bold text-slate-800">
                        فرع {order.branchName || 'الفرع الرئيسي'}
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {order.customerName}
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-700" dir="ltr">
                        <PhoneNumber phone={order.customerPhone} />
                      </td>
                      <td className="p-4 font-semibold text-slate-800">
                        {order.takerName || 'كاشير الفرع'}
                      </td>
                      <td className="p-4 font-mono font-black text-rose-600">
                        {order.totalAmount} ج.م
                      </td>
                      <td className="p-4">
                        {getStatusChip(order)}
                      </td>
                      <td className="p-4">
                        <div className="text-2xs font-semibold text-slate-700">
                          {order.voidReason || 'SHORT VOID'}
                        </div>
                        <div className="text-3xs text-slate-400">
                          المسؤول: {getResponsibleLabel(order.voidResponsible)}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleCallCustomer(order)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-2xs cursor-pointer shadow-2xs"
                          >
                            <PhoneCallIcon size={13} />
                            <span>اتصال</span>
                          </button>
                          <button
                            onClick={() => openFollowUpModal(order)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                            title="توثيق المتابعة"
                          >
                            <EditIcon size={14} />
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

      {/* Interactive Void Follow-up & Resolution Modal */}
      {investigatingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shadow-xs">
                  <AlertTriangleIcon size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    متابعة وتوثيق الطلب الملغي #{investigatingOrder.orderNumber}
                  </h3>
                  <p className="text-slate-500 text-xs">
                    تسجيل نتيجة التواصل مع العميل، تحديد السبب الدقيق، والجهة المسؤولة.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInvestigatingOrder(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <XIcon size={20} />
              </button>
            </div>

            {/* Quick Customer & Order Snapshot */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-2xs">العميل</span>
                  <span className="font-bold text-slate-900">
                    {investigatingOrder.customerName}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-2xs">الهاتف</span>
                  <span className="font-mono font-bold text-slate-800" dir="ltr">
                    <PhoneNumber phone={investigatingOrder.customerPhone} />
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-2xs">الفرع</span>
                  <span className="font-bold text-slate-800">
                    فرع {investigatingOrder.branchName || 'الرئيسي'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-2xs">كاشير الفرع (TAKER)</span>
                  <span className="font-bold text-slate-800">
                    {investigatingOrder.takerName || 'كاشير الفرع'}
                  </span>
                </div>
              </div>

              {/* Call Trigger in modal */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                <span className="text-xs text-slate-500 font-semibold">
                  مبلغ الأوردر: <strong className="text-rose-600 font-mono">{investigatingOrder.totalAmount} ج.م</strong>
                </span>

                <button
                  type="button"
                  onClick={() => triggerClickToCall(investigatingOrder.id, investigatingOrder.customerPhone)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  <PhoneCallIcon size={14} />
                  <span>بدء الاتصال بالعميل الآن</span>
                </button>
              </div>
            </div>

            {/* Follow-up Form */}
            <div className="space-y-4 text-xs">
              {/* Outcome Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  نتيجة المتابعة والتواصل مع العميل:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'pending', label: 'بانتظار التواصل' },
                    { id: 'recovered', label: 'تم استرجاع العميل بأوردر بديل' },
                    { id: 'resolved', label: 'تم التواصل وتوثيق السبب' },
                    { id: 'compensated', label: 'تم تعويض العميل (خصم/قسيمة)' },
                    { id: 'no_answer', label: 'العميل لم يرد / غير متاح' },
                    { id: 'escalated', label: 'تصعيد للإدارة العامة' },
                  ].map((st) => (
                    <button
                      type="button"
                      key={st.id}
                      onClick={() => setFormStatus(st.id as VoidFollowUpStatus)}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-right transition-all cursor-pointer ${
                        formStatus === st.id
                          ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Root Cause Reason */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  سبب الإلغاء الفعلي المكتشف:
                </label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="SHORT VOID (إلغاء سريع)">SHORT VOID (إلغاء سريع بعد تسجيله مباشرة)</option>
                  <option value="تأخر في تحضير الطلب بالفرع">تأخر في تحضير الطلب بالفرع</option>
                  <option value="صنف غير متوفر / نفاذ المخزون">صنف غير متوفر / نفاذ المخزون</option>
                  <option value="عدم توفر طيارين / تأخر الدليفري">عدم توفر طيارين / تأخر الدليفري</option>
                  <option value="خطأ من كاشير الفرع في إدخال الأصناف">خطأ من كاشير الفرع في إدخال الأصناف</option>
                  <option value="العميل قام بالإلغاء لظروف خاصة">العميل قام بالإلغاء لظروف خاصة</option>
                  <option value="تكرار الطلب عن طريق الخطأ">تكرار الطلب عن طريق الخطأ</option>
                  <option value="طلب ملغي لأسباب أخرى">طلب ملغي لأسباب أخرى</option>
                </select>
              </div>

              {/* Responsible Entity */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  الجهة المسؤولة عن الإلغاء:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'restaurant', label: 'كاشير / مطبخ الفرع' },
                    { id: 'courier', label: 'الطيار / الدليفري' },
                    { id: 'call_center', label: 'الكول سنتر' },
                    { id: 'customer', label: 'العميل' },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setFormResponsible(item.id as any)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        formResponsible === item.id
                          ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  ملاحظات المتابعة والحل والتعويض:
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="اكتب ما تم الاتفاق عليه مع العميل، أي كوبونات خصم تم تقديمها، أو ملابسات الإلغاء..."
                  rows={3}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              {saveSuccessMsg ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs bg-emerald-50 px-3 py-1.5 rounded-xl">
                  <CheckIcon size={16} />
                  <span>تم حفظ وتحديث المتابعة بنجاح!</span>
                </div>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvestigatingOrder(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveFollowUp}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  حفظ توثيق المتابعة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
