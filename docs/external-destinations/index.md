# External Data Destinations (Webhooks)

VaultLogic allows workflows to send structured data to external systems using the **External Send Block**. This system is designed to be explicit, secure, and observable.

## Overview

The External Send system consists of:
1.  **External Destinations**: Configured endpoints (e.g., Webhooks) stored at the workspace level.
2.  **External Send Blocks**: Workflow steps that trigger a data push to a destination.
3.  **Execution Engine**: Handles validation, variable resolution, and transmission.

## Configuration

### 1. Define a Destination
External Destinations are stored in the database. Currently, this is managed via direct database insertion or admin API (UI pending).

**Model**:
- `type`: `webhook` (v1 supported)
- `config`:
    - `url`: Target URL
    - `method`: `POST` | `PUT`
    - `auth`: `none` | `bearer` | `basic`

### 2. Add Block to Workflow
Add a block of type `external_send`.

**Configuration**:
- `destinationId`: UUID of the External Destination.
- `payloadMappings`: Map of JSON keys to values (Static or `{{ variable }}`).
- `headers`: Optional custom headers.

## Execution Behavior

- **Payload Construction**: The runner resolves all mappings. Nested keys (e.g., `user.address.city`) are supported via dot notation.
- **Preview Safety**: In "Preview" mode, external sends are **skipped** to prevent pollution of production systems. A mock success response is returned.
- **Observability**: Execution results (success, status code, response snippet) are captured in the run logs.

## Security
- **Credentials**: Stored in the `config` JSONB column of `external_destinations`.
- **Scope**: Destinations are scoped to `workspaceId`.

## Supported Types
- **Webhook**: Generic HTTP POST/PUT.

## Future Roadmap
- Google Sheets Integration
- Airtable Integration
- Zapier/Make Integration
