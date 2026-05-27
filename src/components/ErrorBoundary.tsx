import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error:", error, info);
    this.setState({ error, info });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen w-screen items-start justify-center overflow-auto bg-red-950 p-8 text-red-100">
        <div className="max-w-3xl">
          <h1 className="text-xl font-bold">Render error</h1>
          <pre className="mt-4 rounded bg-black/40 p-3 text-xs whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          {this.state.error.stack && (
            <pre className="mt-2 rounded bg-black/40 p-3 text-[10px] whitespace-pre-wrap">
              {this.state.error.stack}
            </pre>
          )}
          {this.state.info?.componentStack && (
            <pre className="mt-2 rounded bg-black/40 p-3 text-[10px] whitespace-pre-wrap">
              {this.state.info.componentStack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
