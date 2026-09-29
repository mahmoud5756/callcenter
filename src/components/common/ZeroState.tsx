import React from 'react';
import { UploadCloudIcon, FileTextIcon } from '../icons/SvgIcons';
import { useApp } from '../../context/AppContext';

interface ZeroStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  // Pure "all caught up" states (e.g. no previous-day backlog left) aren't
  // missing-data states, so they shouldn't prompt an upload action.
  hideAction?: boolean;
}

export const ZeroState: React.FC<ZeroStateProps> = ({
  title = 'لا توجد بيانات حتى الآن. ابدأ برفع ملف العملاء',
  description = 'قم برفع تقرير الكاشير والكول سنتر بصيغة PDF أو نص مباشر للبدء في توزيع ومتابعة مكالمات خدمة العملاء.',
  actionText = 'رفع تقرير طلبات POS جديد',
  onAction,
  hideAction = false,
}) => {
  const { setActiveTab, currentUser } = useApp();

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else {
      setActiveTab('import');
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-12 sm:p-16 text-center max-w-xl mx-auto my-12">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-100 shadow-2xs">
        <FileTextIcon size={30} />
      </div>

      <h3 className="font-display font-black text-xl text-slate-900 mb-2">
        {title}
      </h3>

      <p className="text-slate-500 text-xs sm:text-sm leading-relaxed mb-8 max-w-md mx-auto">
        {description}
      </p>

      {hideAction ? null : currentUser?.role !== 'customer_service' ? (
        <button
          type="button"
          onClick={handleAction}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <UploadCloudIcon size={16} />
          <span>{actionText}</span>
        </button>
      ) : (
        <p className="text-xs text-slate-400 font-medium">
          في انتظار قيام المشرف أو الإدارة برفع وتوزيع طلبات اليوم عليك.
        </p>
      )}
    </div>
  );
};
