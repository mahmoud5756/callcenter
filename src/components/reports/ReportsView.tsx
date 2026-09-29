import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PieChartIcon,
  DownloadIcon,
  BarChartIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  BuildingIcon,
  UsersIcon,
  AlertTriangleIcon,
  ClockIcon,
} from '../icons/SvgIcons';
import { AllProblemsReport, DualSourceReport, CustomerProblemsReport, exportAllProblemsCsv, exportDualSourceCsv, exportCustomerProblemsCsv } from './ProblemReports';
import { ZeroState } from '../common/ZeroState';
import { formatProblemType } from '../../services/problemLabels';

export const ReportsView: React.FC = () => {
  const { allOrders, voidOrders, problems, customerCalls, users, exportCsvReport } = useApp();
  const [activeReportTab, setActiveReportTab] = useState<'calls' | 'problems' | 'agents' | 'branches' | 'voids' | 'all_problems' | 'dual' | 'customers'>('calls');

  const validOrders = allOrders.filter((o) => !o.isVoid);

  // 1. Agent Productivity Report Data
  const agentStats = useMemo(() => {
    const agents = users.filter((u) => u.role === 'customer_service');
    return agents.map((agent) => {
      const calls = customerCalls.filter((c) => c.userId === agent.id);
      const tamamCount = calls.filter((c) => c.callResult === 'tamam').length;
      const problemCount = calls.filter((c) => c.callResult === 'problem').length;
      const totalDuration = calls.reduce((acc, c) => acc + (c.callDurationSeconds || 0), 0);
      const avgDuration = calls.length > 0 ? Math.round(totalDuration / calls.length) : 0;
      const satisfactionRate = calls.length > 0 ? Math.round((tamamCount / calls.length) * 100) : 0;

      return {
        agent,
        totalCalls: calls.length,
        tamamCount,
        problemCount,
        avgDuration,
        satisfactionRate,
      };
    });
  }, [customerCalls, users]);

  // 2. Branch Quality & Void Rate Data
  const branchStats = useMemo(() => {
    const branchMap = new Map<string, { total: number; voids: number; problems: number; tamam: number }>();
    
    allOrders.forEach((o) => {
      const b = o.branchName || 'الفرع الرئيسي';
      if (!branchMap.has(b)) {
        branchMap.set(b, { total: 0, voids: 0, problems: 0, tamam: 0 });
      }
      const data = branchMap.get(b)!;
      data.total++;
      if (o.isVoid) data.voids++;
      if (o.status === 'contacted_problem') data.problems++;
      if (o.status === 'contacted_tamam') data.tamam++;
    });

    return Array.from(branchMap.entries()).map(([branchName, stats]) => {
      const voidRate = stats.total > 0 ? Math.round((stats.voids / stats.total) * 100) : 0;
      const problemRate = stats.total > 0 ? Math.round((stats.problems / stats.total) * 100) : 0;
      return {
        branchName,
        ...stats,
        voidRate,
        problemRate,
      };
    });
  }, [allOrders]);

  // 3. Problem Types Ranking
  const problemTypeStats = useMemo(() => {
    const map = new Map<string, { count: number; source: string }>();
    problems.forEach((p) => {
      const key = `${p.source}:${p.type}`;
      if (!map.has(key)) {
        map.set(key, { count: 0, source: p.source });
      }
      map.get(key)!.count++;
    });

    const totalProblems = problems.length || 1;
    return Array.from(map.entries())
      .map(([key, val]) => {
        const [source, type] = key.split(':');
        return {
          source,
          type,
          count: val.count,
          percentage: Math.round((val.count / totalProblems) * 1000) / 10,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [problems]);

  if (allOrders.length === 0) {
    return <ZeroState title="لا توجد بيانات حتى الآن. ابدأ برفع ملف العملاء" />;
  }

  return (
    <div className="space-y-6">
      {/* Header and Report Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              التقارير الإحصائية والتحليلات المتقدمة
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              مؤشرات دقيقة لأداء الفروع، جودة الخدمة، وإنتاجية موظفي الكول سنتر مع إمكانية التصدير.
            </p>
          </div>

          <button
            onClick={() =>
              activeReportTab === 'customers' ? exportCustomerProblemsCsv(problems)
              : activeReportTab === 'all_problems' ? exportAllProblemsCsv(problems)
              : activeReportTab === 'dual' ? exportDualSourceCsv(problems)
              : exportCsvReport(
                activeReportTab === 'calls'
                  ? 'calls'
                  : activeReportTab === 'problems'
                  ? 'problems'
                  : activeReportTab === 'voids'
                  ? 'voids'
                  : 'orders'
              )
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer self-start md:self-auto"
          >
            <DownloadIcon size={16} />
            <span>تصدير التقرير الحالي Excel / CSV</span>
          </button>
        </div>

        {/* Report Tabs */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
          {[
            { id: 'calls', label: 'تقرير المكالمات والتواصل' },
            { id: 'problems', label: 'أنواع المشاكل الأكثر تكراراً' },
            { id: 'agents', label: 'إنتاجية وجودة موظفي الكول سنتر' },
            { id: 'branches', label: 'تحليل جودة الفروع ومعدل الإلغاء' },
            { id: 'voids', label: 'الأوردرات الملغية واسترجاع العملاء' },
            { id: 'customers', label: 'تقرير مشاكل كل عميل' },
            { id: 'all_problems', label: 'سجل كل المشاكل بالتفصيل' },
            { id: 'dual', label: 'عملاء مشاكلهم من المطعم والكول سنتر' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeReportTab === tab.id
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Calls Report */}
      {activeReportTab === 'calls' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            سجل المكالمات وحالات التواصل اليومية ({customerCalls.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">الأوردر</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الهاتف</th>
                  <th className="p-3">الموظف</th>
                  <th className="p-3">نتيجة المكالمة</th>
                  <th className="p-3">الملاحظات</th>
                  <th className="p-3">مدة المكالمة</th>
                  <th className="p-3">التوقيت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">
                      #{call.orderNumber}
                    </td>
                    <td className="p-3 font-bold text-slate-800">{call.customerName}</td>
                    <td className="p-3 font-mono text-slate-600" dir="ltr">
                      {call.customerPhone}
                    </td>
                    <td className="p-3 font-medium text-slate-700">{call.userName}</td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-2xs font-extrabold ${
                          call.callResult === 'tamam'
                            ? 'bg-emerald-100 text-emerald-800'
                            : call.callResult === 'problem'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
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
                    </td>
                    <td className="p-3 max-w-xs truncate text-slate-600">
                      {call.notes || '-'}
                    </td>
                    <td className="p-3 font-mono text-slate-500">
                      {call.callDurationSeconds || 0} ثانية
                    </td>
                    <td className="p-3 text-2xs text-slate-400">
                      {new Date(call.createdAt).toLocaleTimeString('ar-EG')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Problem Types Ranking */}
      {activeReportTab === 'problems' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            ترتيب أنواع المشاكل الأكثر تكراراً ونسبتها المئوية
          </h3>
          <div className="space-y-3">
            {problemTypeStats.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-2xs">
                      {idx + 1}
                    </span>
                    <span>{formatProblemType(item.type)}</span>
                    <span className="text-2xs text-slate-400">
                      ({item.source === 'call_center' ? 'كول سنتر' : 'مطعم'})
                    </span>
                  </span>
                  <span className="font-extrabold text-slate-900">
                    {item.count} حالة <span dir="ltr" className="inline-block text-slate-500">({item.percentage}%)</span>
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      item.source === 'call_center' ? 'bg-red-500' : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Agents Productivity */}
      {activeReportTab === 'agents' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            إنتاجية ومؤشرات جودة موظفي الكول سنتر
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">اسم الموظف</th>
                  <th className="p-3">إجمالي المكالمات المنجزة</th>
                  <th className="p-3">حالات تمام</th>
                  <th className="p-3">حالات المشاكل</th>
                  <th className="p-3">نسبة الرضا (تمام %)</th>
                  <th className="p-3">متوسط وقت المكالمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agentStats.map(({ agent, totalCalls, tamamCount, problemCount, satisfactionRate, avgDuration }) => (
                  <tr key={agent.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-bold text-slate-900">{agent.name}</td>
                    <td className="p-3 font-black text-slate-800">{totalCalls}</td>
                    <td className="p-3 text-emerald-600 font-bold">{tamamCount}</td>
                    <td className="p-3 text-red-600 font-bold">{problemCount}</td>
                    <td className="p-3">
                      <span className="px-2.5 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {satisfactionRate}%
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-500">{avgDuration} ثانية</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Branches Analysis */}
      {activeReportTab === 'branches' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            تحليل الفروع ومعدل المشاكل والإلغاء
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">اسم الفرع</th>
                  <th className="p-3">إجمالي الطلبات</th>
                  <th className="p-3">الملغيات (VOID)</th>
                  <th className="p-3">معدل الإلغاء %</th>
                  <th className="p-3">الشكاوى المسجلة</th>
                  <th className="p-3">معدل الشكاوى %</th>
                  <th className="p-3">الطلبات الراضية (تمام)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchStats.map((b) => (
                  <tr key={b.branchName} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-bold text-slate-900">{b.branchName}</td>
                    <td className="p-3 font-black text-slate-800">{b.total}</td>
                    <td className="p-3 text-amber-600 font-bold">{b.voids}</td>
                    <td className="p-3 font-bold text-amber-700">{b.voidRate}%</td>
                    <td className="p-3 text-red-600 font-bold">{b.problems}</td>
                    <td className="p-3 font-bold text-red-700">{b.problemRate}%</td>
                    <td className="p-3 text-emerald-600 font-bold">{b.tamam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Voids & Re-orders */}
      {activeReportTab === 'voids' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            الأوردرات الملغية ومعدل استرجاع العملاء (Re-orders)
          </h3>
          <p className="text-xs text-slate-500">
            تحليل الأوردرات التي تم إلغاؤها ثم إعادة طلبها بنجاح لنفس العميل في نفس اليوم.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 rounded-xl border border-red-100">
              <span className="text-xs font-bold text-red-700">إجمالي الطلبات الملغية</span>
              <div className="text-2xl font-black text-red-900 mt-1">{voidOrders.length}</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="text-xs font-bold text-emerald-700">أوردرات تم استرجاعها ببديل</span>
              <div className="text-2xl font-black text-emerald-900 mt-1">
                {allOrders.filter((o) => o.replacementForOrderId).length}
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <span className="text-xs font-bold text-blue-700">معدل الاسترجاع والإنقاذ</span>
              <div className="text-2xl font-black text-blue-900 mt-1">
                {voidOrders.length > 0
                  ? Math.round(
                      (allOrders.filter((o) => o.replacementForOrderId).length / voidOrders.length) * 100
                    )
                  : 0}
                %
              </div>
            </div>
          </div>
        </div>
      )}
      {activeReportTab === 'all_problems' && <AllProblemsReport problems={problems} />}
      {activeReportTab === 'customers' && <CustomerProblemsReport problems={problems} />}
      {activeReportTab === 'dual' && <DualSourceReport problems={problems} />}
    </div>
  );
};
