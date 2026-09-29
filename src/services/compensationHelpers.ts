import { CompensationType } from '../types';

export const COMPENSATION_TYPES: { id: CompensationType; label: string }[] = [
  { id: 'free_item_next_order', label: 'صنف مجاني / بديل مع الأوردر القادم' },
  { id: 'instant_replacement_delivery', label: 'إرسال صنف بديل فوراً مع دليفري سريع' },
  { id: 'discount_percentage', label: 'خصم نسبة مئوية (مثال: 10%، 20%، 50%)' },
  { id: 'cash_refund', label: 'استرداد نقدي (Cash Refund)' },
  { id: 'wallet_credit', label: 'إضافة رصيد للمحفظة / نقاط' },
  { id: 'verbal_apology', label: 'اعتذار شفهي فقط وقبله العميل' },
];

export const formatCompensationType = (type?: string): string => {
  switch (type) {
    case 'free_item_next_order':
      return 'صنف مجاني / بديل مع الأوردر القادم';
    case 'instant_replacement_delivery':
      return 'إرسال صنف بديل فوراً مع دليفري سريع';
    case 'discount_percentage':
      return 'خصم نسبة مئوية';
    case 'cash_refund':
      return 'استرداد نقدي (Cash Refund)';
    case 'wallet_credit':
      return 'إضافة رصيد للمحفظة / نقاط';
    case 'verbal_apology':
      return 'اعتذار شفهي فقط وقبله العميل';
    default:
      return type || 'تعويض غير محدد';
  }
};
