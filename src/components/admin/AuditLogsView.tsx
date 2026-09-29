import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldIcon, SearchIcon, ClockIcon } from '../icons/SvgIcons';

export const AuditLogsView: React.FC = () => {
  const { auditLogs } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = auditLogs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                سجل العمليات والرقابة (Audit Log)
              </h1>
              <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-slate-100 text-slate-700">
                {auditLogs.length} حركة مسجلة
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              توثيق شامل ودقيق لجميع نقرات الاتصال، رفع الملفات، توزيع العملاء، وتحديث التذاكر.
            </p>
          </div>

          <div className="relative">
            <SearchIcon
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث في سجل العمليات..."
              className="w-48 sm:w-64 pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            لا توجد حركات مسجلة مطابقة للبحث
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                      {log.action}
                    </span>
                    <span className="font-semibold text-slate-700">{log.entity}</span>
                    <span className="text-slate-400 font-mono text-2xs">({log.id})</span>
                  </div>
                  <p className="text-slate-600 font-medium">{log.details}</p>
                </div>

                <div className="text-left shrink-0 text-2xs text-slate-400">
                  <div className="font-bold text-slate-700">{log.userName}</div>
                  <div>{new Date(log.createdAt).toLocaleString('ar-EG')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
