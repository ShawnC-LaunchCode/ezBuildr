# OpenTelemetry Metrics - Quick Reference

## Setup (3 Steps)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure `.env`:**
   ```bash
   ENABLE_TELEMETRY=true
   METRICS_PORT=9464
   METRICS_API_KEY=optional-secret
   ```

3. **Start server:**
   ```bash
   npm run dev
   ```

## Access Metrics

```bash
# View all metrics
curl http://localhost:5000/metrics

# With API key
curl -H "x-api-key: your-key" http://localhost:5000/metrics
```

## Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `auth_login_attempts` | Counter | Login attempts by status (success/failure/mfa_required) |
| `auth_mfa_events` | Counter | MFA events (enabled/disabled/verified) |
| `auth_session_operations` | Counter | Session operations (created/refreshed/revoked) |
| `auth_endpoint_duration` | Histogram | Auth endpoint latency in milliseconds |
| `auth_sessions_active` | Gauge | Current active sessions |

## Common Prometheus Queries

```promql
# Login success rate (last 5m)
rate(auth_login_attempts{status="success"}[5m]) / rate(auth_login_attempts[5m])

# Failed logins (last 1h)
increase(auth_login_attempts{status="failure"}[1h])

# Average login latency
rate(auth_endpoint_duration_sum{endpoint="login"}[5m]) / rate(auth_endpoint_duration_count{endpoint="login"}[5m])

# P95 latency
histogram_quantile(0.95, rate(auth_endpoint_duration_bucket{endpoint="login"}[5m]))

# Active sessions
auth_sessions_active
```

## Instrumented Endpoints

- `POST /api/auth/login` - Login attempts, latency
- `POST /api/auth/refresh-token` - Token refresh, latency
- `POST /api/auth/logout` - Session revocation
- `POST /api/auth/mfa/verify` - MFA enablement
- `POST /api/auth/mfa/verify-login` - MFA verification
- `POST /api/auth/mfa/disable` - MFA disablement

## Grafana Dashboards

### Panel 1: Login Success Rate
```promql
Query: rate(auth_login_attempts{status="success"}[5m]) / rate(auth_login_attempts[5m])
Type: Gauge
Unit: Percent (0-1)
```

### Panel 2: Failed Logins
```promql
Query: increase(auth_login_attempts{status=~"failure|account_locked"}[1h])
Type: Bar Gauge
```

### Panel 3: Login Latency (P50, P95, P99)
```promql
Query A (P50): histogram_quantile(0.50, rate(auth_endpoint_duration_bucket{endpoint="login"}[5m]))
Query B (P95): histogram_quantile(0.95, rate(auth_endpoint_duration_bucket{endpoint="login"}[5m]))
Query C (P99): histogram_quantile(0.99, rate(auth_endpoint_duration_bucket{endpoint="login"}[5m]))
Type: Time series
Unit: milliseconds
```

### Panel 4: Active Sessions
```promql
Query: auth_sessions_active
Type: Stat
```

## Alerting Rules

```yaml
groups:
  - name: auth
    rules:
      # High failure rate
      - alert: HighLoginFailureRate
        expr: rate(auth_login_attempts{status="failure"}[5m]) > 0.2
        for: 5m

      # Slow logins
      - alert: SlowLoginEndpoint
        expr: histogram_quantile(0.95, rate(auth_endpoint_duration_bucket{endpoint="login"}[5m])) > 1000
        for: 5m

      # MFA failures
      - alert: MfaVerificationFailures
        expr: increase(auth_mfa_events{event="verification_failed"}[10m]) > 5
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 503 at /metrics | Set `ENABLE_TELEMETRY=true` |
| No metrics | Check telemetry initialized FIRST in `server/index.ts` |
| 401 at /metrics | Provide API key via header or query param |
| npm install fails | Install Visual Studio Build Tools (Windows) or use WSL2 |

## File Locations

- **Telemetry setup:** `server/observability/telemetry.ts`
- **Metrics service:** `server/services/MetricsService.ts`
- **Metrics endpoint:** `server/routes/metrics.ts`
- **Auth instrumentation:** `server/routes/auth.routes.ts`
- **Full docs:** `docs/OPENTELEMETRY.md`

## Performance

- **Latency overhead:** < 5ms per request
- **Memory:** ~10MB
- **CPU:** < 1% under normal load
