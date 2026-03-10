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


def load_app(page, base_url: str, fixture: dict) -> None:
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


def measure_throughput(snapshot: dict) -> float:
  summary = snapshot.get("lastTurboGenerationSummary") or {}
  diagnostics = snapshot.get("lastTurboDiagnostics") or {}
  throughput = float(summary.get("wallThroughputX") or diagnostics.get("wallThroughputX") or 0.0)
  if throughput <= 0:
    worker_elapsed_ms = float(
      summary.get("elapsedMs")
      or diagnostics.get("wallElapsedMs")
      or 0.0
    )
    if worker_elapsed_ms > 0:
      throughput = (SMOKE_SIM_DURATION * 1000.0) / worker_elapsed_ms
  if throughput <= 0:
    raise AssertionError(f"turbo throughput missing from snapshot: {snapshot}")
  return throughput


def run_mobile_turbo_session(page, render_mode: str) -> dict:
  console_errors = []
  page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

  page.evaluate(
    f"() => window.__creatureLabsE2E.startTurboSmokeSession({{ popSize: 12, simDuration: {SMOKE_SIM_DURATION}, simSpeed: 1, testingMode: false, renderMode: '{render_mode}' }})"
  )

  page.wait_for_function(
    """
    () => {
      const snap = window.__creatureLabsE2E.getTurboPerfSnapshot();
      return snap.trainingMode === 'turbo' && snap.simSessionStarted;
    }
    """,
    timeout=12000
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

  if render_mode == "headless":
    page.click("#btn-mq-settings")
    page.wait_for_function(
      "() => document.body.classList.contains('mobile-sheet-open') && document.body.classList.contains('mobile-sheet-controls')",
      timeout=3000
    )
    page.click("#btn-mobile-panel-back")
    page.wait_for_function(
      "() => !document.body.classList.contains('mobile-sheet-open')",
      timeout=3000
    )
    page.wait_for_timeout(200)

  snapshot = page.evaluate("() => window.__creatureLabsE2E.getTurboPerfSnapshot()")
  assert snapshot["screen"] == "sim", "mobile turbo smoke left sim screen"
  assert snapshot["trainingMode"] == "turbo", "turbo mode did not stay active"
  assert 1 <= int(snapshot["workerCount"]) <= 6, f"mobile worker cap not applied: {snapshot['workerCount']}"
  assert snapshot.get("crossOriginIsolated") is True, "local turbo smoke should run on an isolated origin"
  assert not console_errors, f"Console errors detected in mobile turbo smoke: {console_errors}"

  perf = snapshot["perf"]
  ui_frame = perf["uiFrame"]
  overlay = perf["overlay"]
  chart = perf["chart"]
  ruler = perf["ruler"]

  assert ui_frame["count"] >= 6, f"insufficient turbo UI samples: {ui_frame}"
  assert overlay["count"] >= 6, f"insufficient turbo overlay samples: {overlay}"
  assert chart["count"] >= 1, f"insufficient turbo chart samples: {chart}"
  assert ruler["count"] >= 1, f"insufficient turbo ruler samples: {ruler}"

  if render_mode == "headless":
    assert snapshot["mobileTurboHeadless"] is True, "headless turbo mode not active"
    assert snapshot["mobileTurboRenderMode"] == "headless", f"unexpected render mode: {snapshot['mobileTurboRenderMode']}"
    assert_between("mobile headless turbo UI avg cadence", float(ui_frame["avgMs"]), 170.0, 320.0)
    assert_between("mobile headless turbo overlay avg cadence", float(overlay["avgMs"]), 170.0, 320.0)
  else:
    assert snapshot["mobileTurboRenderMode"] == "live", f"unexpected live render mode: {snapshot['mobileTurboRenderMode']}"
    assert_between("mobile live turbo UI avg cadence", float(ui_frame["avgMs"]), 90.0, 220.0)

  return {
    "snapshot": snapshot,
    "throughput": measure_throughput(snapshot)
  }


def is_real_mobile_safari(page) -> bool:
  return bool(page.evaluate(
    """
    () => {
      const ua = navigator.userAgent || "";
      const vendor = navigator.vendor || "";
      const appleMobile = /iPhone|iPad|iPod/.test(ua);
      const webkitSafari = /Safari/.test(ua) && !/CriOS|Chrome|EdgiOS|FxiOS/.test(ua) && /Apple/i.test(vendor);
      return appleMobile && webkitSafari;
    }
    """
  ))


def main() -> int:
  port = find_free_port()
  base_url = f"http://127.0.0.1:{port}/"
  server = start_vite_server(port)
  fixture = load_fixture()

  try:
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      try:
        live_page = browser.new_page(viewport={"width": 430, "height": 932})
        load_app(live_page, base_url, fixture)
        live_result = run_mobile_turbo_session(live_page, "live")
        live_page.close()

        headless_page = browser.new_page(viewport={"width": 430, "height": 932})
        load_app(headless_page, base_url, fixture)
        real_mobile_safari = is_real_mobile_safari(headless_page)
        headless_result = run_mobile_turbo_session(headless_page, "headless")
        headless_page.close()

        live_snapshot = live_result["snapshot"]
        headless_snapshot = headless_result["snapshot"]
        live_throughput = float(live_result["throughput"])
        headless_throughput = float(headless_result["throughput"])
        throughput_gain_pct = ((headless_throughput / max(1e-6, live_throughput)) - 1.0) * 100.0

        live_world_render_count = int((live_snapshot.get("perf") or {}).get("worldRenderCount") or 0)
        headless_world_render_count = int((headless_snapshot.get("perf") or {}).get("worldRenderCount") or 0)
        minimum_gain_pct = 30.0 if real_mobile_safari else -10.0

        if headless_world_render_count > 4:
          raise AssertionError(
            f"headless world render count should stay near zero, got {headless_world_render_count}"
          )
        if live_world_render_count <= headless_world_render_count:
          raise AssertionError(
            f"headless render count did not drop below live mode ({live_world_render_count} vs {headless_world_render_count})"
          )
        if throughput_gain_pct < minimum_gain_pct:
          raise AssertionError(
            f"headless mobile turbo throughput gain below target ({minimum_gain_pct:.2f}%): {throughput_gain_pct:.2f}%"
          )

        summary = {
          "live": {
          "workerCount": live_snapshot["workerCount"],
          "crossOriginIsolated": live_snapshot.get("crossOriginIsolated"),
          "generation": live_snapshot["generation"],
          "throughputX": round(live_throughput, 2),
            "worldRenderCount": live_world_render_count,
            "uiFrameAvgMs": round(float(live_snapshot["perf"]["uiFrame"]["avgMs"]), 2),
            "overlayAvgMs": round(float(live_snapshot["perf"]["overlay"]["avgMs"]), 2)
          },
          "headless": {
          "workerCount": headless_snapshot["workerCount"],
          "crossOriginIsolated": headless_snapshot.get("crossOriginIsolated"),
          "generation": headless_snapshot["generation"],
            "throughputX": round(headless_throughput, 2),
            "worldRenderCount": headless_world_render_count,
            "uiFrameAvgMs": round(float(headless_snapshot["perf"]["uiFrame"]["avgMs"]), 2),
            "overlayAvgMs": round(float(headless_snapshot["perf"]["overlay"]["avgMs"]), 2),
            "chartCount": headless_snapshot["perf"]["chart"]["count"],
            "rulerCount": headless_snapshot["perf"]["ruler"]["count"]
          },
          "throughputGainPct": round(throughput_gain_pct, 2),
          "minimumGainPct": round(minimum_gain_pct, 2)
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
