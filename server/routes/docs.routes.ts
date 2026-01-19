import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { asyncHandler } from '../utils/asyncHandler';
const router = Router();
/**
 * API Documentation Routes
 * Serves the OpenAPI 3.0 specification via Swagger UI
 */
// Load the OpenAPI specification
let swaggerDocument: any;
try {
  const openApiPath = path.join(process.cwd(), "openapi.yaml");
  if (!fs.existsSync(openApiPath)) {
    console.error(`OpenAPI spec not found at: ${openApiPath}`);
    swaggerDocument = {
      openapi: "3.0.3",
      info: {
        title: "ezBuildr API",
        version: "1.7.0",
        description: "API documentation is currently unavailable. Please ensure openapi.yaml exists in the project root."
      },
      paths: {}
    };
  } else {
    swaggerDocument = YAML.load(openApiPath);
    console.log("✅ OpenAPI specification loaded successfully");
  }
} catch (error) {
  console.error("Failed to load OpenAPI specification:", error);
  swaggerDocument = {
    openapi: "3.0.3",
    info: {
      title: "ezBuildr API",
      version: "1.7.0",
      description: `API documentation failed to load: ${error instanceof Error ? error.message : 'Unknown error'}`
    },
    paths: {}
  };
}
// Swagger UI options
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 50px 0 }
    .swagger-ui .scheme-container {
      background: #fafafa;
      box-shadow: none;
      padding: 20px;
      margin: 20px 0;
    }
  `,
  customSiteTitle: "ezBuildr API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    docExpansion: "list",
    tagsSorter: "alpha",
    operationsSorter: "alpha"
  }
};
// Redirect /api-docs to /api-docs/ for proper resource loading
router.get("/api-docs", (req, res) => {
  res.redirect("/api-docs/");
});
// Serve Swagger UI
router.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, swaggerUiOptions)
);
// JSON endpoint for raw OpenAPI spec
router.get("/api-docs.json", (req, res) => {
  res.json(swaggerDocument);
});
// YAML endpoint for raw OpenAPI spec
router.get("/api-docs.yaml", asyncHandler(async (req, res) => {
  res.type("text/yaml");
  try {
    const openApiPath = path.join(process.cwd(), "openapi.yaml");
    const yamlContent = await fsPromises.readFile(openApiPath, "utf8");
    res.send(yamlContent);
  } catch (error) {
    res.status(500).send("Error loading OpenAPI YAML file");
  }
}));
export function registerDocsRoutes(app: any): void {
  app.use(router);
  console.log("📚 API Documentation available at /api-docs");
}
export default router;