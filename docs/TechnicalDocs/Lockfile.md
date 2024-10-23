[Back to TechnicalDocs.md](../TechnicalDocs.md)


# Lockfile

Example after installing (eg. `devhub install mere_memory mere_memory_csr`)
```js
{
    "version": 1,
    "zomes": {
        "mere_memory": {
            "0.2.0": {
                "zome_type": "integrity",
                "hash": "a56cab3b4aa9b050549202df99ff108daeccc2b7c25d88577f0a2019a509a797",
                "devhub_source": {
                    "zome_package_id": "uhCkkLF2qSayXNInHQcKxTBt8-vWuce3IiM9qwVFrK2IzNWA0Ixy8",
                    "zome_package_version_id": "uhCkk9FQywjSoBt7hXi8JRGeu-6gBdqF6Eg4XFtGGYYyCrVZCHAKN",
                    "zome_wasm_addr": "uhCEkJrlDe6iDWEfky8X1HOm-2Zip_0o7GfcH6sQEmrv71DIOLlvD",
                    "mere_memory_addr": "uhCEkl1tnjQTBWCVnShX1r2BRBW7GCUtcXQ8hfnpCJVw4ZqIWFCKj"
                },
                "local_source": {
                    "wasm_filepath": ".devhub/wasms/a56cab3b4aa9b050549202df99ff108daeccc2b7c25d88577f0a2019a509a797.wasm",
                    "zome_filepath": ".devhub/zomes/mere_memory-0.2.0.wasm",
                    "file_size": 4034295
                },
                "dependencies": {},
                "dev_dependencies": {}
            }
        },
        "mere_memory_csr": {
            "0.1.0": {
                "zome_type": "coordinator",
                "hash": "9772af948bfd975fe6ae684cab63d3d6ba505ff3989d76fb4ab812c0bebfdab8",
                "devhub_source": {
                    "zome_package_id": "uhCkk6q_S51lenlRYOmH68MkpZWba_59rmQI6x137cbMDQ0BgOpB_",
                    "zome_package_version_id": "uhCkkDWO698Tmfz2oZI3LCeN7KNBFie8gUA4_OM_dHRyrTzh5W504",
                    "zome_wasm_addr": "uhCEkrKJr2wdD8aJhjblXRsKRdiMU2y9VN1lCY-IaGKp0Ukc7gkGi",
                    "mere_memory_addr": "uhCEknTrN4XqSRJjpEKFJT8DeUqFkVdIwMIBCqP_o0xZKf3KFBCrj"
                },
                "local_source": {
                    "wasm_filepath": ".devhub/wasms/9772af948bfd975fe6ae684cab63d3d6ba505ff3989d76fb4ab812c0bebfdab8.wasm",
                    "zome_filepath": ".devhub/zomes/mere_memory_csr-0.1.0.wasm",
                    "file_size": 4749555
                },
                "dependencies": {},
                "dev_dependencies": {}
            }
        }
    }
}
```

### TODO

- Document the purpose of each field
