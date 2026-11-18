# FSP Phase-0 — Local Development Quickstart

## Stack

| Component | Technology | Where it runs |
|---|---|---|
| OLGP database | PostgreSQL 17 | Docker (`fsp-postgres` container, port 5432) |
| Ledger | TigerBeetle 0.17.9 | **Host binary** (`infrastructure/bin/tigerbeetle`, port 3000) |
| Core service | Spring Boot 4.0.9 (Java 25) | Host (`make backend-core`, port 8081) |
| BFF | Spring Boot 4.0.9 (Java 25) | Host (`make backend-bff`, port 8080) |
| SPA | React + Vite (Bun) | Host (`make frontend-dev`, port 5173) |

## Setup (first time)

```bash
# 1. Install frontend deps
make frontend-install

# 2. Start PostgreSQL
make infra-up

# 3. Format + start TigerBeetle (host binary — no Docker needed)
make tb-start
```

## Run the stack

```bash
# Terminal 1 (if not already running)
make infra-up
make tb-start

# Terminal 2 — core service
make backend-core

# Terminal 3 — BFF
make backend-bff

# Terminal 4 — SPA
make frontend-dev
```

- SPA: http://localhost:5173
- BFF: http://localhost:8080
- Core: http://localhost:8081

## TigerBeetle notes

- TigerBeetle runs as a **host binary** because Docker 25+ blocks `io_uring` by default (seccomp), which TigerBeetle requires. Running on the host keeps the setup simple.
- Data file: `infrastructure/tigerbeetle-data/0_0.tigerbeetle`
- Server log: `infrastructure/tigerbeetle-data/server.log`
- Cluster id `0` is testing-only (warning is expected).
- Reset: `make tb-reset` (creates a fresh formatted data file).

Note: TigerBeetle clients must match the server version family. The core uses
`com.tigerbeetle:tigerbeetle-java:0.17.9` to match the 0.17.9 server.

## Reset everything

```bash
make stop-all     # stop TigerBeetle + PostgreSQL
make clean        # also remove PostgreSQL volume
make tb-reset     # wipe TigerBeetle data
```

## Java version

The build requires **Java 25** (Temurin). A `.sdkmanrc` pins it for SDKMAN users:

```bash
source ~/.sdkman/bin/sdkman-init.sh
sdk env install   # first time
sdk env           # activate
```

Gradle 9.9.1 is used; the wrapper downloads it automatically.

## Build

```bash
cd backend
./gradlew build          # compile + test
./gradlew :core:bootJar  # core fat jar
./gradlew :bff:bootJar   # BFF fat jar
```
