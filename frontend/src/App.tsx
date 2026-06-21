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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  function updateField(field: keyof FormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleImageChange(file: File | undefined) {
    setResult(null);
    setError(null);
    setSelectedImage(file ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);

    const validationError = validateForm(formValues, selectedImage);
    if (validationError) {
      setError(validationError);
      return;
    }

    const body = new FormData();
    body.append("image", selectedImage as File);
    body.append("application_data", JSON.stringify(formValues));

    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/verify`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new Error(await readableError(response));
      }

      const payload = (await response.json()) as VerificationResult;
      setResult(payload);
      requestAnimationFrame(() => {
        resultsRef.current?.focus();
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The verification service could not be reached. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setFormValues(initialFormValues);
    setSelectedImage(null);
    setResult(null);
    setError(null);
  }

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Label Check</p>
        <h1 id="page-title">TTB Label Verification</h1>
        <p className="summary">
          Upload one label and enter the application details to check for mismatches.
        </p>
      </section>

      <form className="verification-form" onSubmit={handleSubmit}>
        <section className="form-section" aria-labelledby="image-heading">
          <h2 id="image-heading">Label Image</h2>
          <label className="file-picker">
            <span className="file-picker-label">Choose Label Image</span>
            <span className="file-picker-name">
              {selectedImage ? selectedImage.name : "JPEG, PNG, or WebP"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isSubmitting}
              onChange={(event) => handleImageChange(event.target.files?.[0])}
            />
          </label>
        </section>

        <section className="form-section" aria-labelledby="details-heading">
          <h2 id="details-heading">Application Details</h2>
          <div className="field-grid">
            {textFields.map((field) => (
              <label className="field" key={field.id}>
                <span>{field.label}</span>
                <input
                  type="text"
                  value={formValues[field.id]}
                  placeholder={field.placeholder}
                  disabled={isSubmitting}
                  onChange={(event) => updateField(field.id, event.target.value)}
                />
              </label>
            ))}
          </div>

          <label className="field warning-field">
            <span>Government Warning</span>
            <textarea
              value={formValues.government_warning}
              placeholder="Paste the government warning from the application."
              disabled={isSubmitting}
              onChange={(event) => updateField("government_warning", event.target.value)}
            />
          </label>
        </section>

        {error && (
          <div className="error-panel" role="alert">
            {error}
          </div>
        )}

        {isSubmitting && (
          <p className="loading-message" role="status">
            Reading the label and comparing it to the application details.
          </p>
        )}

        <button className="primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Checking Label..." : "Check Label"}
        </button>
      </form>

      {result && (
        <section
          className="results-section"
          ref={resultsRef}
          tabIndex={-1}
          aria-labelledby="results-heading"
        >
          <div className={`verdict verdict-${result.overall_verdict.toLowerCase()}`}>
            <p className="verdict-label">Result</p>
            <h2 id="results-heading">{formatVerdict(result.overall_verdict)}</h2>
          </div>

          <div className="result-list" aria-label="Field results">
            {result.results.map((item) => (
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

          <button className="secondary-action" type="button" onClick={resetForm}>
            Check Another Label
          </button>
        </section>
      )}
    </main>
  );
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
      return "Please check that every application detail is filled in clearly.";
    }
    if (response.status === 502) {
      return "The label could not be read. Please try a clearer image.";
    }
  } catch {
    return "The verification service could not be reached. Please try again.";
  }

  return "The verification service could not be reached. Please try again.";
}

function formatVerdict(verdict: VerificationResult["overall_verdict"]) {
  return verdict === "APPROVED" ? "APPROVED" : "NEEDS REVIEW";
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
