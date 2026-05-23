# Real journey-test samples (Git LFS)

These are real voice notes and photos for end-to-end journey tests —
distinct from the tiny synthetic fixtures in `apps/cli/scripts/samples/`
(used for fast byte-equal round-trip checks).

Tracked with **Git LFS** via `.gitattributes` at the repo root. After
cloning the repo, ensure LFS is installed (`git lfs install`) and then
`git lfs pull` to fetch the actual binaries.

| File                   | Size | Description                                     |
| ---------------------- | ---: | ----------------------------------------------- |
| `site-walkthrough.m4a` | 5.0M | ~5min construction-site walkthrough recording, used by `journey-core.sh` for live transcription + summarisation. |

## Adding new samples

Drop files into this directory. Patterns covered by LFS in the repo
root `.gitattributes`:

- `*.m4a` / `*.mp4` / `*.wav` — audio
- `*.png` / `*.jpg` / `*.jpeg` — images

For other binary types, extend `.gitattributes` with
`git lfs track "scripts/samples/real/*.{ext}"`.

## Usage from journey scripts

`journey-core.sh` defaults `VOICE_M4A` to
`./sample-voice-note.m4a` (legacy path). Set it explicitly to use the
LFS sample:

```bash
VOICE_M4A=scripts/samples/real/site-walkthrough.m4a \
  PASSWORD=... bash scripts/journey-all.sh dev
```
