[Back to TechnicalDocs.md](../TechnicalDocs.md)


# Local Storage

The hidden folder for storing all state assets is `.devhub`.


## Zome Assets

`.devhub/zomes/wasms/${sha256}.wasm`

Also, a symbolic link is created from the named zome to the sha256 hash

- `.devhub/zomes/${zome_name}.wasm` -> `.devhub/zomes/wasms/${sha256}.wasm`
