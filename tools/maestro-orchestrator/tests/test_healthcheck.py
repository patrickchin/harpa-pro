"""Tests for the httpx-based healthcheck helper."""

from __future__ import annotations

import httpx
import pytest

from maestro_orchestrator import healthcheck


def _patch_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    """Replace healthcheck.httpx.Client with one wired to a MockTransport."""
    real_client = httpx.Client
    transport = httpx.MockTransport(handler)

    def _factory(**kw):
        kw.pop("transport", None)
        return real_client(transport=transport, **kw)

    monkeypatch.setattr(healthcheck.httpx, "Client", _factory)


def test_http_get_success_returns_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/healthz"
        return httpx.Response(200, text="ok")

    _patch_transport(monkeypatch, handler)

    result = healthcheck.http_get("http://localhost:8787/healthz", timeout=1.0)
    assert result.ok is True
    assert result.status == 200
    assert result.error is None


def test_http_get_non_2xx_is_not_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="down")

    _patch_transport(monkeypatch, handler)

    result = healthcheck.http_get("http://localhost:8787/healthz", timeout=1.0)
    assert result.ok is False
    assert result.status == 503


def test_http_get_timeout_returns_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    _patch_transport(monkeypatch, handler)

    result = healthcheck.http_get("http://localhost:8081/status", timeout=0.5)
    assert result.ok is False
    assert result.status is None
    assert result.error is not None
    assert "timed out" in result.error.lower() or "timeout" in result.error.lower()


def test_http_get_connect_error_returns_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    _patch_transport(monkeypatch, handler)

    result = healthcheck.http_get("http://localhost:9999/", timeout=0.5)
    assert result.ok is False
    assert result.error is not None
    assert "refused" in result.error.lower() or "connect" in result.error.lower()


def test_body_contains_substring(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="packager-status:running")

    _patch_transport(monkeypatch, handler)

    result = healthcheck.http_get(
        "http://localhost:8081/status", timeout=1.0, must_contain="packager-status"
    )
    assert result.ok is True


def test_body_missing_substring_is_not_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="something else")

    _patch_transport(monkeypatch, handler)

    result = healthcheck.http_get(
        "http://localhost:8081/status", timeout=1.0, must_contain="packager-status"
    )
    assert result.ok is False
    assert result.error is not None
    assert "packager-status" in result.error
