import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: '#0f172a', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Something went wrong.</h2>
          <p style={{ color: '#94a3b8', marginBottom: '30px', fontSize: '0.86rem' }}>
            The application encountered an unexpected error. This often happens due to memory issues on mobile.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{ padding: '12px 24px', borderRadius: '12px', background: '#10b981', color: 'white', border: 'none', fontWeight: '600' }}
          >
            Reload Application
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre style={{ marginTop: '20px', textAlign: 'left', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', fontSize: '0.7rem', maxWidth: '100%', overflowX: 'auto' }}>
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
