import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          className="cc-card"
          style={{ borderColor: "rgba(251,113,133,0.4)" }}
        >
          <header className="cc-header">
            <div>
              <p className="cc-eyebrow" style={{ color: "#fb7185" }}>
                Widget Error
              </p>
              <h2 style={{ fontSize: "1rem" }}>Something went wrong</h2>
            </div>
          </header>
          <div className="cc-pane">
            <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
