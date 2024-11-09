[![](https://img.shields.io/npm/v/@holochain/devhub-cli/latest?style=flat-square)](http://npmjs.com/package/@holochain/devhub-cli)

# DevHub CLI
A CLI for managing assets and packages on DevHub.

Project configs (eg. `devhub.json`) keep track of assets that the repo is creating.

The dependency config (`devhub-lock.json`) keeps track of zome, DNA, or hApp dependencies for the
assets being created.

[![](https://img.shields.io/github/issues-raw/holochain/devhub-cli?style=flat-square)](https://github.com/holochain/devhub-cli/issues)
[![](https://img.shields.io/github/issues-pr-raw/holochain/devhub-cli?style=flat-square)](https://github.com/holochain/devhub-cli/pulls)


## Getting started

### Install CLI Tool

```
npm i --global @holochain/devhub-cli
```

### Set Connection Info

> See [DevHub Setup](CONTRIBUTING.md#devhub-setup) for instructions on running and installing
> devhub.

```
devhub connection --global set <PORT> <TOKEN>
```

Check connection with
```
devhub connection status
```

### Install Zome Dependencies

```
devhub install <package>
```

### Publish a Zome

```
devhub zome init path/to/crate/dir
```

After answering the prompt questions, a `zome.json` file is created in the location provided.

Check local configurations using...
```
devhub status
```

Preview what would be published for the newly defined zome.
```
devhub publish --dry-run zome crate_name
```

If it looks good, complete the publishing by removing the `--dry-run` flag.
```
devhub publish zome crate_name
```


# API Docs

See [docs/API.md](docs/API.md)



# Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
