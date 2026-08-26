#!/usr/bin/env python3
"""Read-only Phase 7 verification against the public HTTPS deployment."""

import argparse
import json
import sys
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


def fetch_json(url, *, origin=None):
    headers = {"Accept": "application/json", "User-Agent": "nexora-deployment-smoke/1"}
    if origin:
        headers["Origin"] = origin
    with urlopen(Request(url, headers=headers), timeout=15) as response:
        return json.load(response), response.headers


def require(condition, message, failures):
    print(("PASS" if condition else "FAIL") + f"  {message}")
    if not condition:
        failures.append(message)


def checked_fetch(url, label, failures, *, origin=None):
    try:
        payload, headers = fetch_json(url, origin=origin)
    except Exception as exc:
        require(False, f"{label} is reachable JSON ({type(exc).__name__})", failures)
        return {}, {}
    require(True, f"{label} is reachable JSON", failures)
    return payload, headers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend-url", required=True)
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--expected-release")
    parser.add_argument("--allow-pending-schedulers", action="store_true")
    args = parser.parse_args()
    frontend = args.frontend_url.rstrip("/") + "/"
    api = args.api_url.rstrip("/") + "/"
    failures = []

    for label, value in (("frontend", frontend), ("API", api)):
        parsed = urlparse(value)
        require(parsed.scheme == "https" and parsed.hostname not in {"localhost", "127.0.0.1"}, f"{label} uses public HTTPS", failures)
    if failures:
        return 2

    marker, _ = checked_fetch(urljoin(frontend, "nexora-deployment.json"), "frontend marker", failures)
    require(marker.get("application") == "nexora-agentic-commerce", "frontend is the Nexora build", failures)
    readiness, headers = checked_fetch(
        urljoin(api, "health/ready/"),
        "API readiness",
        failures,
        origin=frontend.rstrip("/"),
    )
    require(readiness.get("status") == "ready", "API readiness passes", failures)
    require(readiness.get("mode") == "razorpay_test_only", "live Razorpay mode is disabled", failures)
    require(bool(readiness.get("database", {}).get("pgvector_version")), "pgvector extension is installed", failures)
    require(readiness.get("database", {}).get("hnsw_index") is True, "HNSW index is installed", failures)
    require(headers.get("Access-Control-Allow-Origin") == frontend.rstrip("/"), "CORS allows only the deployed frontend", failures)
    if args.expected_release:
        require(readiness.get("release") == args.expected_release, "API runs the expected release", failures)
    schedulers = readiness.get("schedulers", {}).get("jobs", {})
    schedulers_ready = len(schedulers) == 2 and all(job.get("healthy") for job in schedulers.values())
    require(schedulers_ready or args.allow_pending_schedulers, "expiry and reconciliation heartbeats are fresh", failures)
    api_origin = f"{urlparse(api).scheme}://{urlparse(api).netloc}/"
    capability, _ = checked_fetch(
        urljoin(api_origin, ".well-known/nexora-commerce.json"),
        "commerce capability",
        failures,
    )
    require(bool(capability), "agent commerce capability document is public", failures)
    if failures:
        print(f"\n{len(failures)} deployment check(s) failed.", file=sys.stderr)
        return 1
    print("\nPhase 7 public deployment smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
