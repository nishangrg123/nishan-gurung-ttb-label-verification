import argparse
import json
import mimetypes
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.vision import OpenAIVisionService, VisionServiceError


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Phase 2 vision extraction on one label image.")
    parser.add_argument("image_path", type=Path)
    args = parser.parse_args()

    content_type = mimetypes.guess_type(args.image_path.name)[0] or "image/jpeg"
    image_bytes = args.image_path.read_bytes()

    try:
        extracted = OpenAIVisionService().extract(image_bytes, content_type)
    except VisionServiceError as exc:
        raise SystemExit(f"Vision extraction failed: {exc}") from exc

    print(json.dumps(extracted.model_dump(), indent=2))


if __name__ == "__main__":
    main()
