import asyncio
import json

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.config import get_settings
from app.models import (
    ApplicationData,
    BatchItemResult,
    BatchSummary,
    BatchVerificationResponse,
    VerificationResult,
)
from app.verification import get_vision_service, parse_application_data, verify_label
from app.vision import ALLOWED_IMAGE_TYPES, VisionService, VisionServiceError


settings = get_settings()

app = FastAPI(
    title="TTB Label Verification API",
    version="0.1.0",
    description="Stateless API for TTB alcohol beverage label verification.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ttb-label-verification-api"}


@app.get("/config")
def public_config() -> dict[str, int]:
    return {"max_batch_size": settings.max_batch_size}


@app.post("/verify")
async def verify(
    image: UploadFile = File(...),
    application_data: str = Form(...),
    vision_service: VisionService = Depends(get_vision_service),
):
    try:
        application = parse_application_data(application_data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return await _verify_uploaded_image(image, application, vision_service)
    except VisionServiceError as exc:
        status_code = 400 if str(exc) in {
            "Unsupported image type. Use JPEG, PNG, or WebP.",
            "Image file is empty.",
            "Image is too large for fast extraction.",
        } else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@app.post("/verify/batch")
async def verify_batch(
    images: list[UploadFile] = File(...),
    application_data: str = Form(...),
    vision_service: VisionService = Depends(get_vision_service),
) -> BatchVerificationResponse:
    if not images:
        raise HTTPException(status_code=422, detail="Batch must include at least one image.")
    if len(images) > settings.max_batch_size:
        raise HTTPException(
            status_code=422,
            detail=f"Batch cannot include more than {settings.max_batch_size} labels.",
        )

    applications = parse_batch_application_data(application_data)
    if len(applications) != len(images):
        raise HTTPException(
            status_code=422,
            detail="Number of images must match number of application data records.",
        )

    concurrency = max(1, settings.batch_concurrency)
    semaphore = asyncio.Semaphore(concurrency)
    tasks = [
        verify_batch_item(index, image, applications[index], vision_service, semaphore)
        for index, image in enumerate(images)
    ]
    items = list(await asyncio.gather(*tasks))

    summary = BatchSummary(
        passed=sum(
            1
            for item in items
            if item.result is not None and item.result.overall_verdict == "APPROVED"
        ),
        needs_review=sum(
            1
            for item in items
            if item.result is not None and item.result.overall_verdict == "NEEDS_REVIEW"
        ),
        total=len(items),
    )

    return BatchVerificationResponse(summary=summary, items=items)


def parse_batch_application_data(application_data: str) -> list[ApplicationData]:
    try:
        payload = json.loads(application_data)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="application_data must be a valid JSON array.",
        ) from exc

    if not isinstance(payload, list):
        raise HTTPException(
            status_code=422,
            detail="application_data must be a JSON array.",
        )
    if not payload:
        raise HTTPException(
            status_code=422,
            detail="Batch must include at least one application data record.",
        )

    try:
        return [ApplicationData.model_validate(item) for item in payload]
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Each application data record must include all required fields.",
        ) from exc


async def verify_batch_item(
    index: int,
    image: UploadFile,
    application: ApplicationData,
    vision_service: VisionService,
    semaphore: asyncio.Semaphore,
) -> BatchItemResult:
    filename = image.filename or f"label-{index + 1}"

    async with semaphore:
        try:
            result = await _verify_uploaded_image(image, application, vision_service)
        except VisionServiceError as exc:
            return BatchItemResult(
                index=index,
                filename=filename,
                status="ERROR",
                error=str(exc),
            )

    return BatchItemResult(
        index=index,
        filename=filename,
        status="COMPLETED",
        result=result,
    )


async def _verify_uploaded_image(
    image: UploadFile,
    application: ApplicationData,
    vision_service: VisionService,
) -> VerificationResult:
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise VisionServiceError("Unsupported image type. Use JPEG, PNG, or WebP.")

    image_bytes = await image.read()
    if not image_bytes:
        raise VisionServiceError("Image file is empty.")
    if len(image_bytes) > settings.max_image_bytes:
        raise VisionServiceError("Image is too large for fast extraction.")

    return await asyncio.to_thread(
        verify_label,
        image_bytes=image_bytes,
        content_type=image.content_type,
        application=application,
        vision_service=vision_service,
    )
