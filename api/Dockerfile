# The production image. Nothing here is shared with Dockerfile.dev, which builds
# a hot-reload container around a bind mount and ships nothing.
#
# Two stages, and the second one has no shell. That is the point: what a shell
# buys an attacker who reaches this container is everything, and what it buys us
# is a debugging convenience we can have another way (docs/runbooks/api.md).
#
# Base images are pinned by digest, not by tag. A tag can be moved by whoever
# owns the registry entry, which is exactly how the tj-actions attack worked one
# supply chain over. Raising a digest is a commit somebody reviews; Dependabot
# for Docker arrives in E2 and will open that PR. tools/check-dockerfiles.sh
# refuses a bare tag here so the rule is enforced rather than remembered.

# --------------------------------------------------------------------- build
FROM golang:1.26-alpine@sha256:28d89ee9cc0ff9fec75c82ca201e6bf7fdf9a679d4b7b24dfa04f2bb766bb468 AS build

WORKDIR /src

# The whole context, and NO `COPY go.mod go.sum` + `go mod download` in front of
# it. That is the reflex, and here it is the wrong trade (issue #58): the tool
# dependencies — sqlc, oapi-codegen and the 41 indirect lines they drag in —
# are in go.mod and reach no part of this binary. `go build ./cmd/api`
# downloads what the build actually needs and nothing else, so the layer is
# smaller and it does not go stale the day a tool version moves.
COPY . .

# Two build args, both public, both visible on /api/health. That is the entire
# list and it is a rule, not a coincidence: a build arg lands in the image
# layers and stays there after the value is rotated, so no token, no password
# and no pepper is ever passed this way. They arrive as runtime environment,
# from Dokploy. tools/check-dockerfiles.sh holds this file to it.
ARG VERSION=dev
ARG GIT_SHA=unknown

# CGO_ENABLED=0 so the result is a static binary — distroless/static has no libc
# to link against. -trimpath so the paths of this machine do not end up in the
# binary, which is one less way two builds of the same commit differ. The two -X
# flags are the ones internal/buildinfo documents; they are how a container with
# no .git can still answer "which build is this".
RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags="-s -w \
        -X github.com/G1NG4R/timseil-dev/api/internal/buildinfo.version=${VERSION} \
        -X github.com/G1NG4R/timseil-dev/api/internal/buildinfo.sha=${GIT_SHA}" \
      -o /out/api ./cmd/api

# --------------------------------------------------------------------- final
# distroless/static:nonroot is a filesystem with no shell, no package manager
# and no busybox. It brings the two things this binary cannot do without: the CA
# certificate bundle — GitHub's GraphQL endpoint and OVH's SMTP relay are both
# TLS, and without it every outbound call fails certificate verification — and
# an /etc/passwd containing nonroot (65532), so USER below names a real account.
#
# Nothing is installed on top. If a future phase seems to need a package here,
# what it actually needs is a different base image and an ADR saying so.
FROM gcr.io/distroless/static:nonroot@sha256:1c2c046bc09ed40fad370b599a0b1ae7987f55b01e247cf27a7c27cd97e5bbc7

COPY --from=build /out/api /api

# OCI labels. Without image.source a GHCR package hangs on nothing: no link
# back to the repository, no README on the package page, and — the part that
# matters later — no way for a reader to get from a published artefact to the
# commit that produced it. E3 signs these images and E4 pushes them; a
# provenance chain that starts at an image nobody can trace to a source tree
# starts one link short. Issue #111.
#
# revision and version are re-declared here because ARG does not cross a stage
# boundary. Their defaults are the same honest ones the binary carries: an
# unstamped build says "dev" and "unknown" rather than inventing a version.
ARG VERSION=dev
ARG GIT_SHA=unknown

LABEL org.opencontainers.image.source="https://github.com/G1NG4R/timseil-dev" \
      org.opencontainers.image.description="timseil.dev API — Go, pgx, PostgreSQL" \
      org.opencontainers.image.licenses="NOASSERTION" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${VERSION}"

# 65532:65532. The image already runs as this user; saying it out loud means a
# `docker run --user root` is a deliberate act and an inspectable one, and it
# survives a base image that changes its default.
USER nonroot:nonroot

# Documentation, not a rule — publishing the port is compose's decision and D2
# makes it. The number matches listenAddr in cmd/api/main.go.
EXPOSE 8080

# The probe is the binary (issue #57). There is no shell here to run `wget` in,
# so the exec form is not a preference: a CMD written as a string would be
# handed to /bin/sh, which does not exist, and every container would come up
# unhealthy. --timeout is above the 2s the probe gives itself, so a slow answer
# is reported by the process rather than cut by Docker. --start-period covers
# the pool opening its first connections; failures inside it do not count.
#
# --retries=3 and not the 12 compose.dev.yaml uses. That number is there to sit
# out air recompiling the world on a cold clone, which is a development problem
# and does not exist here. After the start period, three failures over fifteen
# seconds is an outage, and every reaction that waits on this answer — D2's
# startup order, E4's rollback gate — waits exactly that long to hear it.
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
  CMD ["/api", "-healthcheck"]

ENTRYPOINT ["/api"]
