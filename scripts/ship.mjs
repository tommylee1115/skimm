#!/usr/bin/env node
/**
 * One-command Skimm release.
 *
 * What it does:
 *   1. Reads the GitHub token from the `gh` CLI's OS keychain store.
 *   2. Builds the app (`electron-vite build`).
 *   3. Packages + publishes to GitHub Releases (`electron-builder
 *      --win --publish always`).
 *
 * The token is injected into the env only for the duration of the
 * build/package commands — never touches disk, never persists in the
 * shell session, and isn't logged. If the token fetch fails, the
 * script exits before building so you can fix auth first.
 *
 * Usage:
 *   npm run ship
 *
 * Prereq (one-time):
 *   gh auth login   # paste a fine-grained PAT scoped to skimm
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function run(cmd, env) {
  execSync(cmd, { stdio: 'inherit', env, shell: true })
}

function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }).trim()
}

function fail(msg) {
  console.error(`\n\u2717 ${msg}\n`)
  process.exit(1)
}

// ─── 1. Surface the version we're about to ship ────────────────────────
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
console.log(`\nShipping Skimm v${pkg.version}\u2026`)

// ─── 2. Pull GH_TOKEN from the gh CLI keychain ─────────────────────────
let token
try {
  token = capture('gh auth token')
} catch {
  fail(
    'Could not read a GitHub token from `gh`.\n' +
      '  Install gh, then run `gh auth login` to store a fine-grained PAT\n' +
      '  scoped to this repo with Contents: Write + Metadata: Read.'
  )
}
if (!token) {
  fail('`gh auth token` returned empty. Run `gh auth login` first.')
}

// ─── 3. Build + publish with the token in env ─────────────────────────
const env = { ...process.env, GH_TOKEN: token }

console.log('\n\u2192 Building (electron-vite build)')
run('npm run build', env)

console.log('\n\u2192 Packaging + publishing (electron-builder --publish always)')
run('npm run package -- --publish always', env)

console.log(`\n\u2713 Skimm v${pkg.version} shipped.`)
console.log(`  GitHub Release: https://github.com/tommylee1115/skimm/releases/tag/v${pkg.version}`)
console.log(`  Installed clients pick it up on next launch.\n`)
