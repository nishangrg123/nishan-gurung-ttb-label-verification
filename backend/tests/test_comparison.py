from app.comparison import compare_label
from app.models import ApplicationData, ExtractedLabel


TEST_GOVERNMENT_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not "
    "drink alcoholic beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or "
    "operate machinery, and may cause health problems."
)


def _application(**overrides: str) -> ApplicationData:
    data = {
        "brand_name": "Example Reserve",
        "class_type": "Whiskey",
        "abv": "45%",
        "net_contents": "750 mL",
        "producer": "Example Distilling Co.",
        "country_of_origin": "United States",
        "government_warning": TEST_GOVERNMENT_WARNING,
    }
    data.update(overrides)
    return ApplicationData(**data)


def _extracted(**overrides: str) -> ExtractedLabel:
    data = {
        "brand_name": "example reserve",
        "class_type": "WHISKEY",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750ml",
        "producer": "Example Distilling Co",
        "country_of_origin": "USA",
        "government_warning": TEST_GOVERNMENT_WARNING,
    }
    data.update(overrides)
    return ExtractedLabel(**data)


def _field(result, field: str):
    return next(item for item in result.results if item.field == field)


def test_case_only_brand_difference_passes() -> None:
    result = compare_label(
        _application(brand_name="Example Reserve"),
        _extracted(brand_name="EXAMPLE RESERVE"),
    )

    assert _field(result, "brand_name").status == "PASS"


def test_fuzzy_fields_normalize_punctuation_and_whitespace() -> None:
    result = compare_label(
        _application(brand_name="Example Reserve"),
        _extracted(brand_name="  example---reserve!!!  "),
    )

    assert _field(result, "brand_name").status == "PASS"


def test_abv_numeric_normalization_passes_with_alc_vol_and_proof_text() -> None:
    result = compare_label(_application(abv="45%"), _extracted(abv="45% Alc./Vol. (90 Proof)"))

    assert _field(result, "abv").status == "PASS"


def test_net_contents_unit_normalization_passes_for_spacing_difference() -> None:
    result = compare_label(
        _application(net_contents="750 mL"),
        _extracted(net_contents="750ml"),
    )

    assert _field(result, "net_contents").status == "PASS"


def test_net_contents_unit_normalization_allows_one_ml_tolerance() -> None:
    result = compare_label(
        _application(net_contents="750 mL"),
        _extracted(net_contents="749.2 ml"),
    )

    assert _field(result, "net_contents").status == "PASS"


def test_net_contents_unit_normalization_rejects_beyond_one_ml_tolerance() -> None:
    result = compare_label(
        _application(net_contents="750 mL"),
        _extracted(net_contents="748.8 ml"),
    )

    assert _field(result, "net_contents").status == "FAIL"


def test_net_contents_unit_normalization_passes_for_fluid_ounces() -> None:
    result = compare_label(
        _application(net_contents="750 mL"),
        _extracted(net_contents="25.4 fl oz"),
    )

    assert _field(result, "net_contents").status == "PASS"


def test_country_synonym_passes_for_usa_and_united_states() -> None:
    result = compare_label(
        _application(country_of_origin="United States"),
        _extracted(country_of_origin="USA"),
    )

    assert _field(result, "country_of_origin").status == "PASS"


def test_country_synonym_passes_for_punctuated_usa_alias() -> None:
    result = compare_label(
        _application(country_of_origin="United States"),
        _extracted(country_of_origin="U.S.A."),
    )

    assert _field(result, "country_of_origin").status == "PASS"


def test_country_synonym_passes_for_non_us_aliases() -> None:
    cases = [
        ("United Kingdom", "Scotland"),
        ("France", "French Republic"),
        ("Mexico", "United Mexican States"),
    ]

    for expected, found in cases:
        result = compare_label(
            _application(country_of_origin=expected),
            _extracted(country_of_origin=found),
        )

        assert _field(result, "country_of_origin").status == "PASS"


def test_title_case_government_warning_fails() -> None:
    title_case_warning = TEST_GOVERNMENT_WARNING.title()

    result = compare_label(_application(), _extracted(government_warning=title_case_warning))
    warning_result = _field(result, "government_warning")

    assert warning_result.status == "FAIL"
    assert warning_result.found == title_case_warning


def test_government_warning_missing_colon_fails() -> None:
    warning_without_colon = TEST_GOVERNMENT_WARNING.replace("WARNING:", "WARNING", 1)

    result = compare_label(_application(), _extracted(government_warning=warning_without_colon))
    warning_result = _field(result, "government_warning")

    assert warning_result.status == "FAIL"
    assert warning_result.found == warning_without_colon


def test_correct_all_caps_government_warning_passes() -> None:
    result = compare_label(_application(), _extracted(government_warning=TEST_GOVERNMENT_WARNING))

    assert _field(result, "government_warning").status == "PASS"


def test_government_warning_fails_with_duplicate_section_heading() -> None:
    scanned_warning_block = f"GOVERNMENT WARNING {TEST_GOVERNMENT_WARNING}"

    result = compare_label(
        _application(),
        _extracted(government_warning=scanned_warning_block),
    )

    assert _field(result, "government_warning").status == "FAIL"


def test_government_warning_allows_whitespace_collapse_only() -> None:
    warning_with_extra_whitespace = TEST_GOVERNMENT_WARNING.replace(
        "According to the Surgeon General,",
        "According   to\n the\tSurgeon General,",
    )

    result = compare_label(
        _application(),
        _extracted(government_warning=warning_with_extra_whitespace),
    )

    assert _field(result, "government_warning").status == "PASS"


def test_misread_government_warning_returns_extracted_text_on_failure() -> None:
    misread_warning = TEST_GOVERNMENT_WARNING.replace("pregnancy", "pregnancv")

    result = compare_label(_application(), _extracted(government_warning=misread_warning))
    warning_result = _field(result, "government_warning")

    assert warning_result.status == "FAIL"
    assert warning_result.expected == TEST_GOVERNMENT_WARNING
    assert warning_result.found == misread_warning


def test_government_warning_compares_against_submitted_application_value() -> None:
    submitted_warning = "CUSTOM WARNING: Serve chilled."

    result = compare_label(
        _application(government_warning=submitted_warning),
        _extracted(government_warning=submitted_warning),
    )

    assert _field(result, "government_warning").status == "PASS"


def test_government_warning_rejects_canonical_label_when_application_differs() -> None:
    submitted_warning = "CUSTOM WARNING: Serve chilled."

    result = compare_label(
        _application(government_warning=submitted_warning),
        _extracted(government_warning=TEST_GOVERNMENT_WARNING),
    )
    warning_result = _field(result, "government_warning")

    assert warning_result.status == "FAIL"
    assert warning_result.expected == submitted_warning


def test_any_failed_field_makes_verdict_needs_review() -> None:
    result = compare_label(_application(), _extracted(brand_name="Completely Different"))

    assert _field(result, "brand_name").status == "FAIL"
    assert result.overall_verdict == "NEEDS_REVIEW"


def test_missing_extracted_fields_fail_without_throwing() -> None:
    result = compare_label(_application(), ExtractedLabel())

    assert result.overall_verdict == "NEEDS_REVIEW"
    assert all(item.status == "FAIL" for item in result.results)
    assert _field(result, "government_warning").found is None


def test_all_passing_fields_make_verdict_approved() -> None:
    result = compare_label(_application(), _extracted())

    assert result.overall_verdict == "APPROVED"
