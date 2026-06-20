import re
import string
from difflib import SequenceMatcher
from decimal import Decimal, InvalidOperation

from app.models import ApplicationData, ExtractedLabel, FieldResult, VerificationResult


FUZZY_THRESHOLD = 90
ABV_TOLERANCE = Decimal("0.1")

CANONICAL_GOVERNMENT_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not "
    "drink alcoholic beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or "
    "operate machinery, and may cause health problems."
)

_PUNCTUATION_TRANSLATION = str.maketrans("", "", string.punctuation)
_COUNTRY_ALIASES = {
    "america": "united states",
    "u s": "united states",
    "u s a": "united states",
    "us": "united states",
    "usa": "united states",
    "united states": "united states",
    "united states america": "united states",
    "united states of america": "united states",
}


def compare_label(
    application: ApplicationData, extracted: ExtractedLabel, latency_ms: float = 0
) -> VerificationResult:
    results = [
        compare_fuzzy_field("brand_name", application.brand_name, extracted.brand_name),
        compare_fuzzy_field("class_type", application.class_type, extracted.class_type),
        compare_abv(application.abv, extracted.abv),
        compare_net_contents(application.net_contents, extracted.net_contents),
        compare_fuzzy_field("producer", application.producer, extracted.producer),
        compare_country(application.country_of_origin, extracted.country_of_origin),
        compare_government_warning(extracted.government_warning),
    ]
    verdict = "APPROVED" if all(result.status == "PASS" for result in results) else "NEEDS_REVIEW"

    return VerificationResult(
        results=results,
        overall_verdict=verdict,
        latency_ms=latency_ms,
    )


def compare_fuzzy_field(field: str, expected: str, found: str | None) -> FieldResult:
    score = _fuzzy_ratio(_normalize_text(expected), _normalize_text(found))

    return FieldResult(
        field=field,
        match_type="fuzzy",
        expected=expected,
        found=found,
        status="PASS" if score >= FUZZY_THRESHOLD else "FAIL",
    )


def compare_country(expected: str, found: str | None) -> FieldResult:
    normalized_expected = _normalize_country(expected)
    normalized_found = _normalize_country(found)

    return FieldResult(
        field="country_of_origin",
        match_type="country_synonym",
        expected=expected,
        found=found,
        status="PASS" if normalized_expected == normalized_found else "FAIL",
    )


def compare_abv(expected: str, found: str | None) -> FieldResult:
    expected_value = _parse_abv(expected)
    found_value = _parse_abv(found)
    is_match = (
        expected_value is not None
        and found_value is not None
        and abs(expected_value - found_value) <= ABV_TOLERANCE
    )

    return FieldResult(
        field="abv",
        match_type="numeric_abv",
        expected=expected,
        found=found,
        status="PASS" if is_match else "FAIL",
    )


def compare_net_contents(expected: str, found: str | None) -> FieldResult:
    expected_ml = _parse_net_contents_ml(expected)
    found_ml = _parse_net_contents_ml(found)
    is_match = expected_ml is not None and found_ml is not None and expected_ml == found_ml

    return FieldResult(
        field="net_contents",
        match_type="unit_normalized",
        expected=expected,
        found=found,
        status="PASS" if is_match else "FAIL",
    )


def compare_government_warning(found: str | None) -> FieldResult:
    normalized_expected = _collapse_whitespace(CANONICAL_GOVERNMENT_WARNING)
    normalized_found = _collapse_whitespace(found)

    return FieldResult(
        field="government_warning",
        match_type="exact_case_sensitive",
        expected=CANONICAL_GOVERNMENT_WARNING,
        found=found,
        status="PASS" if normalized_expected == normalized_found else "FAIL",
    )


def _normalize_text(value: str | None) -> str:
    if value is None:
        return ""

    without_punctuation = value.translate(_PUNCTUATION_TRANSLATION)
    return " ".join(without_punctuation.lower().split())


def _collapse_whitespace(value: str | None) -> str:
    if value is None:
        return ""

    return " ".join(value.split())


def _fuzzy_ratio(expected: str, found: str) -> int:
    if not expected or not found:
        return 0

    return round(SequenceMatcher(None, expected, found).ratio() * 100)


def _normalize_country(value: str | None) -> str:
    normalized = _normalize_text(value)
    return _COUNTRY_ALIASES.get(normalized, normalized)


def _parse_abv(value: str | None) -> Decimal | None:
    if value is None:
        return None

    percent_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent|alc\.?/vol\.?)", value, re.I)
    if percent_match:
        return _to_decimal(percent_match.group(1))

    proof_match = re.search(r"(\d+(?:\.\d+)?)\s*proof", value, re.I)
    if proof_match:
        proof = _to_decimal(proof_match.group(1))
        return proof / 2 if proof is not None else None

    number_match = re.search(r"\d+(?:\.\d+)?", value)
    return _to_decimal(number_match.group(0)) if number_match else None


def _parse_net_contents_ml(value: str | None) -> Decimal | None:
    if value is None:
        return None

    match = re.search(
        r"(\d+(?:\.\d+)?)\s*(ml|milliliter|milliliters|l|liter|liters|cl|centiliter|centiliters)",
        value,
        re.I,
    )
    if not match:
        return None

    amount = _to_decimal(match.group(1))
    if amount is None:
        return None

    unit = match.group(2).lower()
    if unit in {"ml", "milliliter", "milliliters"}:
        return amount
    if unit in {"l", "liter", "liters"}:
        return amount * Decimal("1000")
    if unit in {"cl", "centiliter", "centiliters"}:
        return amount * Decimal("10")

    return None


def _to_decimal(value: str) -> Decimal | None:
    try:
        return Decimal(value)
    except InvalidOperation:
        return None
