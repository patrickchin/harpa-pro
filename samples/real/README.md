# Real journey-test samples (Git LFS)

Shared real voice/photo samples used by all journey tests. Distinct
from the tiny synthetic fixtures in `apps/cli/scripts/samples/`
(used for fast byte-equal round-trip checks).

Tracked with **Git LFS** via `.gitattributes` at the repo root. After
cloning the repo, ensure LFS is installed (`git lfs install`) and then
`git lfs pull` to fetch the actual binaries.

| File                          | Size  | Duration | Used by | Description |
| ----------------------------- | ----: | -------: | ------- | ----------- |
| `rain.m4a`           | 125K  |    0:10  | `scripts/journeys/core.sh` (default `VOICE_M4A`) + `journey.sh` | Short status clip — cheap on tokens, fast CI, still exercises full transcribe + summarise + title pipeline. |
| `framing.m4a`   | 4.2M  |    4:34  | `scripts/journeys/extended.sh` (default `VOICE_LONG`) | Multi-topic LGS framing walkthrough — produces rich transcript for the aggregator step. |
| `walkthrough.m4a`        | 5.0M  |    6:13  | manual / heavyweight runs (override `VOICE_M4A=…`) | ~6min construction-site walkthrough. Token-expensive; not a default. |

## Adding new samples

Drop files into this directory. Patterns covered by LFS in the repo
root `.gitattributes`:

- `*.m4a` / `*.mp4` / `*.wav` — audio
- `*.png` / `*.jpg` / `*.jpeg` — images

For other binary types, extend `.gitattributes` with
`git lfs track "samples/real/*.{ext}"`.

## Usage from journey scripts

`scripts/journeys/core.sh` and `extended.sh` default to the samples
listed above. Override per-run, e.g. to use the heavyweight walkthrough
in core:

```bash
VOICE_M4A=samples/real/walkthrough.m4a \
VOICE_DURATION_SEC=373 \
  PASSWORD=... bash scripts/journeys/all.sh dev
```
