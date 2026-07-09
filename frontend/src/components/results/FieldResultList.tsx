import { fieldLabels } from "../../constants";
import type { FieldResult } from "../../types";
import { displayValue, failureMessage } from "../../utils";

type FieldResultListProps = {
  results: FieldResult[];
};

export function FieldResultList({ results }: FieldResultListProps) {
  return (
    <div className="result-list" aria-label="Field results">
      {results.map((item) => (
        <article className={`result-row result-${item.status.toLowerCase()}`} key={item.field}>
          <div className="result-row-heading">
            <h3>{fieldLabels[item.field] ?? item.field}</h3>
            <span className="status-badge">{item.status}</span>
          </div>

          {item.status === "PASS" ? (
            <p className="match-copy">Matches</p>
          ) : (
            <>
              <p className="failure-note">{failureMessage(item)}</p>
              <dl className="comparison-values">
                <div>
                  <dt>Application says</dt>
                  <dd>{displayValue(item.expected)}</dd>
                </div>
                <div>
                  <dt>Label shows</dt>
                  <dd>{displayValue(item.found)}</dd>
                </div>
              </dl>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
