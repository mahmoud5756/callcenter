import React, { useState } from 'react';
import { UtensilsIcon, ChevronDownIcon } from '../icons/SvgIcons';
import { OrderItem } from '../../types';
import { formatItemName } from '../../services/arabicItemFixer';

export { formatItemName };

interface OrderItemsListProps {
  items?: Array<OrderItem | { itemName: string; quantity: number; price?: number; id?: string }>;
  maxVisible?: number;
  theme?: 'red' | 'rose' | 'emerald';
  showHeader?: boolean;
  className?: string;
}

export const OrderItemsList: React.FC<OrderItemsListProps> = ({
  items = [],
  maxVisible = 2,
  theme = 'red',
  showHeader = true,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!items || items.length === 0) {
    return null;
  }

  const hasMore = items.length > maxVisible;
  const visibleItems = isExpanded ? items : items.slice(0, maxVisible);
  const remainingCount = items.length - maxVisible;

  // Theme-specific styles
  const themeClasses = {
    red: {
      badge: 'bg-red-50 text-red-700 border-red-200/80',
      toggle: 'text-red-600 hover:text-red-700 hover:bg-red-50/60',
      borderHover: 'hover:border-red-200',
    },
    rose: {
      badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
      toggle: 'text-rose-600 hover:text-rose-700 hover:bg-rose-50/60',
      borderHover: 'hover:border-rose-200',
    },
    emerald: {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      toggle: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/60',
      borderHover: 'hover:border-emerald-200',
    },
  }[theme];

  return (
    <div className={`space-y-1.5 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between text-2xs font-bold text-slate-500">
          <div className="flex items-center gap-1.5">
            <UtensilsIcon size={12} className="text-slate-400" />
            <span>الأصناف ({items.length}):</span>
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-black text-3xs transition-colors cursor-pointer ${themeClasses.toggle}`}
            >
              <span>{isExpanded ? 'إخفاء' : `+${remainingCount} أصناف أخرى`}</span>
              <ChevronDownIcon
                size={12}
                className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      )}

      {/* Structured Item Rows */}
      <div className="space-y-1.5">
        {visibleItems.map((item, idx) => {
          const formattedName = formatItemName(item.itemName);
          const hasPrice = typeof item.price === 'number' && item.price > 0;

          return (
            <div
              key={item.id || idx}
              className={`flex items-center justify-between gap-2 px-3 py-2 bg-slate-50/90 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 text-xs transition-all ${themeClasses.borderHover}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* Quantity Pill */}
                <span
                  className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-lg border font-mono font-black text-2xs shrink-0 select-none ${themeClasses.badge}`}
                >
                  {item.quantity}×
                </span>

                {/* Clean Item Title */}
                <span
                  className="font-bold text-slate-800 text-xs leading-normal truncate"
                  title={formattedName}
                >
                  {formattedName}
                </span>
              </div>

              {/* Price Tag if available */}
              {hasPrice && (
                <span className="text-2xs font-mono font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200/60 shrink-0">
                  {(item.price! * item.quantity).toFixed(0)} <span className="text-3xs font-sans text-slate-400">ج.م</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
