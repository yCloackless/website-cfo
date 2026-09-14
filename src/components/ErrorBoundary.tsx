import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log estruturado anônimo no client
    console.error('[CFO Tactical ErrorBoundary]', {
      name: error.name,
      message: error.message,
      componentStack: errorInfo.componentStack?.slice(0, 300),
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#020617] text-[#e2e8f0] flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-[#0f172a] border border-[#1e293b] rounded-xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-[#b91c1c]/10 border border-[#b91c1c]/30 text-[#ef4444] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-2">
              <span className="text-xs uppercase tracking-widest text-[#94a3b8] font-bold">
                Procedimento de Contingência Operacional
              </span>
              <h1 className="text-xl font-bold text-white">
                Intercorrência Tática Identificada
              </h1>
              <p className="text-sm text-[#94a3b8] leading-relaxed">
                O módulo operacional encontrou uma condição inesperada de execução. Os dados do seu plano de estudo estão protegidos e sincronizados.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 bg-[#1d4ed8] hover:bg-[#2563eb] text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              >
                Recarregar Módulo
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 bg-[#1e293b] hover:bg-[#334155] text-[#cbd5e1] py-2.5 px-4 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              >
                Tela Inicial
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
