"""HTTP healthcheck helper for `mo doctor`.

Thin wrapper around `httpx.Client.get` that always uses a short
timeout (default 2 s — per the design's <30 s total-runtime budget)
and turns every failure mode into a uniform `HealthResult` so the
doctor catalogue doesn't have to know about httpx exceptions.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class HealthResult:
    """Outcome of a single healthcheck."""

    ok: bool
    status: int | None
    error: str | None


def http_get(
    url: str,
    *,
    timeout: float = 2.0,
    must_contain: str | None = None,
) -> HealthResult:
    """GET `url` with a short timeout.

    Returns ok=True iff:
      - the request completed,
      - the status is 2xx, and
      - if `must_contain` is given, the response body includes it.
    All exceptions are turned into ok=False with `error` populated.
    """
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.get(url)
    except httpx.TimeoutException as exc:
        return HealthResult(ok=False, status=None, error=f"timeout: {exc}")
    except httpx.HTTPError as exc:
        return HealthResult(ok=False, status=None, error=f"connect error: {exc}")

    status = response.status_code
    if not (200 <= status < 300):
        return HealthResult(ok=False, status=status, error=f"HTTP {status}")

    if must_contain is not None and must_contain not in response.text:
        return HealthResult(
            ok=False,
            status=status,
            error=f"body missing {must_contain!r}",
        )

    return HealthResult(ok=True, status=status, error=None)
