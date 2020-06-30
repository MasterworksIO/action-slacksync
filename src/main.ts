import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

import * as artifact from '@actions/artifact'
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import fetch from 'node-fetch'

import type { Context } from '@actions/github/lib/context'
import type { ActionsListJobsForWorkflowRunResponseData } from '@octokit/types'
import type { ChatPostMessageArguments, WebAPICallResult } from '@slack/web-api'

import log, { objectDebug } from './log'

type ActionsListJobsForWorkflowRunJobs = ActionsListJobsForWorkflowRunResponseData['jobs']

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

export type Renderer = (arg0: RendererInput) => RendererOutput

interface SlackMessageResult extends WebAPICallResult {
  ts: string
}

const defaultRenderer: Renderer = ({ jobs }) => {
  const completed = jobs.filter((job) => job.conclusion)

  return {
    text: `Workflow (${completed.length}/${jobs.length})`,
  }
}

const artifactClient = artifact.create()

const ARTIFACT_KEY = 'slacksync'
const ARTIFACT_FILENAME = 'slacksync.txt'

const CWD = process.cwd()

const run = async (): Promise<void> => {
  try {
    const options = {
      token: core.getInput('token') || process.env.SLACKSYNC_TOKEN,
      channel: core.getInput('channel') || process.env.SLACKSYNC_CHANNEL,
      renderer: core.getInput('renderer') || process.env.SLACKSYNC_RENDERER,
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
      github.actions.listJobsForWorkflowRun.endpoint.merge({
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
    } catch (err) {
      // @actions/artifact just throws a generic new Error(<string>), no class instance and not even
      // an error code, thus we cannot identify it by anything other than the message.
      if (err.message.match(/unable to find/i)) {
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

      renderer = (await import(rendererLocation)).default
    }

    const renderResult = renderer({
      channel: options.channel,
      context,
      githubRunId,
      isUpdating: Boolean(messageTimestamp),
      jobs,
    })

    objectDebug('renderResult', renderResult)

    if (messageTimestamp) {
      const payload = {
        ...renderResult,
        channel: options.channel,
        ts: messageTimestamp,
      }

      objectDebug('payload', payload)

      const response = await fetch('https://slack.com/api/chat.update', {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${options.token}`,
          'Content-type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to POST message`)
      }

      const responseBody = (await response.json()) as SlackMessageResult

      objectDebug('responseBody', responseBody)

      if (!responseBody.ok) {
        throw new Error(`Failed to POST message`)
      }
    } else {
      const payload = {
        ...renderResult,
        channel: options.channel,
      }

      objectDebug('payload', payload)

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${options.token}`,
          'Content-type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to POST message`)
      }

      const responseBody = (await response.json()) as SlackMessageResult

      objectDebug('responseBody', responseBody)

      if (!responseBody.ok) {
        throw new Error(`Failed to POST message`)
      }

      messageTimestamp = responseBody.ts

      await fs.writeFile(artifactLocation, messageTimestamp, 'utf-8')

      const uploadResult = await artifactClient.uploadArtifact(
        ARTIFACT_KEY,
        [artifactLocation],
        tempDir
      )

      objectDebug('uploadResult', uploadResult)
    }

    log.info(`slacksync: finished action (${messageTimestamp})`)
  } catch (error) {
    console.trace(error)
    core.setFailed(error.message)
  }
}

run()
