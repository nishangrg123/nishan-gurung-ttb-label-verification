import argparse
import json
import mimetypes
import ssl
import uuid
from pathlib import Path
from urllib import error, request

import certifi


DEFAULT_BASE_URL = "https://ttb-label-verification-api.onrender.com"
DEFAULT_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not "
    "drink alcoholic beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or "
    "operate machinery, and may cause health problems."
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke test the deployed /verify endpoint.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--image",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "samples" / "sample-label.png",
    )
    args = parser.parse_args()

    payload = _post_verify(args.base_url.rstrip("/"), args.image)
    _assert_verification_shape(payload)
    print(json.dumps({
        "status": "ok",
        "overall_verdict": payload["overall_verdict"],
        "latency_ms": payload["latency_ms"],
    }, indent=2))


def _post_verify(base_url: str, image_path: Path) -> dict:
    if not image_path.exists():
        raise SystemExit(f"Sample image not found: {image_path}")

    boundary = f"----ttb-live-check-{uuid.uuid4().hex}"
    content_type = mimetypes.guess_type(image_path.name)[0] or "image/png"
    application_data = {
        "brand_name": "Example Reserve",
        "class_type": "Whiskey",
        "abv": "45%",
        "net_contents": "750 mL",
        "producer": "Example Distilling Co.",
        "country_of_origin": "United States",
        "government_warning": DEFAULT_WARNING,
    }
    body = _multipart_body(
        boundary,
        fields={"application_data": json.dumps(application_data)},
        files={
            "image": (
                image_path.name,
                content_type,
                image_path.read_bytes(),
            )
        },
    )

    live_request = request.Request(
        f"{base_url}/verify",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        context = ssl.create_default_context(cafile=certifi.where())
        with request.urlopen(live_request, timeout=70, context=context) as response:
            response_body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Live /verify failed with {exc.code}: {detail}") from exc
    except OSError as exc:
        raise SystemExit(f"Live /verify request failed: {exc}") from exc

    return json.loads(response_body)


def _multipart_body(
    boundary: str,
    fields: dict[str, str],
    files: dict[str, tuple[str, str, bytes]],
) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(),
            b"\r\n",
        ])

    for name, (filename, content_type, content) in files.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{filename}"\r\n'
            ).encode(),
            f"Content-Type: {content_type}\r\n\r\n".encode(),
            content,
            b"\r\n",
        ])

    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks)


def _assert_verification_shape(payload: dict) -> None:
    required_keys = {"results", "overall_verdict", "latency_ms"}
    if not required_keys.issubset(payload):
        raise SystemExit(f"Unexpected response keys: {sorted(payload)}")
    if payload["overall_verdict"] not in {"APPROVED", "NEEDS_REVIEW"}:
        raise SystemExit(f"Unexpected verdict: {payload['overall_verdict']}")
    if not isinstance(payload["latency_ms"], int | float):
        raise SystemExit("latency_ms must be numeric")
    if not isinstance(payload["results"], list) or len(payload["results"]) != 7:
        raise SystemExit("results must contain seven field results")

    for item in payload["results"]:
        item_keys = {"field", "match_type", "expected", "found", "status"}
        if not item_keys.issubset(item):
            raise SystemExit(f"Unexpected field result shape: {item}")
        if item["status"] not in {"PASS", "FAIL"}:
            raise SystemExit(f"Unexpected field status: {item['status']}")


if __name__ == "__main__":
    main()
