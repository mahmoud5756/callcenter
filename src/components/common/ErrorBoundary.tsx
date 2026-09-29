import React from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-6 text-center space-y-3">
          <h1 className="font-black text-lg text-slate-900">حصل خطأ غير متوقع</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            اضغط إعادة التحميل. لو المشكلة استمرت ابعت الرسالة دي للمطور:
          </p>
          <pre className="text-2xs text-left bg-slate-50 border border-slate-200 rounded-lg p-2 overflow-auto max-h-32" dir="ltr">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 cursor-pointer"
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    );
  }
}
