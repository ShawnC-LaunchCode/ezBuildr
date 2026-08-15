# Build Stage
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Install dependencies needed for build
# Install dependencies needed for build
COPY package*.json ./
COPY .npmrc ./
# Install python/make/g++ for potential native module builds (bcrypt, isolated-vm).
#
# unzip is for Puppeteer's postinstall. Up to puppeteer 24 the Chromium download
# was extracted by the bundled extract-zip; puppeteer 25 dropped that dependency
# (it carried GHSA-jmr9-qjv8-65gv) and now shells out to a system unzip, falling
# back to an optional yauzl. node:24-bookworm-slim ships neither, so `npm ci`
# exits 1 with "no zip archiver is available" and the whole build fails. Caught
# by the test environment on the first promotion after the upgrade.
RUN apt-get update && apt-get install -y python3 make g++ unzip

# Configure npm for better network reliability and performance
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000

RUN npm ci

# SMOKE TEST: Verify native modules built correctly
# This will fail the build immediately if isolated-vm is broken, saving a deployment cycle
# Also verifying we can load the module in the build environment
RUN node -e "console.log('Testing isolated-vm load...'); require('isolated-vm'); console.log('isolated-vm loaded successfully');"

COPY . .

# ARG variables for frontend build (passed by Railway)
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_BASE_URL
# Set as ENV so they are visible to npm run build
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_BASE_URL=$VITE_BASE_URL

# Set NODE_OPTIONS to increase memory limit for Vite build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build the client and server
RUN npm run build
# Prune dev dependencies (Commented out for debugging 502)
# RUN npm prune --production

# Production Stage
FROM node:24-bookworm-slim

WORKDIR /app

# Install qpdf — used AT RUNTIME to decrypt/unlock restricted PDF templates before
# AcroForm filling (server/services/document/PdfService.ts unlockPdf). Without it,
# locked/encrypted PDF forms silently fall back to the original (un-fillable) buffer.
# Runtime-only; --no-install-recommends + apt cleanup keeps the image lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends qpdf \
    && rm -rf /var/lib/apt/lists/*

# dumb-init removed to prevent path mismatches on Debian
# RUN apt-get update && apt-get install -y dumb-init

ENV NODE_ENV=production
# Default to port 8080 (standard for many PaaS)
ENV PORT=8080

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
# migrations/meta/_journal.json is read AT RUNTIME by the portability feature
# (IEX2-8): ExportService stamps the journal head into every bundle manifest and
# ImportService compares it to reject bundles from a newer deployment. Both
# resolve it from process.cwd(), which is this WORKDIR. Without this copy the
# export path throws on every call and the import-side version guard silently
# never fires -- neither of which any test can catch, since the repo tree always
# has migrations/.
COPY --from=builder /app/migrations ./migrations
# runMigrations.ts is executed by railway.json's preDeployCommand
# (`npm run db:migrate` -> `tsx scripts/runMigrations.ts`), so the script file
# itself has to exist in the runtime image -- migrations/ alone is not enough.
# It is self-contained: it imports only drizzle-orm/pg/dotenv (all in
# node_modules, which is copied whole because the prune above is disabled) and
# reads './migrations' relative to this WORKDIR. Same class of gap as the
# journal copy above: nothing in the test suite can catch a missing file that
# the repo tree always has.
COPY --from=builder /app/scripts/runMigrations.ts ./scripts/runMigrations.ts
# Copy any public or necessary script files if they aren't bundled
# COPY --from=builder /app/public ./public

# EXPOSE instruction is documentation only, but removing to avoid confusion
# EXPOSE 8080

# Use dumb-init to handle signals correctly (Disabled for debugging)
# ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Switch to direct Node execution for better signal handling
CMD ["node", "dist/index.js"]
