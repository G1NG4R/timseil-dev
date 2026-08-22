# The production image. Dockerfile.dev next door runs `next dev` around a bind
# mount and ships nothing; this one ships.
#
# Three stages, and the split is not cosmetic: the runtime stage never sees
# node_modules. `output: 'standalone'` in next.config.ts makes `next build`
# trace what each route actually imports and write a self-contained tree, so
# what runs is that tree plus node — no devDependencies, no npm, no install step
# on start.
#
# Base image pinned by digest for the reason api/Dockerfile gives at more length:
# a tag can be moved by whoever owns the registry entry. tools/check-dockerfiles.sh
# refuses a bare tag here.

ARG NODE_IMAGE=node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43

# ---------------------------------------------------------------------- deps
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

# npm ci and not npm install: it installs what package-lock.json says and fails
# if the lock file disagrees with package.json, which is the difference between
# a reproducible image and a nearly reproducible one.
#
# The full install, NOT --omit=dev. The build needs typescript and
# babel-plugin-react-compiler, both devDependencies. Nothing from this stage
# reaches the runtime image, so there is nothing to save by pruning here.
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------- build
FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# A site whose argument is "everything here is checkable" does not build with a
# tool that reports home in the background. Set for the build as well as for the
# runtime, because `next build` is the half that phones.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# -------------------------------------------------------------------- runner
FROM ${NODE_IMAGE} AS runner

WORKDIR /app

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
      org.opencontainers.image.description="timseil.dev web — Next.js App Router, standalone" \
      org.opencontainers.image.licenses="NOASSERTION" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${VERSION}"

# The package manager does not ship.
#
# Trivy found seven HIGH/CRITICAL advisories in this image on the first run of
# the E2 pipeline, and every one of them was in npm's OWN bundled dependencies
# under /usr/local/lib/node_modules/npm — tar, undici, ip-address,
# brace-expansion. None of them ours, and none of them fixable from here: the
# pinned digest already IS the current node:24-alpine, so there was nothing for
# Dependabot to raise, and each advisory has a fix version so --ignore-unfixed
# does not hide them either.
#
# What is fixable is shipping a package manager in a production container at
# all. This stage installs nothing: it copies the standalone tree and runs
# `node server.js`. npm, npx and corepack are attack surface with no purpose
# here, and removing them takes all seven findings with them — measured, not
# assumed.
#
# If a future stage genuinely needs npm at runtime, what it actually needs is a
# different base image and an ADR saying so. Same sentence api/Dockerfile makes
# about installing packages on distroless.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Not optional, and the same trap as `-H 0.0.0.0` in Dockerfile.dev: server.js
# binds to HOSTNAME, and left to itself it binds to localhost — where it answers
# only itself, and the published port looks dead from every side.
ENV HOSTNAME=0.0.0.0

# Stops Next registering its own SIGTERM handler so instrumentation.ts can
# register one that pauses first. The pause is what lets Traefik take this
# container out of its pool before the socket goes away — without it every
# rollout loses a request on `/`, measured in E5b's lab. instrumentation.ts
# carries the reasoning and what the trade gives up. Issue #65, ADR 0035.
#
# In the image and not in compose, because it is a property of how this image
# is built rather than a knob: an image whose shutdown handler depends on an
# environment variable somebody remembered to set is an image with two
# behaviours. The DURATION is the knob, and that one is SHUTDOWN_DELAY.
ENV NEXT_MANUAL_SIG_HANDLE=true

# THE STANDALONE TRAP. Three copies, and the last two are the ones everybody
# forgets: `.next/standalone` contains NEITHER `public/` NOR `.next/static`.
# Next.js leaves them out on the assumption that a CDN serves them — this site
# has no CDN (ADR 0006), so this container serves them or nobody does.
#
# Drop either line and the build still succeeds, the container still starts, and
# every page comes up with no stylesheet, no font and no image. Build plan D1
# calls it the most common Next.js self-hosting error and it presents as "works
# locally, broken in the container".
#
# --chown because the files land under a user that is not the one running them.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# node (1000:1000), which the base image creates. There is no distroless
# equivalent for this half — Next's server needs a real node runtime — so the
# reduction available here is "not root", and it is taken.
USER node

EXPOSE 3000

# busybox wget is available here, unlike in the API's distroless image, so the
# probe is a command rather than a flag on the binary. Exec form so no shell is
# involved even though one exists.
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
  CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:3000/"]

# server.js, not `next start`. It is what standalone emits, and it is the whole
# reason node_modules is absent from this stage.
CMD ["node", "server.js"]
