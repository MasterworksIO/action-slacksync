# Slack Sync for GitHub Actions

Notify throught Slack when a workflow starts and sync the jobs' status & results in real-time.

## Requirements

A valid [Slack Access Token](https://api.slack.com/authentication/token-types) with the right permissions to post to your channels is required.

We recomend using a "Bot token" type for which you need to [create a Slack App](https://api.slack.com/start/building).

The only required scope is [chat:write](https://api.slack.com/scopes/chat:write); but if you would like to customize the message name dynamically via the `as_user` + `username` fields, you will also need the [chat:write.customize scope](https://api.slack.com/scopes/chat:write.customize).

Someone in your organization with admin rights to the Slack workspace will need to [accept the app installation](https://slack.com/help/articles/202035138-Add-apps-to-your-Slack-workspace) and your bot must be invited to the channel you want to post to.

Once your bot as been installed on your org, you will find the Bot Token at `https://api.slack.com/apps/<your app ID>/install-on-team`.

Bot tokens start with the `xoxb-` identefier.

## Usage

Add your slack token to the repo's secrets and pass it along the slack channel ID to the action either via env variables or the action's input.

Include the action on every job so the jobs' statuses & results are updated on the slack notification message.

To prevent race conditions that create duplicated messages, you will need to run the first job of your workflow in isolation by making it a dependency of other jobs.

```yaml
name: Build and deploy our system
on: push

env:
  SLACKSYNC_CHANNEL: XMXXXXTW
  SLACKSYNC_RENDERER: './.github/slacksync.push.js'
  SLACKSYNC_TOKEN: '${{ secrets.SLACK_TOKEN }}'

jobs:
  prepare:
    name: Prepare
    runs-on: ubuntu-20.04

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@1.1.0

  lint:
    name: Lint
    runs-on: ubuntu-20.04
    needs: prepare

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@1.1.0
      [ ... other steps of the job ]


  build:
    name: Build
    runs-on: ubuntu-20.04
    needs: prepare

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@1.1.0
      [ ... other steps of the job ]

  deploy:
    name: Deploy
    runs-on: ubuntu-20.04
    needs: [build, lint]

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@1.1.0
      [ ... other steps of the job ]

   [ ... other jobs ]

  conclusion:
    name: 'Conclusion'
    runs-on: ubuntu-20.04
    needs: [deploy]
    if: always()
    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@1.1.0
```

See [action.yml](./action.yml) for the full documentation for this action's inputs and outputs.


## License

This code is made available under the MIT license. Read [LICENSE](./LICENSE) for more.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions in [our Security Policy doc](./SECURITY.md).
