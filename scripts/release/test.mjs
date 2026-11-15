import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../',import.meta.url))
const gameplay = (await fs.readdir(new URL('../harbor/',import.meta.url))).filter(name=>name.endsWith('.mjs') && name.includes('check')).sort().map(name=>'scripts/harbor/'+name)
const release = (await fs.readdir(new URL('./',import.meta.url))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'scripts/release/'+name)
const result = spawnSync(process.execPath,['--test','--test-concurrency=2',...gameplay,...release],{cwd:root,stdio:'inherit'})
process.exit(result.status ?? 1)
