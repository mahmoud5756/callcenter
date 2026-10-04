import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { AuthScreen } from './components/auth/AuthScreen';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { canAccessTab } from './services/permissions';
import { CustomerCallModal } from './components/calls/CustomerCallModal';
import { InboundComplaintModal } from './components/complaints/InboundComplaintModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { CallQueueView } from './components/queue/CallQueueView';
import { OrdersListView } from './components/orders/OrdersListView';
import { VoidOrdersView } from './components/voids/VoidOrdersView';
import { ProblemManagementView } from './components/problems/ProblemManagementView';
import { CustomersView } from './components/customers/CustomersView';
import { CustomerAssignmentView } from './components/assignment/CustomerAssignmentView';
import { ReportsView } from './components/reports/ReportsView';
import { MonthlyClosingView } from './components/closing/MonthlyClosingView';
import { PosUploadView } from './components/upload/PosUploadView';
import { AuditLogsView } from './components/admin/AuditLogsView';
import { UsersSettingsView } from './components/admin/UsersSettingsView';

const MainLayout: React.FC = () => {
  const { currentUser, activeTab, setActiveTab, authReady, recoveryMode } = useApp();
  const [complaintOpen, setComplaintOpen] = useState(false);

  // Route guard: never stay on a tab the current role may not open
  useEffect(() => {
    if (currentUser && !canAccessTab(currentUser.role, activeTab)) {
      setActiveTab('dashboard');
    }
  }, [currentUser, activeTab, setActiveTab]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3" dir="rtl">
        <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-red-500 animate-spin" />
        <p className="text-xs font-bold text-white/70">جاري التحقق من الجلسة…</p>
      </div>
    );
  }

  if (recoveryMode) {
    return <ResetPasswordScreen />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  const renderActiveView = () => {
    if (!canAccessTab(currentUser.role, activeTab)) {
      return <DashboardView />;
    }
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'queue':
        return <CallQueueView scope="today" />;
      case 'previous_pending':
        return <CallQueueView scope="previous" />;
      case 'orders':
        return <OrdersListView />;
      case 'voids':
        return <VoidOrdersView />;
      case 'problems':
        return <ProblemManagementView />;
      case 'customers':
        return <CustomersView />;
      case 'assignment':
        return <CustomerAssignmentView />;
      case 'reports':
        return <ReportsView />;
      case 'closing':
        return <MonthlyClosingView />;
      case 'import':
        return <PosUploadView />;
      case 'audit':
        return <AuditLogsView />;
      case 'settings':
        return <UsersSettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-red-500 selection:text-white" dir="rtl">
      {/* Top Navigation */}
      <Navbar onNewComplaint={() => setComplaintOpen(true)} />

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col lg:flex-row">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Dynamic Content View Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-hidden">
          {renderActiveView()}
        </main>
      </div>

      {/* Global Active Call & Follow-up Modal */}
      <CustomerCallModal />

      {/* Inbound complaint (customer called in) */}
      <InboundComplaintModal open={complaintOpen} onClose={() => setComplaintOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </ErrorBoundary>
  );
}
