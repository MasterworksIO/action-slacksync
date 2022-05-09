import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

import * as artifact from '@actions/artifact'
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import fetch from 'node-fetch'

import type { Context } from '@actions/github/lib/context'
import type { Endpoints } from '@octokit/types'
import type { ChatPostMessageArguments, WebAPICallResult } from '@slack/web-api'

import log, { objectDebug } from './log'

class SlackCommunicationError extends Error {
  code = ''
  constructor() {
    super(`Failed to POST message to Slack`)
  }
}

class SlackOutputError extends Error {
  code = ''
  constructor() {
    super(`Malformed response from Slack server`)
  }
}

type ActionsListJobsForWorkflowRunJobs =
  Endpoints['GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs']['response']['data']['jobs']

export type RendererInput = {
  channel?: string
  githubRunId: number
  isUpdating: boolean
  jobs: ActionsListJobsForWorkflowRunJobs
  context: Context
}

export type RendererOutput = Pick<
  ChatPostMessageArguments,
  | 'as_user'
  | 'attachments'
  | 'blocks'
  | 'icon_emoji'
  | 'icon_url'
  | 'link_names'
  | 'mrkdwn'
  | 'parse'
  | 'reply_broadcast'
  | 'text'
  | 'thread_ts'
  | 'unfurl_links'
  | 'unfurl_media'
  | 'username'
>

export interface IRenderer {
  (arg0: RendererInput): RendererOutput
}

interface SlackMessageResult extends WebAPICallResult {
  ts: string
}

const defaultRenderer: IRenderer = ({ jobs }) => {
  const finalJob = jobs.find((job) => job.name.match(/conclusion/i))
  const finished = Boolean(finalJob)

  if (!finished) {
    const completed = jobs.filter((job) => job.conclusion)

    return {
      text: `Workflow running: job ${completed.length + 1}`,
    }
  }

  return {
    text: `Workflow completed`,
  }
}

const artifactClient = artifact.create()

const ARTIFACT_KEY = 'slacksync'
const ARTIFACT_FILENAME = 'slacksync.txt'

const CWD = process.cwd()

const run = async (retries = 3): Promise<void> => {
  try {
    const options = {
      token: core.getInput('token') || process.env.SLACKSYNC_TOKEN,
      channel: core.getInput('channel') || process.env.SLACKSYNC_CHANNEL,
      renderer: core.getInput('renderer') || process.env.SLACKSYNC_RENDERER,
      endpoint: core.getInput('endpoint') || process.env.SLACKSYNC_ENDPOINT || 'https://slack.com/api'
    }

    objectDebug('options', options)

    const githubRunId = Number(process.env.GITHUB_RUN_ID)

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slacksync'))
    const artifactLocation = path.resolve(tempDir, ARTIFACT_FILENAME)

    log.info(`slacksync: GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID}`)
    log.info(`slacksync: GITHUB_TOKEN=${core.getInput('GITHUB_TOKEN')}`)

    objectDebug('context', context)

    const github = getOctokit(core.getInput('GITHUB_TOKEN'))

    const jobs: ActionsListJobsForWorkflowRunJobs = await github.paginate(
      github.rest.actions.listJobsForWorkflowRun.endpoint.merge({
        ...context.repo,
        run_id: githubRunId,
      })
    )

    objectDebug('jobs', jobs)

    let messageTimestamp

    try {
      const downloadResult = await artifactClient.downloadArtifact(ARTIFACT_KEY, tempDir)

      objectDebug('downloadResult', downloadResult)

      const artifactBuffer = await fs.readFile(artifactLocation, { encoding: 'utf-8' })
      messageTimestamp = artifactBuffer.toString()
    } catch (err: unknown) {
      // @actions/artifact just throws a generic new Error(<string>), no class instance and not even
      // an error code, thus we cannot identify it by anything other than the message.
      if (err instanceof Error && err.message.match(/unable to find/i)) {
        log.info('No artifact found')
      } else {
        throw err
      }
    }

    log.debug(`slacksync: messageTimestamp=${messageTimestamp}`)

    let renderer = defaultRenderer

    if (options.renderer) {
      const rendererLocation = path.resolve(CWD, options.renderer)

      log.debug(`slacksync: rendererLocation=${rendererLocation}`)

      renderer = (await import(rendererLocation)).default as IRenderer
    }

    const renderResult = renderer({
      channel: options.channel,
      context,
      githubRunId,
      isUpdating: Boolean(messageTimestamp),
      jobs,
    })

    objectDebug('renderResult', renderResult)

    let response
    let responseBody

    if (messageTimestamp) {
      const payload = {
        ...renderResult,
        channel: options.channel,
        ts: messageTimestamp,
      }

      objectDebug('payload', payload)

      try {
        response = await fetch(`${options.endpoint}/chat.update`, {
          body: JSON.stringify(payload),
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-type': 'application/json',
          },
          method: 'POST',
        })
      } catch (error: unknown) {
        log.error(error)
        throw new SlackCommunicationError()
      }

      if (!response.ok) {
        throw new SlackCommunicationError()
      }

      if (!response.headers.get('content-type')?.split(';').includes('application/json')) {
        throw new SlackOutputError()
      }

      try {
        responseBody = (await response.json()) as SlackMessageResult
      } catch (error: unknown) {
        throw new SlackOutputError()
      }
      objectDebug('responseBody', responseBody)

      if (!responseBody.ok) {
        throw new SlackCommunicationError()
      }
    } else {
      const payload = {
        ...renderResult,
        channel: options.channel,
      }

      objectDebug('payload', payload)

      try {
        response = await fetch(`${options.endpoint}/chat.postMessage`, {
          body: JSON.stringify(payload),
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-type': 'application/json',
          },
          method: 'POST',
        })
      } catch (error: unknown) {
        log.error(error)
        throw new SlackCommunicationError()
      }

      if (!response.ok) {
        throw new SlackCommunicationError()
      }

      if (!response.headers.get('content-type')?.split(';').includes('application/json')) {
        throw new SlackOutputError()
      }

      try {
        responseBody = (await response.json()) as SlackMessageResult
      } catch (error: unknown) {
        throw new SlackOutputError()
      }

      objectDebug('responseBody', responseBody)

      if (!responseBody.ok) {
        throw new SlackCommunicationError()
      }
      if(responseBody.ts) {
        messageTimestamp = responseBody.ts

        await fs.writeFile(artifactLocation, messageTimestamp, 'utf-8')

        const uploadResult = await artifactClient.uploadArtifact(
          ARTIFACT_KEY,
          [artifactLocation],
          tempDir
        )

        objectDebug('uploadResult', uploadResult)
      }
    }

    log.info(`slacksync: finished action (${messageTimestamp})`)
  } catch (error: unknown) {
    console.trace(error)

    if (
      error instanceof SlackCommunicationError || error instanceof SlackOutputError
    ) {
      log.error(`${error.code}: ${error.message}`)
      log.info(`Retrying... (${retries} retries left)`)
      if(retries) {
        await run(retries - 1)
      }
    } else {
      core.setFailed(error instanceof Error ? error.message : `unknown error: ${error}`)
    }
  }
}

void run()
