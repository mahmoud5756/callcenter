import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  UsersIcon,
  CheckIcon,
  RefreshCwIcon,
  SearchIcon,
  UserCheckIcon,
  FilterIcon,
} from '../icons/SvgIcons';
import { ZeroState } from '../common/ZeroState';

export const CustomerAssignmentView: React.FC = () => {
  const { allOrders, users, assignOrdersToUser, autoDistributeOrders, updateAgentBranches } = useApp();

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'unassigned' | 'assigned'>('unassigned');
  const [searchTerm, setSearchTerm] = useState('');

  const validOrders = useMemo(() => allOrders.filter((o) => !o.isVoid), [allOrders]);
  const activeAgents = useMemo(() => users.filter((u) => u.role === 'customer_service' && u.isActive), [users]);

  if (validOrders.length === 0) {
    return <ZeroState title="لا توجد بيانات حتى الآن. ابدأ برفع ملف العملاء" />;
  }

  // Workload summary per agent
  const agentWorkload = activeAgents.map((agent) => {
    const assigned = validOrders.filter((o) => o.assignedToUserId === agent.id);
    const completed = assigned.filter(
      (o) => o.status === 'contacted_tamam' || o.status === 'contacted_problem'
    );
    const remaining = assigned.length - completed.length;

    return {
      agent,
      totalAssigned: assigned.length,
      completed: completed.length,
      remaining,
    };
  });

  const unassignedCount = validOrders.filter((o) => !o.assignedToUserId).length;

  const filteredOrders = validOrders.filter((order) => {
    const matchSearch =
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerPhone.includes(searchTerm) ||
      order.orderNumber.includes(searchTerm);

    const matchType =
      filterType === 'all'
        ? true
        : filterType === 'unassigned'
        ? !order.assignedToUserId
        : Boolean(order.assignedToUserId);

    return matchSearch && matchType;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleManualAssign = () => {
    if (selectedOrderIds.length === 0 || !targetUserId) return;
    assignOrdersToUser(selectedOrderIds, targetUserId);
    setSelectedOrderIds([]);
  };

  const handleAutoDistribute = () => {
    autoDistributeOrders(selectedOrderIds.length > 0 ? selectedOrderIds : undefined);
    setSelectedOrderIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Header and Summary Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                توزيع وتخصيص العملاء على الموظفين
              </h1>
              {unassignedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {unassignedCount} عميل غير مخصص
                </span>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              توزيع طلبات اليوم بالتساوي أو تخصيص مجموعات محددة لكل موظف خدمة عملاء.
            </p>
          </div>

          {/* Quick Auto-Distribute Action */}
          <button
            type="button"
            onClick={handleAutoDistribute}
            disabled={activeAgents.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCwIcon size={16} />
            <span>
              {selectedOrderIds.length > 0
                ? `توزيع (${selectedOrderIds.length}) المحددين بالتساوي`
                : 'توزيع غير المخصصين بالتساوي'}
            </span>
          </button>
        </div>

        {/* Branch -> Agent mapping */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <h3 className="font-bold text-sm text-slate-800 mb-1">تقسيم الفروع على الموظفين</h3>
          <p className="text-xs text-slate-500 mb-3">اختار الفروع اللي كل موظف مسؤول عنها. التوزيع التلقائي هيوزع أوردرات كل فرع على موظفيه بس. الموظف من غير فروع بياخد من الفروع اللي مالهاش موظف.</p>
          <div className="space-y-2">
            {activeAgents.map((agent) => {
              const branchNames = Array.from(new Set(allOrders.map((o) => o.branchName).filter(Boolean)));
              const mine = agent.assignedBranches || [];
              return (
                <div key={agent.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-32 text-xs font-bold text-slate-700">{agent.name}</span>
                  {branchNames.map((b) => {
                    const on = mine.includes(b);
                    return (
                      <button key={b} onClick={() => updateAgentBranches(agent.id, on ? mine.filter((x) => x !== b) : [...mine, b])}
                        className={`text-xs font-bold rounded-full px-3 py-1 border transition ${on ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        {b}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Workload Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          {agentWorkload.map(({ agent, totalAssigned, completed, remaining }) => (
            <div
              key={agent.id}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <div className="flex items-center justify-between font-bold text-xs text-slate-800 mb-1">
                <span>{agent.name}</span>
                <span className="text-2xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                  {totalAssigned} عميل
                </span>
              </div>
              <div className="flex items-center justify-between text-2xs text-slate-500">
                <span>المتبقي: <strong className="text-red-600">{remaining}</strong></span>
                <span>المكتمل: <strong className="text-emerald-600">{completed}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assignment Control Box */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث بالاسم، الهاتف..."
                className="w-48 pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="unassigned">غير المخصصين فقط ({unassignedCount})</option>
              <option value="assigned">المخصصين مسبقاً</option>
              <option value="all">عرض الكل ({validOrders.length})</option>
            </select>
          </div>

          {/* Manual assign dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="">-- اختر موظف للتخصيص --</option>
              {activeAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleManualAssign}
              disabled={selectedOrderIds.length === 0 || !targetUserId}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-40 cursor-pointer"
            >
              تخصيص ({selectedOrderIds.length}) للموظف
            </button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredOrders.length > 0 &&
                      selectedOrderIds.length === filteredOrders.length
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                </th>
                <th className="p-3.5">رقم الأوردر</th>
                <th className="p-3.5">اسم العميل</th>
                <th className="p-3.5">رقم الهاتف</th>
                <th className="p-3.5">الفرع</th>
                <th className="p-3.5">التاريخ والوقت</th>
                <th className="p-3.5">الموظف المسند إليه</th>
                <th className="p-3.5">حالة المتابعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => {
                const isSelected = selectedOrderIds.includes(order.id);

                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(order.id)}
                        className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                    </td>

                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      #{order.orderNumber}
                    </td>

                    <td className="p-3.5 font-bold text-slate-800">
                      {order.customerName}
                    </td>

                    <td className="p-3.5 font-mono text-slate-600" dir="ltr">
                      {order.customerPhone}
                    </td>

                    <td className="p-3.5 text-slate-700 font-medium">
                      {order.branchName}
                    </td>

                    <td className="p-3.5 text-slate-500">
                      {order.orderDate} {order.orderTime}
                    </td>

                    <td className="p-3.5">
                      {order.assignedToUserName ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          <UserCheckIcon size={12} />
                          <span>{order.assignedToUserName}</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-slate-500">
                          غير مخصص
                        </span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span className="text-2xs font-semibold text-slate-600">
                        {order.status === 'pending'
                          ? 'بانتظار الاتصال'
                          : order.status === 'contacted_tamam'
                          ? 'تم التواصل (تمام)'
                          : order.status === 'contacted_problem'
                          ? 'تم التواصل (مشكلة)'
                          : order.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
