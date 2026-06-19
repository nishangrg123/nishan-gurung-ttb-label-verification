import { useEffect, useState } from "react";
import "./styles.css";

type HealthResponse = {
  status: string;
  service: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`);

        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`);
        }

        setHealth(await response.json());
      } catch {
        setError("Could not reach the verification service.");
      } finally {
        setIsLoading(false);
      }
    }

    loadHealth();
  }, []);

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Phase 0</p>
        <h1 id="page-title">TTB Label Verification</h1>
        <p className="summary">
          Deployment skeleton for a stateless label verification app.
        </p>
      </section>

      <section className="status-panel" aria-live="polite">
        <h2>Backend Health</h2>
        {isLoading && <p className="muted">Checking service...</p>}
        {error && <p className="error">{error}</p>}
        {health && (
          <dl className="health-grid">
            <div>
              <dt>Status</dt>
              <dd>{health.status}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{health.service}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}

