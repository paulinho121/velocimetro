import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any render-time throw unmounts the whole tree and the user is
 * left staring at a blank white page with no way back.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('VELOX crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="scroll-area fixed inset-0 z-50 overflow-y-auto bg-[#050A15] text-white">
        <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-10 pt-safe pb-nav text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400" />
          <h1 className="text-xl font-black tracking-wide">Algo deu errado</h1>
          <p className="max-w-sm text-sm leading-relaxed text-white/60">
            O app encontrou um erro inesperado. Você pode recarregar a tela sem
            perder suas viagens salvas.
          </p>
          <code
            data-selectable
            className="max-w-full overflow-x-auto rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] text-red-300"
          >
            {error.message}
          </code>
          <button
            onClick={() => window.location.reload()}
            className="h-14 w-full max-w-xs rounded-2xl bg-cyan-400 text-sm font-black uppercase tracking-[0.2em] text-black active:bg-cyan-300"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
