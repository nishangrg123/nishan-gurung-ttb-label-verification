import { FormEvent, useEffect, useRef, useState } from "react";

import { BatchFlow } from "./components/flows/BatchFlow";
import { SingleFlow } from "./components/flows/SingleFlow";
import { apiBaseUrl, fallbackMaxBatchItems, initialFormValues } from "./constants";
import type { BatchFormItem, BatchVerificationResponse, FormValues, VerificationResult } from "./types";
import {
  buildApplicationPayload,
  createBatchItem,
  focusResults,
  readableCaughtError,
  readableError,
  validateBatch,
  validateForm,
} from "./utils";
import "./styles.css";

type Mode = "single" | "batch";

export function App() {
  const [mode, setMode] = useState<Mode>("single");
  const [maxBatchItems, setMaxBatchItems] = useState(fallbackMaxBatchItems);
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

  useEffect(() => {
    let ignore = false;

    async function loadConfig() {
      try {
        const response = await fetch(`${apiBaseUrl}/config`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { max_batch_size?: number };
        if (!ignore && typeof payload.max_batch_size === "number") {
          setMaxBatchItems(payload.max_batch_size);
        }
      } catch {
        // The env fallback keeps local-only frontend work usable when the API is offline.
      }
    }

    void loadConfig();

    return () => {
      ignore = true;
    };
  }, []);

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
    body.append("application_data", JSON.stringify(buildApplicationPayload(singleValues)));

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

    const validationError = validateBatch(batchItems, maxBatchItems);
    if (validationError) {
      setBatchError(validationError);
      return;
    }

    const body = new FormData();
    batchItems.forEach((item) => {
      body.append("images", item.image as File);
    });
    body.append(
      "application_data",
      JSON.stringify(batchItems.map((item) => buildApplicationPayload(item.values))),
    );

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
        <SingleFlow
          values={singleValues}
          image={singleImage}
          error={singleError}
          isSubmitting={isSingleSubmitting}
          result={singleResult}
          resultsRef={singleResultsRef}
          onSubmit={handleSingleSubmit}
          onImageChange={updateSingleImage}
          onFieldChange={updateSingleField}
          onReset={resetSingleForm}
        />
      ) : (
        <BatchFlow
          items={batchItems}
          error={batchError}
          isSubmitting={isBatchSubmitting}
          result={batchResult}
          openItemIndexes={openBatchItems}
          maxBatchItems={maxBatchItems}
          resultsRef={batchResultsRef}
          onSubmit={handleBatchSubmit}
          onAddItem={addBatchItem}
          onRemoveItem={removeBatchItem}
          onImageChange={updateBatchImage}
          onFieldChange={updateBatchField}
          onToggleDetails={toggleBatchDetails}
        />
      )}
    </main>
  );
}
