# Vantemio Editor automation source

Vantemio Editor is the public project name used here for the existing VidRa fork of Kdenlive. The fork adds a native automation gateway and editor integration. Its implementation is published as `Vantemio_Editor_Automation.patch`, with standalone copies of the request/response protocol files for convenient inspection.

The patch contains the complete gateway service and header plus integration changes in 24 source/build files. It connects structured commands to the editor, timeline, media bin, mixer, library, project manager and render-request interfaces. This is the editor control layer; the separate Vantemio production engine decides what work to perform and remains private.

The gateway source includes an opt-in localhost NDJSON transport, request and response identities, serialized command dispatch and bounded request buffering. The protocol carries action, request identity, project identity and parameters; responses include status, timeline revision, result, warnings and errors. These source features do not establish that every editor function is remotely supported or validated.

## Patch verification

`SOURCE_MANIFEST.json` records the fork commit, patch base and preceding upstream commit. The patch was applied to a temporary source export of its exact base. `git apply --check` passed, and all 24 resulting files matched the recorded fork commit byte for byte. No running editor or production source was modified.

This is a source overlay, not the complete upstream Kdenlive tree, a compiled application or a release installer. Building requires the compatible Kdenlive base and its Qt/KDE/MLT dependencies. The local patch base includes a preceding line-ending normalization commit; the manifest records that distinction. Compilation and live gateway operation have not been verified for this publication. Authentication, authorization and remote transport must be configured by the deployment; publishing this source does not make it an Internet-facing service.

The public project name does not rename the installed application. Historical VidRa and Kdenlive identifiers and existing source comments remain unchanged to preserve source traceability. Operational overlay manifests, subtitle fixture edits and branding resource changes are excluded. No memory contents, production plans, prompts, matrices, accounts, deployment routes or private editing-engine code are included.

## License

The Kdenlive-derived editor material is distributed under the included GNU GPL version 3 license in `COPYING`; upstream rights and notices remain applicable. This does not license the separate proprietary Vantemio production engine.
