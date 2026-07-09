import type { VerificationResult } from "../../types";
import { formatVerdict } from "../../utils";
import { FieldResultList } from "./FieldResultList";

type VerificationResultViewProps = {
  headingId: string;
  result: VerificationResult;
  compact?: boolean;
};

export function VerificationResultView({
  headingId,
  result,
  compact = false,
}: VerificationResultViewProps) {
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
