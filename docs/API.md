[Back to CONTRIBUTING.md](../CONTRIBUTING.md)


# API

- [`devhub init`](#devhub-init) - Initialize a devhub project
- [`devhub whoami`](#devhub-whoami) - Display the connected cell agent pubkey
- [`devhub status`](#devhub-status) - Display the known contexts and settings
- [`devhub connection`](#devhub-connection) - Manage connection to Conductor
- [`devhub config`](#devhub-config) - Manage devhub project config
- [`devhub publish`](#devhub-publish) - Publish a locally defined target
- [`devhub install`](#devhub-install) - Install a DevHub asset
- [`devhub zomes`](#devhub-zomes) - Manage the local project's zome targets



## `devhub init`
Create a `devhub.json` config file.

Example of a new `devhub.json` config
```js
{
    "version": "1",
    "zomes": {}
}
```



## `devhub whoami`
Display cell agent

Example result
```
[shell]$ devhub whoami
uhCAkh4Ycahw023cJUemyA2q10I1_k1oPgKSw3L69HJJeH9QpCGG7
```



## `devhub status`
Information about the connection and local project.

#### Options

- `-d, --data` - output as a data format


Example result
```
[shell]$ devhub whoami
You are agent uhCAkh4Ycahw023cJUemyA2q10I1_k1oPgKSw3L69HJJeH9QpCGG7
Project CWD: /home/username/project-name/

Project assets
  Zomes:
    example_zome
      Example Zome - Lorem ipsum dolor sit amet, consectetur adipiscing elit
```



## `devhub connection`
Manage connection settings

#### Options

- `-g, --global` - Manage the global connection configuration


#### Subcommands

- [`devhub connection status`](#devhub-connection-status) - Display connection status
- [`devhub connection set`](#devhub-connection-set) - Set devhub connection settings
- [`devhub connection update`](#devhub-connection-update) - Update a single connection setting

Locations that will be checked for `connection.json`

- `.devhub/`
- `~/.devhub/`


### `devhub connection status`
Display information about connection settings and result.

| State                | Configured | Attempted | Succeeded |
|----------------------|------------|-----------|-----------|
| `CONNECTED`          | &check;    | &check;   | &check;   |
| `CONNECTED_FAILED`   | &check;    | &check;   | &cross;   |
| `UNCONNECTED`        | &check;    | &cross;   | &cross;   |
| `NO_CONNECTION_INFO` | &cross;    | &cross;   | &cross;   |


Example
```js
{
    "state": "CONNECTED",
    "connection": {
        "app_port": 24246,
        "app_token": "813fad07c6925a5d150adafe22e6299c90d33f16d33e96edb123a26563ee428879cff52f72743075e6a0817afc3829c6572b40dabfe633b470774781d6d31023"
    }
}
```

### `devhub connection set`
Set the connnection properties.

#### Arguments

- `<port>` - Holochain Conductor's app port
- `<token>` - DevHub auth token

#### Options

- `-f, --force` - Overwrite config if it already exists


### `devhub connection update`
Update a single property of the connection configuration.

#### Arguments

- `<property>` - Config property (`app_port` or `app_token`)
- `<value>` - The property's new value



## `devhub config`
Manage local project settings

#### Subcommands

- [`devhub config add`](#devhub-config-add) - Add inline zome config


### `devhub config add`
Add an DevHub configuration to the project config.

#### Arguments

- `<type>` - Config type (`zome`, `dna`, or `app`)
- `<target-id>` - Unique ID for this target
- `<path>` - Path to target config file


Example `devhub.json` after command `devhub config add zome mere_memory zomes/mere_memory/zome.json`
```js
{
    "version": "1",
    "zomes": {
        "mere_memory": "zomes/mere_memory/zome.json",
    }
}
```



## `devhub publish`

See [API/Publish.md](API/Publish.md)



## `devhub install`

See [API/Install.md](API/Install.md)



## `devhub zomes`

See [API/Zomes.md](API/Zomes.md)
