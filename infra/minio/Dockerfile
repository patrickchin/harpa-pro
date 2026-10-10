# Local development and integration tests only; production uses Cloudflare R2.
# Build official source revisions because MinIO no longer distributes CE images.
FROM golang:1.24.13-bookworm AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
# RELEASE.2025-10-15T17-29-55Z
RUN go install github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
# RELEASE.2025-08-13T08-35-41Z
RUN go install github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096

FROM alpine:3.22.1
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /go/bin/minio /go/bin/mc /usr/local/bin/
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
