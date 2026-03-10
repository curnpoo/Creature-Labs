#!/usr/bin/env python3

import json
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CREATURE_FIXTURE = ROOT / "src" / "data" / "default-creatures" / "creature-5.json"
SMOKE_SIM_DURATION = 8


def find_free_port() -> int:
  with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    return int(sock.getsockname()[1])


def wait_for_server_ready(url: str, process: subprocess.Popen[str], timeout_seconds: float = 20.0) -> None:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    if process.poll() is not None:
      output = process.stdout.read() if process.stdout else ""
      raise RuntimeError(f"Vite exited before the app became reachable.\n{output}")
    try:
      with urllib.request.urlopen(url, timeout=1):
        return
    except Exception:
      time.sleep(0.25)
  raise RuntimeError(f"Timed out waiting for {url}")


def start_vite_server(port: int) -> subprocess.Popen[str]:
  base_url = f"http://127.0.0.1:{port}/"
  process = subprocess.Popen(
    ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(port)],
    cwd=ROOT,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
  )
  wait_for_server_ready(base_url, process)
  return process


def load_fixture() -> dict:
  with CREATURE_FIXTURE.open("r", encoding="utf-8") as handle:
    return json.load(handle)


def assert_between(label: str, value: float, minimum: float, maximum: float) -> None:
  if not (minimum <= value <= maximum):
    raise AssertionError(f"{label} expected {minimum}..{maximum}, got {value}")


def main() -> int:
  port = find_free_port()
  base_url = f"http://127.0.0.1:{port}/"
  server = start_vite_server(port)
  fixture = load_fixture()

  try:
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      page = browser.new_page(viewport={"width": 430, "height": 932})
      try:
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(f"{base_url}?ui=mobile&e2e=1", wait_until="networkidle")
        page.wait_for_timeout(250)
        page.click("#btn-start-draw")
        page.wait_for_function(
          "() => document.getElementById('screen-draw')?.classList.contains('active')",
          timeout=3000
        )
        page.wait_for_function("() => !!window.__creatureLabsE2E", timeout=3000)

        page.evaluate("(design) => window.__creatureLabsE2E.loadDesign(design)", fixture)
        page.evaluate("() => window.__creatureLabsE2E.goToScreen('sim')")
        page.wait_for_function(
          "() => document.getElementById('screen-sim')?.classList.contains('active')",
          timeout=3000
        )
        page.evaluate(
          f"() => window.__creatureLabsE2E.startTurboSmokeSession({{ popSize: 12, simDuration: {SMOKE_SIM_DURATION}, simSpeed: 1, testingMode: false }})"
        )

        page.wait_for_function(
          """
          () => {
            const snap = window.__creatureLabsE2E.getTurboPerfSnapshot();
            return snap.trainingMode === 'turbo' && snap.simSessionStarted;
          }
          """,
          timeout=3000
        )
        page.wait_for_function(
          """
          () => {
            const snap = window.__creatureLabsE2E.getTurboPerfSnapshot();
            return snap.turboStatus === 'running' || !!snap.lastTurboGenerationSummary;
          }
          """,
          timeout=12000
        )
        page.wait_for_timeout(4500)

        snapshot = page.evaluate("() => window.__creatureLabsE2E.getTurboPerfSnapshot()")
        assert snapshot["screen"] == "sim", "mobile turbo smoke left sim screen"
        assert snapshot["trainingMode"] == "turbo", "turbo mode did not stay active"
        assert 1 <= int(snapshot["workerCount"]) <= 4, f"mobile worker cap not applied: {snapshot['workerCount']}"
        assert not console_errors, f"Console errors detected in mobile turbo smoke: {console_errors}"

        perf = snapshot["perf"]
        ui_frame = perf["uiFrame"]
        overlay = perf["overlay"]
        chart = perf["chart"]

        assert ui_frame["count"] >= 8, f"insufficient turbo UI samples: {ui_frame}"
        assert overlay["count"] >= 8, f"insufficient turbo overlay samples: {overlay}"
        assert chart["count"] >= 3, f"insufficient turbo chart samples: {chart}"

        assert_between("mobile turbo UI avg cadence", float(ui_frame["avgMs"]), 90.0, 190.0)
        assert_between("mobile turbo overlay avg cadence", float(overlay["avgMs"]), 90.0, 190.0)
        assert_between("mobile turbo chart avg cadence", float(chart["avgMs"]), 100.0, 320.0)

        diagnostics = snapshot.get("lastTurboDiagnostics") or {}
        throughput = float(diagnostics.get("throughputX") or 0.0)
        if throughput <= 0:
          worker_elapsed_ms = float(
            diagnostics.get("workerElapsedMs")
            or (snapshot.get("lastTurboGenerationSummary") or {}).get("elapsedMs")
            or 0.0
          )
          if worker_elapsed_ms > 0:
            throughput = (SMOKE_SIM_DURATION * 1000.0) / worker_elapsed_ms
        if throughput <= 0:
          raise AssertionError(f"turbo throughput missing from snapshot: {snapshot}")

        summary = {
          "workerCount": snapshot["workerCount"],
          "generation": snapshot["generation"],
          "turboStatus": snapshot["turboStatus"],
          "fpsSmoothed": round(float(snapshot["fpsSmoothed"]), 2),
          "throughputX": round(throughput, 2),
          "uiFrameAvgMs": round(float(ui_frame["avgMs"]), 2),
          "overlayAvgMs": round(float(overlay["avgMs"]), 2),
          "chartAvgMs": round(float(chart["avgMs"]), 2),
          "allTimeBest": round(float(snapshot["allTimeBest"]), 2)
        }
        print(json.dumps(summary, indent=2))
      finally:
        browser.close()
  finally:
    server.terminate()
    try:
      server.wait(timeout=5)
    except subprocess.TimeoutExpired:
      server.kill()
      server.wait(timeout=5)

  return 0


if __name__ == "__main__":
  try:
    raise SystemExit(main())
  except AssertionError as exc:
    print(f"Mobile turbo smoke failed: {exc}", file=sys.stderr)
    raise SystemExit(1)
  except Exception as exc:
    print(f"Mobile turbo smoke errored: {exc}", file=sys.stderr)
    raise SystemExit(1)
