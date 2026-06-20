import json
from io import BytesIO

import pytest
from PIL import Image

from app.models import ExtractedLabel
from app.vision import (
    OPENAI_RESPONSES_URL,
    FakeVisionService,
    OpenAIVisionService,
    VisionConfigurationError,
    VisionServiceError,
    parse_extracted_label_response,
    preprocess_image,
)
from app.config import Settings


def _image_bytes(width: int = 20, height: int = 20, image_format: str = "PNG") -> bytes:
    image = Image.new("RGB", (width, height), color=(255, 255, 255))
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


JPEG_IMAGE_BYTES = _image_bytes(image_format="JPEG")
PNG_IMAGE_BYTES = _image_bytes(image_format="PNG")


def test_fake_vision_service_returns_configured_label() -> None:
    expected = ExtractedLabel(
        brand_name="Example Reserve",
        class_type="Whiskey",
        abv="45%",
        net_contents="750 mL",
        producer="Example Distilling Co.",
        country_of_origin="USA",
        government_warning="GOVERNMENT WARNING: exact text",
        raw_text="label text",
        extraction_confidence=0.82,
    )

    service = FakeVisionService(expected)

    assert service.extract(JPEG_IMAGE_BYTES, "image/jpeg") == expected


def test_fake_vision_service_can_return_partial_label_for_imperfect_images() -> None:
    partial = ExtractedLabel(
        brand_name="Example Reserve",
        class_type=None,
        abv="45%",
        net_contents=None,
        producer=None,
        country_of_origin="USA",
        government_warning=None,
        raw_text="Example Reserve 45% USA",
        extraction_confidence=0.42,
    )

    service = FakeVisionService(partial)

    assert service.extract(JPEG_IMAGE_BYTES, "image/jpeg") == partial


def test_preprocess_rejects_empty_images() -> None:
    with pytest.raises(VisionServiceError, match="empty"):
        preprocess_image(b"", "image/jpeg")


def test_preprocess_rejects_unsupported_image_type() -> None:
    with pytest.raises(VisionServiceError, match="Unsupported"):
        preprocess_image(PNG_IMAGE_BYTES, "application/pdf")


def test_preprocess_rejects_images_over_size_budget() -> None:
    with pytest.raises(VisionServiceError, match="too large"):
        preprocess_image(b"12345", "image/jpeg", max_image_bytes=4)


def test_preprocess_downscales_and_reencodes_to_jpeg() -> None:
    processed = preprocess_image(_image_bytes(width=2400, height=1200), "image/png")

    with Image.open(BytesIO(processed.data)) as image:
        assert processed.content_type == "image/jpeg"
        assert max(image.size) <= 1600


def test_preprocess_rejects_undecodable_image_bytes() -> None:
    with pytest.raises(VisionServiceError, match="decoded"):
        preprocess_image(b"not an image", "image/jpeg")


def test_openai_vision_service_requires_api_key() -> None:
    service = OpenAIVisionService(settings=Settings(openai_api_key=None))

    with pytest.raises(VisionConfigurationError, match="OPENAI_API_KEY"):
        service.extract(JPEG_IMAGE_BYTES, "image/jpeg")


def test_openai_vision_service_sends_structured_image_request() -> None:
    captured = {}

    def fake_post(url, payload, headers, timeout_seconds):
        captured["url"] = url
        captured["payload"] = payload
        captured["headers"] = headers
        captured["timeout_seconds"] = timeout_seconds
        return {
            "output_text": json.dumps(
                {
                    "brand_name": "Example Reserve",
                    "class_type": "Whiskey",
                    "abv": "45%",
                    "net_contents": "750 mL",
                    "producer": "Example Distilling Co.",
                    "country_of_origin": "USA",
                    "government_warning": None,
                    "raw_text": "Example Reserve Whiskey",
                    "extraction_confidence": 0.7,
                }
            )
        }

    service = OpenAIVisionService(
        settings=Settings(
            openai_api_key="test-key",
            vision_model="test-model",
            vision_timeout_seconds=3,
        ),
        http_post=fake_post,
    )

    extracted = service.extract(PNG_IMAGE_BYTES, "image/png")

    assert extracted.brand_name == "Example Reserve"
    assert captured["url"] == OPENAI_RESPONSES_URL
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["timeout_seconds"] == 3
    assert captured["payload"]["model"] == "test-model"
    assert captured["payload"]["text"]["format"]["type"] == "json_schema"
    assert captured["payload"]["input"][0]["content"][1]["image_url"].startswith(
        "data:image/jpeg;base64,"
    )


def test_openai_vision_service_wraps_timeout() -> None:
    def timeout_post(url, payload, headers, timeout_seconds):
        raise TimeoutError

    service = OpenAIVisionService(
        settings=Settings(openai_api_key="test-key"),
        http_post=timeout_post,
    )

    with pytest.raises(VisionServiceError, match="timed out"):
        service.extract(JPEG_IMAGE_BYTES, "image/jpeg")


def test_parse_response_accepts_nested_responses_output_text() -> None:
    response = {
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(
                            {
                                "brand_name": None,
                                "class_type": None,
                                "abv": None,
                                "net_contents": None,
                                "producer": None,
                                "country_of_origin": None,
                                "government_warning": None,
                                "raw_text": None,
                                "extraction_confidence": None,
                            }
                        ),
                    }
                ],
            }
        ]
    }

    extracted = parse_extracted_label_response(response)

    assert extracted == ExtractedLabel()


def test_parse_response_rejects_malformed_json() -> None:
    with pytest.raises(VisionServiceError, match="malformed JSON"):
        parse_extracted_label_response({"output_text": "{not json"})
