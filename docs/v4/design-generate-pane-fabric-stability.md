# Generate-pane Fabric host stability

## Status

Approved for implementation under the request to stabilize and rerun the full
local Maestro suite.

## Problem

Automatic report regeneration toggles `generation.isUpdating` while the Edit
pane remains mounted off screen. Its inner form wrapper changes between
`flex-1 opacity-60` and `flex-1`. On Android Fabric, that transition can change
the wrapper from a native host to a flattened layout-only view. The same mount
batch then targets the removed tag with `UPDATE LAYOUT`, terminating the React
surface with `RetryableMountingLayerException: Unable to find viewState`.

The fresh Android regression artifact maps missing tag `13758` to this exact
wrapper. The same tag relationship appeared in the earlier full-run failure,
so a Maestro wait cannot prevent it: the application crashes while producing
the state that the wait observes.

## Decision

Keep the Edit pane's form-content wrapper as a stable native host across both
generation states by setting `collapsable={false}`. Give it a stable test id so
component coverage can pin the native-host contract. Retain the existing
opacity and pointer-event behavior; do not remount panes or add E2E sleeps and
retries.

## Verification

Component coverage will require the wrapper to stay non-collapsable while a
report transitions from generating to current. The existing generation state
tests, release-confidence policy, two fresh Android regression journeys, and
the complete post-merge local Maestro inventory provide broader proof.
