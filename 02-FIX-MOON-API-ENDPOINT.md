# Fix: nxapi Moon API Base URL and Endpoint Version Migration

## Context

01-FIX-PARENTAL-CONTROLS.md covered updating the version headers (znma_version, znma_build, OS version). Those patches were applied to `src/api/moon.ts` and the compiled JS. But the fix is incomplete. Even with correct version headers, Nintendo still rejects requests with `update_required`.

## The Real Problem

nxapi's Moon API client uses a **deprecated base URL and API version**:

```
nxapi:     https://api-lp1.pctl.srv.nintendo.net/moon/v1/
```

Nintendo has migrated the Parental Controls API to a new endpoint with new API versions:

```
current:   https://app.lp1.znma.srv.nintendo.net/v2/ and /v3/
```

Patching version headers alone doesn't work because the old endpoint (`api-lp1.pctl.srv.nintendo.net`) appears to reject all requests now, regardless of version headers.

## Evidence

We tested all combinations:
- Old URL + old headers: 400 `update_required`
- Old URL + new headers (2.4.0/660/34): 400 `update_required`
- Old URL + new headers + remote config disabled: 400 `update_required`
- Old URL + new headers + cache deleted: 400 `update_required`
- New URL + old API path (`/v1/users/.../devices`): 404 Not Found

The old endpoint rejects everything. The new endpoint exists but needs the correct API paths (v2/v3, not v1).

## Working Reference Implementation

[pynintendoparental](https://github.com/pantherale0/pynintendoparental) is a Python library that currently works with Nintendo's Parental Controls API. Use it as the reference for what the current API looks like.

Key file: `pynintendoparental/const.py` contains:
- Base URL: `https://app.lp1.znma.srv.nintendo.net`
- API uses `/v2/` and `/v3/` versioned endpoints
- Client ID: `54789befb391a838`
- App version: `2.4.0`, build: `660`
- User-Agent: `moon_ANDROID/2.4.0 (com.nintendo.znma; build:660; ANDROID 34)`
- Device model: `Pixel 4 XL`
- OS: `ANDROID`, version: `34`

Look at how pynintendoparental constructs its API calls (authentication flow, device listing, daily summaries) and replicate that structure in nxapi's Moon client.

## What Needs to Change in nxapi

### `src/api/moon.ts`
This is the main file. It needs:

1. **Base URL**: Change `MOON_URL` from `https://api-lp1.pctl.srv.nintendo.net/moon` to `https://app.lp1.znma.srv.nintendo.net`
2. **API paths**: All endpoint paths need updating from `/v1/...` to `/v2/...` or `/v3/...`. Check pynintendoparental for the correct version per endpoint.
3. **Headers**: The version headers from 01-FIX are correct (2.4.0/660/34). Keep those.
4. **Client ID**: May need updating to `54789befb391a838` (check if nxapi uses a different one for Moon auth).
5. **Request/response shapes**: The v2/v3 API may have different JSON structures than v1. Compare nxapi's type definitions against pynintendoparental's parsing code.

### `src/cli/pctl/dump-summaries.ts`
May need updates if the response format changed between v1 and v2/v3.

### `resources/common/remote-config.json`
Update the `moon` section. But also note: the remote config server at `fancy.org.uk` will override local values unless `NXAPI_ENABLE_REMOTE_CONFIG=0` is set. Any local fix should work regardless of what the remote config says.

## How to Test

```bash
# Build after making changes
npx tsc

# Run with remote config disabled so local values are used
NXAPI_ENABLE_REMOTE_CONFIG=0 node dist/cli-entry.js pctl dump-summaries /tmp/nxapi-test

# Success looks like: JSON files written to /tmp/nxapi-test with daily play summaries
# Failure looks like: MoonErrorResponse with 400 or 404
```

## Environment

- nxapi source: `~/dev/git/nxapi/` (cloned, dependencies installed, builds with `npx tsc`)
- nxapi v1.6.1
- Node.js v22.17.0, Windows 11
- `nxapi pctl auth` succeeded (Nintendo Account token is valid and stored in `%LOCALAPPDATA%/nxapi-nodejs/Data`)
- The auth token works, the API calls after auth are what's broken
