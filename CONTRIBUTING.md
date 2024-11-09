[Back to README.md](README.md)

<!--
[![](https://img.shields.io/github/actions/workflow/status/holochain/devhub-cli/all-tests.yml?branch=master&style=flat-square&label=master)](https://github.com/holochain/devhub-cli/actions/workflows/all-tests.yml?query=branch%3Amaster)
[![](https://img.shields.io/github/actions/workflow/status/holochain/devhub-cli/all-tests.yml?branch=develop&style=flat-square&label=develop)](https://github.com/holochain/devhub-cli/actions/workflows/all-tests.yml?query=branch%3Adevelop)
-->


# Contributing


## Overview
The purpose of this project is to provide a command-line tool for the DevHub app that resembles
other package management tools such as NPM or Cargo.


## Development

### Environment

- Enter `nix develop` for development environment dependencies.

### Building

```
nix develop
[nix-shell]$ make lib/index.js
```

### Testing

To run all tests with logging

```
nix develop
[nix-shell]$ make test
```

> **NOTE:** set the `DEBUG_LEVEL` environment variable to `fatal`, `error`, `normal`, `info`,
> `debug`, or `trace` for different logging levels.



## DevHub Setup
The DevHub CLI requires a Holochain runtime with the DevHub App installed.


### Using Launcher

1. Install Launcher
2. Install DevHub
3. Install DevHub CLI
4. Setup CLI access to Launcher


##### Install Launcher

Download `v0.400.0-rc.2` from https://github.com/holochain/launcher/releases/tag/v0.400.0-rc.2 and
install.


##### Install DevHub

Download `devhub.happ` from
https://github.com/holochain/devhub-dnas/releases/tag/zomehub-zomelets-v0.2.0-dev.3

- Open Launcher
- Complete setup
- Install `devhub.happ` from file system
  - Use network `devhub-beta-testing`


##### Install DevHub CLI

```
npm i -g @holochain/devhub-cli
```

Test install with
```
devhub connection status
```


##### Setup CLI access to Launcher

- Go to Launcher settings
- Navigate to the `devhub` app you just installed
- Under Settings -> Advanced Settings
  - Generate an unlimited use authentication token that's valid until Launcher is quit.
  - Copy that token and the `App Port` displayed on the same settings page
    - `devhub connection -g set <app port>, <auth token>`
  - Test the connection with `devhub connection status`
  - Try the command `devhub zomes list`.  You should get a `BadCapGrant` error
  - Copy the `client_agent` from the connection status output and use it to "Grant Permission" on
    the devhub settings page.
  - Check the connection status again and the status should say `CONNECTED`

Now you can explore the CLI tool using `--help`


### Using Backdrop

1. Run Holochain
2. Establish an App Port
3. Create an Agent
4. Install & Enable DevHub
5. Grant Capabilities to Agent
6. Create Auth Token


##### Install Backdrop Globally - [`@spartan-hc/holochain-backdrop`](https://www.npmjs.com/package/@spartan-hc/holochain-backdrop)

```
npm i -g @spartan-hc/holochain-backdrop
```

##### Run Holochain Instance

Make a directory to store the holochain runtime files
```
mkdir global-holochain
```

Start backdrop with a given config location and admin port (4656 stands for HOLO)
```
cd global-holochain
holochain-backdrop --config config.toml --admin-port 4656
```


##### Install the Admin CLI Globally - [`@spartan-hc/holochain-admin-client`](https://www.npmjs.com/package/@spartan-hc/holochain-admin-client)

```
npm i -g @spartan-hc/holochain-admin-client
```

##### Establish an App Port
Create an app interface connection point (24246 stands for CHAIN)
```
hc-admin -p 4656 interfaces app create 24246
```

##### Create an Agent
```
hc-admin -p 4656 agents create
```

Remember Agent pubkey for later use.
```
AGENT=...
```

##### Install DevHub App

Download `devhub.happ` file from [Github
releases](https://github.com/holochain/devhub-dnas/releases/tag/zome-packages-dev.0).

```
hc-admin -p 4656 apps install -i devhub $AGENT devhub.happ
```

Remember ZomeHub DNA hash for later use.
```
ZOMEHUB=...
```

##### Enable app
```
hc-admin -p 4656 apps enable devhub
```

##### Grant Capabilities to Agent
```
hc-admin -p 4656 grants create unrestricted devhub-zomehub-unrestricted $AGENT $ZOMEHUB
```

##### Create Auth Token

> Auth tokens are like session tokens; they need to be recreated every time the holochain process is
> restarted.

```
hc-admin -p 4656 auth create --multi-use --expiry-seconds 0 devhub
```



## Technical Docs

See [docs/TechnicalDocs.md](docs/TechnicalDocs.md)
