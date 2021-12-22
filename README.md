# Slack Sync for GitHub Actions

Show the workflow progress showing jobs and results live in Slack.

**Table of Contents**

<!-- toc -->

- [Usage](#usage)
- [Credentials and Region](#credentials-and-region)
- [Permissions](#permissions)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)

<!-- tocstop -->

## Usage

```yaml
name: Push
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
      - uses: MasterworksIO/action-slacksync@master

  lint:
    name: Lint
    runs-on: ubuntu-20.04
    needs: prepare

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@master
      [ ... other steps of the job ]


  build:
    name: Build
    runs-on: ubuntu-20.04
    needs: prepare

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@master
      [ ... other steps of the job ]

  deploy:
    name: Build
    runs-on: ubuntu-20.04
    needs: [build, lint]

    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@master
      [ ... other steps of the job ]

   [ ... other jobs ]

  conclusion:
    name: 'Conclusion'
    runs-on: ubuntu-20.04
    needs: [deploy]
    if: always()
    steps:
      - uses: actions/checkout@v2
      - uses: MasterworksIO/action-slacksync@master
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.


## Credentials

The `SLACKSYNC_TOKEN` env variable must be defined on the repository secrets.

## License Summary

This code is made available under the MIT license.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
