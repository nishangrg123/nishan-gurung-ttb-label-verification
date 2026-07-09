type SubmitAreaProps = {
  error: string | null;
  isSubmitting: boolean;
  loadingText: string;
  buttonText: string;
  loadingButtonText: string;
};

export function SubmitArea({
  error,
  isSubmitting,
  loadingText,
  buttonText,
  loadingButtonText,
}: SubmitAreaProps) {
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
