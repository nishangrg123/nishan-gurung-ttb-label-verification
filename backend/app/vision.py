import base64
import io
import json
import ssl
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import certifi
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.models import ExtractedLabel


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

VISION_EXTRACTION_PROMPT = """
Extract structured fields from this alcohol beverage label image.

Return only the requested schema fields. If a value is absent, obscured, blurry,
or uncertain, return null for that field instead of guessing.

Fields:
- brand_name
- class_type
- abv
- net_contents
- producer
- country_of_origin
- government_warning
- raw_text
- extraction_confidence

Copy the government warning exactly as printed, preserving case and punctuation.
The comparison engine is case-sensitive for that field.
""".strip()


class VisionServiceError(RuntimeError):
    pass


class VisionConfigurationError(VisionServiceError):
    pass


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    content_type: str


HttpPost = Callable[[str, dict[str, Any], dict[str, str], float], dict[str, Any]]


class VisionService:
    def extract(self, image_bytes: bytes, content_type: str) -> ExtractedLabel:
        raise NotImplementedError


class FakeVisionService(VisionService):
    def __init__(self, extracted_label: ExtractedLabel | None = None) -> None:
        self.extracted_label = extracted_label or ExtractedLabel()

    def extract(self, image_bytes: bytes, content_type: str) -> ExtractedLabel:
        preprocess_image(image_bytes, content_type)
        return self.extracted_label


class OpenAIVisionService(VisionService):
    def __init__(
        self,
        settings: Settings | None = None,
        http_post: HttpPost | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.http_post = http_post or _post_json

    def extract(self, image_bytes: bytes, content_type: str) -> ExtractedLabel:
        if not self.settings.openai_api_key:
            raise VisionConfigurationError("OPENAI_API_KEY is required for real vision extraction.")

        processed_image = preprocess_image(
            image_bytes,
            content_type,
            max_image_bytes=self.settings.max_image_bytes,
            max_image_dimension=self.settings.max_image_dimension,
        )
        payload = _build_responses_payload(processed_image, self.settings.vision_model)
        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = self.http_post(
                OPENAI_RESPONSES_URL,
                payload,
                headers,
                self.settings.vision_timeout_seconds,
            )
        except TimeoutError as exc:
            raise VisionServiceError("Vision model request timed out.") from exc
        except OSError as exc:
            raise VisionServiceError(f"Vision model request failed: {exc}") from exc

        return parse_extracted_label_response(response)


def preprocess_image(
    image_bytes: bytes,
    content_type: str,
    max_image_bytes: int = 4_000_000,
    max_image_dimension: int = 1600,
) -> ProcessedImage:
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise VisionServiceError("Unsupported image type. Use JPEG, PNG, or WebP.")
    if not image_bytes:
        raise VisionServiceError("Image file is empty.")
    if len(image_bytes) > max_image_bytes:
        raise VisionServiceError("Image is too large for fast extraction.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.thumbnail((max_image_dimension, max_image_dimension))
            rgb_image = image.convert("RGB")
            output = io.BytesIO()
            rgb_image.save(output, format="JPEG", quality=82, optimize=True)
    except UnidentifiedImageError as exc:
        raise VisionServiceError("Image could not be decoded.") from exc
    except OSError as exc:
        raise VisionServiceError("Image preprocessing failed.") from exc

    return ProcessedImage(data=output.getvalue(), content_type="image/jpeg")


def parse_extracted_label_response(response: dict[str, Any]) -> ExtractedLabel:
    output_text = _extract_output_text(response)
    if not output_text:
        raise VisionServiceError("Vision model returned no structured output.")

    try:
        payload = json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise VisionServiceError("Vision model returned malformed JSON.") from exc

    try:
        return ExtractedLabel.model_validate(payload)
    except ValidationError as exc:
        raise VisionServiceError("Vision model output did not match ExtractedLabel.") from exc


def _build_responses_payload(processed_image: ProcessedImage, model: str) -> dict[str, Any]:
    encoded_image = base64.b64encode(processed_image.data).decode("ascii")
    image_url = f"data:{processed_image.content_type};base64,{encoded_image}"

    return {
        "model": model,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": VISION_EXTRACTION_PROMPT},
                    {"type": "input_image", "image_url": image_url},
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "extracted_label",
                "strict": True,
                "schema": _extracted_label_json_schema(),
            }
        },
    }


def _extracted_label_json_schema() -> dict[str, Any]:
    nullable_string = {"type": ["string", "null"]}

    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "brand_name": nullable_string,
            "class_type": nullable_string,
            "abv": nullable_string,
            "net_contents": nullable_string,
            "producer": nullable_string,
            "country_of_origin": nullable_string,
            "government_warning": nullable_string,
            "raw_text": nullable_string,
            "extraction_confidence": {
                "anyOf": [
                    {"type": "number", "minimum": 0, "maximum": 1},
                    {"type": "null"},
                ]
            },
        },
        "required": [
            "brand_name",
            "class_type",
            "abv",
            "net_contents",
            "producer",
            "country_of_origin",
            "government_warning",
            "raw_text",
            "extraction_confidence",
        ],
    }


def _extract_output_text(response: dict[str, Any]) -> str | None:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]

    for output_item in response.get("output", []):
        if output_item.get("type") != "message":
            continue
        for content_item in output_item.get("content", []):
            text = content_item.get("text")
            if isinstance(text, str):
                return text

    return None


def _post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout_seconds: float,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout_seconds,
            context=ssl_context,
        ) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise VisionServiceError(f"Vision model request failed with status {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise VisionServiceError(f"Vision model request failed: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise VisionServiceError("Vision model returned an unreadable response.") from exc
