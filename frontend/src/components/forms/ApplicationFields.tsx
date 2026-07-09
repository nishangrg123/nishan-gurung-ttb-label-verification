import { canonicalGovernmentWarning } from "../../constants";
import type { FormValues } from "../../types";

type ApplicationFieldsProps = {
  headingId: string;
  values: FormValues;
  isSubmitting: boolean;
  onFieldChange: (field: keyof FormValues, value: string) => void;
  nested?: boolean;
};

const textFields: Array<{
  id: keyof FormValues;
  label: string;
  placeholder: string;
}> = [
  { id: "brand_name", label: "Brand Name", placeholder: "Example Reserve" },
  { id: "class_type", label: "Type of Alcohol", placeholder: "Whiskey" },
  { id: "producer", label: "Producer", placeholder: "Example Distilling Co." },
  { id: "country_of_origin", label: "Country of Origin", placeholder: "United States" },
];

export function ApplicationFields({
  headingId,
  values,
  isSubmitting,
  onFieldChange,
  nested = false,
}: ApplicationFieldsProps) {
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

        <label className="field">
          <span>Alcohol by Volume (%)</span>
          <input
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            inputMode="decimal"
            value={values.abv}
            placeholder="45"
            disabled={isSubmitting}
            onChange={(event) => onFieldChange("abv", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Net Contents (mL)</span>
          <input
            type="number"
            min="1"
            max="10000"
            step="1"
            inputMode="numeric"
            value={values.net_contents}
            placeholder="750"
            disabled={isSubmitting}
            onChange={(event) => onFieldChange("net_contents", event.target.value)}
          />
        </label>
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
      <div className="warning-helper">
        <p>
          This field is checked exactly. Use the standard warning text when it matches the application.
        </p>
        <button
          className="secondary-action inline-action"
          type="button"
          disabled={isSubmitting}
          onClick={() => onFieldChange("government_warning", canonicalGovernmentWarning)}
        >
          Insert Canonical Warning
        </button>
      </div>
    </section>
  );
}
