import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { FRONTEND_A_BUTTON_API_COVERAGE } from '../src/lib/maple-workspace/button-api-coverage.js'

const outputPath = resolve(process.cwd(), 'docs/frontendA-button-api-coverage.md')

const lines = [
  '# Frontend A Button/API Coverage',
  '',
  '| Component | Control ID | Action Type | API Endpoint | Fake Handler | Persistence |',
  '| --- | --- | --- | --- | --- | --- |',
]

for (const item of FRONTEND_A_BUTTON_API_COVERAGE) {
  lines.push(
    `| ${item.component} | ${item.controlId} | ${item.actionType} | ${item.apiEndpoint || '-'} | ${item.fakeHandler || '-'} | ${item.persistence} |`,
  )
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote ${outputPath}`)
