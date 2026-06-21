import { FormEvent, useRef, useState } from "react";
import "./styles.css";

type FormValues = {
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  producer: string;
  country_of_origin: string;
  government_warning: string;
};

type FieldResult = {
  field: keyof FormValues;
  match_type: string;
  expected: string | null;
  found: string | null;
  status: "PASS" | "FAIL";
};

type VerificationResult = {
  overall_verdict: "APPROVED" | "NEEDS_REVIEW";
  latency_ms: number;
  results: FieldResult[];
};

type BatchSummary = {
  total: number;
  approved: number;
  needs_review: number;
  errors: number;
};

type BatchItemResult = {
  index: number;
  filename: string;
  status: "COMPLETED" | "ERROR";
  result: VerificationResult | null;
  error: string | null;
};

type BatchVerificationResponse = {
  summary: BatchSummary;
  items: BatchItemResult[];
};

type BatchFormItem = {
  id: number;
  image: File | null;
  values: FormValues;
};

type Mode = "single" | "batch";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const maxBatchItems = 5;

const initialFormValues: FormValues = {
  brand_name: "",
  class_type: "",
  abv: "",
  net_contents: "",
  producer: "",
  country_of_origin: "",
  government_warning: "",
};

const fieldLabels: Record<keyof FormValues, string> = {
  brand_name: "Brand Name",
  class_type: "Type of Alcohol",
  abv: "Alcohol by Volume",
  net_contents: "Net Contents",
  producer: "Producer",
  country_of_origin: "Country of Origin",
  government_warning: "Government Warning",
};

const textFields: Array<{
  id: keyof FormValues;
  label: string;
  placeholder: string;
}> = [
  { id: "brand_name", label: "Brand Name", placeholder: "Example Reserve" },
  { id: "class_type", label: "Type of Alcohol", placeholder: "Whiskey" },
  { id: "abv", label: "Alcohol by Volume", placeholder: "45%" },
  { id: "net_contents", label: "Net Contents", placeholder: "750 mL" },
  { id: "producer", label: "Producer", placeholder: "Example Distilling Co." },
  { id: "country_of_origin", label: "Country of Origin", placeholder: "United States" },
];

export function App() {
  const [mode, setMode] = useState<Mode>("single");
  const [singleValues, setSingleValues] = useState<FormValues>(initialFormValues);
  const [singleImage, setSingleImage] = useState<File | null>(null);
  const [singleResult, setSingleResult] = useState<VerificationResult | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [isSingleSubmitting, setIsSingleSubmitting] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchFormItem[]>([createBatchItem(1)]);
  const [nextBatchId, setNextBatchId] = useState(2);
  const [batchResult, setBatchResult] = useState<BatchVerificationResponse | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [openBatchItems, setOpenBatchItems] = useState<Set<number>>(new Set());

  const singleResultsRef = useRef<HTMLDivElement>(null);
  const batchResultsRef = useRef<HTMLDivElement>(null);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setSingleError(null);
    setBatchError(null);
  }

  function updateSingleField(field: keyof FormValues, value: string) {
    setSingleValues((current) => ({ ...current, [field]: value }));
  }

  function updateSingleImage(file: File | undefined) {
    setSingleResult(null);
    setSingleError(null);
    setSingleImage(file ?? null);
  }

  async function handleSingleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSingleResult(null);
    setSingleError(null);

    const validationError = validateForm(singleValues, singleImage);
    if (validationError) {
      setSingleError(validationError);
      return;
    }

    const body = new FormData();
    body.append("image", singleImage as File);
    body.append("application_data", JSON.stringify(singleValues));

    setIsSingleSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/verify`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new Error(await readableError(response));
      }

      const payload = (await response.json()) as VerificationResult;
      setSingleResult(payload);
      focusResults(singleResultsRef);
    } catch (caughtError) {
      setSingleError(readableCaughtError(caughtError));
    } finally {
      setIsSingleSubmitting(false);
    }
  }

  function resetSingleForm() {
    setSingleValues(initialFormValues);
    setSingleImage(null);
    setSingleResult(null);
    setSingleError(null);
  }

  function updateBatchImage(itemId: number, file: File | undefined) {
    setBatchResult(null);
    setBatchError(null);
    setBatchItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, image: file ?? null } : item)),
    );
  }

  function updateBatchField(itemId: number, field: keyof FormValues, value: string) {
    setBatchItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, values: { ...item.values, [field]: value } } : item,
      ),
    );
  }

  function addBatchItem() {
    if (batchItems.length >= maxBatchItems) {
      setBatchError(`Batch cannot include more than ${maxBatchItems} labels.`);
      return;
    }

    setBatchItems((current) => [...current, createBatchItem(nextBatchId)]);
    setNextBatchId((current) => current + 1);
    setBatchError(null);
  }

  function removeBatchItem(itemId: number) {
    setBatchItems((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter((item) => item.id !== itemId);
    });
    setBatchResult(null);
    setBatchError(null);
  }

  async function handleBatchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBatchResult(null);
    setBatchError(null);
    setOpenBatchItems(new Set());

    const validationError = validateBatch(batchItems);
    if (validationError) {
      setBatchError(validationError);
      return;
    }

    const body = new FormData();
    batchItems.forEach((item) => {
      body.append("images", item.image as File);
    });
    body.append("application_data", JSON.stringify(batchItems.map((item) => item.values)));

    setIsBatchSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/verify/batch`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new Error(await readableError(response));
      }

      const payload = (await response.json()) as BatchVerificationResponse;
      setBatchResult(payload);
      setOpenBatchItems(new Set(payload.items.map((item) => item.index)));
      focusResults(batchResultsRef);
    } catch (caughtError) {
      setBatchError(readableCaughtError(caughtError));
    } finally {
      setIsBatchSubmitting(false);
    }
  }

  function toggleBatchDetails(index: number) {
    setOpenBatchItems((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Label Check</p>
        <h1 id="page-title">TTB Label Verification</h1>
        <p className="summary">
          Upload label images and enter the application details to check for mismatches.
        </p>
      </section>

      <div className="mode-switch" aria-label="Choose verification mode">
        <button
          className={mode === "single" ? "mode-button active" : "mode-button"}
          type="button"
          aria-pressed={mode === "single"}
          onClick={() => switchMode("single")}
        >
          Single Label
        </button>
        <button
          className={mode === "batch" ? "mode-button active" : "mode-button"}
          type="button"
          aria-pressed={mode === "batch"}
          onClick={() => switchMode("batch")}
        >
          Batch Upload
        </button>
      </div>

      {mode === "single" ? (
        <>
          <SingleLabelForm
            values={singleValues}
            image={singleImage}
            error={singleError}
            isSubmitting={isSingleSubmitting}
            onSubmit={handleSingleSubmit}
            onImageChange={updateSingleImage}
            onFieldChange={updateSingleField}
          />

          {singleResult && (
            <section
              className="results-section"
              ref={singleResultsRef}
              tabIndex={-1}
              aria-labelledby="single-results-heading"
            >
              <VerificationResultView
                headingId="single-results-heading"
                result={singleResult}
              />
              <button className="secondary-action" type="button" onClick={resetSingleForm}>
                Check Another Label
              </button>
            </section>
          )}
        </>
      ) : (
        <>
          <BatchForm
            items={batchItems}
            error={batchError}
            isSubmitting={isBatchSubmitting}
            onSubmit={handleBatchSubmit}
            onAddItem={addBatchItem}
            onRemoveItem={removeBatchItem}
            onImageChange={updateBatchImage}
            onFieldChange={updateBatchField}
          />

          {batchResult && (
            <section
              className="batch-results-section"
              ref={batchResultsRef}
              tabIndex={-1}
              aria-labelledby="batch-results-heading"
            >
              <BatchSummaryView summary={batchResult.summary} />

              <div className="batch-result-list" aria-label="Batch item results">
                {batchResult.items.map((item) => (
                  <article className="batch-result-item" key={item.index}>
                    <button
                      className="batch-result-toggle"
                      type="button"
                      onClick={() => toggleBatchDetails(item.index)}
                      aria-expanded={openBatchItems.has(item.index)}
                    >
                      <span>
                        Label {item.index + 1}: {item.filename}
                      </span>
                      <strong>{formatBatchItemStatus(item)}</strong>
                    </button>

                    {openBatchItems.has(item.index) && (
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
      )}
    </main>
  );
}

function SingleLabelForm({
  values,
  image,
  error,
  isSubmitting,
  onSubmit,
  onImageChange,
  onFieldChange,
}: {
  values: FormValues;
  image: File | null;
  error: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onImageChange: (file: File | undefined) => void;
  onFieldChange: (field: keyof FormValues, value: string) => void;
}) {
  return (
    <form className="verification-form" onSubmit={onSubmit}>
      <ImagePicker
        headingId="single-image-heading"
        image={image}
        isSubmitting={isSubmitting}
        onImageChange={onImageChange}
      />

      <ApplicationFields
        headingId="single-details-heading"
        values={values}
        isSubmitting={isSubmitting}
        onFieldChange={onFieldChange}
      />

      <SubmitArea
        error={error}
        isSubmitting={isSubmitting}
        loadingText="Reading the label and comparing it to the application details."
        buttonText="Check Label"
        loadingButtonText="Checking Label..."
      />
    </form>
  );
}

function BatchForm({
  items,
  error,
  isSubmitting,
  onSubmit,
  onAddItem,
  onRemoveItem,
  onImageChange,
  onFieldChange,
}: {
  items: BatchFormItem[];
  error: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: number) => void;
  onImageChange: (itemId: number, file: File | undefined) => void;
  onFieldChange: (itemId: number, field: keyof FormValues, value: string) => void;
}) {
  return (
    <form className="verification-form batch-form" onSubmit={onSubmit}>
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
        loadingText={`Checking ${items.length} ${items.length === 1 ? "label" : "labels"}...`}
        buttonText="Check All Labels"
        loadingButtonText="Checking Labels..."
      />
    </form>
  );
}

function ImagePicker({
  headingId,
  image,
  isSubmitting,
  onImageChange,
  nested = false,
}: {
  headingId: string;
  image: File | null;
  isSubmitting: boolean;
  onImageChange: (file: File | undefined) => void;
  nested?: boolean;
}) {
  return (
    <section className={nested ? "form-section nested-section" : "form-section"} aria-labelledby={headingId}>
      <h2 id={headingId}>Label Image</h2>
      <label className="file-picker">
        <span className="file-picker-label">Choose Label Image</span>
        <span className="file-picker-name">{image ? image.name : "JPEG, PNG, or WebP"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isSubmitting}
          onChange={(event) => onImageChange(event.target.files?.[0])}
        />
      </label>
    </section>
  );
}

function ApplicationFields({
  headingId,
  values,
  isSubmitting,
  onFieldChange,
  nested = false,
}: {
  headingId: string;
  values: FormValues;
  isSubmitting: boolean;
  onFieldChange: (field: keyof FormValues, value: string) => void;
  nested?: boolean;
}) {
  return (
    <section className={nested ? "form-section nested-section" : "form-section"} aria-labelledby={headingId}>
      <h2 id={headingId}>Application Details</h2>
      <div className="field-grid">
        {textFields.map((field) => (
          <label className="field" key={field.id}>
            <span>{field.label}</span>
            <input
              type="text"
              value={values[field.id]}
              placeholder={field.placeholder}
              disabled={isSubmitting}
              onChange={(event) => onFieldChange(field.id, event.target.value)}
            />
          </label>
        ))}
      </div>

      <label className="field warning-field">
        <span>Government Warning</span>
        <textarea
          value={values.government_warning}
          placeholder="Paste the government warning from the application."
          disabled={isSubmitting}
          onChange={(event) => onFieldChange("government_warning", event.target.value)}
        />
      </label>
    </section>
  );
}

function SubmitArea({
  error,
  isSubmitting,
  loadingText,
  buttonText,
  loadingButtonText,
}: {
  error: string | null;
  isSubmitting: boolean;
  loadingText: string;
  buttonText: string;
  loadingButtonText: string;
}) {
  return (
    <>
      {error && (
        <div className="error-panel" role="alert">
          {error}
        </div>
      )}

      {isSubmitting && (
        <p className="loading-message" role="status">
          {loadingText}
        </p>
      )}

      <button className="primary-action" type="submit" disabled={isSubmitting}>
        {isSubmitting ? loadingButtonText : buttonText}
      </button>
    </>
  );
}

function VerificationResultView({
  headingId,
  result,
  compact = false,
}: {
  headingId: string;
  result: VerificationResult;
  compact?: boolean;
}) {
  return (
    <>
      <div className={`verdict verdict-${result.overall_verdict.toLowerCase()} ${compact ? "compact-verdict" : ""}`}>
        <p className="verdict-label">Result</p>
        <h2 id={headingId}>{formatVerdict(result.overall_verdict)}</h2>
      </div>

      <FieldResultList results={result.results} />
    </>
  );
}

function FieldResultList({ results }: { results: FieldResult[] }) {
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

function BatchSummaryView({ summary }: { summary: BatchSummary }) {
  return (
    <section className="batch-summary" aria-labelledby="batch-results-heading">
      <h2 id="batch-results-heading">Batch Results</h2>
      <dl className="summary-grid">
        <div>
          <dt>Total</dt>
          <dd>{summary.total}</dd>
        </div>
        <div>
          <dt>Approved</dt>
          <dd>{summary.approved}</dd>
        </div>
        <div>
          <dt>Needs Review</dt>
          <dd>{summary.needs_review}</dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd>{summary.errors}</dd>
        </div>
      </dl>
    </section>
  );
}

function createBatchItem(id: number): BatchFormItem {
  return {
    id,
    image: null,
    values: { ...initialFormValues },
  };
}

function validateForm(values: FormValues, image: File | null): string | null {
  if (!image) {
    return "Please choose a label image.";
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    return "Use a JPEG, PNG, or WebP image.";
  }

  const hasMissingValue = Object.values(values).some((value) => value.trim().length === 0);
  if (hasMissingValue) {
    return "Please fill in all application details before checking.";
  }

  return null;
}

function validateBatch(items: BatchFormItem[]): string | null {
  if (items.length === 0) {
    return "Please add at least one label.";
  }

  if (items.length > maxBatchItems) {
    return `Batch cannot include more than ${maxBatchItems} labels.`;
  }

  for (const [index, item] of items.entries()) {
    const validationError = validateForm(item.values, item.image);
    if (validationError) {
      return `Label ${index + 1}: ${validationError}`;
    }
  }

  return null;
}

async function readableError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (response.status === 400 && payload.detail?.includes("Unsupported image")) {
      return "Use a JPEG, PNG, or WebP image.";
    }
    if (response.status === 400 && payload.detail?.includes("empty")) {
      return "Please choose a label image.";
    }
    if (response.status === 422) {
      return payload.detail ?? "Please check that every application detail is filled in clearly.";
    }
    if (response.status === 502) {
      return "The label could not be read. Please try a clearer image.";
    }
  } catch {
    return "The verification service could not be reached. Please try again.";
  }

  return "The verification service could not be reached. Please try again.";
}

function readableCaughtError(caughtError: unknown) {
  return caughtError instanceof Error
    ? caughtError.message
    : "The verification service could not be reached. Please try again.";
}

function focusResults(ref: React.RefObject<HTMLElement>) {
  requestAnimationFrame(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function formatVerdict(verdict: VerificationResult["overall_verdict"]) {
  return verdict === "APPROVED" ? "APPROVED" : "NEEDS REVIEW";
}

function formatBatchItemStatus(item: BatchItemResult) {
  if (item.status === "ERROR") {
    return "ERROR";
  }

  return item.result ? formatVerdict(item.result.overall_verdict) : "COMPLETED";
}

function displayValue(value: string | null) {
  if (!value || value.trim().length === 0) {
    return "Not found";
  }

  return value;
}

function failureMessage(item: FieldResult) {
  if (item.field === "government_warning") {
    return "The government warning must match exactly, including the words GOVERNMENT WARNING:";
  }

  if (!item.found || item.found.trim().length === 0) {
    return "This field was not found on the label.";
  }

  return "This field does not match the application details.";
}
