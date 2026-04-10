# Fix: nxapi Parental Controls `update_required` Error

## The Problem

`nxapi pctl dump-summaries` fails with a 400 error from Nintendo's Moon API:

```
MoonErrorResponse: [moon] Non-200 status code
    from https://api-lp1.pctl.srv.nintendo.net/moon/v1/users/{user_id}/devices (400 Bad Request)
      { type: 'https://moon.nintendo.com/errors/v1/400/update_required',
        status: 400,
        errorCode: 'update_required',
        title: 'UpdateRequiredException' }
```

This affects all parental controls commands (`pctl dump-summaries`, `pctl daily-summary`, etc.).

NSO Coral auth (`nxapi nso auth`) is also broken with a separate "Remote configuration prevents Coral authentication" error.

## Root Cause

Nintendo updated the Parental Controls mobile app to v2.4.0 on March 24, 2026. This likely bumped the minimum API version that the Moon server accepts.

nxapi spoofs the Parental Controls app version when talking to Nintendo's API. The version it sends is controlled by a remote config fetched from `nxapi-auth.fancy.org.uk`. The current remote config has:

```json
"moon": { "znma_version": "1.20.0", "znma_build": "282" }
```

Nintendo's server now rejects this version as too old.

## What Needs to Happen

1. Someone needs to figure out the current Parental Controls app version and build number (from the v2.4.0 app update).
2. The remote config at `nxapi-auth.fancy.org.uk` needs to be updated with the new `znma_version` and `znma_build` values.
3. Alternatively, the values could be patched locally in the nxapi source code.

## Where to Look in the Code

- **Remote config fetching:** `src/api/moon.ts` - this is where nxapi reads the Moon API version from remote config and sends it as a User-Agent or header to Nintendo's server.
- **Config URL:** The remote config is fetched from `https://nxapi-auth.fancy.org.uk/config` (or similar endpoint). Run `nxapi util remote-config` to see the current values.
- **Moon API client:** `src/api/moon.ts` - the `MoonApi` class handles all parental controls API calls. Look for where `znma_version` and `znma_build` are used in request headers.
- **CLI command:** `src/cli/pctl/dump-summaries.ts` - the CLI entry point that triggers the error.

## Local Fix Approach

If you want to patch this locally without waiting for the remote config update:

1. Find where the Moon API version is set in `src/api/moon.ts` (look for `znma_version` or User-Agent construction).
2. Intercept the Parental Controls app v2.4.0 traffic (or decompile the APK/IPA) to find the new version string and build number.
3. Hardcode or override the version values.
4. Rebuild: `npm run build` (or `npx tsc` depending on the build setup).

## Environment

- nxapi v1.6.1 (also tried v1.6.1-next.254, same error)
- Node.js on Windows 11
- Installed via `npm install -g nxapi`
- nxapi pctl auth succeeded (Nintendo Account token is valid)
- The error occurs when making the first API call to Moon, not during auth

## Upstream

- GitHub repo: https://github.com/samuelthomas2774/nxapi (mirror of GitLab)
- Primary repo: https://gitlab.fancy.org.uk/samuel/nxapi
- No existing issue filed for this specific error as of 2026-04-10
- The maintainer (Ellie) controls the remote config server
