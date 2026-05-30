# Phase 1 — Local Observability Stack — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-1--local-observability-stack) §Phase 1
> **Total tasks:** 6
> **Progress:** 🔴 0 / 6 done (0%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID   | Task                                                                       | Status | Priority | Size | Depends on       |
| ---- | -------------------------------------------------------------------------- | ------ | -------- | ---- | ---------------- |
| P1-1 | `docker-compose.yml` — 5-service stack (healthchecks, 127.0.0.1 ports, volumes) | 🔴     | High     | M    | Phase 0          |
| P1-2 | `docker/loki/loki-config.yml` + `docker/tempo/tempo-config.yml`             | 🔴     | High     | M    | P1-1             |
| P1-3 | `docker/otel-collector/config.yml` (OTLP → Tempo + Loki via `otlphttp`)     | 🔴     | High     | M    | P1-1, P1-2       |
| P1-4 | `docker/grafana/provisioning/` — Loki + Tempo datasources + `traceId` derived field | 🔴     | High     | M    | P1-1, P1-2       |
| P1-5 | `docker/postgres/init.sql` (`CREATE DATABASE logger_example;`)              | 🔴     | Medium   | XS   | P1-1             |
| P1-6 | Root `.env.example` (every Appendix A variable) + `pnpm infra:up` green gate | 🔴     | High     | S    | P1-1..P1-5       |

---

## P1-1 — `docker-compose.yml` — 5-service stack (healthchecks, 127.0.0.1 ports, volumes)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `Phase 0`

### Description

Author the root `docker-compose.yml` that defines the full local observability backend: `postgres:18-alpine`, `grafana/loki`, `grafana/tempo`, `otel/opentelemetry-collector`, and `grafana/grafana`. Every service declares a **healthcheck** so `docker compose up -d --wait` (the `infra:up` script from P0-1) blocks until the stack is actually ready. All published ports bind to **`127.0.0.1`** (never `0.0.0.0`) so the demo never exposes Loki/Tempo/Postgres to the LAN. Named volumes persist Postgres/Loki/Tempo/Grafana state across restarts. The bind-mounted config files (`docker/**`) are created in P1-2..P1-5; this task wires the mounts and `depends_on` ordering so the later tasks drop their files into a stack that already references them.

### Acceptance Criteria

- [ ] `docker-compose.yml` at repo root defines services `postgres`, `loki`, `tempo`, `otel-collector`, `grafana`.
- [ ] Images pinned per spec: `postgres:18-alpine`, `grafana/loki:latest`, `grafana/tempo:latest`, `otel/opentelemetry-collector:latest`, `grafana/grafana:latest`.
- [ ] Every published port is bound to `127.0.0.1` — `postgres 5432`, `loki 3100`, `tempo 3200`, `otel-collector 4317` (gRPC) + `4318` (HTTP), `grafana 3000`.
- [ ] Every service has a `healthcheck` block (with `interval`/`timeout`/`retries`/`start_period`).
- [ ] Named volumes declared for `postgres`, `loki`, `tempo`, `grafana` data.
- [ ] Config bind mounts wired: `./docker/loki/loki-config.yml`, `./docker/tempo/tempo-config.yml`, `./docker/otel-collector/config.yml`, `./docker/grafana/provisioning`, `./docker/postgres/init.sql`.
- [ ] `otel-collector depends_on` (with `condition: service_healthy`) `loki` + `tempo`; `grafana depends_on` `loki` + `tempo`.
- [ ] `docker compose config` validates the file (exit 0) with no interpolation warnings.

### Files to create / modify

- `docker-compose.yml` — the 5-service local stack.

### Agent Execution Prompt

> Role: Senior platform / DevOps engineer wiring a local observability stack with Docker Compose v2.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger` (see `docs/DEVELOPMENT_PLAN.md` §Phase 1 + `docs/OVERVIEW.md` §8 Local Stack). This is task P1-1. The `infra:up` script (`docker compose up -d --wait`) already exists from P0-1. The config files referenced by the bind mounts are authored in P1-2..P1-5 — wire the mounts now so they slot in. The port table is fixed: `postgres 5432`, `loki 3100`, `tempo 3200`, `otel-collector 4317/4318`, `grafana 3000`.
> Objective: Produce a validated root `docker-compose.yml` with healthchecks, `127.0.0.1`-bound ports, named volumes, and config bind mounts.
> Steps:
>
> 1. Create `/docker-compose.yml`. Do NOT set a top-level `version:` key (obsolete in Compose v2). Define a shared `services:` block:
>    ```yaml
>    services:
>      postgres:
>        image: postgres:18-alpine
>        environment:
>          POSTGRES_USER: postgres
>          POSTGRES_PASSWORD: postgres
>          POSTGRES_DB: postgres
>        ports:
>          - '127.0.0.1:5432:5432'
>        volumes:
>          - postgres-data:/var/lib/postgresql/data
>          - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
>        healthcheck:
>          test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres']
>          interval: 5s
>          timeout: 5s
>          retries: 10
>          start_period: 10s
>
>      loki:
>        image: grafana/loki:latest
>        command: ['-config.file=/etc/loki/loki-config.yml']
>        ports:
>          - '127.0.0.1:3100:3100'
>        volumes:
>          - ./docker/loki/loki-config.yml:/etc/loki/loki-config.yml:ro
>          - loki-data:/loki
>        healthcheck:
>          # busybox wget ships in the loki image; /ready returns 200 once ingester is live
>          test: ['CMD-SHELL', 'wget -q -O- http://localhost:3100/ready | grep -q ready || exit 1']
>          interval: 10s
>          timeout: 5s
>          retries: 12
>          start_period: 30s
>
>      tempo:
>        image: grafana/tempo:latest
>        command: ['-config.file=/etc/tempo/tempo-config.yml']
>        ports:
>          - '127.0.0.1:3200:3200'
>        volumes:
>          - ./docker/tempo/tempo-config.yml:/etc/tempo/tempo-config.yml:ro
>          - tempo-data:/var/tempo
>        healthcheck:
>          test: ['CMD-SHELL', 'wget -q -O- http://localhost:3200/ready | grep -q ready || exit 1']
>          interval: 10s
>          timeout: 5s
>          retries: 12
>          start_period: 30s
>
>      otel-collector:
>        image: otel/opentelemetry-collector:latest
>        command: ['--config=/etc/otelcol/config.yml']
>        ports:
>          - '127.0.0.1:4317:4317' # OTLP gRPC
>          - '127.0.0.1:4318:4318' # OTLP HTTP
>        volumes:
>          - ./docker/otel-collector/config.yml:/etc/otelcol/config.yml:ro
>        depends_on:
>          loki:
>            condition: service_healthy
>          tempo:
>            condition: service_healthy
>        healthcheck:
>          # the collector exposes a health_check extension on :13133 (enabled in P1-3 config)
>          test: ['CMD-SHELL', 'wget -q -O- http://localhost:13133/ || exit 1']
>          interval: 10s
>          timeout: 5s
>          retries: 12
>          start_period: 20s
>
>      grafana:
>        image: grafana/grafana:latest
>        environment:
>          GF_AUTH_ANONYMOUS_ENABLED: 'true'
>          GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
>          GF_AUTH_DISABLE_LOGIN_FORM: 'true'
>          GF_FEATURE_TOGGLES_ENABLE: traceQLStreaming
>        ports:
>          - '127.0.0.1:3000:3000'
>        volumes:
>          - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
>          - grafana-data:/var/lib/grafana
>        depends_on:
>          loki:
>            condition: service_healthy
>          tempo:
>            condition: service_healthy
>        healthcheck:
>          test: ['CMD-SHELL', 'wget -q -O- http://localhost:3000/api/health | grep -q ok || exit 1']
>          interval: 10s
>          timeout: 5s
>          retries: 12
>          start_period: 20s
>
>    volumes:
>      postgres-data:
>      loki-data:
>      tempo-data:
>      grafana-data:
>    ```
> 2. Confirm every `ports:` entry is prefixed with `127.0.0.1:` — grep the file: `grep -c "127.0.0.1:" docker-compose.yml` should be `6` (5432, 3100, 3200, 4317, 4318, 3000).
> 3. Do NOT create the `docker/**` config files here — they are P1-2 (loki/tempo), P1-3 (otel-collector), P1-4 (grafana), P1-5 (postgres). The mounts intentionally reference files that do not exist yet; `docker compose config` still validates because it does not stat bind sources.
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 Global Conventions and `docs/OVERVIEW.md` §8.
> - No `0.0.0.0` / unqualified host port bindings — every port MUST bind `127.0.0.1`.
> - No top-level `version:` key (Compose v2 ignores it and emits a warning).
> - Do NOT containerize the `apps/*` services here — only the five backend services (app services run on the host per §8).
>   Verification:
>
> - `docker compose config -q` — expected: exit 0, no warnings.
> - `docker compose config --services` — expected: prints `postgres loki tempo otel-collector grafana` (any order).
> - `grep -c "127.0.0.1:" docker-compose.yml` — expected: `6`.
> - `docker compose config | grep -c "healthcheck"` — expected: `>= 5`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P1-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P1-2 — `docker/loki/loki-config.yml` + `docker/tempo/tempo-config.yml`

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P1-1`

### Description

Author the Loki and Tempo server configs that back the bind mounts wired in P1-1. **Loki** must accept the **native OTLP** ingest path the collector targets in P1-3 (`/otlp`) with **`allow_structured_metadata: true`**, run single-binary filesystem storage, and enable **retention** through the compactor (`retention_enabled: true` + a `delete_request_store`) so the `RETENTION_DAYS` story (Maintenance page, later phases) has a real backend. **Tempo** runs single-binary local storage with an **OTLP receiver** (gRPC + HTTP) so the collector can forward spans, and exposes `/ready` for the healthcheck.

### Acceptance Criteria

- [ ] `docker/loki/loki-config.yml` — single-binary (`filesystem` object store), `auth_enabled: false`, HTTP on `3100`.
- [ ] Loki `limits_config.allow_structured_metadata: true` (mandatory for native OTLP ingest).
- [ ] Loki retention enabled: `compactor.retention_enabled: true` **and** a configured `delete_request_store` (e.g. `filesystem`).
- [ ] `docker/tempo/tempo-config.yml` — `server.http_listen_port: 3200`, `distributor.receivers.otlp` with `grpc` (`0.0.0.0:4317` inside the container network namespace is fine — only Compose publishes ports) + `http`, `storage.trace.backend: local`.
- [ ] Both files contain only valid YAML (no tabs); `docker compose config -q` still passes with the mounts present.
- [ ] Bringing up just these two services reaches healthy: `docker compose up -d --wait loki tempo` returns 0.

### Files to create / modify

- `docker/loki/loki-config.yml`
- `docker/tempo/tempo-config.yml`

### Agent Execution Prompt

> Role: Senior platform / SRE engineer configuring Grafana Loki + Tempo for a local demo.
> Context: Task P1-2 of `docs/DEVELOPMENT_PLAN.md` §Phase 1. The OTel Collector (P1-3) will push **logs to Loki's native OTLP endpoint** `http://loki:3100/otlp` and **traces to Tempo's OTLP receiver**. Loki v3+ ingests OTLP directly and **requires** `allow_structured_metadata: true` for it; the deprecated collector `loki` exporter is gone (see `docs/OVERVIEW.md` §8). Retention must be real so the later Maintenance page (`RETENTION_DAYS`) has a backend. Ports: Loki `3100`, Tempo `3200`.
> Objective: Produce both server configs as valid YAML wired for OTLP ingest + retention.
> Steps:
>
> 1. Create `/docker/loki/loki-config.yml`:
>    ```yaml
>    auth_enabled: false
>
>    server:
>      http_listen_port: 3100
>      grpc_listen_port: 9096
>      log_level: warn
>
>    common:
>      instance_addr: 127.0.0.1
>      path_prefix: /loki
>      storage:
>        filesystem:
>          chunks_directory: /loki/chunks
>          rules_directory: /loki/rules
>      replication_factor: 1
>      ring:
>        kvstore:
>          store: inmemory
>
>    schema_config:
>      configs:
>        - from: 2024-01-01
>          store: tsdb
>          object_store: filesystem
>          schema: v13
>          index:
>            prefix: index_
>            period: 24h
>
>    limits_config:
>      # MANDATORY for native OTLP ingest (collector → http://loki:3100/otlp)
>      allow_structured_metadata: true
>      retention_period: 744h # 31d ceiling; per-stream overrides can shorten
>      volume_enabled: true
>
>    compactor:
>      working_directory: /loki/compactor
>      retention_enabled: true
>      retention_delete_delay: 2h
>      delete_request_store: filesystem
>
>    ruler:
>      storage:
>        type: local
>        local:
>          directory: /loki/rules
>    ```
> 2. Create `/docker/tempo/tempo-config.yml`:
>    ```yaml
>    server:
>      http_listen_port: 3200
>      log_level: warn
>
>    distributor:
>      receivers:
>        otlp:
>          protocols:
>            grpc:
>              endpoint: 0.0.0.0:4317
>            http:
>              endpoint: 0.0.0.0:4318
>
>    ingester:
>      max_block_duration: 5m
>
>    compactor:
>      compaction:
>        block_retention: 48h # local demo trace retention
>
>    storage:
>      trace:
>        backend: local
>        wal:
>          path: /var/tempo/wal
>        local:
>          path: /var/tempo/blocks
>    ```
>    > NOTE: Tempo's OTLP receiver here listens on `4317`/`4318` **inside Tempo's container**; the collector forwards to `tempo:4317`. This is distinct from the host-published collector ports (also `4317`/`4318`) in P1-1 — different containers, no conflict on the Compose network.
> 3. Validate YAML and bring the two services up:
>    ```bash
>    docker compose config -q
>    docker compose up -d --wait loki tempo
>    ```
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §8. Use spaces only (no tabs) in YAML.
> - Do NOT use the removed Loki `boltdb-shipper`/legacy schema — use `tsdb` + `schema: v13`.
> - Keep storage `filesystem`/`local` — this is a self-contained local demo, not cloud object storage.
>   Verification:
>
> - `docker compose up -d --wait loki tempo` — expected: exit 0 (both healthy).
> - `curl -fsS http://127.0.0.1:3100/ready` — expected: `ready`.
> - `curl -fsS http://127.0.0.1:3200/ready` — expected: `ready`.
> - `grep -q "allow_structured_metadata: true" docker/loki/loki-config.yml` — expected: match.
> - `grep -q "retention_enabled: true" docker/loki/loki-config.yml` — expected: match.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P1-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P1-3 — `docker/otel-collector/config.yml` (OTLP → Tempo + Loki via `otlphttp`)

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P1-1`, `P1-2`

### Description

Author the OpenTelemetry Collector config: an **OTLP receiver** (gRPC `4317` + HTTP `4318`) that fans out **traces → Tempo** (OTLP) and **logs → Loki** via the **`otlphttp` exporter** pointed at Loki's **native OTLP endpoint** `http://loki:3100/otlp`. The deprecated `loki` exporter was **removed (late 2024)** and MUST NOT be used. Enable the `health_check` extension on `:13133` so the P1-1 healthcheck passes. This is the second of the two log-shipping paths documented in `OVERVIEW.md` §8 (the app's own `LokiDestination` is path A; this collector route is path B).

### Acceptance Criteria

- [ ] `docker/otel-collector/config.yml` defines `receivers.otlp` with both `grpc` (`0.0.0.0:4317`) and `http` (`0.0.0.0:4318`).
- [ ] `exporters.otlp` (or `otlp/tempo`) targets `tempo:4317` with `tls.insecure: true` for traces.
- [ ] `exporters.otlphttp` (or `otlphttp/loki`) targets `endpoint: http://loki:3100/otlp` for logs.
- [ ] The deprecated `loki` exporter is **absent** (grep proves no `loki:` exporter key).
- [ ] `extensions.health_check` listens on `0.0.0.0:13133` and is listed under `service.extensions`.
- [ ] `service.pipelines.traces` → `[otlp receiver] → [otlp/tempo exporter]`; `service.pipelines.logs` → `[otlp receiver] → [otlphttp/loki exporter]`.
- [ ] A `batch` processor is wired into both pipelines.
- [ ] `docker compose up -d --wait otel-collector` reaches healthy (depends_on loki+tempo already healthy).

### Files to create / modify

- `docker/otel-collector/config.yml`

### Agent Execution Prompt

> Role: Senior observability engineer configuring the OpenTelemetry Collector.
> Context: Task P1-3 of `docs/DEVELOPMENT_PLAN.md` §Phase 1. The collector receives OTLP from the apps and routes **traces → Tempo** and **logs → Loki's native OTLP endpoint** `http://loki:3100/otlp` (Loki has `allow_structured_metadata: true` from P1-2). ⚠️ The old `loki` exporter was **deprecated and removed** — use `otlphttp` instead (`docs/OVERVIEW.md` §8). The health_check extension on `:13133` backs the Compose healthcheck from P1-1. Container DNS names on the Compose network: `loki`, `tempo`.
> Objective: Produce a collector config that fans OTLP out to Tempo (traces) + Loki (logs) and exposes a health endpoint.
> Steps:
>
> 1. Create `/docker/otel-collector/config.yml`:
>    ```yaml
>    receivers:
>      otlp:
>        protocols:
>          grpc:
>            endpoint: 0.0.0.0:4317
>          http:
>            endpoint: 0.0.0.0:4318
>
>    processors:
>      batch:
>        timeout: 5s
>        send_batch_size: 1024
>
>    exporters:
>      # Traces → Tempo (OTLP gRPC on the Compose network)
>      otlp/tempo:
>        endpoint: tempo:4317
>        tls:
>          insecure: true
>      # Logs → Loki NATIVE OTLP endpoint. The deprecated `loki` exporter was REMOVED;
>      # Loki v3+ ingests OTLP directly at /otlp (needs allow_structured_metadata: true).
>      otlphttp/loki:
>        endpoint: http://loki:3100/otlp
>
>    extensions:
>      health_check:
>        endpoint: 0.0.0.0:13133
>
>    service:
>      extensions: [health_check]
>      pipelines:
>        traces:
>          receivers: [otlp]
>          processors: [batch]
>          exporters: [otlp/tempo]
>        logs:
>          receivers: [otlp]
>          processors: [batch]
>          exporters: [otlphttp/loki]
>    ```
> 2. Prove the removed exporter is not present:
>    ```bash
>    # must NOT match a top-level `loki:` exporter (otlphttp/loki is fine)
>    grep -E "^\s{2}loki:" docker/otel-collector/config.yml && echo "FAIL: deprecated loki exporter present" || echo "ok"
>    ```
> 3. Bring the collector up (loki + tempo must already be healthy from P1-2):
>    ```bash
>    docker compose up -d --wait otel-collector
>    ```
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §8 — `otlphttp` to `http://loki:3100/otlp`, NEVER the deprecated `loki` exporter.
> - Use container service names (`tempo`, `loki`) for endpoints, not `localhost`.
> - Spaces only in YAML; keep `tls.insecure: true` (local, non-TLS demo).
>   Verification:
>
> - `docker compose up -d --wait otel-collector` — expected: exit 0 (healthy).
> - `curl -fsS http://127.0.0.1:13133/` — expected: HTTP 200 (collector healthy).
> - `grep -q "http://loki:3100/otlp" docker/otel-collector/config.yml` — expected: match.
> - `grep -Eq "^\s{2}loki:" docker/otel-collector/config.yml` — expected: NO match (exit 1).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P1-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P1-4 — `docker/grafana/provisioning/` — Loki + Tempo datasources + `traceId` derived field

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** M (90–180 min)
- **Depends on:** `P1-1`, `P1-2`

### Description

Provision Grafana so it auto-registers the **Loki** and **Tempo** datasources on boot (no click-ops) and ships the **`traceId` derived field** on the Loki datasource that turns the `traceId` in every log line into a one-click link to the correlated Tempo trace. This derived field is the payoff that proves end-to-end logs↔traces correlation (`OVERVIEW.md` §8 + the Observability "logs ↔ traces correlation" pattern). The provisioning directory is bind-mounted by P1-1 at `/etc/grafana/provisioning`.

### Acceptance Criteria

- [ ] `docker/grafana/provisioning/datasources/datasources.yml` registers a **Loki** datasource (`url: http://loki:3100`) and a **Tempo** datasource (`url: http://tempo:3200`).
- [ ] The Loki datasource declares a **derived field** named `traceId` with a `matcherRegex` capturing the trace id and `datasourceUid` pointing at the Tempo datasource UID.
- [ ] The Tempo datasource sets `tracesToLogsV2` (or equivalent) back to Loki so the reverse pivot ("logs for this trace") works.
- [ ] Datasource UIDs are stable/explicit (e.g. `loki` and `tempo`) so the derived field can reference Tempo by UID.
- [ ] `apiVersion: 1` and the `datasources:` list shape are valid Grafana provisioning YAML.
- [ ] After `docker compose up -d --wait grafana`, `GET /api/datasources` lists both `loki` and `tempo`.

### Files to create / modify

- `docker/grafana/provisioning/datasources/datasources.yml`

### Agent Execution Prompt

> Role: Senior observability engineer provisioning Grafana datasources as code.
> Context: Task P1-4 of `docs/DEVELOPMENT_PLAN.md` §Phase 1. Grafana is bind-mounted at `/etc/grafana/provisioning` (P1-1) and runs with anonymous Admin auth. The **`traceId` derived field** on the Loki datasource is the headline correlation feature (`docs/OVERVIEW.md` §8). Logs arrive at Loki carrying `traceId` (camelCase from `apps/api`; the worker uses snake_case `trace_id` later — the regex below tolerates both). Container DNS: `loki`, `tempo`.
> Objective: Produce the Grafana provisioning file that auto-registers Loki + Tempo and wires bidirectional log↔trace correlation.
> Steps:
>
> 1. Create `/docker/grafana/provisioning/datasources/datasources.yml`:
>    ```yaml
>    apiVersion: 1
>
>    datasources:
>      - name: Loki
>        uid: loki
>        type: loki
>        access: proxy
>        url: http://loki:3100
>        isDefault: true
>        jsonData:
>          # Turn `traceId` (or snake_case `trace_id`) in any log line into a click-through to Tempo.
>          derivedFields:
>            - name: traceId
>              matcherRegex: '"trace_?[iI]d":"([a-f0-9]+)"'
>              url: '$${__value.raw}'
>              datasourceUid: tempo
>              urlDisplayLabel: 'View trace'
>
>      - name: Tempo
>        uid: tempo
>        type: tempo
>        access: proxy
>        url: http://tempo:3200
>        jsonData:
>          # Reverse pivot: from a trace span jump back to its Loki logs.
>          tracesToLogsV2:
>            datasourceUid: loki
>            spanStartTimeShift: '-1h'
>            spanEndTimeShift: '1h'
>            filterByTraceID: true
>            tags:
>              - key: service.name
>                value: service
>          nodeGraph:
>            enabled: true
>    ```
>    > NOTE on `$$`: in a Compose-interpolated file the `$` in `${__value.raw}` must be escaped as `$$` ONLY if this YAML is ever passed through `docker compose` interpolation. Since it is a **bind-mounted** file read directly by Grafana (not an `environment:` value), a single `$` is also correct — keep `$${__value.raw}` only if you observe Compose warning about it; otherwise use `${__value.raw}`.
> 2. Bring Grafana up (loki + tempo healthy from P1-2):
>    ```bash
>    docker compose up -d --wait grafana
>    ```
> 3. Confirm both datasources registered:
>    ```bash
>    curl -fsS http://127.0.0.1:3000/api/datasources | grep -Eo '"name":"(Loki|Tempo)"'
>    ```
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §8 (auto-registered Loki + Tempo + the `traceId` derived field).
> - Reference Tempo from the derived field by stable `uid: tempo`, not by name.
> - Spaces only in YAML.
>   Verification:
>
> - `docker compose up -d --wait grafana` — expected: exit 0 (healthy).
> - `curl -fsS http://127.0.0.1:3000/api/datasources` — expected: JSON listing both `Loki` and `Tempo`.
> - `grep -q "derivedFields" docker/grafana/provisioning/datasources/datasources.yml` — expected: match.
> - `grep -q "datasourceUid: tempo" docker/grafana/provisioning/datasources/datasources.yml` — expected: match.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P1-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P1-5 — `docker/postgres/init.sql` (`CREATE DATABASE logger_example;`)

- **Status:** 🔴 Not Started
- **Priority:** Medium
- **Size:** XS (<30 min)
- **Depends on:** `P1-1`

### Description

Create the Postgres init script that runs once on first container start (mounted by P1-1 into `/docker-entrypoint-initdb.d/`). It creates the `logger_example` database that `DATABASE_URL` points at (the Prisma demo domain + `PrismaLogDestination` durable tier land here in Phase 5). The official `postgres` image only runs files in `/docker-entrypoint-initdb.d/` when the data volume is empty — so this is a first-boot bootstrap, not an idempotent migration.

### Acceptance Criteria

- [ ] `docker/postgres/init.sql` issues `CREATE DATABASE logger_example;`.
- [ ] Guarded so a re-run on an existing DB does not hard-fail (e.g. a `\gexec` `SELECT … WHERE NOT EXISTS` guard or a documented "first-boot only" comment — `CREATE DATABASE` has no `IF NOT EXISTS` in Postgres).
- [ ] After a clean `docker compose up -d --wait postgres`, the `logger_example` database exists.
- [ ] The connection string `postgresql://postgres:postgres@localhost:5432/logger_example` (the `DATABASE_URL` default from Appendix A) connects.

### Files to create / modify

- `docker/postgres/init.sql`

### Agent Execution Prompt

> Role: Senior backend / data engineer bootstrapping a Postgres database.
> Context: Task P1-5 of `docs/DEVELOPMENT_PLAN.md` §Phase 1. The `postgres:18-alpine` service (P1-1) mounts this file at `/docker-entrypoint-initdb.d/init.sql`, executed once on first boot against the default `postgres` DB. `DATABASE_URL` (Appendix A) targets `…/logger_example`; Prisma creates the tables in Phase 5. Note: `CREATE DATABASE` has no `IF NOT EXISTS` in Postgres, so guard with the `\gexec` idiom.
> Objective: Produce `docker/postgres/init.sql` that creates `logger_example` idempotently-enough for repeated demos.
> Steps:
>
> 1. Create `/docker/postgres/init.sql`:
>    ```sql
>    -- Runs once on first container start (data volume empty), against the default `postgres` DB.
>    -- Postgres lacks `CREATE DATABASE IF NOT EXISTS`, so use the \gexec guard to stay re-run-safe.
>    SELECT 'CREATE DATABASE logger_example'
>    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logger_example')\gexec
>    ```
> 2. Bring Postgres up clean and verify the DB exists:
>    ```bash
>    docker compose up -d --wait postgres
>    docker compose exec -T postgres psql -U postgres -lqt | cut -d '|' -f1 | grep -qw logger_example
>    ```
>    Constraints:
>
> - Follow `docs/OVERVIEW.md` §8/§9. Keep credentials as the demo defaults (`postgres`/`postgres`) — they match `DATABASE_URL`.
> - Do NOT create application tables here — Prisma owns the schema (Phase 5).
> - The `\gexec` meta-command requires `psql` (the init runner uses it) — keep the trailing `\gexec` on its own logical line.
>   Verification:
>
> - `docker compose up -d --wait postgres` — expected: exit 0.
> - `docker compose exec -T postgres psql -U postgres -c "SELECT datname FROM pg_database WHERE datname='logger_example';"` — expected: one row `logger_example`.
> - `docker compose exec -T postgres psql "postgresql://postgres:postgres@localhost:5432/logger_example" -c "SELECT 1;"` — expected: returns `1`.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P1-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P1-6 — Root `.env.example` (every Appendix A variable) + `pnpm infra:up` green gate

- **Status:** 🔴 Not Started
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P1-1`, `P1-2`, `P1-3`, `P1-4`, `P1-5`

### Description

Author the root `.env.example` documenting **every** variable in the Appendix A / `OVERVIEW.md` §9 registry, then run the Phase 1 "Definition of done" gate: `pnpm infra:up` reports all five services healthy and Grafana at `:3000` shows the Loki + Tempo datasources. This closes the phase. `.env.example` is the only env file committed (real `.env` is gitignored, `!.env.example` allow-listed in P0-7).

### Acceptance Criteria

- [ ] `.env.example` at repo root defines, with sane defaults + a one-line comment each: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `OTEL_SERVICE_NAME`, `RELEASE_SHA`, `OTLP_TRACE_ENDPOINT`, `LOG_EXTRA_REDACT_PATHS`, `LOKI_URL`, `LOKI_QUERY_URL`, `DATABASE_URL`, `LOG_DB_MIN_LEVEL`, `RETENTION_DAYS`, `OTEL_FIELD_FORMAT`, `SENTRY_DSN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAFANA_URL`.
- [ ] Values align with §9 examples (e.g. `OTLP_TRACE_ENDPOINT=http://localhost:4318/v1/traces`, `LOKI_URL=http://localhost:3100/loki/api/v1/push`, `LOKI_QUERY_URL=http://localhost:3100`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/logger_example`, `LOG_DB_MIN_LEVEL=warn`, `RETENTION_DAYS=30`).
- [ ] `SENTRY_DSN` is present but empty (optional integration, unset by default).
- [ ] `git check-ignore .env.example` produces no match (it is committed; real `.env` stays ignored).
- [ ] `pnpm infra:up` exits 0 with all five services healthy (`postgres`, `loki`, `tempo`, `otel-collector`, `grafana`).
- [ ] Grafana `GET /api/datasources` returns both `Loki` and `Tempo` (the §1 DoD).
- [ ] `pnpm infra:down` tears the stack down cleanly afterward.

### Files to create / modify

- `.env.example` — root environment registry template.

### Agent Execution Prompt

> Role: Senior platform engineer finalizing the local stack + its env contract.
> Context: Task P1-6 of `docs/DEVELOPMENT_PLAN.md` §Phase 1 (the phase's Definition of done). The full variable list is `docs/OVERVIEW.md` §9 / Appendix A. `infra:up` = `docker compose up -d --wait` (from P0-1). `.env.example` is allow-listed past `.gitignore` (P0-7); the real `.env` is ignored. All ports bind `127.0.0.1`.
> Objective: Write the complete `.env.example` and prove the whole stack comes up healthy with Grafana showing both datasources.
> Steps:
>
> 1. Create `/.env.example` covering every Appendix A variable:
>    ```bash
>    # ── Runtime ────────────────────────────────────────────────────────────────
>    NODE_ENV=development                 # drives isPretty + deployment.environment resource attr
>    PORT=3000                            # apps/api HTTP port (worker uses 3001)
>    LOG_LEVEL=debug                      # BymaxLoggerModuleOptions.level
>
>    # ── Service identity / OTel ────────────────────────────────────────────────
>    OTEL_SERVICE_NAME=nest-logger-example-api      # service.name + OTel resource service.name
>    RELEASE_SHA=dev                                # service.version + OTel resource service.version
>    OTLP_TRACE_ENDPOINT=http://localhost:4318/v1/traces  # OTLP HTTP exporter → the Collector
>    OTEL_FIELD_FORMAT=camelCase                    # otel.fieldFormat (camelCase | snake_case)
>
>    # ── Redaction ──────────────────────────────────────────────────────────────
>    LOG_EXTRA_REDACT_PATHS=*.webhookSignature,payload.creditCard.*  # merged into the 97 defaults
>
>    # ── Loki (log aggregation tier) ────────────────────────────────────────────
>    LOKI_URL=http://localhost:3100/loki/api/v1/push   # LokiDestination push endpoint
>    LOKI_QUERY_URL=http://localhost:3100              # base URL the /logs/loki proxy queries
>
>    # ── Postgres (durable / audit tier + demo domain) ──────────────────────────
>    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/logger_example  # Prisma
>    LOG_DB_MIN_LEVEL=warn                # PrismaLogDestination.minLevel (durable tier floor)
>    RETENTION_DAYS=30                    # TTL sweep over application_logs (Maintenance page)
>
>    # ── Optional error tracking ────────────────────────────────────────────────
>    SENTRY_DSN=                          # unset → Sentry+OTel integration disabled
>
>    # ── Dashboard (apps/web) ───────────────────────────────────────────────────
>    NEXT_PUBLIC_API_URL=http://localhost:3000        # dashboard → apps/api logs/ API base
>    NEXT_PUBLIC_GRAFANA_URL=http://localhost:3000    # "View trace" deep-links via Grafana
>    ```
> 2. Run the Phase 1 DoD gate:
>    ```bash
>    pnpm infra:up                         # docker compose up -d --wait
>    docker compose ps                     # all five services should read healthy
>    curl -fsS http://127.0.0.1:3000/api/datasources | grep -Eo '"name":"(Loki|Tempo)"'
>    ```
> 3. Tear down to confirm a clean lifecycle:
>    ```bash
>    pnpm infra:down
>    ```
>    Constraints:
>
> - Follow `docs/DEVELOPMENT_PLAN.md` §2 + Appendix A and `docs/OVERVIEW.md` §9 — every variable present, defaults matching the §9 table.
> - Do NOT commit a real `.env`; only `.env.example`. Do NOT put real secrets in `SENTRY_DSN` (leave empty).
> - If any service is unhealthy, fix the owning task (P1-1..P1-5) and re-run — do NOT relax a healthcheck to make the gate pass.
>   Verification:
>
> - `pnpm infra:up` — expected: exit 0, all five services healthy.
> - `docker compose ps --format '{{.Service}} {{.Health}}'` — expected: `healthy` for all five.
> - `curl -fsS http://127.0.0.1:3000/api/datasources` — expected: lists `Loki` and `Tempo`.
> - `for v in NODE_ENV PORT LOG_LEVEL OTEL_SERVICE_NAME RELEASE_SHA OTLP_TRACE_ENDPOINT LOG_EXTRA_REDACT_PATHS LOKI_URL LOKI_QUERY_URL DATABASE_URL LOG_DB_MIN_LEVEL RETENTION_DAYS OTEL_FIELD_FORMAT SENTRY_DSN NEXT_PUBLIC_API_URL NEXT_PUBLIC_GRAFANA_URL; do grep -q "^$v=" .env.example || echo "MISSING $v"; done` — expected: no output.
> - `git check-ignore .env.example` — expected: no match (exit 1).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P1-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 1 is 6/6 — switch the Phase 1 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- _Phase not started._
