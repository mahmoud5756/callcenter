import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { PhoneNumber } from '../common/PhoneNumber';
import { useApp } from '../../context/AppContext';
import {
  ClipboardListIcon,
  SearchIcon,
  TrashIcon,
  EyeIcon,
  UtensilsIcon,
  XIcon,
  DownloadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../icons/SvgIcons';
import { ZeroState } from '../common/ZeroState';
import { Order } from '../../types';
import { formatItemName } from '../../services/arabicItemFixer';
import { supabase, transformOrderFromDb } from '../../services/supabase';

const PAGE_SIZE = 50;

export const OrdersListView: React.FC = () => {
  const { allOrders, deleteOrder, currentUser, exportCsvReport, users } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(0);
  const [pageOrders, setPageOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  // Debounce free-text search before hitting the DB.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, branchFilter]);

  const profilesMap = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  // Server-side paginated fetch (50/page) instead of filtering the whole
  // in-memory order list - this is the "سجل الطلبات" archive/log table,
  // which can grow well beyond what should ever be pulled client-side.
  const fetchPage = useCallback(async () => {
    setIsLoadingPage(true);
    try {
      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (branchFilter !== 'all') {
        query = query.eq('branch_name', branchFilter);
      }

      if (debouncedSearch) {
        const term = debouncedSearch.replace(/[%,]/g, '');
        query = query.or(
          `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,order_number.ilike.%${term}%`
        );
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('Failed to fetch orders page:', error.message);
        setPageOrders([]);
        setTotalCount(0);
        return;
      }

      setPageOrders((data || []).map((row) => transformOrderFromDb(row, profilesMap)));
      setTotalCount(count || 0);
    } finally {
      setIsLoadingPage(false);
    }
  }, [page, branchFilter, debouncedSearch, profilesMap]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Branch list still derives from the bounded in-memory recent window -
  // good enough for a filter dropdown without a dedicated query.
  const branches = useMemo(() => {
    const set = new Set<string>();
    allOrders.forEach((o) => {
      if (o.branchName && !/TOTAL|المجموع|الاجمالي|الإجمالي/i.test(o.branchName)) {
        set.add(o.branchName.replace(/[\[\]]/g, '').trim());
      }
    });
    return Array.from(set);
  }, [allOrders]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const filteredOrders = pageOrders;

  if (allOrders.length === 0 && totalCount === 0 && !isLoadingPage) {
    return <ZeroState title="لا توجد بيانات حتى الآن. ابدأ برفع ملف العملاء" />;
  }

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <SearchIcon
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الأوردر، اسم العميل، أو الهاتف..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {branches.length > 0 && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="all">جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => exportCsvReport('orders')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              <DownloadIcon size={16} />
              <span>تصدير CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm sm:text-base">
            سجل جميع الطلبات والعملاء ({totalCount})
          </h2>
          {isLoadingPage && (
            <span className="text-2xs text-slate-400 font-semibold">جارِ التحميل...</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">رقم الأوردر</th>
                <th className="p-3.5">اسم العميل</th>
                <th className="p-3.5">رقم الهاتف</th>
                <th className="p-3.5">الفرع</th>
                <th className="p-3.5">التاريخ والوقت</th>
                <th className="p-3.5">الكاشير</th>
                <th className="p-3.5">المبلغ</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-slate-900">
                    #{order.orderNumber}
                  </td>
                  <td className="p-3.5 font-bold text-slate-800">
                    {order.customerName}
                  </td>
                  <td className="p-3.5 font-mono text-slate-600" dir="ltr">
                    <PhoneNumber phone={order.customerPhone} />
                  </td>
                  <td className="p-3.5 text-slate-800 font-bold">
                    فرع {order.branchName || 'الرئيسي'}
                  </td>
                  <td className="p-3.5 text-slate-500 font-mono text-2xs">
                    {order.orderDate} {order.orderTime}
                  </td>
                  <td className="p-3.5 text-slate-800 font-semibold">
                    {order.takerName || 'كاشير الفرع'}
                  </td>
                  <td className="p-3.5 font-bold text-slate-900">
                    {order.totalAmount} ج.م
                  </td>
                  <td className="p-3.5">
                    {order.isVoid ? (
                      <span className="px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-red-100 text-red-800">
                        ملغي SHORT VOID
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-slate-700">
                        {order.status === 'contacted_tamam'
                          ? 'تمام'
                          : order.status === 'contacted_problem'
                          ? 'مشكلة'
                          : order.status === 'pending'
                          ? 'بانتظار المتابعة'
                          : 'متابع'}
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setViewingOrder(order)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        title="عرض تفاصيل الأصناف"
                      >
                        <EyeIcon size={16} />
                      </button>

                      {currentUser?.role === 'admin' && (
                        <button
                          onClick={async () => {
                            await deleteOrder(order.id);
                            fetchPage();
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف الأوردر"
                        >
                          <TrashIcon size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination (server-side, 50/page) */}
        <div className="p-3.5 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-semibold">
            صفحة {totalCount === 0 ? 0 : page + 1} من {totalPages} — {totalCount} طلب إجمالاً
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isLoadingPage}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRightIcon size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || isLoadingPage}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeftIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                تفاصيل الأوردر #{viewingOrder.orderNumber}
              </h3>
              <button
                onClick={() => setViewingOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <XIcon size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-0.5">العميل:</span>
                <span className="font-bold text-slate-800">{viewingOrder.customerName}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl" dir="ltr">
                <span className="text-slate-400 block mb-0.5 text-right">الهاتف:</span>
                <span className="font-mono font-bold text-slate-800"><PhoneNumber phone={viewingOrder.customerPhone} /></span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-0.5">الفرع:</span>
                <span className="font-bold text-slate-800">{viewingOrder.branchName}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-0.5">المبلغ الإجمالي:</span>
                <span className="font-bold text-red-600">{viewingOrder.totalAmount} ج.م</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                <UtensilsIcon size={14} className="text-red-600" />
                <span>قائمة الأصناف ({viewingOrder.items?.length || 0})</span>
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {viewingOrder.items && viewingOrder.items.length > 0 ? (
                  viewingOrder.items.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200/70 font-mono font-black text-2xs shrink-0 select-none">
                          {it.quantity}×
                        </span>
                        <span className="font-bold text-slate-800 truncate" title={formatItemName(it.itemName)}>
                          {formatItemName(it.itemName)}
                        </span>
                      </div>
                      {it.price > 0 && (
                        <span className="font-mono font-bold text-slate-600 text-2xs shrink-0">
                          {it.price} ج.م
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 py-2 text-center">لا توجد أصناف مفصلة</p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewingOrder(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
