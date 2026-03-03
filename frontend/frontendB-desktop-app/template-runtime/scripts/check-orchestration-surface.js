#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

const IGNORE_SEGMENTS = [
  `${path.sep}app${path.sep}(app)${path.sep}governance${path.sep}`,
  `${path.sep}app${path.sep}(app)${path.sep}modifier-ops${path.sep}`,
]

const FORBIDDEN_PATTERNS = [
  '/api/openclaw/modifier/observability',
  '/api/openclaw/modifier/ops',
  '/api/observability/orchestrations',
  '/api/operations/orchestrations',
]

const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])
const violations = []

function shouldSkip(filePath) {
  return IGNORE_SEGMENTS.some((segment) => filePath.includes(segment))
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue
    if (shouldSkip(fullPath)) continue
    const content = fs.readFileSync(fullPath, 'utf8')
    FORBIDDEN_PATTERNS.forEach((pattern) => {
      if (content.includes(pattern)) {
        violations.push({
          file: path.relative(ROOT, fullPath),
          pattern,
        })
      }
    })
  }
}

walk(SRC)

if (violations.length === 0) {
  console.log('B orchestration surface check passed.')
  process.exit(0)
}

console.error('Forbidden observability/safeguard API calls detected in Frontend B:')
violations.forEach((item) => {
  console.error(`- ${item.file}: ${item.pattern}`)
})
process.exit(1)
