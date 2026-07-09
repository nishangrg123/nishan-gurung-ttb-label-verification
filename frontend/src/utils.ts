import type { RefObject } from "react";

import { initialFormValues } from "./constants";
import type { BatchFormItem, BatchItemResult, FieldResult, FormValues, VerificationResult } from "./types";

export function createBatchItem(id: number): BatchFormItem {
  return {
    id,
    image: null,
    values: { ...initialFormValues },
  };
}

export function buildApplicationPayload(values: FormValues): FormValues {
  return {
    ...values,
    abv: `${values.abv}%`,
    net_contents: `${values.net_contents} mL`,
  };
}

export function validateForm(values: FormValues, image: File | null): string | null {
  if (!image) {
    return "Please choose a label image.";
  }

  if (!image.type.startsWith("image/")) {
    return "Please choose an image file.";
  }

  const hasMissingValue = Object.values(values).some((value) => value.trim().length === 0);
  if (hasMissingValue) {
    return "Please fill in all application details before checking.";
  }

  const abv = Number(values.abv);
  if (!Number.isFinite(abv) || abv <= 0 || abv > 100) {
    return "Enter alcohol by volume as a number from 0.1 to 100.";
  }

  const netContents = Number(values.net_contents);
  if (!Number.isFinite(netContents) || netContents <= 0 || netContents > 10000) {
    return "Enter net contents as milliliters, using numbers only.";
  }

  return null;
}

export function validateBatch(items: BatchFormItem[], maxBatchItems: number): string | null {
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

export async function readableError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (response.status === 400 && payload.detail?.includes("Unsupported image")) {
      return "Please choose a clear image file.";
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

export function readableCaughtError(caughtError: unknown) {
  return caughtError instanceof Error
    ? caughtError.message
    : "The verification service could not be reached. Please try again.";
}

export function focusResults(ref: RefObject<HTMLElement>) {
  requestAnimationFrame(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function formatVerdict(verdict: VerificationResult["overall_verdict"]) {
  return verdict === "APPROVED" ? "APPROVED" : "NEEDS REVIEW";
}

export function formatBatchItemStatus(item: BatchItemResult) {
  if (item.status === "ERROR") {
    return "ERROR";
  }

  return item.result ? formatVerdict(item.result.overall_verdict) : "COMPLETED";
}

export function displayValue(value: string | null) {
  if (!value || value.trim().length === 0) {
    return "Not found";
  }

  return value;
}

export function failureMessage(item: FieldResult) {
  if (item.field === "government_warning") {
    return "The government warning must match exactly, including the words GOVERNMENT WARNING:";
  }

  if (!item.found || item.found.trim().length === 0) {
    return "This field was not found on the label.";
  }

  return "This field does not match the application details.";
}
