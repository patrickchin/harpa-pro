# 2026-08-04 — storage worker runs without memory headroom

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The production storage worker was OOM-killed with exit 137 on
four consecutive daily briefs. Fly restarted it each time, and the durable
deletion queue was empty at every check, so cleanup remained recoverable but
the executor was not reliably available.

**Root cause.** The worker had a 256 MB Fly allocation but the guest exposed
only about 207 MiB. A read-only inspection after the latest restart found only
about 9 MiB available with an empty queue. Roughly 48 MiB RSS belonged to the
resident `pnpm` launcher, 11 MiB to the `tsx` CLI, 72 MiB to the worker Node
process, 9 MiB to two esbuild helpers, and 15 MiB to Fly's SSH helper before
kernel and filesystem overhead. That is an undersized runtime envelope; the
available evidence does not establish an application-heap leak.

**Fix.** Run the TypeScript entrypoint with Node's `tsx` loader directly so
the package-manager and CLI supervisors do not stay resident, and allocate
512 MB to the worker in both production and dev. Emit structured uptime, Node
RSS, heap, external-buffer, and guest total/free memory at startup and hourly
so a future growth trend can be separated from fixed launcher or VM overhead.

**Test.** `packages/api/src/workers/storage-worker-config.test.ts` pins the
direct launcher and 512 MB allocation in both Fly configs.
`packages/api/src/workers/storage-worker-memory.test.ts` pins the structured
resource sample without reading a real Machine.

**Pattern.** New operational sizing recurrence; no existing application bug
pattern describes a service-less process whose launcher and guest overhead
consume most of its Machine allocation.
