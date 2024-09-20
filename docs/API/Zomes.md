[Back to API.md](../API.md)


# `devhub zomes`
Manage locally defined zome packages

### Subcommands

- [`devhub zomes init`](#devhub-zomes-init) - Create zome config
- [`devhub zomes list`](#devhub-zomes-list) - List my zomes
- [`devhub zomes versions list`](#devhub-zomes-versions-list) - Manage zome versions
- [`devhub zomes wasms list`](#devhub-zomes-wasms-list) - Manage zome wasms



## `devhub zomes init`

#### Arguments

- `[location]` - zome config location

#### Options

- `-w, --target-path <path>` - path to the zome target (default: "")
- `-T, --zome-type <path>` - zome type (default: "integrity") (choices: "integrity", "coordinator")
- `-i, --package-name <string>` - zome package name (default: "")
- `-n, --package-title <string>` - zome package title (default: "")
- `-d, --package-description <string>` - zome package description (default: "")
- `-x, --package-version <string>` - zome package version (default: "0.1.0")
- `-m, --package-maintainer <hash>` - zome package maintainer (default: "null")
- `-l, --package-tags <string>` - zome package tag (default: "[]")
- `-y, --yes` - use defaults for all prompts
- `-f, --force` - create config even if the file already exists


Example command
```
devhub zomes init zomes/mere_memory/	\
    -w zomes/mere_memory.wasm		\
    -T integrity			\
    -i mere_memory			\
    -x 0.100.0				\
    -n "Mere Memory"			\
    -d "Integrity rules for simple byte storage"
```

Example `zomes/mere_memory/zome.json` result
```js
{
    "type": "zome",
    "version": "0.100.0",
    "target": "../mere_memory.wasm",
    "name": "mere_memory",
    "title": "Mere Memory",
    "description": "Integrity rules for simple byte storage",
    "zome_type": "integrity",
    "maintainer": null,
    "tags": [],
    "metadata": {}
}
```



## `devhub zomes list`
List the Zome Packages under my agent's management.



## `devhub zomes versions list`
List the Zome Package Versions for the given zome name.

#### Arguments

- `<target-id>` - Zome name



## `devhub zomes wasms list`
List the Zome WASMs under my agent's management.
