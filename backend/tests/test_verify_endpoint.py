import json
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app import main as main_module
from app.comparison import CANONICAL_GOVERNMENT_WARNING
from app.config import get_settings
from app.main import app
from app.models import ExtractedLabel
from app.verification import get_vision_service
from app.vision import FakeVisionService, VisionService, VisionServiceError


def _image_bytes() -> bytes:
    image = Image.new("RGB", (20, 20), color=(255, 255, 255))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _application_data(**overrides: str) -> str:
    data = {
        "brand_name": "Example Reserve",
        "class_type": "Whiskey",
        "abv": "45%",
        "net_contents": "750 mL",
        "producer": "Example Distilling Co.",
        "country_of_origin": "United States",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
    }
    data.update(overrides)
    return json.dumps(data)


def _extracted_label(**overrides: str | None) -> ExtractedLabel:
    data = {
        "brand_name": "Example Reserve",
        "class_type": "Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750ml",
        "producer": "Example Distilling Co.",
        "country_of_origin": "USA",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
    }
    data.update(overrides)
    return ExtractedLabel(**data)


def _client_with_vision(vision_service: VisionService) -> TestClient:
    app.dependency_overrides[get_vision_service] = lambda: vision_service
    return TestClient(app)


def _post_verify(client: TestClient, application_data: str | None = None, content_type: str = "image/png"):
    data = {}
    if application_data is not None:
        data["application_data"] = application_data

    return client.post(
        "/verify",
        data=data,
        files={"image": ("label.png", _image_bytes(), content_type)},
    )


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_verify_returns_approved_result_for_matching_label() -> None:
    client = _client_with_vision(FakeVisionService(_extracted_label()))

    response = _post_verify(client, _application_data())

    assert response.status_code == 200
    payload = response.json()
    assert payload["overall_verdict"] == "APPROVED"
    assert isinstance(payload["latency_ms"], float | int)
    assert len(payload["results"]) == 7


def test_get_vision_service_can_use_fake_vision_for_local_checks() -> None:
    settings = get_settings()
    original_use_fake_vision = settings.use_fake_vision
    settings.use_fake_vision = True

    try:
        assert isinstance(get_vision_service(), FakeVisionService)
    finally:
        settings.use_fake_vision = original_use_fake_vision


def test_verify_returns_needs_review_for_mismatch() -> None:
    client = _client_with_vision(FakeVisionService(_extracted_label(brand_name="Different Brand")))

    response = _post_verify(client, _application_data())

    assert response.status_code == 200
    payload = response.json()
    brand_result = next(item for item in payload["results"] if item["field"] == "brand_name")
    assert payload["overall_verdict"] == "NEEDS_REVIEW"
    assert brand_result["status"] == "FAIL"
    assert brand_result["expected"] == "Example Reserve"
    assert brand_result["found"] == "Different Brand"


def test_verify_surfaces_extracted_warning_text_on_failure() -> None:
    misread_warning = CANONICAL_GOVERNMENT_WARNING.replace("pregnancy", "pregnancv")
    client = _client_with_vision(
        FakeVisionService(_extracted_label(government_warning=misread_warning))
    )

    response = _post_verify(client, _application_data())

    assert response.status_code == 200
    warning_result = next(
        item for item in response.json()["results"] if item["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] == misread_warning


def test_verify_rejects_bad_file_type_before_vision_call() -> None:
    client = _client_with_vision(FailingVisionService())

    response = _post_verify(client, _application_data(), content_type="application/pdf")

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported image type. Use JPEG, PNG, or WebP."


def test_verify_rejects_empty_image() -> None:
    client = _client_with_vision(FakeVisionService(_extracted_label()))

    response = client.post(
        "/verify",
        data={"application_data": _application_data()},
        files={"image": ("label.png", b"", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Image file is empty."


def test_verify_rejects_oversized_image_before_vision_call() -> None:
    client = _client_with_vision(FailingVisionService())
    original_max_image_bytes = main_module.settings.max_image_bytes
    main_module.settings.max_image_bytes = 4

    try:
        response = _post_verify(client, _application_data())
    finally:
        main_module.settings.max_image_bytes = original_max_image_bytes

    assert response.status_code == 400
    assert response.json()["detail"] == "Image is too large for fast extraction."


def test_verify_rejects_missing_application_data() -> None:
    client = _client_with_vision(FakeVisionService(_extracted_label()))

    response = _post_verify(client)

    assert response.status_code == 422


def test_verify_rejects_malformed_application_json() -> None:
    client = _client_with_vision(FakeVisionService(_extracted_label()))

    response = _post_verify(client, "{not json")

    assert response.status_code == 422
    assert response.json()["detail"] == "application_data must be valid JSON."


def test_verify_rejects_missing_application_field() -> None:
    data = json.loads(_application_data())
    del data["brand_name"]
    client = _client_with_vision(FakeVisionService(_extracted_label()))

    response = _post_verify(client, json.dumps(data))

    assert response.status_code == 422
    assert "application_data is missing required fields" in response.json()["detail"]


def test_verify_maps_vision_service_failure_to_readable_error() -> None:
    client = _client_with_vision(FailingVisionService())

    response = _post_verify(client, _application_data())

    assert response.status_code == 502
    assert response.json()["detail"] == "Vision model request timed out."


def test_verify_allows_partial_extracted_label_and_returns_needs_review() -> None:
    client = _client_with_vision(
        FakeVisionService(
            ExtractedLabel(
                brand_name="Example Reserve",
                abv="45%",
                raw_text="Example Reserve 45%",
                extraction_confidence=0.4,
            )
        )
    )

    response = _post_verify(client, _application_data())

    assert response.status_code == 200
    payload = response.json()
    class_result = next(item for item in payload["results"] if item["field"] == "class_type")
    assert payload["overall_verdict"] == "NEEDS_REVIEW"
    assert class_result["status"] == "FAIL"
    assert class_result["found"] is None


class FailingVisionService(VisionService):
    def extract(self, image_bytes: bytes, content_type: str) -> ExtractedLabel:
        raise VisionServiceError("Vision model request timed out.")
