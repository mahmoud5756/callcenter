import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  UploadCloudIcon,
  FileTextIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  XIcon,
  TrashIcon,
  RefreshCwIcon,
  CheckIcon,
  CopyIcon,
  SparklesIcon,
} from '../icons/SvgIcons';
import {
  extractTextFromPdf,
  parsePosReportText,
  ParsedOrderDraft,
  ParseResult,
} from '../../services/pdfParser';
import { reverseItemWords } from '../../services/arabicItemFixer';
import { orderIdentityKey } from '../../services/pdfParser';
import { findReturningCustomers, ReturningCustomer } from '../../services/customerHistory';
import { ReturningCustomersPanel } from './ReturningCustomersPanel';

export const PosUploadView: React.FC = () => {
  const { commitImportedOrders, allOrders, problems, setActiveTab } = useApp();

  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [pastedText, setPastedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [editableOrders, setEditableOrders] = useState<ParsedOrderDraft[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Customers in this file who already have problems on record (new orders only)
  const returningCustomers = useMemo(() => {
    const existing = new Set(allOrders.map((o) => orderIdentityKey(o)));
    const fresh = editableOrders.filter((d) => !existing.has(orderIdentityKey(d)));
    return findReturningCustomers(fresh, problems);
  }, [editableOrders, allOrders, problems]);
  const [committedReturning, setCommittedReturning] = useState<ReturningCustomer[]>([]);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setStatusMessage(null);
    setCommittedReturning([]);
    setFileName(file.name);

    try {
      let rawText = '';
      if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
        const buffer = await file.arrayBuffer();
        rawText = await extractTextFromPdf(buffer);
      } else {
        rawText = await file.text();
      }

      const result = parsePosReportText(rawText, allOrders);
      setParseResult(result);
      setEditableOrders(result.orders);

      if (result.orders.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'لم يتم العثور على أوردرات بصيغة POS صالحة في الملف. يرجى التأكد من أن التقرير يحتوي على كتل تبدأ بـ ORDER NUMBER.',
        });
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء قراءة وتحليل الملف.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextParse = (textToParse?: string) => {
    const content = textToParse || pastedText;
    if (!content.trim()) {
      setStatusMessage({ type: 'error', text: 'يرجى لصق نص التقرير أولاً' });
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);
    setFileName(`تقرير-مباشر-${new Date().toISOString().substring(0, 10)}.txt`);

    try {
      const result = parsePosReportText(content, allOrders);
      setParseResult(result);
      setEditableOrders(result.orders);

      if (result.orders.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'لم يتم العثور على أوردرات بصيغة POS صالحة في النص المدخل.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء معالجة النص.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (editableOrders.length === 0) return;
    setIsProcessing(true);

    try {
      const result = await commitImportedOrders(editableOrders, fileName || 'POS_Orders_Report');

      if (result.error || result.importedCount === 0) {
        setStatusMessage({
          type: 'error',
          text: `فشل حفظ الأوردرات في قاعدة البيانات: ${
            result.error || 'لم يتم استيراد أي أوردر.'
          }`,
        });
        return;
      }

      setStatusMessage({
        type: 'success',
        text: `تم استيراد ${result.importedCount} أوردر بنجاح في قاعدة بيانات Supabase! تم تطبيق خوارزميات الأولويات واستبعاد ${result.duplicateCount} مكرر.`,
      });

      // Keep the "returning customers" report on screen after saving instead of
      // jumping away, so the team can read it before starting the calls.
      setCommittedReturning(returningCustomers);
      setParseResult(null);
      setEditableOrders([]);
      setPastedText('');

      if (returningCustomers.length === 0) {
        setTimeout(() => {
          setActiveTab('queue');
        }, 1200);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء حفظ الأوردرات في قاعدة البيانات.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveOrderDraft = (index: number) => {
    setEditableOrders((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleFieldChange = (index: number, field: keyof ParsedOrderDraft, value: any) => {
    setEditableOrders((prev) =>
      prev.map((order, idx) => (idx === index ? { ...order, [field]: value } : order))
    );
  };

  const handleFlipAllItemsWords = () => {
    setEditableOrders((prev) =>
      prev.map((order) => ({
        ...order,
        items: order.items.map((it) => ({
          ...it,
          itemName: reverseItemWords(it.itemName),
        })),
      }))
    );
  };

  const handleFlipSingleItem = (orderIdx: number, itemIdx: number) => {
    setEditableOrders((prev) =>
      prev.map((order, oIdx) => {
        if (oIdx !== orderIdx) return order;
        return {
          ...order,
          items: order.items.map((it, iIdx) => {
            if (iIdx !== itemIdx) return it;
            return {
              ...it,
              itemName: reverseItemWords(it.itemName),
            };
          }),
        };
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                محرك قراءة تقارير الـ POS الذكي
              </h1>
              <span className="px-2 py-0.5 rounded-full text-3xs font-bold bg-red-100 text-red-800">
                خوارزمية مطابقة مكانية Spatial Parser
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              استخراج فائق الدقة للأوردرات مع التفريق الإلزامي بين الكاشير (TAKER) والعميل (NAM) وعزل الـ SHORT VOID ورصد الأوردرات البديلة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => {
                  setInputMode('file');
                  setStatusMessage(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  inputMode === 'file'
                    ? 'bg-white text-red-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                رفع PDF / Text
              </button>
              <button
                onClick={() => {
                  setInputMode('text');
                  setStatusMessage(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  inputMode === 'text'
                    ? 'bg-white text-red-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                لصق نص التقرير
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm font-bold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircleIcon size={20} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircleIcon size={20} className="text-red-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* After saving: customers from this file who already had problems */}
      {committedReturning.length > 0 && (
        <div className="space-y-3">
          <ReturningCustomersPanel customers={committedReturning} />
          <button
            type="button"
            onClick={() => {
              setCommittedReturning([]);
              setActiveTab('queue');
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
          >
            الذهاب إلى طابور المتابعة
          </button>
        </div>
      )}

      {/* Input Section */}
      {!parseResult && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {inputMode === 'file' ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-3xl p-12 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-red-50/20 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
                accept=".pdf,.txt"
                className="hidden"
              />
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <UploadCloudIcon size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">
                اسحب وأفلت تقرير الـ PDF أو انقر لاختيار الملف
              </h3>
              <p className="text-slate-500 text-xs mb-4">
                يدعم تقارير DETAIL ORDERS LIST و CALL CENTER بجميع أنظمة الكاشير (Micros, Symphony, Foodics, Odoo)
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-xs">
                <span>الصيغ المدعومة: PDF, TXT</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-800">
                  الصق نص تقرير الـ POS بالكامل هنا:
                </label>
              </div>

              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="الصق تقرير الطلبات هنا... (يبدأ بـ ORDER NUMBER: ... TAKER ... PHONE ... NAM)"
                rows={11}
                className="w-full p-4 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleTextParse()}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCwIcon size={16} className={isProcessing ? 'animate-spin' : ''} />
                  <span>معالجة واستخراج الأوردرات بالخوارزمية</span>
                </button>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="text-center py-8">
              <RefreshCwIcon size={32} className="animate-spin text-red-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">
                جاري استخراج البيانات وفصل الكاشير عن العملاء ورصد الملغيات...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Parse Preview & Review Step */}
      {parseResult && (
        <div className="space-y-6">
          {/* Returning customers (already have problems on record) */}
          <ReturningCustomersPanel customers={returningCustomers} />

          {/* Summary Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-500">إجمالي الأوردرات المقروءة</span>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {parseResult.totalParsed}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm bg-emerald-50/30">
              <span className="text-xs font-bold text-emerald-700">الأوردرات السليمة (طابور المتابعة)</span>
              <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                {editableOrders.filter((o) => !o.isVoid).length}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-red-200 shadow-sm bg-red-50/30">
              <span className="text-xs font-bold text-red-700">الملغيات (SHORT VOID)</span>
              <div className="text-2xl font-black text-red-600 mt-1 font-mono">
                {editableOrders.filter((o) => o.isVoid).length}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm bg-amber-50/30">
              <span className="text-xs font-bold text-amber-700">أوردرات بديلة (Re-ordered)</span>
              <div className="text-2xl font-black text-amber-600 mt-1 font-mono">
                {editableOrders.filter((o) => o.replacementForOrderId).length}
              </div>
            </div>
          </div>

          {/* Warnings List */}
          {parseResult.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-1 text-xs text-amber-900 font-medium">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangleIcon size={16} className="text-amber-600" />
                <span>تنبيهات وملاحظات المطابقة ({parseResult.warnings.length})</span>
              </div>
              {parseResult.warnings.slice(0, 4).map((w, idx) => (
                <p key={idx}>• {w}</p>
              ))}
            </div>
          )}

          {/* Editable Preview Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base">
                  مراجعة وتأكيد بيانات الأوردرات قبل الاعتماد ({editableOrders.length})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFlipAllItemsWords}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                  title="عكس ترتيب الكلمات لجميع أصناف الأوردرات (في حال كانت معكوسة من اليمين لليسار في ملف POS)"
                >
                  <RefreshCwIcon size={14} />
                  <span>🔄 عكس ترتيب كلمات الأصناف</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setParseResult(null);
                    setEditableOrders([]);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء وإعادة الرفع
                </button>

                <button
                  type="button"
                  onClick={handleCommit}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <CheckIcon size={16} />
                  <span>اعتماد وحفظ بالمنظومة</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-3">دقة القراءة</th>
                    <th className="p-3">رقم الأوردر</th>
                    <th className="p-3">اسم العميل (NAM)</th>
                    <th className="p-3">رقم الهاتف</th>
                    <th className="p-3">الفرع</th>
                    <th className="p-3">كاشير الفرع (TAKER)</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3">الأصناف</th>
                    <th className="p-3">الحالة والتصنيف الذكي</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editableOrders.map((draft, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition-colors ${
                        draft.isVoid ? 'bg-red-50/20' : ''
                      }`}
                    >
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-2xs bg-emerald-100 text-emerald-800">
                          {draft.confidenceScore || 95}%
                        </span>
                      </td>

                      <td className="p-3 font-mono font-bold text-slate-900">
                        <input
                          type="text"
                          value={draft.orderNumber}
                          onChange={(e) => handleFieldChange(idx, 'orderNumber', e.target.value)}
                          className="w-24 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          value={draft.customerName}
                          onChange={(e) => handleFieldChange(idx, 'customerName', e.target.value)}
                          className="w-36 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                        />
                      </td>

                      <td className="p-3" dir="ltr">
                        <input
                          type="text"
                          value={draft.customerPhone}
                          onChange={(e) => handleFieldChange(idx, 'customerPhone', e.target.value)}
                          className="w-28 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          value={draft.branchName}
                          onChange={(e) => handleFieldChange(idx, 'branchName', e.target.value)}
                          className="w-28 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          value={draft.takerName || ''}
                          onChange={(e) => handleFieldChange(idx, 'takerName', e.target.value)}
                          placeholder="اسم الكاشير"
                          className="w-32 p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                        />
                      </td>

                      <td className="p-3 font-bold text-slate-900 font-mono">
                        {draft.totalAmount} ج.م
                      </td>

                      <td className="p-3 min-w-[220px] max-w-xs text-slate-700">
                        {draft.items.length > 0 ? (
                          <div className="space-y-1">
                            {draft.items.map((item, itemIdx) => (
                              <div
                                key={itemIdx}
                                className="flex items-center justify-between gap-1.5 px-2 py-1 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200/80 text-xs"
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="font-mono font-bold text-2xs text-red-600 bg-red-50 px-1 py-0.5 rounded border border-red-100 shrink-0">
                                    {item.quantity}×
                                  </span>
                                  <span className="font-bold text-slate-800 truncate" title={item.itemName}>
                                    {item.itemName}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleFlipSingleItem(idx, itemIdx)}
                                  className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded transition-colors cursor-pointer shrink-0"
                                  title="عكس ترتيب كلمات هذا الصنف"
                                >
                                  <RefreshCwIcon size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">لا توجد أصناف</span>
                        )}
                      </td>

                      <td className="p-3">
                        {draft.isVoid ? (
                          <span className="px-2.5 py-1 rounded-full text-2xs font-black bg-red-100 text-red-800 border border-red-200">
                            SHORT VOID (ملغي)
                          </span>
                        ) : draft.replacementForOrderId ? (
                          <span className="px-2.5 py-1 rounded-full text-2xs font-black bg-amber-100 text-amber-900 border border-amber-200">
                            أوردر بديل (#{draft.replacementForOrderId})
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-2xs font-extrabold bg-emerald-100 text-emerald-800">
                            سليم جاهز للمتابعة
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveOrderDraft(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف من الاستيراد"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
