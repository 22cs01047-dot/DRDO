import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-8 transition-colors">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 border border-red-200 dark:border-red-500/30
                          rounded-lg p-8 text-center shadow-sm dark:shadow-slate-900/30">
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Application Error
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              An unexpected error occurred. This has been logged for review.
            </p>
            {this.state.error && (
              <pre className="text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700
                              rounded-md p-3 mb-4 text-left overflow-x-auto text-red-600 dark:text-red-400
                              font-mono max-h-32 overflow-y-auto">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2
                           bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900
                           text-sm font-medium rounded-md
                           hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
              >
                <RotateCcw size={14} />
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 px-4 py-2
                           border border-slate-200 dark:border-slate-600
                           text-slate-700 dark:text-slate-300 text-sm font-medium rounded-md
                           hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}