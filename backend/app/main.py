from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
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


@app.post("/verify")
async def verify(
    image: UploadFile = File(...),
    application_data: str = Form(...),
    vision_service: VisionService = Depends(get_vision_service),
):
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use JPEG, PNG, or WebP.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    if len(image_bytes) > settings.max_image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Image is too large for fast extraction.",
        )

    try:
        application = parse_application_data(application_data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return verify_label(
            image_bytes=image_bytes,
            content_type=image.content_type,
            application=application,
            vision_service=vision_service,
        )
    except VisionServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
