import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import {
  User,
  Order,
  CallClick,
  CustomerCall,
  Problem,
  ProblemStatus,
  ProblemSource,
  ImportedFile,
  AuditLog,
  AppSettings,
  CallResult,
  OrderStatus,
  BranchAnomaly,
  CompensationType,
  CompensationStatus,
  Branch,
} from '../types';
import {
  supabase,
  isSupabaseConfigured,
  transformOrderFromDb,
  transformProblemFromDb,
  transformCallFromDb,
  mapCallResultToDb,
  mapProblemStatusToDb,
  mapCompensationTypeToDb,
  mapCompensationStatusToDb,
  mapOrderStatusToDb,
  createIsolatedClient,
} from './../services/supabase';
import { dialNumber } from '../services/dial';
import { ParsedOrderDraft, orderIdentityKey } from '../services/pdfParser';
import {
  calculateOrderPriority,
  smartBalancedAssignment,
  detectBranchAnomalies,
} from '../services/algorithms';

// How many days of order history to keep loaded in memory. Covers today's
// active queue plus enough lookback for the priority/repeat-customer
// algorithm. Anything older belongs in paginated archive/report queries,
// not the always-loaded app state - see fetchData().
const RECENT_ORDERS_WINDOW_DAYS = 45;

// Supabase/PostgREST silently caps a single response at 1000 rows, so any
// list larger than that gets truncated without an error. This pages through
// the full result set in batches.
const fetchAllRows = async (
  buildQuery: () => any,
  batchSize = 1000
): Promise<{ data: any[]; error: { message: string } | null }> => {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + batchSize - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < batchSize) break;
    from += batchSize;
  }
  return { data: all, error: null };
};

export type NavigationTab =
  | 'dashboard'
  | 'queue'
  | 'previous_pending'
  | 'orders'
  | 'voids'
  | 'problems'
  | 'customers'
  | 'assignment'
  | 'reports'
  | 'closing'
  | 'import'
  | 'audit'
  | 'users'
  | 'settings';

const DEFAULT_SETTINGS: AppSettings = {
  callProtocol: 'tel',
  sipServerUrl: '',
  agentLockTimeoutMinutes: 5,
  restaurantName: 'Customer Service Management',
};

interface AppContextType {
  currentUser: User | null;
  authReady: boolean;
  authNotice: string | null;
  recoveryMode: boolean;
  users: User[];
  allOrders: Order[];
  orders: Order[]; // Role-filtered orders for current view
  voidOrders: Order[];
  problems: Problem[];
  customerCalls: CustomerCall[];
  callClicks: CallClick[];
  importedFiles: ImportedFile[];
  auditLogs: AuditLog[];
  branches: Branch[];
  settings: AppSettings;
  activeTab: NavigationTab;
  selectedOrderId: string | null;
  activeCallModalOrderId: string | null;
  branchAnomalies: BranchAnomaly[];
  isLoadingData: boolean;
  isConfigured: boolean;

  // Navigation & selection
  setActiveTab: (tab: NavigationTab) => void;
  setSelectedOrderId: (orderId: string | null) => void;
  setActiveCallModalOrderId: (orderId: string | null) => void;

  // Auth & User Management
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  updateOwnPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  finishRecovery: () => void;
  addUser: (
    name: string,
    email: string,
    role: User['role'],
    password?: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateUserRole: (userId: string, role: User['role']) => Promise<void>;
  toggleUserActive: (userId: string) => Promise<void>;

  // Settings
  updateSettings: (newSettings: Partial<AppSettings>) => void;

  // Call Actions & Conflict Locking
  triggerClickToCall: (
    orderId: string,
    phone: string
  ) => Promise<{ success: boolean; conflictMessage?: string }>;
  unlockOrder: (orderId: string) => Promise<void>;
  logInboundComplaint: (
    orderId: string | null,
    data: {
      guest?: { phone: string; name?: string; branch?: string };
      items: { source: ProblemSource; type: string }[];
      details: string;
      mode: 'resolved_on_call' | 'escalated';
      resolutionDetails?: string;
      compensationType?: CompensationType;
      compensationDetails?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  submitCallResult: (
    orderId: string,
    data: {
      result: CallResult;
      notes?: string;
      problemSource?: ProblemSource;
      problemType?: string;
      problemDetails?: string;
      problemResolutionMode?: 'resolved_on_call' | 'escalated';
      additionalProblem?: { source: ProblemSource; type: string };
      problemItems?: { source: ProblemSource; type: string }[];
      resolutionDetails?: string;
      oldOrderNumber?: string;
      newOrderNumber?: string;
      callDurationSeconds?: number;
      customerRating?: number;
      compensationType?: CompensationType;
      compensationDetails?: string;
      compensationStatus?: CompensationStatus;
    }
  ) => Promise<string | null>; // returns next assigned order id if available

  // Assignment Actions
  assignOrdersToUser: (orderIds: string[], targetUserId: string) => Promise<void>;
  updateAgentBranches: (userId: string, branchNames: string[]) => Promise<void>;
  autoDistributeOrders: (orderIds?: string[]) => Promise<void>;

  // Problem & Void Management
  updateProblemStatus: (
    problemId: string,
    newStatus: ProblemStatus,
    resolutionNotes?: string,
    compensation?: { type: CompensationType; details: string }
  ) => Promise<boolean>;
  confirmCompensationExecuted: (
    problemId: string,
    appliedOrderNumber?: string,
    notes?: string
  ) => Promise<void>;
  updateVoidDetails: (
    orderId: string,
    reason: string,
    responsible: 'restaurant' | 'call_center' | 'courier' | 'customer',
    followUpStatus?: import('../types').VoidFollowUpStatus,
    notes?: string
  ) => Promise<void>;

  // Import & Data
  commitImportedOrders: (
    drafts: ParsedOrderDraft[],
    fileName: string
  ) => Promise<{ importedCount: number; duplicateCount: number; error?: string }>;
  deleteOrder: (orderId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  refreshData: () => Promise<void>;

  // Export CSV
  exportCsvReport: (
    type: 'calls' | 'problems' | 'orders' | 'agents' | 'branches' | 'voids'
  ) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const currentUserRef = useRef<User | null>(null);
  const suppressListenerRef = useRef(false);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [customerCalls, setCustomerCalls] = useState<CustomerCall[]>([]);
  const [callClicks, setCallClicks] = useState<CallClick[]>([]);
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isConfigured, setIsConfigured] = useState<boolean>(isSupabaseConfigured());

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeCallModalOrderId, setActiveCallModalOrderId] = useState<string | null>(null);

  // Map of profile id -> profile name for instant lookups
  const profilesMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.name));
    return map;
  }, [users]);

  // Map of order id -> order for problem & call relations
  const ordersMap = useMemo(() => {
    const map = new Map<string, Order>();
    allOrders.forEach((o) => map.set(o.id, o));
    return map;
  }, [allOrders]);

  // Fetch all primary database tables from Supabase
  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsLoadingData(false);
      return;
    }

    try {
      setIsLoadingData(true);

      // 1. Fetch Profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (profilesErr) {
        console.warn('Could not fetch profiles:', profilesErr.message);
      }

      const pList: User[] = (profilesData || []).map((p: any) => ({
        id: p.id,
        name: p.name || 'مستخدم',
        email: p.email || '',
        role: (p.role as any) || 'customer_service',
        isActive: p.is_active !== false,
        createdAt: p.created_at || new Date().toISOString(),
        assignedBranches: p.assigned_branches || [],
      }));
      setUsers(pList);

      const pMap = new Map<string, string>();
      pList.forEach((p) => pMap.set(p.id, p.name));

      // 2. Fetch Branches
      const { data: branchesData } = await supabase
        .from('branches')
        .select('*')
        .order('name');
      if (branchesData) {
        setBranches(
          branchesData.map((b: any) => ({
            id: b.id,
            name: b.name,
            code: b.code,
          }))
        );
      }

      // 3. Fetch Orders
      // Performance: don't pull the entire historical archive into memory on
      // every load. We keep a rolling recent window (default 45 days) which
      // covers the active call queue plus the ~30-day lookback the priority
      // algorithm needs for repeat-customer/problem history. Older archive
      // data is intentionally NOT loaded here - it belongs behind paginated
      // archive/report queries, not the live in-memory app state.
      const recentWindowCutoff = new Date();
      recentWindowCutoff.setDate(recentWindowCutoff.getDate() - RECENT_ORDERS_WINDOW_DAYS);
      const recentWindowCutoffIso = recentWindowCutoff.toISOString().split('T')[0];

      const { data: ordersData, error: ordersErr } = await fetchAllRows(() =>
        supabase
          .from('orders')
          .select('*')
          .gte('order_date', recentWindowCutoffIso)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
      );

      if (ordersErr) {
        console.warn('Could not fetch orders:', ordersErr.message);
      }

      const oList = (ordersData || []).map((row) => transformOrderFromDb(row, pMap));
      setAllOrders(oList);

      const oMap = new Map<string, Order>();
      oList.forEach((o) => oMap.set(o.id, o));

      // 4. Fetch Problems
      const { data: problemsData } = await fetchAllRows(() =>
        supabase
          .from('problems')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
      );
      if (problemsData) {
        setProblems(problemsData.map((row) => transformProblemFromDb(row, pMap, oMap)));
      }

      // 5. Fetch Customer Calls
      const { data: callsData } = await supabase
        .from('customer_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (callsData) {
        setCustomerCalls(callsData.map((row) => transformCallFromDb(row, pMap, oMap)));
      }

      // 6. Fetch Imported Files
      const { data: filesData } = await supabase
        .from('imported_files')
        .select('*')
        .order('created_at', { ascending: false });
      if (filesData) {
        setImportedFiles(
          filesData.map((f: any) => ({
            id: f.id,
            fileName: f.file_name,
            importedByUserId: f.uploaded_by || '',
            importedByUserName: (f.uploaded_by && pMap.get(f.uploaded_by)) || 'مستخدم',
            totalRecords: f.total_records || 0,
            validRecords: f.valid_orders || 0,
            voidRecords: f.void_orders || 0,
            reorderRecords: 0,
            importedAt: f.created_at || new Date().toISOString(),
          }))
        );
      }

      // 7. Fetch Audit Logs
      const { data: auditData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (auditData) {
        setAuditLogs(
          auditData.map((a: any) => ({
            id: a.id,
            userId: a.user_id || '',
            userName: (a.user_id && pMap.get(a.user_id)) || 'النظام',
            action: a.action || 'عملية',
            entity: a.entity_type || 'نظام',
            entityId: a.entity_id || undefined,
            details:
              typeof a.details === 'string'
                ? a.details
                : JSON.stringify(a.details || {}),
            createdAt: a.created_at || new Date().toISOString(),
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching Supabase data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // ---------------------------------------------------------------------
  // Authentication
  // Single source of truth: the session. Data is fetched ONLY after a valid
  // session + active profile exist (fetching before login caused 403s under RLS).
  // ---------------------------------------------------------------------
  const clearSessionData = useCallback(() => {
    setCurrentUser(null);
    currentUserRef.current = null;
    setUsers([]);
    setAllOrders([]);
    setProblems([]);
    setCustomerCalls([]);
    setCallClicks([]);
    setImportedFiles([]);
    setAuditLogs([]);
    setBranches([]);
    setActiveTab('dashboard');
    setSelectedOrderId(null);
    setActiveCallModalOrderId(null);
  }, []);

  // Returns the app user for an auth user, or a reason why access is denied
  const resolveUser = useCallback(
    async (authUser: any): Promise<{ user?: User; blocked?: string }> => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) console.warn('Could not read profile:', error.message);

      if (profile) {
        if (profile.is_active === false) {
          return { blocked: 'هذا الحساب معطل حالياً من قبل الإدارة. يرجى مراجعة المسؤول.' };
        }
        return {
          user: {
            id: profile.id,
            name: profile.name || authUser.email?.split('@')[0] || 'مستخدم',
            email: profile.email || authUser.email || '',
            role: (profile.role as User['role']) || 'customer_service',
            isActive: true,
            createdAt: profile.created_at || new Date().toISOString(),
            assignedBranches: profile.assigned_branches || [],
          },
        };
      }

      // No profile row (or it could not be read): do NOT let the user in.
      // An auth account alone (anyone can self-register with the public anon key) is not an employee.
      return {
        blocked: error
          ? 'تعذر التحقق من الحساب حالياً. تأكد من الاتصال وحاول مرة أخرى.'
          : 'هذا الحساب غير مفعّل في المنظومة. يرجى مراجعة المدير العام.',
      };
    },
    []
  );

  const applySession = useCallback(
    async (session: any): Promise<{ ok: boolean; error?: string }> => {
      if (!session?.user) {
        if (currentUserRef.current) clearSessionData();
        return { ok: false };
      }
      if (currentUserRef.current?.id === session.user.id) return { ok: true };

      const res = await resolveUser(session.user);
      if (res.blocked || !res.user) {
        await supabase.auth.signOut();
        clearSessionData();
        setAuthNotice(res.blocked || 'تعذر التحقق من الحساب.');
        return { ok: false, error: res.blocked };
      }

      setAuthNotice(null);
      currentUserRef.current = res.user;
      setCurrentUser(res.user);
      await fetchData();
      return { ok: true };
    },
    [resolveUser, clearSessionData, fetchData]
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoadingData(false);
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Never await supabase calls inside this callback (it can deadlock the auth client):
      // defer the work to the next tick.
      setTimeout(async () => {
        if (cancelled) return;
        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true);
        }
        if (event === 'SIGNED_OUT') {
          clearSessionData();
        } else if (
          (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
          !suppressListenerRef.current
        ) {
          await applySession(session);
        }
        if (!cancelled) setAuthReady(true);
      }, 0);
    });

    // Safety net: never leave the app stuck on the loading screen
    const safety = setTimeout(() => {
      if (!cancelled) setAuthReady(true);
    }, 6000);

    return () => {
      cancelled = true;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, [applySession, clearSessionData]);

  // Set up Supabase Realtime Channel for live multi-user sync
  useEffect(() => {
    if (!isSupabaseConfigured() || !currentUser?.id) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrder = transformOrderFromDb(payload.new, profilesMap);
            setAllOrders((prev) => {
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = transformOrderFromDb(payload.new, profilesMap);
            setAllOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? updated : o))
            );
          } else if (payload.eventType === 'DELETE') {
            setAllOrders((prev) => prev.filter((o) => o.id !== (payload.old as any).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'problems' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newProblem = transformProblemFromDb(payload.new, profilesMap, ordersMap);
            setProblems((prev) => {
              if (prev.some((p) => p.id === newProblem.id)) return prev;
              return [newProblem, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = transformProblemFromDb(payload.new, profilesMap, ordersMap);
            setProblems((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setProblems((prev) => prev.filter((p) => p.id !== (payload.old as any).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_calls' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newCall = transformCallFromDb(payload.new, profilesMap, ordersMap);
            setCustomerCalls((prev) => (prev.some((c) => c.id === newCall.id) ? prev : [newCall, ...prev]));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const p = payload.new as any;
            // My own account changed: deactivated -> kick out, role changed -> apply immediately
            if (currentUserRef.current && p.id === currentUserRef.current.id) {
              if (p.is_active === false) {
                setAuthNotice('تم تعطيل حسابك من قبل الإدارة.');
                supabase.auth.signOut();
                clearSessionData();
                return;
              }
              const nextRole = (p.role as User['role']) || currentUserRef.current.role;
              const nextName = p.name || currentUserRef.current.name;
              if (nextRole !== currentUserRef.current.role || nextName !== currentUserRef.current.name) {
                setCurrentUser((prev) => (prev ? { ...prev, role: nextRole, name: nextName } : prev));
              }
            }
            setUsers((prev) =>
              prev.map((u) =>
                u.id === p.id
                  ? {
                      ...u,
                      name: p.name || u.name,
                      role: p.role || u.role,
                      isActive: p.is_active !== false,
                    }
                  : u
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profilesMap, ordersMap, currentUser?.id, clearSessionData]);

  // Clean expired locks locally and in database
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      const timeoutMs = (settings.agentLockTimeoutMinutes || 5) * 60 * 1000;

      const expiredOrders = allOrders.filter((order) => {
        if (!order.lockedAt) return false;
        const lockedTime = new Date(order.lockedAt).getTime();
        return now - lockedTime > timeoutMs;
      });

      if (expiredOrders.length > 0) {
        setAllOrders((prev) =>
          prev.map((order) => {
            if (order.lockedAt) {
              const lockedTime = new Date(order.lockedAt).getTime();
              if (now - lockedTime > timeoutMs) {
                return {
                  ...order,
                  lockedByUserId: undefined,
                  lockedByUserName: undefined,
                  lockedAt: undefined,
                };
              }
            }
            return order;
          })
        );

        // Update database in background
        const expiredIds = expiredOrders.map((o) => o.id);
        await supabase
          .from('orders')
          .update({ locked_by: null, locked_at: null })
          .in('id', expiredIds);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [settings.agentLockTimeoutMinutes, allOrders]);

  const addAuditLog = async (
    action: string,
    entity: string,
    details: string,
    entityId?: string
  ) => {
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'النظام',
      action,
      entity,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs((prev) => [log, ...prev]);

    if (currentUser?.id) {
      try {
        await supabase.from('audit_logs').insert({
          user_id: currentUser.id,
          action,
          entity_type: entity,
          entity_id: entityId || null,
          details: { note: details },
        });
      } catch (e) {
        // quiet fallback
      }
    }
  };

  // Auth Operations
  const login = async (
    email: string,
    password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'لم يتم ضبط الاتصال بقاعدة البيانات (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' };
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return { success: false, error: 'يرجى إدخال البريد الإلكتروني' };
    if (!password) return { success: false, error: 'يرجى إدخال كلمة المرور' };

    suppressListenerRef.current = true;
    try {
      setAuthNotice(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        const msg = error.message || '';
        return {
          success: false,
          error: /invalid login credentials/i.test(msg)
            ? 'بيانات تسجيل الدخول غير صحيحة. يرجى التحقق من البريد وكلمة المرور.'
            : /email not confirmed/i.test(msg)
            ? 'البريد الإلكتروني لم يتم تأكيده بعد. اطلب من المدير تفعيل الحساب.'
            : /rate limit|too many/i.test(msg)
            ? 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.'
            : msg,
        };
      }

      const result = await applySession(data.session);
      if (!result.ok) {
        return { success: false, error: result.error || 'تعذر تسجيل الدخول.' };
      }

      // Audit directly with the fresh user (currentUser state is not updated yet in this closure)
      const u = currentUserRef.current;
      if (u) {
        setAuditLogs((prev) => [
          {
            id: `log-${Date.now()}`,
            userId: u.id,
            userName: u.name,
            action: 'تسجيل دخول',
            entity: 'مستخدم',
            details: `تسجيل دخول ناجح: ${trimmedEmail}`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        supabase
          .from('audit_logs')
          .insert({
            user_id: u.id,
            action: 'تسجيل دخول',
            entity_type: 'مستخدم',
            entity_id: null,
            details: { note: `تسجيل دخول ناجح: ${trimmedEmail}` },
          })
          .then(() => undefined, () => undefined);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'حدث خطأ أثناء تسجيل الدخول' };
    } finally {
      suppressListenerRef.current = false;
    }
  };

  const logout = async () => {
    if (currentUser) {
      await addAuditLog('تسجيل خروج', 'مستخدم', `تسجيل خروج المستخدم ${currentUser.name}`, currentUser.id);
    }
    await supabase.auth.signOut();
    clearSessionData();
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { success: false, error: 'اكتب بريدك الإلكتروني أولاً' };
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: window.location.origin,
    });
    if (error) {
      return {
        success: false,
        error: /rate limit|too many/i.test(error.message)
          ? 'تم إرسال طلبات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.'
          : error.message,
      };
    }
    return { success: true };
  };

  const updateOwnPassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (newPassword.length < 8) return { success: false, error: 'كلمة المرور لازم تكون 8 حروف أو أكتر' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const finishRecovery = () => setRecoveryMode(false);

  const addUser = async (
    name: string,
    email: string,
    role: User['role'],
    password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (currentUser?.role !== 'admin') {
        return { success: false, error: 'إضافة المستخدمين متاحة للمدير العام فقط' };
      }
      const trimmedEmail = email.trim().toLowerCase();
      if (!password || password.trim().length < 8) {
        return { success: false, error: 'كلمة المرور لازم تكون 8 حروف أو أكتر' };
      }

      // Create the account with an isolated client so the admin stays logged in
      const provisioner = createIsolatedClient();
      const { data, error } = await provisioner.auth.signUp({
        email: trimmedEmail,
        password: password.trim(),
        options: { data: { name: name.trim() } },
      });

      if (error) {
        return {
          success: false,
          error: /already registered|already been registered/i.test(error.message)
            ? 'هذا البريد مسجل بالفعل'
            : error.message,
        };
      }
      // Supabase returns a user with no identities when the email already exists
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { success: false, error: 'هذا البريد مسجل بالفعل' };
      }

      let confirmFailed = false;
      if (data.user) {
        // Supabase requires email confirmation by default -> the new employee could not log in
        // ("Email not confirmed"). The admin is creating the account, so confirm it right away.
        const { error: confirmErr } = await supabase.rpc('admin_confirm_user', { target_user_id: data.user.id });
        if (confirmErr) {
          console.warn('admin_confirm_user failed:', confirmErr.message);
          confirmFailed = true;
        }

        const { error: upsertErr } = await supabase.from('profiles').upsert({
          id: data.user.id,
          name: name.trim(),
          email: trimmedEmail,
          role,
          is_active: true,
        });
        if (upsertErr) {
          return {
            success: false,
            error: `تم إنشاء الحساب لكن تعذر ضبط الصلاحية: ${upsertErr.message}. شغّل ملف db/auth_hardening.sql.`,
          };
        }
      }

      await fetchData();
      addAuditLog('إضافة مستخدم جديد', 'مستخدم', `تمت إضافة المستخدم ${name} بدور ${role}`);
      if (confirmFailed) {
        return {
          success: false,
          error: 'تم إنشاء الحساب لكنه لسه مش مفعّل للدخول. شغّل ملف db/auth_fix.sql مرة واحدة في Supabase ثم أعد المحاولة أو فعّل الحساب من Authentication.',
        };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر إضافة المستخدم' };
    }
  };

  const updateUserRole = async (userId: string, role: User['role']) => {
    // Only admins manage roles, and nobody can change their own role (prevents lock-out)
    if (currentUser?.role !== 'admin' || currentUser.id === userId) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    );
    if (currentUser?.id === userId) {
      setCurrentUser((prev) => (prev ? { ...prev, role } : null));
    }

    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) {
      console.warn('Could not update role:', error.message);
      await fetchData();
      return;
    }
    addAuditLog('تحديث صلاحية', 'مستخدم', `تم تغيير دور المستخدم (${userId}) إلى ${role}`, userId);
  };

  const toggleUserActive = async (userId: string) => {
    // Only admins can (de)activate accounts, never their own
    if (currentUser?.role !== 'admin' || currentUser.id === userId) return;
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const newActive = !target.isActive;

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isActive: newActive } : u))
    );

    const { error } = await supabase.from('profiles').update({ is_active: newActive }).eq('id', userId);
    if (error) {
      console.warn('Could not toggle user active:', error.message);
      await fetchData();
      return;
    }
    addAuditLog('تغيير حالة مستخدم', 'مستخدم', `تم ${newActive ? 'تفعيل' : 'تعطيل'} حساب المستخدم (${target.name})`, userId);
  };

  const updateAgentBranches = async (userId: string, branchNames: string[]) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, assignedBranches: branchNames } : u)));
    const { error } = await supabase.from('profiles').update({ assigned_branches: branchNames }).eq('id', userId);
    if (error) {
      console.warn('Could not update assigned branches:', error.message);
      await fetchData();
    }
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    addAuditLog('تحديث الإعدادات', 'النظام', 'تم تحديث إعدادات النظام');
  };

  // Operational Anomaly Detection Algorithm
  const branchAnomalies = useMemo(() => {
    return detectBranchAnomalies(allOrders, problems);
  }, [allOrders, problems]);

  // Dynamically enrich all orders with priority score & reasons
  const enrichedOrders = useMemo(() => {
    return allOrders.map((order) => {
      if (order.isVoid) return order;
      const prio = calculateOrderPriority(order, allOrders, problems, branchAnomalies);
      return {
        ...order,
        priorityScore: prio.score,
        priorityLevel: prio.level,
        priorityReasons: prio.reasons,
      };
    });
  }, [allOrders, problems, branchAnomalies]);

  // Role-filtered orders: Customer Service ONLY sees orders assigned to them
  const orders = useMemo(() => {
    if (!currentUser) return [];
    let list: Order[] = [];
    if (currentUser.role === 'admin' || currentUser.role === 'manager') {
      list = enrichedOrders.filter((o) => !o.isVoid);
    } else {
      list = enrichedOrders.filter((o) => !o.isVoid && o.assignedToUserId === currentUser.id);
    }

    return list.sort((a, b) => {
      const isPendingA =
        a.status === 'pending' ||
        a.status === 'callback_requested' ||
        a.status === 'no_answer';
      const isPendingB =
        b.status === 'pending' ||
        b.status === 'callback_requested' ||
        b.status === 'no_answer';
      if (isPendingA && !isPendingB) return -1;
      if (!isPendingA && isPendingB) return 1;
      return (b.priorityScore || 0) - (a.priorityScore || 0);
    });
  }, [enrichedOrders, currentUser]);

  const voidOrders = useMemo(() => {
    return allOrders.filter((o) => o.isVoid);
  }, [allOrders]);

  // Click-to-call with instant locking & real-time conflict prevention
  const triggerClickToCall = async (
    orderId: string,
    phone: string
  ): Promise<{ success: boolean; conflictMessage?: string }> => {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return { success: false, conflictMessage: 'الطلب غير موجود' };

    const now = Date.now();
    const timeoutMs = (settings.agentLockTimeoutMinutes || 5) * 60 * 1000;

    if (
      order.lockedByUserId &&
      order.lockedByUserId !== currentUser?.id &&
      order.lockedAt &&
      now - new Date(order.lockedAt).getTime() < timeoutMs
    ) {
      const conflictMsg = `العميل قيد التواصل حالياً بواسطة الزميل (${order.lockedByUserName || 'زميل آخر'})`;
      return { success: false, conflictMessage: conflictMsg };
    }

    const nowIso = new Date().toISOString();
    const protocol = settings.callProtocol || 'tel';

    // Actually trigger the phone call: navigate the browser to the tel:/sip:
    // URI so the OS/softphone (MicroSIP on desktop, native dialer on mobile)
    // picks it up. This must fire synchronously with the user click so
    // browser popup/navigation blockers don't swallow it - do it before any
    // awaited state or network work below.
    if (typeof window !== 'undefined') {
      dialNumber(protocol, phone, settings.sipServerUrl);
    }

    // Optimistic local update
    setAllOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              lockedByUserId: currentUser?.id,
              lockedByUserName: currentUser?.name,
              lockedAt: nowIso,
              status: o.status === 'pending' ? 'in_progress' : o.status,
            }
          : o
      )
    );

    // Save click log
    const newClick: CallClick = {
      id: `clk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderId: order.id,
      customerPhone: phone,
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'مستخدم',
      protocol,
      clickedAt: nowIso,
    };
    setCallClicks((prev) => [newClick, ...prev]);

    // Update Supabase DB
    try {
      await supabase
        .from('orders')
        .update({
          locked_by: currentUser?.id || null,
          locked_at: nowIso,
          status: mapOrderStatusToDb(order.status === 'pending' ? 'in_progress' : order.status),
        })
        .eq('id', orderId);
    } catch (e) {
      console.warn('Could not update order lock in DB:', e);
    }

    addAuditLog(
      'نقرة اتصال',
      'مكالمة',
      `قام ${currentUser?.name} بالنقر للاتصال بالعميل (${order.customerName} - ${phone}) عبر بروتوكول ${protocol}`,
      order.id
    );

    return { success: true };
  };

  const unlockOrder = async (orderId: string) => {
    setAllOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              lockedByUserId: undefined,
              lockedByUserName: undefined,
              lockedAt: undefined,
            }
          : o
      )
    );

    try {
      await supabase
        .from('orders')
        .update({ locked_by: null, locked_at: null })
        .eq('id', orderId);
    } catch (e) {
      console.warn('Unlock DB update failed:', e);
    }
  };

  // Submit Call Result & Automatic Next Customer Flow
  const submitCallResult = async (
    orderId: string,
    data: {
      result: CallResult;
      notes?: string;
      problemSource?: ProblemSource;
      problemType?: string;
      problemDetails?: string;
      problemResolutionMode?: 'resolved_on_call' | 'escalated';
      additionalProblem?: { source: ProblemSource; type: string };
      problemItems?: { source: ProblemSource; type: string }[];
      resolutionDetails?: string;
      oldOrderNumber?: string;
      newOrderNumber?: string;
      callDurationSeconds?: number;
      customerRating?: number;
      compensationType?: CompensationType;
      compensationDetails?: string;
      compensationStatus?: CompensationStatus;
    }
  ): Promise<string | null> => {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return null;

    let newStatus: OrderStatus = 'pending';
    if (data.result === 'tamam') newStatus = 'contacted_tamam';
    else if (data.result === 'problem') newStatus = 'contacted_problem';
    else if (data.result === 'no_answer') newStatus = 'no_answer';
    else if (data.result === 'unavailable') newStatus = 'unavailable';
    else if (data.result === 'callback_requested') newStatus = 'callback_requested';

    const nowIso = new Date().toISOString();

    // 1. Insert into customer_calls
    const callRecord: CustomerCall = {
      id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'مستخدم',
      callResult: data.result,
      notes: data.notes,
      problemSource: data.problemSource,
      problemType: data.problemType,
      problemDetails: data.problemDetails,
      problemResolution:
        data.problemResolutionMode === 'resolved_on_call'
          ? 'resolved_on_call'
          : data.result === 'problem'
          ? 'escalated_to_management'
          : undefined,
      callDurationSeconds: data.callDurationSeconds || 0,
      hasCompensation: Boolean(data.compensationType),
      compensationType: data.compensationType,
      compensationDetails: data.compensationDetails,
      compensationStatus:
        data.compensationStatus || (data.compensationType ? 'pending_compensation' : undefined),
      createdAt: nowIso,
    };

    let savedCallId = callRecord.id;
    let callSaved = false;

    try {
      const { data: insertedCall, error: callErr } = await supabase.from('customer_calls').insert({
        order_id: order.id,
        agent_id: currentUser?.id || null,
        result: mapCallResultToDb(data.result),
        notes: data.notes || null,
        called_via: 'tel',
        duration_seconds: data.callDurationSeconds || 0,
        call_started_at: nowIso,
        call_ended_at: nowIso,
      }).select('id').single();
      if (callErr) console.error('Could not insert customer_call in DB:', callErr);
      else if (insertedCall?.id) {
        savedCallId = insertedCall.id;
        callSaved = true;
      }
    } catch (e) {
      console.warn('Could not insert customer_call in DB:', e);
    }
    if (callSaved || !isSupabaseConfigured()) {
      setCustomerCalls((prev) =>
        prev.some((c) => c.id === savedCallId) ? prev : [{ ...callRecord, id: savedCallId }, ...prev]
      );
    }

    // 2. If problem, record in problems table
    // One ticket per selected problem (multi-select). Falls back to the old single/dual shape.
    const problemItems: { source: ProblemSource; type: string }[] =
      data.result !== 'problem'
        ? []
        : data.problemItems && data.problemItems.length > 0
        ? data.problemItems
        : data.problemSource && data.problemType
        ? [{ source: data.problemSource, type: data.problemType }, ...(data.additionalProblem ? [data.additionalProblem] : [])]
        : [];
    for (const item of problemItems) {
      // Compensation is attached to the first problem only, so a two-sided problem is not double-counted
      const isFirst = item === problemItems[0];
      const isResolvedOnCall = data.problemResolutionMode === 'resolved_on_call';
      const hasComp = Boolean((isFirst ? data : ({} as typeof data)).compensationType);
      const compStatus: CompensationStatus | undefined =
        (isFirst ? data : ({} as typeof data)).compensationStatus || (hasComp ? 'pending_compensation' : undefined);

      const resolutionText: string | undefined = isResolvedOnCall
        ? data.resolutionDetails ||
          (hasComp ? `تم الحل فورياً ووعد بتعويض: ${data.compensationDetails || ''}` : 'تم حل المشكلة وإرضاء العميل فورياً أثناء المكالمة')
        : undefined;

      const problemRecord: Problem = {
        id: `prob-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        callId: savedCallId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        branchName: order.branchName,
        source: item.source,
        type: item.type,
        details: data.problemDetails || 'بدون تفاصيل إضافية',
        status: isResolvedOnCall
          ? hasComp
            ? 'pending_compensation'
            : 'resolved_on_call'
          : 'escalated',
        isEscalated: !isResolvedOnCall,
        resolutionType: isResolvedOnCall ? 'resolved_on_call' : 'escalated_to_management',
        reportedByUserId: currentUser?.id || 'sys',
        reportedByUserName: currentUser?.name || 'مستخدم',
        resolvedByUserId: isResolvedOnCall ? currentUser?.id : undefined,
        resolvedByUserName: isResolvedOnCall ? currentUser?.name : undefined,
        resolutionNotes: resolutionText,
        resolvedAt: isResolvedOnCall && !hasComp ? nowIso : undefined,
        createdAt: nowIso,
        oldOrderNumber: data.oldOrderNumber,
        newOrderNumber: data.newOrderNumber,

        hasCompensation: hasComp,
        compensationType: (isFirst ? data : ({} as typeof data)).compensationType,
        compensationDetails: (isFirst ? data : ({} as typeof data)).compensationDetails,
        compensationStatus: compStatus,
        compensationPromisedAt: hasComp ? nowIso : undefined,
        compensationPromisedByUserId: hasComp ? currentUser?.id : undefined,
        compensationPromisedByUserName: hasComp ? currentUser?.name : undefined,
      };

      let savedProblemId = problemRecord.id;
      let problemSaved = false;

      try {
        const problemRow: Record<string, unknown> = {
          order_id: order.id,
          manager_response: resolutionText || null,
          agent_id: currentUser?.id || null,
          source: item.source,
          problem_type: item.type,
          custom_details: data.problemDetails || null,
          notes: data.notes || null,
          status: mapProblemStatusToDb(
            isResolvedOnCall
              ? hasComp
                ? 'pending_compensation'
                : 'resolved_on_call'
              : 'escalated',
            !isResolvedOnCall
          ),
          is_escalated: !isResolvedOnCall,
          escalated_at: !isResolvedOnCall ? nowIso : null,
          resolved_by: isResolvedOnCall ? currentUser?.id || null : null,
          resolved_at: isResolvedOnCall && !hasComp ? nowIso : null,
          has_compensation: hasComp,
          compensation_type: mapCompensationTypeToDb((isFirst ? data : ({} as typeof data)).compensationType),
          compensation_details: (isFirst ? data : ({} as typeof data)).compensationDetails || null,
          compensation_status: mapCompensationStatusToDb(compStatus),
        };
        let { data: insRow, error: insErr } = await supabase.from('problems').insert({
          ...problemRow,
          old_order_number: data.oldOrderNumber || null,
          new_order_number: data.newOrderNumber || null,
        }).select('id').single();
        if (insErr && /old_order_number|new_order_number/.test(insErr.message)) {
          // New columns not created yet - keep the problem itself, tell the user to run the SQL file
          ({ data: insRow, error: insErr } = await supabase.from('problems').insert(problemRow).select('id').single());
          if (typeof window !== 'undefined') window.alert('تم حفظ المشكلة، لكن أرقام الأوردر القديم/الجديد لم تُحفظ. شغّل ملف db/customer_tracking.sql في Supabase.');
        }
        if (insErr) {
          console.error('Could not insert problem in DB:', insErr);
          if (typeof window !== 'undefined') window.alert(`تعذر حفظ المشكلة في قاعدة البيانات: ${insErr.message}`);
        } else if (insRow?.id) {
          savedProblemId = insRow.id;
          problemSaved = true;
        }
      } catch (e) {
        console.warn('Could not insert problem in DB:', e);
      }

      // Add locally only with the REAL database id, so the realtime INSERT event is recognised as the same row
      if (problemSaved || !isSupabaseConfigured()) {
        setProblems((prev) =>
          prev.some((p) => p.id === savedProblemId) ? prev : [{ ...problemRecord, id: savedProblemId }, ...prev]
        );
      }
    }

    // 3. Update order in Supabase and release lock
    setAllOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: newStatus,
              customerRating: data.customerRating || o.customerRating,
              lockedByUserId: undefined,
              lockedByUserName: undefined,
              lockedAt: undefined,
            }
          : o
      )
    );

    try {
      await supabase
        .from('orders')
        .update({
          status: mapOrderStatusToDb(newStatus),
          locked_by: null,
          locked_at: null,
        })
        .eq('id', orderId);
    } catch (e) {
      console.warn('Order status update in DB failed:', e);
    }

    addAuditLog(
      'تسجيل نتيجة مكالمة',
      'مكالمة',
      `تم تسجيل نتيجة (${data.result}) للأوردر #${order.orderNumber} للعميل ${order.customerName}`,
      order.id
    );

    // Find next available order for this agent
    const nextOrder = orders.find(
      (o) =>
        o.id !== orderId &&
        (o.status === 'pending' ||
          o.status === 'callback_requested' ||
          o.status === 'no_answer')
    );

    return nextOrder ? nextOrder.id : null;
  };

  // Assignment logic
  const assignOrdersToUser = async (orderIds: string[], targetUserId: string) => {
    const targetUser = users.find((u) => u.id === targetUserId);
    if (!targetUser) return;

    const nowIso = new Date().toISOString();

    setAllOrders((prev) =>
      prev.map((o) =>
        orderIds.includes(o.id)
          ? {
              ...o,
              assignedToUserId: targetUser.id,
              assignedToUserName: targetUser.name,
              assignedAt: nowIso,
            }
          : o
      )
    );

    try {
      await supabase
        .from('orders')
        .update({
          assigned_to: targetUser.id,
          assigned_at: nowIso,
        })
        .in('id', orderIds);
    } catch (e) {
      console.warn('Assignment DB update failed:', e);
    }

    addAuditLog(
      'توزيع عملاء',
      'طلبات',
      `تم تخصيص عدد (${orderIds.length}) عميل للموظف (${targetUser.name})`
    );
  };

  const autoDistributeOrders = async (targetOrderIds?: string[]) => {
    const activeAgents = users.filter((u) => u.role === 'customer_service' && u.isActive);
    if (activeAgents.length === 0) return;

    const ordersToDistribute = enrichedOrders.filter(
      (o) =>
        !o.isVoid &&
        (targetOrderIds ? targetOrderIds.includes(o.id) : !o.assignedToUserId)
    );

    if (ordersToDistribute.length === 0) return;

    const assignmentMap = smartBalancedAssignment(ordersToDistribute, activeAgents, allOrders);
    const nowIso = new Date().toISOString();

    setAllOrders((prev) =>
      prev.map((o) => {
        const assigned = assignmentMap.get(o.id);
        if (assigned) {
          return {
            ...o,
            assignedToUserId: assigned.userId,
            assignedToUserName: assigned.userName,
            assignedAt: nowIso,
          };
        }
        return o;
      })
    );

    // Persist per agent in DB
    for (const agent of activeAgents) {
      const assignedIds = ordersToDistribute
        .filter((o) => assignmentMap.get(o.id)?.userId === agent.id)
        .map((o) => o.id);

      if (assignedIds.length > 0) {
        try {
          await supabase
            .from('orders')
            .update({
              assigned_to: agent.id,
              assigned_at: nowIso,
            })
            .in('id', assignedIds);
        } catch (e) {
          console.warn('Auto-distribution DB sync error:', e);
        }
      }
    }

    addAuditLog(
      'توزيع ذكي متوازن للأحمال',
      'طلبات',
      `تم توزيع (${ordersToDistribute.length}) عميل باستخدام خوارزمية التوزيع العادل على (${activeAgents.length}) موظف`
    );
  };

  // Problems lifecycle
  const updateProblemStatus = async (
    problemId: string,
    newStatus: ProblemStatus,
    resolutionNotes?: string,
    compensation?: { type: CompensationType; details: string }
  ): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const previous = problems.find((p) => p.id === problemId);
    // "Resolved + compensated" with a compensation still to be handed over stays pending
    // until the customer actually receives it (confirmCompensationExecuted closes the loop).
    const compPending = Boolean(compensation) && newStatus === 'resolved';
    const effectiveStatus: ProblemStatus = compPending ? 'pending_compensation' : newStatus;
    const isFinal = !compPending && (newStatus === 'resolved' || newStatus === 'closed');

    setProblems((prev) =>
      prev.map((p) =>
        p.id === problemId
          ? {
              ...p,
              status: effectiveStatus,
              resolvedByUserId: isFinal ? currentUser?.id : p.resolvedByUserId,
              resolvedByUserName: isFinal ? currentUser?.name : p.resolvedByUserName,
              resolutionNotes: resolutionNotes || p.resolutionNotes,
              resolvedAt: isFinal ? nowIso : p.resolvedAt,
              ...(compPending && compensation
                ? {
                    hasCompensation: true,
                    compensationType: compensation.type,
                    compensationDetails: compensation.details,
                    compensationStatus: 'pending_compensation' as CompensationStatus,
                    compensationPromisedAt: nowIso,
                    compensationPromisedByUserId: currentUser?.id,
                    compensationPromisedByUserName: currentUser?.name,
                  }
                : {}),
            }
          : p
      )
    );

    const payload: Record<string, unknown> = {
      status: mapProblemStatusToDb(effectiveStatus),
      resolved_by: isFinal ? currentUser?.id || null : null,
      resolved_at: isFinal ? nowIso : null,
    };
    // Only overwrite the stored resolution text when a new one was actually given
    if (resolutionNotes) payload.manager_response = resolutionNotes;
    if (compPending && compensation) {
      payload.has_compensation = true;
      payload.compensation_type = mapCompensationTypeToDb(compensation.type);
      payload.compensation_details = compensation.details;
      payload.compensation_status = mapCompensationStatusToDb('pending_compensation');
    }

    // supabase-js does NOT throw on failure - it returns { error }. Check it explicitly.
    const { error } = await supabase.from('problems').update(payload).eq('id', problemId);

    if (error) {
      console.error('Update problem status in DB failed:', error);
      if (previous) setProblems((prev) => prev.map((p) => (p.id === problemId ? previous : p)));
      if (typeof window !== 'undefined') window.alert(`تعذر حفظ التغيير في قاعدة البيانات: ${error.message}`);
      return false;
    }

    addAuditLog(
      'تحديث حالة مشكلة',
      'مشاكل',
      `تم تغيير حالة المشكلة (${problemId}) إلى (${effectiveStatus})${compensation ? ` مع تعويض: ${compensation.details}` : ''}`,
      problemId
    );
    return true;
  };

  const confirmCompensationExecuted = async (
    problemId: string,
    appliedOrderNumber?: string,
    notes?: string
  ) => {
    let affectedProblem: Problem | undefined;
    const nowIso = new Date().toISOString();

    setProblems((prev) =>
      prev.map((p) => {
        if (p.id === problemId) {
          affectedProblem = p;
          const updatedNotes = notes
            ? p.resolutionNotes
              ? `${p.resolutionNotes} | تم استلام التعويض: ${notes}`
              : `تم استلام التعويض: ${notes}`
            : p.resolutionNotes;

          return {
            ...p,
            status: 'compensated',
            compensationStatus: 'compensated',
            compensationExecutedAt: nowIso,
            compensationExecutedByUserId: currentUser?.id || 'sys',
            compensationExecutedByUserName: currentUser?.name || 'مستخدم',
            compensationAppliedOrderNumber: appliedOrderNumber?.trim() || undefined,
            compensationExecutionNotes: notes?.trim() || undefined,
            resolvedAt: nowIso,
            resolvedByUserId: currentUser?.id || 'sys',
            resolvedByUserName: currentUser?.name || 'مستخدم',
            resolutionNotes: updatedNotes,
          };
        }
        return p;
      })
    );

    try {
      await supabase
        .from('problems')
        .update({
          status: 'resolved',
          compensation_status: 'applied',
          compensation_applied_order_id: appliedOrderNumber?.trim() || null,
          compensation_applied_at: nowIso,
          compensation_notes: notes?.trim() || null,
          resolved_by: currentUser?.id || null,
          resolved_at: nowIso,
        })
        .eq('id', problemId);
    } catch (e) {
      console.warn('Confirm compensation in DB failed:', e);
    }

    if (affectedProblem) {
      addAuditLog(
        'تأكيد استلام التعويض',
        'تعويضات',
        `تم تأكيد استلام العميل (${affectedProblem.customerName}) للتعويض (${affectedProblem.compensationDetails || ''})${
          appliedOrderNumber ? ` على الأوردر الجديد #${appliedOrderNumber}` : ''
        } بواسطة ${currentUser?.name || 'المستخدم'}`,
        problemId
      );
    }
  };

  const updateVoidDetails = async (
    orderId: string,
    reason: string,
    responsible: 'restaurant' | 'call_center' | 'courier' | 'customer',
    followUpStatus?: import('../types').VoidFollowUpStatus,
    notes?: string
  ) => {
    setAllOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              voidReason: reason,
              voidResponsible: responsible,
              voidFollowUpStatus: followUpStatus || o.voidFollowUpStatus || 'resolved',
              voidNotes: notes !== undefined ? notes : o.voidNotes,
              voidFollowedUpAt: new Date().toISOString(),
              voidFollowedUpByUserName: currentUser?.name || 'خدمة العملاء',
            }
          : o
      )
    );

    try {
      // Persist the whole follow-up (status / responsible / notes) so it survives a refresh.
      const { error } = await supabase
        .from('orders')
        .update({
          void_reason: reason,
          void_responsible: responsible,
          void_follow_up_status: followUpStatus || 'resolved',
          void_notes: notes ?? null,
          void_followed_up_at: new Date().toISOString(),
          void_followed_up_by: currentUser?.id || null,
        })
        .eq('id', orderId);
      if (error) {
        // DB migration (db/month_closing.sql) not applied yet -> keep the old behaviour so nothing breaks.
        console.warn('Void follow-up columns missing, saving reason only:', error.message);
        await supabase.from('orders').update({ void_reason: reason }).eq('id', orderId);
      }
    } catch (e) {
      console.warn('Update void details in DB failed:', e);
    }

    addAuditLog(
      'متابعة أوردر ملغي',
      'أوردرات ملغية',
      `تم توثيق متابعة الأوردر (${orderId}): سبب الإلغاء (${reason})`,
      orderId
    );
  };

  // Import parsed orders directly to Supabase tables
  const commitImportedOrders = async (
    drafts: ParsedOrderDraft[],
    fileName: string
  ): Promise<{ importedCount: number; duplicateCount: number; error?: string }> => {
    // Order numbers restart every working day and per branch, so a duplicate is
    // the same branch + working date + number - not just the same number.
    const existingOrderKeys = new Set(allOrders.map((o) => orderIdentityKey(o)));
    let duplicateCount = 0;

    const validDrafts = drafts.filter((draft) => {
      if (existingOrderKeys.has(orderIdentityKey(draft))) {
        duplicateCount++;
        return false;
      }
      return true;
    });

    if (validDrafts.length === 0) {
      return { importedCount: 0, duplicateCount };
    }

    const nowIso = new Date().toISOString();
    let fileId: string | null = null;

    // 1. Insert into imported_files
    try {
      const { data: fileData } = await supabase
        .from('imported_files')
        .insert({
          file_name: fileName,
          total_records: drafts.length,
          valid_orders: validDrafts.filter((d) => !d.isVoid).length,
          void_orders: validDrafts.filter((d) => d.isVoid).length,
          uploaded_by: currentUser?.id || null,
        })
        .select()
        .single();

      if (fileData) {
        fileId = fileData.id;
      }
    } catch (e) {
      console.warn('Could not insert imported_file record:', e);
    }

    // 2. Prepare orders payload for Supabase
    // Note: replacement_for_order_id is a UUID FK to orders.id. At parse time we
    // only know the *order number* of the void order being replaced (both orders
    // may be brand-new, in this same batch, with no DB id yet) - so we can't send
    // a real UUID here. We link it in a second pass below, after insert, once we
    // have real ids back from Supabase.
    const dbRows = validDrafts.map((draft) => {
      return {
        order_number: draft.orderNumber,
        customer_name: draft.customerName || '',
        customer_phone: draft.customerPhone || '',
        alt_phone: draft.altPhone || null,
        branch_name: draft.branchName || 'الرئيسي',
        order_date: draft.orderDate || nowIso.split('T')[0],
        order_time: draft.orderTime || '00:00',
        total_amount: draft.totalAmount || 0,
        subtotal: draft.subTotalAmount || null,
        taker_name: draft.takerName || null,
        status: draft.isVoid ? 'void' : mapOrderStatusToDb('pending'),
        is_void: Boolean(draft.isVoid),
        void_reason: draft.voidReason || null,
        is_replacement: Boolean(draft.replacementForOrderId),
        items: draft.items || [],
        imported_file_id: fileId,
      };
    });

    let insertError: string | undefined;

    try {
      const { data: insertedOrders, error: insertErr } = await supabase
        .from('orders')
        .insert(dbRows)
        .select();

      if (insertErr) {
        console.error('Failed inserting orders into Supabase:', insertErr.message);
        insertError = insertErr.message;
      }

      if (insertedOrders) {
        const mapped = insertedOrders.map((row) =>
          transformOrderFromDb(row, profilesMap)
        );
        setAllOrders((prev) => [...mapped, ...prev]);

        // 2b. Second pass: link re-order rows to the real DB id of the void
        // order they replace, now that both have real UUIDs.
        const idByOrderNumber = new Map<string, string>();
        insertedOrders.forEach((row: any) => {
          if (row.order_number) {
            idByOrderNumber.set(
              orderIdentityKey({
                branchName: row.branch_name,
                orderDate: row.order_date,
                orderNumber: row.order_number,
              }),
              row.id
            );
          }
        });

        const linkUpdates = validDrafts
          .filter((draft) => draft.replacementForOrderId)
          .map((draft) => {
            const reorderId = idByOrderNumber.get(orderIdentityKey(draft));
            const voidId = idByOrderNumber.get(
              orderIdentityKey({
                branchName: draft.branchName,
                orderDate: draft.orderDate,
                orderNumber: draft.replacementForOrderId!,
              })
            );
            return reorderId && voidId ? { reorderId, voidId } : null;
          })
          .filter((x): x is { reorderId: string; voidId: string } => Boolean(x));

        if (linkUpdates.length > 0) {
          try {
            await Promise.all(
              linkUpdates.map(({ reorderId, voidId }) =>
                supabase
                  .from('orders')
                  .update({ replacement_for_order_id: voidId })
                  .eq('id', reorderId)
              )
            );
          } catch (e) {
            console.warn('Could not link re-order to void order:', e);
          }
        }
      }
    } catch (err: any) {
      console.error('Error committing imported orders:', err);
      insertError = err?.message || 'حدث خطأ غير متوقع أثناء الحفظ في قاعدة البيانات.';
    }

    await fetchData();

    // Don't report success (or log a success audit entry) if nothing was actually saved.
    if (insertError) {
      return { importedCount: 0, duplicateCount, error: insertError };
    }

    addAuditLog(
      'رفع ملف عملاء',
      'ملفات',
      `تم رفع ومعالجة الملف (${fileName}) بنجاح: تم استيراد ${validDrafts.length} أوردر وتجاهل ${duplicateCount} مكرر`
    );

    return { importedCount: validDrafts.length, duplicateCount };
  };

  const logInboundComplaint = async (
    orderId: string | null,
    data: {
      guest?: { phone: string; name?: string; branch?: string };
      items: { source: ProblemSource; type: string }[];
      details: string;
      mode: 'resolved_on_call' | 'escalated';
      resolutionDetails?: string;
      compensationType?: CompensationType;
      compensationDetails?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const order = orderId ? allOrders.find((o) => o.id === orderId) : undefined;
    // The customer does NOT have to exist in our orders: a walk-in / unknown caller is allowed
    if (!order && !data.guest?.phone?.trim()) {
      return { success: false, error: 'اكتب رقم تليفون العميل على الأقل' };
    }
    const guestName = data.guest?.name?.trim() || 'عميل غير مسجل';
    const guestPhone = data.guest?.phone?.trim() || '';
    const guestBranch = data.guest?.branch?.trim() || '';

    const nowIso = new Date().toISOString();
    const isResolved = data.mode === 'resolved_on_call';
    const hasComp = Boolean(data.compensationType);
    const details = `[شكوى واردة] ${data.details.trim()}`;
    const resolutionText = isResolved
      ? data.resolutionDetails?.trim() ||
        (hasComp
          ? `تم الحل فورياً ووعد بتعويض: ${data.compensationDetails || ''}`
          : 'تم حل الشكوى وإرضاء العميل أثناء المكالمة')
      : undefined;

    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'اختار مشكلة واحدة على الأقل' };
    }

    // An inbound complaint is not a follow-up call: it only creates problem tickets
    // and never changes the order's call status, the queue or the feedback flow.
    // One ticket per selected problem; the compensation is attached to the first one only.
    let savedCount = 0;
    let lastError = '';
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const isFirst = i === 0;
      const rowHasComp = hasComp && isFirst;
      const rowCompStatus: CompensationStatus | undefined = rowHasComp ? 'pending_compensation' : undefined;
      const rowStatus: ProblemStatus = isResolved ? (rowHasComp ? 'pending_compensation' : 'resolved_on_call') : 'escalated';

      const { data: insRow, error } = await supabase
        .from('problems')
        .insert({
          order_id: order ? order.id : null,
          ...(order
            ? {}
            : {
                customer_name: guestName,
                customer_phone: guestPhone,
                branch_name: guestBranch || null,
              }),
          agent_id: currentUser?.id || null,
          source: item.source,
          problem_type: item.type,
          custom_details: details,
          manager_response: resolutionText || null,
          status: mapProblemStatusToDb(rowStatus, !isResolved),
          is_escalated: !isResolved,
          escalated_at: !isResolved ? nowIso : null,
          resolved_by: isResolved ? currentUser?.id || null : null,
          resolved_at: isResolved && !rowHasComp ? nowIso : null,
          has_compensation: rowHasComp,
          compensation_type: rowHasComp ? mapCompensationTypeToDb(data.compensationType) : null,
          compensation_details: rowHasComp ? data.compensationDetails || null : null,
          compensation_status: mapCompensationStatusToDb(rowCompStatus),
        })
        .select('id')
        .single();

      if (error) {
        console.error('Could not insert inbound complaint:', error);
        lastError = error.message;
        continue;
      }
      savedCount++;

      const problemRecord: Problem = {
        id: insRow?.id || `prob-${Date.now()}-${i}`,
        callId: '',
        orderId: order ? order.id : '',
        orderNumber: order ? order.orderNumber : '',
        customerName: order ? order.customerName : guestName,
        customerPhone: order ? order.customerPhone : guestPhone,
        branchName: order ? order.branchName : guestBranch || 'الرئيسي',
        source: item.source,
        type: item.type,
        details,
        status: rowStatus,
        isEscalated: !isResolved,
        resolutionType: isResolved ? 'resolved_on_call' : 'escalated_to_management',
        reportedByUserId: currentUser?.id || 'sys',
        reportedByUserName: currentUser?.name || 'مستخدم',
        resolvedByUserId: isResolved ? currentUser?.id : undefined,
        resolvedByUserName: isResolved ? currentUser?.name : undefined,
        resolutionNotes: resolutionText,
        resolvedAt: isResolved && !rowHasComp ? nowIso : undefined,
        createdAt: nowIso,
        hasCompensation: rowHasComp,
        compensationType: rowHasComp ? data.compensationType : undefined,
        compensationDetails: rowHasComp ? data.compensationDetails : undefined,
        compensationStatus: rowCompStatus,
        compensationPromisedAt: rowHasComp ? nowIso : undefined,
        compensationPromisedByUserId: rowHasComp ? currentUser?.id : undefined,
        compensationPromisedByUserName: rowHasComp ? currentUser?.name : undefined,
      };
      setProblems((prev) => (prev.some((p) => p.id === problemRecord.id) ? prev : [problemRecord, ...prev]));

      addAuditLog(
        'تسجيل شكوى واردة',
        'مشاكل',
        order
          ? `شكوى واردة من العميل (${order.customerName}) على الأوردر ${order.orderNumber}`
          : `شكوى واردة من عميل غير مسجل (${guestName} - ${guestPhone})`,
        problemRecord.id
      );
    }

    if (savedCount === 0) return { success: false, error: lastError || 'تعذر حفظ الشكوى' };
    if (savedCount < data.items.length) {
      return { success: false, error: `اتحفظ ${savedCount} من ${data.items.length} تذكرة فقط: ${lastError}` };
    }
    return { success: true };
  };

  const deleteOrder = async (orderId: string) => {
    setAllOrders((prev) => prev.filter((o) => o.id !== orderId));
    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) {
        console.warn('Could not delete order in DB:', error.message);
        await fetchData();
        return;
      }
    } catch (e) {
      console.warn('Could not delete order in DB:', e);
      await fetchData();
      return;
    }
    addAuditLog('حذف أوردر', 'طلبات', `تم حذف الأوردر رقم (${orderId})`, orderId);
  };

  const clearAllData = async () => {
    if (currentUser?.role !== 'admin') return;
    const NIL = '00000000-0000-0000-0000-000000000000';
    // Order matters: problems/calls reference orders.
    for (const table of ['problems', 'customer_calls', 'orders', 'imported_files']) {
      const { error } = await supabase.from(table).delete().neq('id', NIL);
      if (error) {
        console.warn(`Clear data DB error (${table}):`, error.message);
        await fetchData(); // show what is really in the DB, not a fake empty state
        return;
      }
    }
    setAllOrders([]);
    setProblems([]);
    setCustomerCalls([]);
    setImportedFiles([]);
    addAuditLog('تفريغ البيانات', 'قاعدة البيانات', 'تم مسح سجلات الطلبات والمشاكل');
  };

  // Full-archive fetch used only at export time (not kept in memory). Pages
  // through the whole `orders` table in batches so CSV exports of "orders"
  // and "voids" cover the entire archive, not just the bounded in-memory
  // recent window (`allOrders` / `RECENT_ORDERS_WINDOW_DAYS`).
  const fetchAllOrdersForExport = async (onlyVoid: boolean): Promise<Order[]> => {
    const EXPORT_BATCH_SIZE = 1000;
    const result: Order[] = [];
    let from = 0;

    while (true) {
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + EXPORT_BATCH_SIZE - 1);

      if (onlyVoid) {
        query = query.eq('is_void', true);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Full export fetch error:', error.message);
        break;
      }
      const batch = (data || []).map((row) => transformOrderFromDb(row, profilesMap));
      result.push(...batch);
      if (!data || data.length < EXPORT_BATCH_SIZE) break;
      from += EXPORT_BATCH_SIZE;
    }

    return result;
  };

  const exportCsvReport = async (
    type: 'calls' | 'problems' | 'orders' | 'agents' | 'branches' | 'voids'
  ) => {
    let csvContent = '\uFEFF';
    let filename = `report-${type}-${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'calls') {
      csvContent += 'رقم_المكالمة,رقم_الأوردر,اسم_العميل,هاتف_العميل,الموظف,النتيجة,الملاحظات,المدة_ثانية,تاريخ_المكالمة\n';
      customerCalls.forEach((c) => {
        csvContent += `"${c.id}","${c.orderNumber}","${c.customerName}","${c.customerPhone}","${c.userName}","${c.callResult}","${c.notes || ''}","${c.callDurationSeconds || 0}","${c.createdAt}"\n`;
      });
    } else if (type === 'problems') {
      csvContent += 'رقم_المشكلة,رقم_الأوردر,العميل,الهاتف,الفرع,المصدر,نوع_المشكلة,الحالة,التعويض,الموظف,التاريخ\n';
      problems.forEach((p) => {
        csvContent += `"${p.id}","${p.orderNumber}","${p.customerName}","${p.customerPhone}","${p.branchName}","${p.source}","${p.type}","${p.status}","${p.compensationDetails || ''}","${p.reportedByUserName}","${p.createdAt}"\n`;
      });
    } else if (type === 'orders') {
      // Full archive, not the bounded in-memory window.
      const fullOrders = await fetchAllOrdersForExport(false);
      csvContent += 'رقم_الأوردر,العميل,الهاتف,الفرع,الكاشير,الإجمالي,الحالة,الموظف_المسند,تاريخ_الأوردر\n';
      fullOrders.forEach((o) => {
        csvContent += `"${o.orderNumber}","${o.customerName}","${o.customerPhone}","${o.branchName}","${o.takerName || ''}","${o.totalAmount}","${o.status}","${o.assignedToUserName || ''}","${o.orderDate} ${o.orderTime}"\n`;
      });
    } else if (type === 'voids') {
      // Full archive of void orders, not the bounded in-memory window.
      const fullVoids = await fetchAllOrdersForExport(true);
      csvContent += 'رقم_الأوردر,العميل,الهاتف,الفرع,الإجمالي,سبب_الإلغاء,تاريخ_الأوردر\n';
      fullVoids.forEach((o) => {
        csvContent += `"${o.orderNumber}","${o.customerName}","${o.customerPhone}","${o.branchName}","${o.totalAmount}","${o.voidReason || ''}","${o.orderDate} ${o.orderTime}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authReady,
        authNotice,
        recoveryMode,
        users,
        allOrders,
        orders,
        voidOrders,
        problems,
        customerCalls,
        callClicks,
        importedFiles,
        auditLogs,
        branches,
        settings,
        activeTab,
        selectedOrderId,
        activeCallModalOrderId,
        branchAnomalies,
        isLoadingData,
        isConfigured,
        setActiveTab,
        setSelectedOrderId,
        setActiveCallModalOrderId,
        login,
        logout,
        requestPasswordReset,
        updateOwnPassword,
        finishRecovery,
        addUser,
        updateUserRole,
        toggleUserActive,
        updateSettings,
        triggerClickToCall,
        unlockOrder,
        submitCallResult,
        logInboundComplaint,
        assignOrdersToUser,
        updateAgentBranches,
        autoDistributeOrders,
        updateProblemStatus,
        confirmCompensationExecuted,
        updateVoidDetails,
        commitImportedOrders,
        deleteOrder,
        clearAllData,
        refreshData: fetchData,
        exportCsvReport,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

// Dev only: this module exports a Context + Provider + hook together, which Fast Refresh
// cannot patch safely (it recreates the Context and throws "useApp must be used within an AppProvider").
// Force a full reload instead of a hot patch whenever this file changes.
if (import.meta.hot) {
  import.meta.hot.invalidate();
}
