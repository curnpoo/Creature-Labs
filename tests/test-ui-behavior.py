#!/usr/bin/env python3

import argparse
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


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


def is_hidden(page, selector: str) -> bool:
  return page.locator(selector).evaluate("el => el.classList.contains('hidden') || el.getAttribute('aria-hidden') === 'true'")


def has_class(page, selector: str, class_name: str) -> bool:
  return page.locator(selector).evaluate("(el, name) => el.classList.contains(name)", class_name)


def run_desktop_behavior(page, base_url: str) -> None:
  console_errors = []
  page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

  page.goto(f"{base_url}?ui=desktop", wait_until="networkidle")
  page.wait_for_timeout(250)

  assert page.locator("body").get_attribute("data-ui-platform") == "desktop", "desktop platform override not applied"
  assert has_class(page, "#screen-splash", "active"), "splash screen should be active on desktop load"

  page.click("#btn-settings-splash")
  assert not is_hidden(page, "#modal-splash-settings"), "splash settings modal did not open on desktop"
  assert page.locator("#val-settings-master-speed").text_content() != "test", "splash settings still show placeholder text"
  page.keyboard.press("Escape")
  page.wait_for_timeout(100)
  assert is_hidden(page, "#modal-splash-settings"), "splash settings modal did not close on Escape"

  page.click("#btn-start-draw")
  page.wait_for_function(
    "() => document.getElementById('screen-draw')?.classList.contains('active')",
    timeout=3000
  )
  assert has_class(page, "#screen-draw", "active"), "draw screen did not become active after PLAY"
  assert not has_class(page, "#screen-splash", "active"), "splash screen stayed active after PLAY"

  page.click("#tool-bone")
  assert has_class(page, "#tool-bone", "active"), "bone tool did not activate on desktop"
  assert not console_errors, f"Console errors detected in desktop flow: {console_errors}"


def run_mobile_behavior(page, base_url: str) -> None:
  console_errors = []
  page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

  page.set_viewport_size({"width": 430, "height": 932})
  page.goto(f"{base_url}?ui=mobile", wait_until="networkidle")
  page.wait_for_timeout(250)

  assert page.locator("body").get_attribute("data-ui-platform") == "mobile", "mobile platform override not applied"
  assert has_class(page, "body", "app-mobile"), "body is missing app-mobile class"

  page.click("#btn-settings-splash")
  assert not is_hidden(page, "#modal-splash-settings"), "splash settings modal did not open on mobile"
  page.click("#btn-splash-settings-close")
  page.wait_for_timeout(100)
  assert is_hidden(page, "#modal-splash-settings"), "splash settings modal did not close on mobile"

  page.click("#btn-start-draw")
  page.wait_for_function(
    "() => document.getElementById('screen-draw')?.classList.contains('active')",
    timeout=3000
  )
  assert has_class(page, "#screen-draw", "active"), "draw screen did not become active on mobile"
  assert page.locator("#panel-controls").evaluate("el => el.parentElement && el.parentElement.id") == "mobile-pane-controls", "mobile sheet did not adopt panel-controls"
  assert page.locator("#panel-top-bar").evaluate("el => getComputedStyle(el).display") == "none", "desktop top bar was not hidden in mobile sheet mode"

  page.click("#tool-bone")
  assert has_class(page, "#tool-bone", "active"), "bone tool did not activate on mobile"
  assert not console_errors, f"Console errors detected in mobile flow: {console_errors}"


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--desktop", action="store_true")
  parser.add_argument("--mobile", action="store_true")
  args = parser.parse_args()

  run_desktop = args.desktop or not args.mobile
  run_mobile = args.mobile or not args.desktop

  port = find_free_port()
  base_url = f"http://127.0.0.1:{port}/"
  server = start_vite_server(port)
  try:
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      try:
        if run_desktop:
          desktop_page = browser.new_page(viewport={"width": 1440, "height": 960})
          run_desktop_behavior(desktop_page, base_url)
          desktop_page.close()
          print("desktop-ui-behavior: OK")

        if run_mobile:
          mobile_page = browser.new_page()
          run_mobile_behavior(mobile_page, base_url)
          mobile_page.close()
          print("mobile-ui-behavior: OK")
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
    print(f"UI behavior test failed: {exc}", file=sys.stderr)
    raise SystemExit(1)
  except Exception as exc:
    print(f"UI behavior test errored: {exc}", file=sys.stderr)
    raise SystemExit(1)
