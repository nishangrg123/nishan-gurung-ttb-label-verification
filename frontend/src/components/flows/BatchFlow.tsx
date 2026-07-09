import type { RefObject } from "react";

import { ApplicationFields } from "../forms/ApplicationFields";
import { ImagePicker } from "../forms/ImagePicker";
import { SubmitArea } from "../forms/SubmitArea";
import { BatchSummaryView } from "../results/BatchSummaryView";
import { VerificationResultView } from "../results/VerificationResultView";
import type { BatchFormItem, BatchVerificationResponse, FormSubmitHandler, FormValues } from "../../types";
import { formatBatchItemStatus } from "../../utils";

type BatchFlowProps = {
  items: BatchFormItem[];
  error: string | null;
  isSubmitting: boolean;
  result: BatchVerificationResponse | null;
  openItemIndexes: Set<number>;
  maxBatchItems: number;
  resultsRef: RefObject<HTMLDivElement>;
  onSubmit: FormSubmitHandler;
  onAddItem: () => void;
  onRemoveItem: (itemId: number) => void;
  onImageChange: (itemId: number, file: File | undefined) => void;
  onFieldChange: (itemId: number, field: keyof FormValues, value: string) => void;
  onToggleDetails: (index: number) => void;
};

export function BatchFlow({
  items,
  error,
  isSubmitting,
  result,
  openItemIndexes,
  maxBatchItems,
  resultsRef,
  onSubmit,
  onAddItem,
  onRemoveItem,
  onImageChange,
  onFieldChange,
  onToggleDetails,
}: BatchFlowProps) {
  return (
    <>
      <form className="verification-form batch-form" onSubmit={onSubmit}>
        <div className="batch-mode-header">
          <h2>Batch Upload</h2>
          <p>Batch limit: {maxBatchItems} labels</p>
        </div>

        {items.map((item, index) => (
          <section className="batch-form-item" key={item.id}>
            <div className="batch-form-heading">
              <h2>Label {index + 1}</h2>
              {items.length > 1 && (
                <button
                  className="remove-action"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onRemoveItem(item.id)}
                >
                  Remove
                </button>
              )}
            </div>

            <ImagePicker
              headingId={`batch-image-heading-${item.id}`}
              image={item.image}
              isSubmitting={isSubmitting}
              onImageChange={(file) => onImageChange(item.id, file)}
              nested
            />

            <ApplicationFields
              headingId={`batch-details-heading-${item.id}`}
              values={item.values}
              isSubmitting={isSubmitting}
              onFieldChange={(field, value) => onFieldChange(item.id, field, value)}
              nested
            />
          </section>
        ))}

        <div className="batch-actions">
          <button
            className="secondary-action inline-action"
            type="button"
            disabled={isSubmitting || items.length >= maxBatchItems}
            onClick={onAddItem}
          >
            Add Another Label
          </button>
        </div>

        <SubmitArea
          error={error}
          isSubmitting={isSubmitting}
          loadingText={`Checking ${items.length} ${items.length === 1 ? "label" : "labels"}... The first request may take up to a minute while the server wakes up.`}
          buttonText="Check All Labels"
          loadingButtonText="Checking Labels..."
        />
      </form>

      {result && (
        <section
          className="batch-results-section"
          ref={resultsRef}
          tabIndex={-1}
          aria-labelledby="batch-results-heading"
        >
          <BatchSummaryView summary={result.summary} />

          <div className="batch-result-list" aria-label="Batch item results">
            {result.items.map((item) => (
              <article className="batch-result-item" key={item.index}>
                <button
                  className="batch-result-toggle"
                  type="button"
                  onClick={() => onToggleDetails(item.index)}
                  aria-expanded={openItemIndexes.has(item.index)}
                >
                  <span>
                    Label {item.index + 1}: {item.filename}
                  </span>
                  <strong>{formatBatchItemStatus(item)}</strong>
                </button>

                {openItemIndexes.has(item.index) && (
                  <div className="batch-drilldown">
                    {item.status === "ERROR" ? (
                      <div className="error-panel" role="alert">
                        {item.error ?? "This label could not be checked."}
                      </div>
                    ) : item.result ? (
                      <VerificationResultView
                        headingId={`batch-result-${item.index}`}
                        result={item.result}
                        compact
                      />
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
