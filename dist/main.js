"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const artifact = __importStar(require("@actions/artifact"));
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const node_fetch_1 = __importDefault(require("node-fetch"));
const log_1 = __importStar(require("./log"));
const defaultRenderer = ({ jobs }) => {
    const completed = jobs.filter((job) => job.conclusion);
    return {
        text: `Workflow (${completed.length}/${jobs.length})`,
    };
};
const artifactClient = artifact.create();
const ARTIFACT_KEY = 'slacksync';
const ARTIFACT_FILENAME = 'slacksync.txt';
const CWD = process.cwd();
const run = async () => {
    try {
        const options = {
            token: core.getInput('token') || process.env.SLACKSYNC_TOKEN,
            channel: core.getInput('channel') || process.env.SLACKSYNC_CHANNEL,
            renderer: core.getInput('renderer') || process.env.SLACKSYNC_RENDERER,
        };
        log_1.objectDebug('options', options);
        const githubRunId = Number(process.env.GITHUB_RUN_ID);
        const tempDir = await fs_1.promises.mkdtemp(path.join(os.tmpdir(), 'slacksync'));
        const artifactLocation = path.resolve(tempDir, ARTIFACT_FILENAME);
        log_1.default.info(`slacksync: GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID}`);
        log_1.default.info(`slacksync: GITHUB_TOKEN=${core.getInput('GITHUB_TOKEN')}`);
        log_1.objectDebug('context', github_1.context);
        const github = github_1.getOctokit(core.getInput('GITHUB_TOKEN'));
        const jobs = await github.paginate(github.actions.listJobsForWorkflowRun.endpoint.merge({
            ...github_1.context.repo,
            run_id: githubRunId,
        }));
        log_1.objectDebug('jobs', jobs);
        let messageTimestamp;
        try {
            const downloadResult = await artifactClient.downloadArtifact(ARTIFACT_KEY, tempDir);
            log_1.objectDebug('downloadResult', downloadResult);
            const artifactBuffer = await fs_1.promises.readFile(artifactLocation, { encoding: 'utf-8' });
            messageTimestamp = artifactBuffer.toString();
        }
        catch (err) {
            // @actions/artifact just throws a generic new Error(<string>), no class instance and not even
            // an error code, thus we cannot identify it by anything other than the message.
            if (err.message.match(/unable to find/i)) {
                log_1.default.info('No artifact found');
            }
            else {
                throw err;
            }
        }
        log_1.default.debug(`slacksync: messageTimestamp=${messageTimestamp}`);
        let renderer = defaultRenderer;
        if (options.renderer) {
            const rendererLocation = path.resolve(CWD, options.renderer);
            log_1.default.debug(`slacksync: rendererLocation=${rendererLocation}`);
            renderer = (await Promise.resolve().then(() => __importStar(require(rendererLocation)))).default;
        }
        const renderResult = renderer({
            channel: options.channel,
            context: github_1.context,
            githubRunId,
            isUpdating: Boolean(messageTimestamp),
            jobs,
        });
        log_1.objectDebug('renderResult', renderResult);
        if (messageTimestamp) {
            const payload = {
                ...renderResult,
                channel: options.channel,
                ts: messageTimestamp,
            };
            log_1.objectDebug('payload', payload);
            const response = await node_fetch_1.default('https://slack.com/api/chat.update', {
                body: JSON.stringify(payload),
                headers: {
                    Authorization: `Bearer ${options.token}`,
                    'Content-type': 'application/json',
                },
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Failed to POST message`);
            }
            const responseBody = (await response.json());
            log_1.objectDebug('responseBody', responseBody);
            if (!responseBody.ok) {
                throw new Error(`Failed to POST message`);
            }
        }
        else {
            const payload = {
                ...renderResult,
                channel: options.channel,
            };
            log_1.objectDebug('payload', payload);
            const response = await node_fetch_1.default('https://slack.com/api/chat.postMessage', {
                body: JSON.stringify(payload),
                headers: {
                    Authorization: `Bearer ${options.token}`,
                    'Content-type': 'application/json',
                },
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error(`Failed to POST message`);
            }
            const responseBody = (await response.json());
            log_1.objectDebug('responseBody', responseBody);
            if (!responseBody.ok) {
                throw new Error(`Failed to POST message`);
            }
            messageTimestamp = responseBody.ts;
            await fs_1.promises.writeFile(artifactLocation, messageTimestamp, 'utf-8');
            const uploadResult = await artifactClient.uploadArtifact(ARTIFACT_KEY, [artifactLocation], tempDir);
            log_1.objectDebug('uploadResult', uploadResult);
        }
        log_1.default.info(`slacksync: finished action (${messageTimestamp})`);
    }
    catch (error) {
        console.trace(error);
        core.setFailed(error.message);
    }
};
run();
