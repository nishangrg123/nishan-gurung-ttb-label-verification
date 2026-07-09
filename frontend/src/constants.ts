import type { FormValues } from "./types";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const fallbackMaxBatchItems = Number(import.meta.env.VITE_MAX_BATCH_SIZE ?? 5);

export const canonicalGovernmentWarning =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not " +
  "drink alcoholic beverages during pregnancy because of the risk of birth defects. " +
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car or " +
  "operate machinery, and may cause health problems.";

export const initialFormValues: FormValues = {
  brand_name: "",
  class_type: "",
  abv: "",
  net_contents: "",
  producer: "",
  country_of_origin: "",
  government_warning: "",
};

export const fieldLabels: Record<keyof FormValues, string> = {
  brand_name: "Brand Name",
  class_type: "Type of Alcohol",
  abv: "Alcohol by Volume",
  net_contents: "Net Contents",
  producer: "Producer",
  country_of_origin: "Country of Origin",
  government_warning: "Government Warning",
};
