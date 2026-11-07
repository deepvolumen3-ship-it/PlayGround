#!/usr/bin/env bash
set -euo pipefail

run() {
  /usr/bin/time -p "$@"
}

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$SCRIPT_DIR" != "${BASH_SOURCE[0]}" ]] || SCRIPT_DIR=.
cd "$SCRIPT_DIR"
PROJECT_DIR="$PWD"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR for screenshots outside the project source}"
[[ "$CAPTURE_DIR" = /* ]] || { echo 'CAPTURE_DIR must be an absolute path outside the project source.' >&2; exit 1; }
[[ "$CAPTURE_DIR" != "$PROJECT_DIR" && "$CAPTURE_DIR" != "$PROJECT_DIR/"* ]] || { echo 'CAPTURE_DIR must be outside the project source.' >&2; exit 1; }
: "${RUNTIME_DIR:?RUNTIME_DIR must point to the OMGithub runtime}"
run mkdir -p "$CAPTURE_DIR"
run node --input-type=module - <<'NODE'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()
const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
const transient = error => Object.assign(error instanceof Error ? error : new Error(String(error)), { exitCode: 75 })
let browser

try {
  try {
    new URL(url)
  } catch (error) {
    throw new Error(`CAPTURE_URL is not a valid absolute URL: ${error.message}`)
  }
  try {
    browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 })
  } catch (error) {
    throw transient(error)
  }

  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    let page
    try {
      page = await browser.newPage({ viewport: { width, height } })
    } catch (error) {
      throw transient(error)
    }
    page.setDefaultTimeout(15000)
    const failures = []
    const origin = new URL(url).origin
    page.on('pageerror', error => failures.push(`JavaScript error: ${error.message}`))
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).origin === origin) {
        failures.push(`HTTP ${response.status()}: ${response.url()}`)
      }
    })

    let response
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    } catch (error) {
      throw transient(error)
    }
    if (!response) throw transient(new Error(`No response while loading ${url}`))
    if (!response.ok()) {
      const status = response.status()
      const error = new Error(`HTTP ${status} loading preview`)
      error.exitCode = status === 408 || status === 429 || status >= 500 ? 75 : 1
      throw error
    }

    try {
      await page.locator('#startScreen').waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.fonts.status === 'loaded')
      const start = page.locator('#btnStart')
      if (!await start.isVisible() || !await start.isEnabled()) {
        throw new Error('The rendered start screen has no usable START GAME button.')
      }
      // DOM activation avoids flaky pointer hit-testing while the animated canvas redraws.
      await start.evaluate(button => button.click())
      await page.waitForFunction(() =>
        document.getElementById('startScreen')?.classList.contains('hidden') &&
        document.getElementById('hud')?.getAttribute('aria-hidden') === 'false'
      )
      await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas')
        return canvas && canvas.width > 0 && canvas.height > 0
      })
      await page.waitForTimeout(1000)
    } catch (error) {
      if (error.exitCode) throw error
      throw new Error(`The ${name} preview did not render playable game content: ${error.message}`)
    }

    if (failures.length) throw new Error(`The ${name} preview has rendering defects: ${failures.join('; ')}`)
    try {
      await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 })
    } catch (error) {
      if (error.name === 'TimeoutError' || !browser.isConnected()) throw transient(error)
      throw error
    } finally {
      await page.close().catch(() => {})
    }
    console.log(`Captured ${name} view: ${width}x${height}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = error.exitCode || 1
} finally {
  if (browser) {
    try {
      await browser.close()
    } catch (error) {
      console.error(error)
      process.exitCode ||= 75
    }
  }
}
NODE
