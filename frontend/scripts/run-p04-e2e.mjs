import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = resolve(frontendDir, '../backend')
const virtualEnvironment = process.env.VIRTUAL_ENV
const localCandidates = [
  process.env.NEXORA_PYTHON,
  virtualEnvironment && resolve(virtualEnvironment, 'Scripts/python.exe'),
  virtualEnvironment && resolve(virtualEnvironment, 'bin/python'),
  resolve(backendDir, '.venv/Scripts/python.exe'),
  resolve(backendDir, '.venv/bin/python'),
].filter(Boolean)
const python = localCandidates.find((candidate) => existsSync(candidate))
  ?? (process.platform === 'win32' ? 'python' : 'python3')

const labels = [
  'apps.e2e.tests.CriticalBrowserEndToEndTests',
  'apps.commerce.tests.ReferenceBuyerEndToEndTests',
]
const child = spawn(
  python,
  ['manage.py', 'test', ...labels, '--keepdb', '--verbosity', '2'],
  { cwd: backendDir, env: process.env, stdio: 'inherit' },
)

child.on('error', (error) => {
  process.stderr.write(`Could not start the P0.4 Django test runner with ${python}: ${error.message}\n`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) process.stderr.write(`P0.4 E2E was interrupted by ${signal}.\n`)
  process.exitCode = code ?? 1
})
