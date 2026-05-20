# Journey sample files

Tiny, license-free fixtures used by `journey-extras.sh` to exercise the
real upload pipeline (presign → PUT to MinIO → register → signed GET →
byte-equal round-trip). All four files are hand-crafted and in the
public domain.

| File         | Bytes | Kind     | Notes                                       |
| ------------ | ----: | -------- | ------------------------------------------- |
| `sample.png` |    70 | image    | 1×1 transparent PNG                         |
| `sample.wav` |   852 | voice    | 100 ms silence, 8 kHz mono 8-bit unsigned   |
| `sample.pdf` |   421 | pdf      | Minimal valid PDF 1.1                       |
| `sample.txt` |    57 | document | Plain text                                  |

Keep these small — they're round-tripped in CI/manual journey runs and
are not meant to be representative content.
