export const formatProblemType = (type: string): string => {
  if (!type) return 'غير محدد';
  const map: Record<string, string> = {
    // Restaurant problems
    food_quality: 'جودة الأكل',
    missing_item: 'صنف ناقص',
    item_missing: 'صنف ناقص',
    wrong_item: 'صنف غلط',
    item_wrong: 'صنف غلط',
    packaging: 'مشكلة في التغليف',
    packaging_issue: 'مشكلة في التغليف',
    delay: 'تأخير تجهيز الطلب',
    preparation_delay: 'تأخير تجهيز الطلب',
    food_cold: 'الأكل وصل بارد',
    insufficient_quantity: 'الكمية وحجم الحصة غير كافية',
    addon_missed: 'إضافة لم تنفذ',
    removal_missed: 'إزالة مكون لم تنفذ',
    mismatched_order: 'الطلب غير مطابق لما تم طلبه',
    bill_issue: 'مشكلة في حساب الفاتورة والسعر',
    
    // Call center problems
    order_wrong: 'الطلب اتسجل غلط بالكامل',
    quantity_wrong: 'الكمية اتسجلت غلط',
    address_wrong: 'العنوان اتسجل غلط',
    phone_wrong: 'رقم الهاتف اتسجل غلط',
    note_missed: 'ملاحظة العميل لم تسجل',
    unavailable_confirmed: 'تم تأكيد صنف غير متاح',
    communication_issue: 'مشكلة في أسلوب التواصل',
    other: 'أخرى (تفاصيل خاصة)',
  };
  return map[type] || type;
};

export const cleanBranchName = (name: string): string => {
  if (!name) return 'الرئيسي';
  return name
    .replace(/[\[\]]/g, '') // remove square brackets producing broken [] glyphs
    .replace(/[\uFFFD\u0000-\u001F\u007F-\u009F\u25A0-\u25FF\u2600-\u26FF\uFEFF]/g, '')
    .trim() || 'الرئيسي';
};

// Problem type ids available when logging a problem, grouped by who is responsible.
export const RESTAURANT_PROBLEM_TYPE_IDS = [
  'item_missing', 'item_wrong', 'addon_missed', 'removal_missed', 'mismatched_order',
  'food_quality', 'food_cold', 'insufficient_quantity', 'packaging_issue',
  'preparation_delay', 'bill_issue', 'other',
] as const;

export const CALL_CENTER_PROBLEM_TYPE_IDS = [
  'order_wrong', 'item_wrong', 'quantity_wrong', 'address_wrong', 'phone_wrong',
  'note_missed', 'unavailable_confirmed', 'communication_issue', 'other',
] as const;

export const PROBLEM_STATUS_LABEL: Record<string, string> = {
  open: 'مفتوحة',
  escalated: 'مصعّدة للإدارة',
  in_progress: 'قيد المتابعة',
  resolved_on_call: 'اتحلّت في المكالمة',
  pending_compensation: 'تعويض معلّق',
  compensated: 'تم التعويض',
  resolved: 'تم الحل',
  closed: 'مغلقة',
};

export const isProblemUnresolved = (status: string): boolean =>
  ['open', 'escalated', 'in_progress', 'pending_compensation'].includes(status);

// Labelled option lists, shared by every screen that logs a problem (call modal + inbound complaint).
export const CALL_CENTER_PROBLEM_OPTIONS: { id: string; label: string }[] = [
  { id: 'order_wrong', label: 'الطلب اتسجل غلط بالكامل' },
  { id: 'item_wrong', label: 'صنف اتسجل غلط' },
  { id: 'quantity_wrong', label: 'الكمية اتسجلت غلط' },
  { id: 'address_wrong', label: 'العنوان اتسجل غلط' },
  { id: 'phone_wrong', label: 'رقم الهاتف اتسجل غلط' },
  { id: 'note_missed', label: 'ملاحظة العميل لم يتم تسجيلها' },
  { id: 'unavailable_confirmed', label: 'تم تأكيد صنف غير متاح' },
  { id: 'communication_issue', label: 'مشكلة في أسلوب التواصل مع العميل' },
  { id: 'other', label: 'أخرى (اكتب التفاصيل)' },
];

export const RESTAURANT_PROBLEM_OPTIONS: { id: string; label: string }[] = [
  { id: 'item_missing', label: 'صنف ناقص في الطلب' },
  { id: 'item_wrong', label: 'صنف غلط مستلم' },
  { id: 'addon_missed', label: 'إضافة لم يتم تنفيذها' },
  { id: 'removal_missed', label: 'إزالة صنف/مكون لم تنفذ' },
  { id: 'mismatched_order', label: 'الطلب غير مطابق لما تم طلبه' },
  { id: 'food_quality', label: 'مستوى وجودة الأكل غير مرضية' },
  { id: 'food_cold', label: 'الأكل وصل بارد' },
  { id: 'insufficient_quantity', label: 'الكمية وحجم الحصة غير كافية' },
  { id: 'packaging_issue', label: 'مشكلة في التغليف والتقفيل' },
  { id: 'preparation_delay', label: 'تأخير كبير في تجهيز الطلب' },
  { id: 'bill_issue', label: 'مشكلة في حساب الفاتورة والسعر' },
  { id: 'other', label: 'أخرى (اكتب التفاصيل)' },
];
