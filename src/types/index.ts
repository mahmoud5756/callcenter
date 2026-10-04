export type UserRole = 'admin' | 'manager' | 'customer_service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  assignedBranches?: string[];
}

export interface Branch {
  id: string;
  name: string;
  code?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  altPhone?: string;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemName: string;
  quantity: number;
  price: number;
}

export type OrderStatus =
  | 'pending'
  | 'in_progress'
  | 'contacted_tamam'
  | 'contacted_problem'
  | 'no_answer'
  | 'unavailable'
  | 'callback_requested';

export type VoidFollowUpStatus =
  | 'pending'
  | 'recovered'
  | 'resolved'
  | 'compensated'
  | 'no_answer'
  | 'escalated';

export interface Order {
  id: string;
  orderNumber: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  altPhone?: string;
  orderDate: string; // YYYY-MM-DD
  orderTime: string; // HH:MM
  totalAmount: number;
  subTotalAmount?: number;
  takerName?: string; // Cashier / POS order taker (NEVER customer name)
  status: OrderStatus;
  isVoid: boolean; // SHORT VOID or VOID
  voidReason?: string;
  voidResponsible?: 'restaurant' | 'call_center' | 'courier' | 'customer';
  voidFollowUpStatus?: VoidFollowUpStatus;
  voidNotes?: string;
  voidFollowedUpAt?: string;
  voidFollowedUpByUserName?: string;
  replacementForOrderId?: string; // Linked void order if this is a Re-order
  assignedToUserId?: string;
  assignedToUserName?: string;
  assignedAt?: string;
  items: OrderItem[];
  importedFileId?: string;
  createdAt: string;
  
  // Algorithmic smart fields
  priorityScore?: number; // 0 - 100
  priorityLevel?: 'critical' | 'high' | 'medium' | 'normal';
  priorityReasons?: string[];
  customerRating?: number; // 1 to 5 stars
  
  // Agent conflict locking
  lockedByUserId?: string;
  lockedByUserName?: string;
  lockedAt?: string;
}

export interface BranchAnomaly {
  id: string;
  branchName: string;
  severity: 'critical' | 'warning' | 'info';
  anomalyType: 'high_void_rate' | 'cold_food_cluster' | 'missing_items_cluster' | 'delay_cluster' | 'high_complaint_rate';
  title: string;
  description: string;
  affectedOrdersCount: number;
  ratePercentage: number;
  recommendedAction: string;
  detectedAt: string;
}

export interface CallClick {
  id: string;
  orderId: string;
  customerPhone: string;
  userId: string;
  userName: string;
  protocol: 'tel' | 'sip';
  clickedAt: string;
}

export type CallResult =
  | 'tamam'
  | 'problem'
  | 'no_answer'
  | 'unavailable'
  | 'callback_requested';

export type ProblemSource = 'call_center' | 'restaurant';

export type CallCenterProblemType =
  | 'order_wrong'
  | 'item_wrong'
  | 'quantity_wrong'
  | 'address_wrong'
  | 'phone_wrong'
  | 'note_missed'
  | 'unavailable_confirmed'
  | 'communication_issue'
  | 'other';

export type RestaurantProblemType =
  | 'item_missing'
  | 'item_wrong'
  | 'addon_missed'
  | 'removal_missed'
  | 'mismatched_order'
  | 'food_quality'
  | 'food_cold'
  | 'insufficient_quantity'
  | 'packaging_issue'
  | 'preparation_delay'
  | 'bill_issue'
  | 'other';

export type CompensationType =
  | 'free_item_next_order'
  | 'instant_replacement_delivery'
  | 'discount_percentage'
  | 'cash_refund'
  | 'wallet_credit'
  | 'verbal_apology'
  | 'custom'; // any admin-defined compensation (e.g. free delivery)

export type CompensationStatus =
  | 'pending_compensation'
  | 'compensated';

export interface CustomerCall {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  userId: string;
  userName: string;
  callResult: CallResult;
  notes?: string;
  problemSource?: ProblemSource;
  problemType?: string;
  problemDetails?: string;
  problemResolution?: 'resolved_on_call' | 'escalated_to_management';
  callDurationSeconds?: number;
  // Compensation
  hasCompensation?: boolean;
  compensationType?: CompensationType;
  compensationDetails?: string;
  compensationStatus?: CompensationStatus;
  createdAt: string;
}

export type ProblemStatus =
  | 'open'
  | 'escalated'
  | 'in_progress'
  | 'resolved_on_call'
  | 'pending_compensation'
  | 'compensated'
  | 'resolved'
  | 'closed';

export interface Problem {
  id: string;
  callId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  branchName: string;
  source: ProblemSource;
  type: string;
  details: string;
  status: ProblemStatus;
  isEscalated?: boolean;
  resolutionType?: 'resolved_on_call' | 'escalated_to_management';
  reportedByUserId: string;
  reportedByUserName: string;
  resolvedByUserId?: string;
  resolvedByUserName?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  oldOrderNumber?: string;
  newOrderNumber?: string;

  // Customer Compensation Cycle Fields
  hasCompensation?: boolean;
  compensationType?: CompensationType;
  compensationDetails?: string;
  compensationStatus?: CompensationStatus;
  compensationPromisedAt?: string;
  compensationPromisedByUserId?: string;
  compensationPromisedByUserName?: string;
  compensationExecutedAt?: string;
  compensationExecutedByUserId?: string;
  compensationExecutedByUserName?: string;
  compensationAppliedOrderNumber?: string;
  compensationExecutionNotes?: string;
}

export interface ImportedFile {
  id: string;
  fileName: string;
  importedByUserId: string;
  importedByUserName: string;
  totalRecords: number;
  validRecords: number;
  voidRecords: number;
  reorderRecords: number;
  importedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  details: string;
  createdAt: string;
}

export interface AppSettings {
  callProtocol: 'tel' | 'sip';
  sipServerUrl?: string;
  agentLockTimeoutMinutes: number;
  restaurantName: string;
}
