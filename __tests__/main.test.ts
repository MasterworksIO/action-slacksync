import * as process from 'node:process'
import * as cp from 'node:child_process'
import * as path from 'node:path'

import { test, expect } from 'vitest'

const REQUIRED_VARIABLES = [
  'INPUT_GITHUB_TOKEN',
  'SLACKSYNC_CHANNEL',
  'SLACKSYNC_TOKEN',
  'GITHUB_RUN_ID',
  'GITHUB_REPOSITORY',
]

// shows how the runner will run a javascript action with env / stdout protocol
test('it runs without failing', () => {
  for (const env of REQUIRED_VARIABLES) {
    if (!process.env[env]) {
      throw new Error(`${env} has to be set in order to run tests`)
    }
  }

  const ip = path.join(__dirname, '..', 'dist', 'index.js')
  const options: cp.ExecSyncOptions = {
    env: process.env,
  }

  expect(() => {
    // eslint-disable-next-line no-sync
    console.log(cp.execSync(`node ${ip}`, options).toString())
  }).not.toThrow()
})
