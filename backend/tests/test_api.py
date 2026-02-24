from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_demo_mode_runs_end_to_end():
    client = TestClient(app)
    payload = {
        "use_demo": True,
        "project": {
            "timezone": "UTC",
            "site_latitude": 51.5074,
            "site_longitude": -0.1278,
            "deliverability_km": 20,
            "fill_strategy": "reject",
            "emissions_mode": "operational",
        },
        "load_series": [],
        "resources": [],
        "grid": {"ef_input_mode": "country_default", "country_code": "GB"},
    }
    res = client.post('/api/simulate', json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["summary"]["eligible"]["total_load_kwh"] > 0
    assert "views" in body and "eligible" in body["views"] and "physical" in body["views"]
    assert "report_html" in body


def test_defaults_endpoint_available():
    client = TestClient(app)
    res = client.get('/api/defaults')
    assert res.status_code == 200
    body = res.json()
    assert "technology_efs" in body
    assert "grid_intensity" in body
    assert "demo" in body
