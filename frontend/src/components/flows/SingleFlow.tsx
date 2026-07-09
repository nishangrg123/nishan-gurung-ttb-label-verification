import type { RefObject } from "react";

import { ApplicationFields } from "../forms/ApplicationFields";
import { ImagePicker } from "../forms/ImagePicker";
import { SubmitArea } from "../forms/SubmitArea";
import { VerificationResultView } from "../results/VerificationResultView";
import type { FormSubmitHandler, FormValues, VerificationResult } from "../../types";

type SingleFlowProps = {
  values: FormValues;
  image: File | null;
  error: string | null;
  isSubmitting: boolean;
  result: VerificationResult | null;
  resultsRef: RefObject<HTMLDivElement>;
  onSubmit: FormSubmitHandler;
  onImageChange: (file: File | undefined) => void;
  onFieldChange: (field: keyof FormValues, value: string) => void;
  onReset: () => void;
};

export function SingleFlow({
  values,
  image,
  error,
  isSubmitting,
  result,
  resultsRef,
  onSubmit,
  onImageChange,
  onFieldChange,
  onReset,
}: SingleFlowProps) {
  return (
    <>
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
          loadingText="Reading the label and comparing it to the application details. The first request may take up to a minute while the server wakes up."
          buttonText="Check Label"
          loadingButtonText="Checking Label..."
        />
      </form>

      {result && (
        <section
          className="results-section"
          ref={resultsRef}
          tabIndex={-1}
          aria-labelledby="single-results-heading"
        >
          <VerificationResultView headingId="single-results-heading" result={result} />
          <button className="secondary-action" type="button" onClick={onReset}>
            Check Another Label
          </button>
        </section>
      )}
    </>
  );
}
