import type { FormEvent } from "react";

export type FormValues = {
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  producer: string;
  country_of_origin: string;
  government_warning: string;
};

export type FieldResult = {
  field: keyof FormValues;
  match_type: string;
  expected: string | null;
  found: string | null;
  status: "PASS" | "FAIL";
};

export type VerificationResult = {
  overall_verdict: "APPROVED" | "NEEDS_REVIEW";
  latency_ms: number;
  results: FieldResult[];
};

export type BatchSummary = {
  passed: number;
  needs_review: number;
  total: number;
};

export type BatchItemResult = {
  index: number;
  filename: string;
  status: "COMPLETED" | "ERROR";
  result: VerificationResult | null;
  error: string | null;
};

export type BatchVerificationResponse = {
  summary: BatchSummary;
  items: BatchItemResult[];
};

export type BatchFormItem = {
  id: number;
  image: File | null;
  values: FormValues;
};

export type FormSubmitHandler = (event: FormEvent<HTMLFormElement>) => void;
