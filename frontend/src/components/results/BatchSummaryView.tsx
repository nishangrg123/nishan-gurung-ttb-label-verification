import type { BatchSummary } from "../../types";

type BatchSummaryViewProps = {
  summary: BatchSummary;
};

export function BatchSummaryView({ summary }: BatchSummaryViewProps) {
  return (
    <section className="batch-summary" aria-labelledby="batch-results-heading">
      <h2 id="batch-results-heading">Batch Results</h2>
      <dl className="summary-grid">
        <div>
          <dt>Total</dt>
          <dd>{summary.total}</dd>
        </div>
        <div>
          <dt>Passed</dt>
          <dd>{summary.passed}</dd>
        </div>
        <div>
          <dt>Needs Review</dt>
          <dd>{summary.needs_review}</dd>
        </div>
      </dl>
    </section>
  );
}
