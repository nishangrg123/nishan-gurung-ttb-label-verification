from typing import Literal

from pydantic import BaseModel, Field


FieldStatus = Literal["PASS", "FAIL"]
OverallVerdict = Literal["APPROVED", "NEEDS_REVIEW"]
BatchItemStatus = Literal["COMPLETED", "ERROR"]


class ApplicationData(BaseModel):
    brand_name: str
    class_type: str
    abv: str
    net_contents: str
    producer: str
    country_of_origin: str
    government_warning: str


class ExtractedLabel(BaseModel):
    brand_name: str | None = None
    class_type: str | None = None
    abv: str | None = None
    net_contents: str | None = None
    producer: str | None = None
    country_of_origin: str | None = None
    government_warning: str | None = None
    raw_text: str | None = None
    extraction_confidence: float | None = Field(default=None, ge=0, le=1)


class FieldResult(BaseModel):
    field: str
    match_type: str
    expected: str | None
    found: str | None
    status: FieldStatus


class VerificationResult(BaseModel):
    results: list[FieldResult]
    overall_verdict: OverallVerdict
    latency_ms: float = 0


class BatchSummary(BaseModel):
    total: int
    approved: int
    needs_review: int
    errors: int


class BatchItemResult(BaseModel):
    index: int
    filename: str
    status: BatchItemStatus
    result: VerificationResult | None = None
    error: str | None = None


class BatchVerificationResponse(BaseModel):
    summary: BatchSummary
    items: list[BatchItemResult]
