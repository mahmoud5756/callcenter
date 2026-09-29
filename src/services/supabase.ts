import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  User,
  Order,
  CustomerCall,
  Problem,
  ImportedFile,
  AuditLog,
  CallResult,
  OrderStatus,
  ProblemSource,
  ProblemStatus,
  CompensationType,
  CompensationStatus,
} from '../types';

// Read Supabase credentials directly from environment variables (.env / import.meta.env)
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Provide a safe fallback client to avoid crashing on boot if env vars are being configured
    supabaseInstance = createClient(
      'https://placeholder.supabase.co',
      'placeholder-anon-key',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    );
    return supabaseInstance;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return supabaseInstance;
};

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('placeholder.supabase.co')
  );
};

export const supabase = getSupabaseClient();

// A throw-away client that never touches the logged-in admin's session.
// Used to create other users (signUp on the main client would sign the admin out).
export const createIsolatedClient = (): SupabaseClient =>
  createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-user-provisioning',
    },
  });

// ==========================================
// Enum Mappings between UI and Supabase DB
// ==========================================

// order_status enum values in the live Supabase DB:
// not_contacted, contacted_ok, has_problem, no_answer, not_available, call_back_requested, void
export const mapOrderStatusToDb = (status: OrderStatus): string => {
  switch (status) {
    case 'pending':
    case 'in_progress':
      // The DB has no separate "in progress" state - the locked_by/locked_at
      // columns already track that an order is actively being called.
      return 'not_contacted';
    case 'contacted_tamam':
      return 'contacted_ok';
    case 'contacted_problem':
      return 'has_problem';
    case 'no_answer':
      return 'no_answer';
    case 'unavailable':
      return 'not_available';
    case 'callback_requested':
      return 'call_back_requested';
    default:
      return 'not_contacted';
  }
};

export const mapOrderStatusFromDb = (dbStatus?: string): OrderStatus => {
  switch (dbStatus) {
    case 'not_contacted':
      return 'pending';
    case 'contacted_ok':
      return 'contacted_tamam';
    case 'has_problem':
      return 'contacted_problem';
    case 'no_answer':
      return 'no_answer';
    case 'not_available':
      return 'unavailable';
    case 'call_back_requested':
      return 'callback_requested';
    case 'void':
      // Void orders are already distinguished via the separate is_void column.
      return 'pending';
    default:
      return 'pending';
  }
};

export const mapCallResultToDb = (result: CallResult): string => {
  switch (result) {
    case 'tamam':
      return 'ok';
    case 'problem':
      return 'problem';
    case 'no_answer':
      return 'no_answer';
    case 'unavailable':
      return 'busy_or_unavailable';
    case 'callback_requested':
      return 'call_back_later';
    default:
      return 'ok';
  }
};

export const mapCallResultFromDb = (dbResult: string): CallResult => {
  switch (dbResult) {
    case 'ok':
      return 'tamam';
    case 'problem':
      return 'problem';
    case 'no_answer':
      return 'no_answer';
    case 'busy_or_unavailable':
      return 'unavailable';
    case 'call_back_later':
      return 'callback_requested';
    case 'wrong_number':
      return 'unavailable';
    default:
      return 'tamam';
  }
};

export const mapCompensationTypeToDb = (type?: CompensationType): string | null => {
  if (!type) return null;
  switch (type) {
    case 'free_item_next_order':
      return 'resend_items';
    case 'instant_replacement_delivery':
      return 'resend_items';
    case 'discount_percentage':
      return 'discount_voucher';
    case 'cash_refund':
      return 'full_refund';
    case 'verbal_apology':
      return 'apology_courtesy';
    case 'wallet_credit':
    default:
      return 'other';
  }
};

export const mapCompensationTypeFromDb = (dbType?: string): CompensationType | undefined => {
  if (!dbType) return undefined;
  switch (dbType) {
    case 'resend_items':
      return 'free_item_next_order';
    case 'discount_voucher':
      return 'discount_percentage';
    case 'full_refund':
      return 'cash_refund';
    case 'apology_courtesy':
      return 'verbal_apology';
    case 'other':
    default:
      return 'wallet_credit';
  }
};

export const mapCompensationStatusToDb = (status?: CompensationStatus): string => {
  switch (status) {
    case 'compensated':
      return 'applied';
    case 'pending_compensation':
    default:
      return 'pending';
  }
};

export const mapCompensationStatusFromDb = (dbStatus?: string): CompensationStatus => {
  switch (dbStatus) {
    case 'applied':
      return 'compensated';
    case 'pending':
    case 'rejected':
    default:
      return 'pending_compensation';
  }
};

export const mapProblemStatusToDb = (
  status: ProblemStatus,
  isEscalated?: boolean
): string => {
  if (isEscalated || status === 'escalated') return 'escalated_to_management';
  if (status === 'resolved_on_call') return 'resolved_on_call';
  if (status === 'compensated' || status === 'resolved') return 'resolved';
  if (status === 'closed') return 'closed';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
};

export const mapProblemStatusFromDb = (
  dbStatus: string,
  compensationStatus?: string
): ProblemStatus => {
  // An explicit resolve/close must win over a still-pending compensation, otherwise the
  // problem snaps back to 'pending_compensation' after every reload. Compensation progress
  // stays tracked separately in compensationStatus.
  if (compensationStatus === 'pending' && dbStatus !== 'resolved' && dbStatus !== 'closed') return 'pending_compensation';
  if (compensationStatus === 'applied') return 'compensated';

  switch (dbStatus) {
    case 'escalated_to_management':
      return 'escalated';
    case 'resolved_on_call':
      return 'resolved_on_call';
    case 'in_progress':
      return 'in_progress';
    case 'resolved':
      return 'resolved';
    case 'closed':
      return 'closed';
    case 'open':
    default:
      return 'open';
  }
};

// ==========================================
// Database Transformers
// ==========================================

export const transformOrderFromDb = (row: any, profilesMap: Map<string, string>): Order => {
  const isVoid = Boolean(row.is_void);
  return {
    id: row.id,
    orderNumber: row.order_number || '',
    branchName: row.branch_name || 'الرئيسي',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    altPhone: row.alt_phone || undefined,
    orderDate: row.order_date || new Date().toISOString().split('T')[0],
    orderTime: row.order_time || '00:00',
    totalAmount: Number(row.total_amount) || 0,
    subTotalAmount: row.subtotal ? Number(row.subtotal) : undefined,
    takerName: row.taker_name || undefined,
    status: mapOrderStatusFromDb(row.status),
    isVoid,
    voidReason: row.void_reason || undefined,
    replacementForOrderId: row.replacement_for_order_id || undefined,
    assignedToUserId: row.assigned_to || undefined,
    assignedToUserName: row.assigned_to ? profilesMap.get(row.assigned_to) : undefined,
    assignedAt: row.assigned_at || undefined,
    lockedByUserId: row.locked_by || undefined,
    lockedByUserName: row.locked_by ? profilesMap.get(row.locked_by) : undefined,
    lockedAt: row.locked_at || undefined,
    items: Array.isArray(row.items)
      ? row.items.map((it: any, idx: number) => ({
          id: it.id || `it-${row.id}-${idx}`,
          orderId: row.id,
          itemName: it.itemName || it.item_name || it.name || 'صنف',
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
        }))
      : [],
    importedFileId: row.imported_file_id || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
};

export const transformProblemFromDb = (
  row: any,
  profilesMap: Map<string, string>,
  ordersMap: Map<string, Order>
): Problem => {
  const relatedOrder = row.order_id ? ordersMap.get(row.order_id) : undefined;
  const isEscalated =
    Boolean(row.is_escalated) || row.status === 'escalated_to_management';
  const compStatus = row.compensation_status
    ? mapCompensationStatusFromDb(row.compensation_status)
    : undefined;

  return {
    id: row.id,
    callId: row.id,
    orderId: row.order_id || '',
    orderNumber: relatedOrder?.orderNumber || row.order_number || '',
    customerName: relatedOrder?.customerName || row.customer_name || '',
    customerPhone: relatedOrder?.customerPhone || row.customer_phone || '',
    branchName: relatedOrder?.branchName || row.branch_name || 'الرئيسي',
    source: (row.source as ProblemSource) || 'restaurant',
    type: row.problem_type || 'other',
    details: row.custom_details || row.notes || 'بدون تفاصيل',
    status: mapProblemStatusFromDb(row.status, row.compensation_status),
    isEscalated,
    resolutionType: isEscalated
      ? 'escalated_to_management'
      : row.status === 'resolved_on_call'
      ? 'resolved_on_call'
      : undefined,
    reportedByUserId: row.agent_id || '',
    reportedByUserName: (row.agent_id && profilesMap.get(row.agent_id)) || 'خدمة العملاء',
    resolvedByUserId: row.resolved_by || undefined,
    resolvedByUserName: (row.resolved_by && profilesMap.get(row.resolved_by)) || undefined,
    resolutionNotes: row.manager_response || row.escalation_notes || row.compensation_notes || undefined,
    resolvedAt: row.resolved_at || undefined,
    oldOrderNumber: row.old_order_number || undefined,
    newOrderNumber: row.new_order_number || undefined,
    createdAt: row.created_at || new Date().toISOString(),

    // Compensation fields
    hasCompensation: Boolean(row.has_compensation),
    compensationType: mapCompensationTypeFromDb(row.compensation_type),
    compensationDetails: row.compensation_details || undefined,
    compensationStatus: compStatus,
    compensationPromisedAt: row.created_at || undefined,
    compensationPromisedByUserId: row.agent_id || undefined,
    compensationPromisedByUserName: (row.agent_id && profilesMap.get(row.agent_id)) || undefined,
    compensationExecutedAt: row.compensation_applied_at || undefined,
    compensationAppliedOrderNumber: row.compensation_applied_order_id || undefined,
    compensationExecutionNotes: row.compensation_notes || undefined,
  };
};

export const transformCallFromDb = (
  row: any,
  profilesMap: Map<string, string>,
  ordersMap: Map<string, Order>
): CustomerCall => {
  const relatedOrder = row.order_id ? ordersMap.get(row.order_id) : undefined;
  return {
    id: row.id,
    orderId: row.order_id || '',
    orderNumber: relatedOrder?.orderNumber || '',
    customerName: relatedOrder?.customerName || row.customer_name || '',
    customerPhone: relatedOrder?.customerPhone || row.customer_phone || '',
    userId: row.agent_id || '',
    userName: (row.agent_id && profilesMap.get(row.agent_id)) || 'موظف',
    callResult: mapCallResultFromDb(row.result),
    notes: row.notes || undefined,
    callDurationSeconds: row.duration_seconds || 0,
    createdAt: row.created_at || row.call_started_at || new Date().toISOString(),
  };
};
