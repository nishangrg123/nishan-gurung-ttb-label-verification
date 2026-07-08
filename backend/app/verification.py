import json
import time
from functools import lru_cache

from pydantic import ValidationError

from app.comparison import compare_label
from app.models import ApplicationData, VerificationResult
from app.config import get_settings
from app.vision import OpenAIVisionService, VisionService


def get_vision_service() -> VisionService:
    return get_real_vision_service()


@lru_cache
def get_real_vision_service() -> VisionService:
    return OpenAIVisionService()


def parse_application_data(application_data: str) -> ApplicationData:
    try:
        payload = json.loads(application_data)
    except json.JSONDecodeError as exc:
        raise ValueError("application_data must be valid JSON.") from exc

    try:
        return ApplicationData.model_validate(payload)
    except ValidationError as exc:
        raise ValueError("application_data is missing required fields or has invalid values.") from exc


def verify_label(
    image_bytes: bytes,
    content_type: str,
    application: ApplicationData,
    vision_service: VisionService,
) -> VerificationResult:
    started_at = time.perf_counter()
    extracted = vision_service.extract(image_bytes, content_type)
    latency_ms = round((time.perf_counter() - started_at) * 1000, 2)

    return compare_label(application, extracted, latency_ms=latency_ms)
