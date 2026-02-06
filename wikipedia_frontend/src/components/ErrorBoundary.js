import React from "react";
import { withTranslation } from "react-i18next";
import ErrorState from "./ErrorState";

/**
 * Minimal global error boundary to avoid blank screens.
 * Note: Error boundaries catch render/lifecycle errors, not async errors in effects.
 */
class ErrorBoundaryImpl extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep console error for debugging; can be wired to telemetry later.
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        <ErrorState
          title={t("errors.boundaryTitle")}
          description={
            this.state.error?.message || t("errors.boundaryDescription")
          }
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            // In SPAs it's usually safest to hard-reload to reset state.
            window.location.reload();
          }}
          retryLabel={t("common.reload")}
        />
      );
    }

    return this.props.children;
  }
}

// PUBLIC_INTERFACE
function ErrorBoundary({ children }) {
  /** Global error boundary wrapper used at the root of the app. */
  return <ErrorBoundaryImpl>{children}</ErrorBoundaryImpl>;
}

// PUBLIC_INTERFACE
export default withTranslation()(ErrorBoundary);
