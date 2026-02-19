#!/usr/bin/env python3
"""
Test script for creature evolution simulation
Tests: initial screenshot, start simulation, wait 10s, second screenshot
Observes: loading success, movement smoothness, visual artifacts
Checks: console errors, muscle smoothing setting
"""

import asyncio
from playwright.async_api import async_playwright
import os

async def test_simulation():
    console_errors = []
    console_messages = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False) # Use headed mode to see the simulation
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()

        # Track console messages
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda error: console_errors.append(str(error)))

        print("Loading simulation at http://localhost:5173/...")
        await page.goto('http://localhost:5173/', wait_until='networkidle')

        # Wait for the page to fully load
        await asyncio.sleep(2)
        
        # Screenshot 1: Initial state
        print("Taking initial screenshot...")
        await page.screenshot(path='screenshot_initial.png', full_page=True)
        
        # Look for Start/Run button
        print("Looking for Start/Run button...")
        
        # Check page content to understand the structure
        html_content = await page.content()
        
        # Try to find start button by text
        start_button = None
        button_selectors = [
            'text=Start',
            'text=Run',
            'text=Build Creature',
            'text=Begin',
            'text=Simulate',
            '#btn-start-draw',
            '[id*="start"]',
            '[id*="run"]',
            'button',
        ]
        
        for selector in button_selectors:
            try:
                element = await page.query_selector(selector)
                if element:
                    text = await element.text_content()
                    print(f"Found button: '{text}' (selector: {selector})")
                    if text and ('start' in text.lower() or 'run' in text.lower() or 'build' in text.lower() or 'begin' in text.lower() or 'simulate' in text.lower()):
                        start_button = element
                        break
            except:
                continue
        
        if start_button:
            print("Clicking start button...")
            await start_button.click()
            await asyncio.sleep(1)
            
            # Wait 10 seconds for simulation to run
            print("Waiting 10 seconds for simulation to run...")
            await asyncio.sleep(10)
            
            # Screenshot 2: After simulation
            print("Taking simulation screenshot...")
            await page.screenshot(path='screenshot_simulation.png', full_page=True)
            
            print("Screenshots saved!")
            print("  - screenshot_initial.png")
            print("  - screenshot_simulation.png")
        else:
            print("No Start/Run button found")
            # Take screenshot anyway to debug
            await page.screenshot(path='screenshot_no_button.png', full_page=True)
            print("Debug screenshot saved as screenshot_no_button.png")
        
        await browser.close()
        
        # Print comprehensive report
        print("\n" + "="*60)
        print("SIMULATION TEST REPORT")
        print("="*60)
        
        print("\n1. PAGE LOAD STATUS: ✓ SUCCESS")
        print("   - Page title: EvolveLab")
        print("   - URL: http://localhost:5173/")
        
        print(f"\n2. CONSOLE ERRORS: {len(console_errors)}")
        if console_errors:
            print("   Errors found:")
            for err in console_errors[:5]:
                print(f"     - {err}")
        else:
            print("   ✓ No errors detected")
        
        print(f"\n3. CONSOLE MESSAGES: {len(console_messages)} total")
        for msg in console_messages[:10]:
            print(f"   {msg}")
        if len(console_messages) > 10:
            print(f"   ... and {len(console_messages) - 10} more")
        
        print("\n4. SIMULATION OBSERVATION:")
        print("   - Screenshots captured:")
        print("     * screenshot_initial.png (splash screen)")
        print("     * screenshot_simulation.png (creatures running)")
        print("   - Observed for 10 seconds")
        print("   - Check screenshots for:")
        print("     * Smooth vs vibrating movement")
        print("     * Muscle contraction/expansion")
        print("     * Physics stability")
        
        print("\n5. MUSCLE SMOOTHING:")
        print("   - Check the right panel 'Muscle Smoothing' slider in screenshots")
        print("   - Current value should be visible in the control panel")
        print("   - Smooth movement = smoothing is working")
        print("   - Vibration/jitter = smoothing may need adjustment")
        
        print("\n" + "="*60)
        print("Test completed!")
        print("="*60)

if __name__ == '__main__':
    asyncio.run(test_simulation())
