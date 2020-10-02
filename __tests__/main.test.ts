import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

const REQUIRED_VARIABLES = ['INPUT_GITHUB_TOKEN', 'SLACKSYNC_CHANNEL', 'SLACKSYNC_TOKEN']

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  for (let env of REQUIRED_VARIABLES) {
    if (!process.env[env]) {
      throw new Error(`${env} has to be set in order to run tests`)
    }
  }

  const ip = path.join(__dirname, '..', 'dist', 'main.js')
  const options: cp.ExecSyncOptions = {
    env: process.env,
  }

  console.log(cp.execSync(`node ${ip}`, options).toString())
})
