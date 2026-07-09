from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "ttb-label-verification-api",
    }


def test_config_endpoint_returns_public_batch_cap() -> None:
    client = TestClient(app)

    response = client.get("/config")

    assert response.status_code == 200
    assert response.json() == {"max_batch_size": 5}
