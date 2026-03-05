#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..', 'src')
const BADGE_USAGE_RE = /<Badge\b/m
const BADGE_IMPORT_RE = /import\s+\{[^}]*\bBadge\b[^}]*\}\s+from\s+['"](?:@\/components\/badge|\.\/badge)['"]/m

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const next = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(next, out)
      continue
    }
    if (!/\.(jsx|tsx)$/.test(entry.name)) continue
    out.push(next)
  }
  return out
}

function main() {
  const files = walk(ROOT)
  const failures = []

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    if (!BADGE_USAGE_RE.test(source)) continue
    if (path.basename(file) === 'badge.jsx') continue
    if (!BADGE_IMPORT_RE.test(source)) {
      failures.push(path.relative(path.resolve(__dirname, '..'), file))
    }
  }

  if (failures.length === 0) {
    console.log('UI import guards: ok')
    return
  }

  console.error('UI import guard failure: <Badge> used without Badge import in:')
  for (const file of failures) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

main()
