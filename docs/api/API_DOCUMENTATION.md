# API Documentation Guide

This document explains how to access, use, and maintain the ezBuildr API documentation.

---

## Accessing the API Documentation

### Swagger UI Interface

The ezBuildr API documentation is served via **Swagger UI**, an interactive API documentation interface that allows you to:

- Browse all available API endpoints
- View request/response schemas
- Test API calls directly from the browser
- See authentication requirements
- Explore data models

**URL:** [http://localhost:5000/api-docs](http://localhost:5000/api-docs)

**Production URL:** `https://your-domain.com/api-docs`

### Alternative Formats

In addition to the Swagger UI interface, you can also access the OpenAPI specification in raw formats:

- **JSON Format:** `http://localhost:5000/api-docs.json`
- **YAML Format:** `http://localhost:5000/api-docs.yaml`

These endpoints are useful for:
- Importing into API testing tools (Postman, Insomnia, etc.)
- Generating client SDKs
- Automated testing
- CI/CD integration

---

## OpenAPI Specification

The API documentation is based on **OpenAPI 3.0.3** specification located at:

```
/openapi.yaml
```

**Specification Stats:**
- **Lines:** 82,835+
- **Format:** YAML
- **Version:** OpenAPI 3.0.3
- **Size:** Comprehensive coverage of all 66+ API route files

### What's Documented

The OpenAPI specification includes:

#### Authentication
- Google OAuth2 authentication flow
- JWT Bearer token authentication
- Session-based authentication
- API token authentication for external access
- Portal magic link authentication

#### Core Resources
- **Projects:** Top-level containers for workflows
- **Workflows:** Complete workflow definitions
- **Sections:** Workflow pages/sections
- **Steps:** Individual workflow steps (15+ question types)
- **Runs:** Workflow execution instances
- **Values:** Step values and run data

#### DataVault (Data Management)
- **Databases:** Database definitions
- **Tables:** Table schemas and metadata
- **Rows:** Table data (CRUD operations)
- **Permissions:** Row-level and table-level permissions
- **API Tokens:** External API access tokens
- **Notes:** Row comments and collaboration

#### Custom Scripting
- **Lifecycle Hooks:** 4 workflow phases (beforePage, afterPage, beforeFinalBlock, afterDocumentsGenerated)
- **Document Hooks:** 2 document phases (beforeGeneration, afterGeneration)
- **Script Console:** Execution logs and debugging
- **Helper Library:** 40+ utility functions

#### Logic & Automation
- **Logic Rules:** Conditional logic (show/hide/require/skip)
- **Transform Blocks:** JavaScript/Python code blocks
- **Virtual Steps:** Computed values from transforms
- **Visibility Expressions:** Step-level visibility logic

#### Integrations & Connections
- **Connections:** API connections (OAuth2, API keys, bearer tokens)
- **Secrets:** Encrypted credentials (AES-256-GCM)
- **Webhooks:** Webhook subscriptions and events
- **External Destinations:** HTTP/API integrations

#### Document Generation & E-Signature
- **Documents:** Document templates (PDF/DOCX)
- **Final Blocks:** Document generation configuration
- **E-Signature:** DocuSign, HelloSign integration
- **Signature Requests:** Signature workflow management

#### AI Features
- **Workflow Generation:** Generate workflows from natural language
- **Optimization:** Workflow improvement suggestions
- **Transform Generation:** Generate code blocks from descriptions
- **Template Binding:** AI-powered variable mapping

#### Templates & Marketplace
- **Templates:** Reusable workflow templates
- **Marketplace:** Template sharing and discovery
- **Blueprints:** Template structure definitions
- **Template Testing:** Test runner with sample data

#### Analytics & Reporting
- **Analytics:** Workflow metrics and insights
- **Funnel Analysis:** Completion funnel tracking
- **Dropoff Analysis:** Identify abandonment points
- **Heatmaps:** Field-level engagement data
- **Exports:** JSON, CSV, PDF export formats

#### Portal & External Access
- **Portal:** External user portal system
- **Magic Links:** Token-based authentication
- **Public Workflows:** Anonymous access workflows
- **Run Sharing:** Share completed runs

#### Teams & Collaboration
- **Teams:** Team management
- **Team Members:** Member invitation and roles
- **Project Access:** Project-level permissions
- **Workflow Access:** Workflow-level permissions
- **Organizations:** Enterprise organization management

#### Admin & Enterprise
- **Admin Dashboard:** System overview and stats
- **User Management:** User administration
- **Audit Logs:** Comprehensive activity tracking
- **Billing:** Stripe subscription management
- **Usage Metrics:** Resource usage tracking

---

## Using the Swagger UI

### Navigation

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Open your browser:**
   Navigate to `http://localhost:5000/api-docs`

3. **Browse endpoints:**
   - Endpoints are organized by tags (e.g., Workflows, DataVault, AI)
   - Click on any endpoint to expand details
   - View request parameters, body schemas, and response formats

### Testing Endpoints

#### Step 1: Authenticate

Most endpoints require authentication. You have several options:

**Option A: Session Authentication (Recommended for Browser)**
1. Open a new tab and log in to the application at `http://localhost:5000`
2. Return to the Swagger UI tab
3. Your session cookie will be automatically included in requests

**Option B: Bearer Token**
1. Click the "Authorize" button at the top of the Swagger UI
2. Enter your JWT token in the format: `Bearer <your-token>`
3. Click "Authorize" to save
4. All subsequent requests will include this token

**Option C: API Token**
For external API access:
1. Generate an API token via DataVault settings
2. Use the token in the `Authorization` header: `Bearer <api-token>`

#### Step 2: Try an Endpoint

1. Click on any endpoint to expand it
2. Click "Try it out" button
3. Fill in required parameters:
   - **Path parameters:** e.g., `workflowId`, `databaseId`
   - **Query parameters:** e.g., `page`, `limit`, `filter`
   - **Request body:** Edit the JSON schema with your data
4. Click "Execute"
5. View the response:
   - Response code (200, 201, 400, 401, 404, 500, etc.)
   - Response body (JSON)
   - Response headers
   - Curl command (for copying to terminal)

### Understanding Schemas

Click on the "Schemas" section at the bottom of the page to view:
- Data models and their properties
- Required vs optional fields
- Field types and formats
- Validation rules
- Example values

---

## Updating the OpenAPI Specification

### When to Update

Update the OpenAPI specification when:
- Adding new API endpoints
- Modifying existing endpoint parameters
- Changing request/response schemas
- Adding new authentication methods
- Updating API descriptions or examples

### How to Update

The OpenAPI specification is maintained in `openapi.yaml`. You can update it in two ways:

#### Manual Editing

1. Open `openapi.yaml` in your text editor
2. Make your changes following the OpenAPI 3.0.3 specification
3. Validate your changes:
   ```bash
   npx @apidevtools/swagger-cli validate openapi.yaml
   ```
4. Restart the server to see changes:
   ```bash
   npm run dev
   ```

#### Using OpenAPI Tools

You can use various tools to help edit the specification:

- **Swagger Editor:** [editor.swagger.io](https://editor.swagger.io)
- **Stoplight Studio:** [stoplight.io](https://stoplight.io)
- **VS Code Extension:** "OpenAPI (Swagger) Editor" by 42Crunch

### Validation

Always validate your OpenAPI spec before committing:

```bash
# Install swagger-cli if not already installed
npm install -g @apidevtools/swagger-cli

# Validate the spec
npx @apidevtools/swagger-cli validate openapi.yaml

# Bundle into a single file (optional)
npx @apidevtools/swagger-cli bundle openapi.yaml -o docs/openapi.json
```

---

## Regenerating the Specification

If you need to regenerate the OpenAPI specification from scratch, you can use tools like:

### express-openapi-generator

```bash
npm install --save-dev express-openapi-generator

# Generate from your Express routes
npx express-openapi-generator \
  --input ./server/routes \
  --output ./openapi.yaml \
  --version 3.0.3
```

### swagger-jsdoc

```bash
npm install --save-dev swagger-jsdoc

# Generate from JSDoc comments in your code
npx swagger-jsdoc -d swagger.config.js server/routes/**/*.ts -o openapi.yaml
```

### Manual Regeneration

The most accurate approach is to manually maintain the specification as you build features. This ensures:
- Accurate descriptions and examples
- Proper authentication documentation
- Complete schema definitions
- Real-world usage examples

---

## Best Practices

### Documentation Quality

1. **Clear Descriptions:** Write clear, concise descriptions for all endpoints
2. **Examples:** Provide realistic request/response examples
3. **Error Codes:** Document all possible error responses
4. **Authentication:** Clearly indicate which endpoints require authentication
5. **Deprecation:** Mark deprecated endpoints clearly with migration guidance

### Maintenance

1. **Keep in Sync:** Update documentation when changing code
2. **Review Process:** Include documentation updates in code reviews
3. **Testing:** Test endpoints via Swagger UI to ensure accuracy
4. **Versioning:** Update version number when making breaking changes

### Security

1. **Sensitive Data:** Don't include real API keys or secrets in examples
2. **Authentication:** Document all authentication requirements
3. **Rate Limiting:** Document rate limits where applicable
4. **CORS:** Document CORS policies for cross-origin requests

---

## Troubleshooting

### Swagger UI Not Loading

**Problem:** Swagger UI returns 404 or blank page

**Solution:**
1. Ensure `openapi.yaml` exists in the project root
2. Check that `docs.routes.ts` is properly imported in `server/routes/index.ts`
3. Verify the server started successfully (check console for errors)
4. Try accessing `/api-docs/` (with trailing slash)

### OpenAPI Spec Errors

**Problem:** Swagger UI shows "Failed to load API definition"

**Solution:**
1. Validate your OpenAPI spec:
   ```bash
   npx @apidevtools/swagger-cli validate openapi.yaml
   ```
2. Check console logs for YAML parsing errors
3. Ensure proper YAML syntax (indentation, colons, hyphens)
4. Verify all `$ref` references are valid

### Authentication Issues

**Problem:** "Unauthorized" errors when testing endpoints

**Solution:**
1. Log in to the application first (for session auth)
2. Click "Authorize" and enter your Bearer token
3. Ensure your token hasn't expired
4. Check that the endpoint requires the authentication method you're using

### Missing Endpoints

**Problem:** Some endpoints don't appear in Swagger UI

**Solution:**
1. Verify the endpoint is defined in `openapi.yaml`
2. Check that the route is registered in `server/routes/index.ts`
3. Restart the server after making changes
4. Clear browser cache and reload

---

## Additional Resources

### OpenAPI Specification
- [OpenAPI 3.0.3 Specification](https://spec.openapis.org/oas/v3.0.3)
- [OpenAPI Guide](https://swagger.io/docs/specification/about/)
- [Swagger UI Documentation](https://swagger.io/docs/open-source-tools/swagger-ui/)

### Tools
- [Swagger Editor](https://editor.swagger.io) - Online OpenAPI editor
- [Postman](https://www.postman.com) - Import OpenAPI specs for testing
- [Insomnia](https://insomnia.rest) - API client with OpenAPI support
- [OpenAPI Generator](https://openapi-generator.tech) - Generate client SDKs

### ezBuildr Documentation
- [Main README](../README.md)
- [Architecture Overview](../CLAUDE.md)
- [API Reference](./api/API.md)
- [Developer Reference](./reference/DEVELOPER_REFERENCE.md)

---

## Support

For questions or issues with the API documentation:

1. Check this guide for common solutions
2. Review the [troubleshooting section](#troubleshooting)
3. Check the console logs for errors
4. Review the OpenAPI specification directly

---

**Last Updated:** January 2026
**Specification Version:** 1.7.0
**OpenAPI Version:** 3.0.3
