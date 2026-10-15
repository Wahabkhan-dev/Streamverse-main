import { Component, type ReactNode } from "react";
import { Sentry } from "@/lib/sentry";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; eventId?: string; }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    if (import.meta.env["VITE_SENTRY_DSN"]) {
      const eventId = Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
      this.setState({ eventId });
    }
    console.error("[ErrorBoundary]", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page. If the problem persists, contact support.</p>
          <button onClick={() => this.setState({ hasError: false })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
