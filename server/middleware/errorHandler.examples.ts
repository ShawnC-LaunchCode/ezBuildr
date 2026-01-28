/**
 * Error Handler Middleware - Usage Examples
 *
 * This file demonstrates how to use the centralized error handling infrastructure.
 * DO NOT import this file - it's for documentation purposes only.
 */

import type { Express } from "express";

// import { isAuthenticated } from "../googleAuth";
const isAuthenticated = (req: any, res: any, next: any) => next();
import { logger } from "../logger";

import {
  errorHandler,
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError,
  assertFound,
  assertAuthorized,
  assertAuthenticated,
  validateInput,
} from "./errorHandler";

// ============================================================================
// SETUP: Register Error Handler in Main Server File
// ============================================================================

/**
 * In your main server file (e.g., server/index.ts), register the error handler
 * AFTER all routes but BEFORE starting the server.
 *
 * IMPORTANT: The error handler must be registered after all routes!
 */
function setupErrorHandlerExample(app: Express) {
  // ... all your route registrations ...
  // app.use('/api/surveys', surveyRoutes);
  // app.use('/api/projects', projectRoutes);
  // etc.

  // Register error handler LAST
  app.use(errorHandler);

  // Start server
  // app.listen(port, () => { ... });
}

// ============================================================================
// EXAMPLE 1: Using asyncHandler Wrapper (Recommended)
// ============================================================================

/**
 * The asyncHandler wrapper automatically catches errors and passes them to
 * the error handler middleware. This eliminates the need for try/catch blocks.
 */
function exampleAsyncHandler(app: Express) {
  // BEFORE (old pattern):
  app.get("/api/surveys/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const survey = await getSurvey(req.params.id);

      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      if (survey.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(survey);
    } catch (error) {
      logger.error({ err: error }, "Error");
      res.status(500).json({ message: "Failed to fetch survey" });
    }
  });

  // AFTER (new pattern with asyncHandler):
  app.get(
    "/api/surveys/:id",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;
      const survey = await getSurvey(req.params.id);

      // Throw custom errors - they'll be caught automatically
      if (!survey) {
        throw new NotFoundError("Survey not found");
      }

      if (survey.creatorId !== userId) {
        throw new ForbiddenError("Access denied - you do not own this survey");
      }

      res.json(survey);
    })
  );
}

// ============================================================================
// EXAMPLE 2: Using Helper Functions (Most Concise)
// ============================================================================

/**
 * Helper functions like assertFound and assertAuthorized make code even cleaner
 */
function exampleHelperFunctions(app: Express) {
  app.get(
    "/api/surveys/:id",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;

      // assertAuthenticated throws UnauthorizedError if falsy
      assertAuthenticated(userId, "Unauthorized - no user ID");

      const survey = await getSurvey(req.params.id);

      // assertFound throws NotFoundError if null/undefined
      assertFound(survey, "Survey not found");

      // assertAuthorized throws ForbiddenError if condition is false
      assertAuthorized(
        survey.creatorId === userId,
        "Access denied - you do not own this survey"
      );

      res.json(survey);
    })
  );
}

// ============================================================================
// EXAMPLE 3: Throwing Custom Errors from Services
// ============================================================================

/**
 * Services can throw custom errors which will be automatically handled
 */
class SurveyServiceExample {
  async getSurvey(id: string, userId: string) {
    const survey = await db.findSurvey(id);

    // Throw custom errors from services
    if (!survey) {
      throw new NotFoundError("Survey not found");
    }

    if (survey.creatorId !== userId) {
      throw new ForbiddenError("Access denied - you do not own this survey");
    }

    return survey;
  }

  async deleteSurvey(id: string, userId: string) {
    const survey = await this.getSurvey(id, userId);

    if (survey.status === "published") {
      throw new BadRequestError("Cannot delete published survey");
    }

    await db.deleteSurvey(id);
    return { message: "Survey deleted successfully" };
  }
}

// Then in routes, errors from services are automatically caught:
function exampleServiceErrors(app: Express) {
  const surveyService = new SurveyServiceExample();

  app.delete(
    "/api/surveys/:id",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;
      // If service throws NotFoundError, ForbiddenError, or BadRequestError,
      // it's automatically caught and proper status code is returned
      const result = await surveyService.deleteSurvey(req.params.id, userId);
      res.json(result);
    })
  );
}

// ============================================================================
// EXAMPLE 4: Handling Validation Errors
// ============================================================================

/**
 * Zod validation errors are automatically handled and return 400 status
 */
function exampleValidation(app: Express) {
  const createSurveySchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
  });

  // Option 1: Let Zod throw (automatic handling)
  app.post(
    "/api/surveys",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;

      // If validation fails, ZodError is thrown and automatically caught
      // Error handler returns 400 with validation details
      const data = createSurveySchema.parse(req.body);

      const survey = await createSurvey({ ...data, creatorId: userId });
      res.json(survey);
    })
  );

  // Option 2: Use validateInput helper (same result)
  app.post(
    "/api/surveys",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;
      const data = validateInput(createSurveySchema, req.body);

      const survey = await createSurvey({ ...(data as any), creatorId: userId });
      res.json(survey);
    })
  );
}

// ============================================================================
// EXAMPLE 5: Migration Pattern for Existing Routes
// ============================================================================

/**
 * Step-by-step migration from old pattern to new pattern
 */
function exampleMigration(app: Express) {
  // STEP 1: Keep existing try/catch, but throw custom errors instead of manual status codes
  app.put("/api/surveys/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const survey = await getSurvey(req.params.id);

      // Replace manual status responses with thrown errors
      if (!survey) {
        throw new NotFoundError("Survey not found"); // Instead of res.status(404).json(...)
      }

      if (survey.creatorId !== userId) {
        throw new ForbiddenError("Access denied"); // Instead of res.status(403).json(...)
      }

      const updated = await updateSurvey(survey.id, req.body);
      res.json(updated);
    } catch (error) {
      // In this step, you can keep the old error handling or use next(error)
      logger.error({ error }, "Error");
      // Option A: Keep old pattern temporarily
      if (error instanceof NotFoundError) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      // Option B: Pass to error handler (better)
      // next(error);
      res.status(500).json({ message: "Failed to update survey" });
    }
  });

  // STEP 2: Remove try/catch and wrap with asyncHandler
  app.put(
    "/api/surveys/:id",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;
      const survey = await getSurvey(req.params.id);

      if (!survey) {
        throw new NotFoundError("Survey not found");
      }

      if (survey.creatorId !== userId) {
        throw new ForbiddenError("Access denied");
      }

      const updated = await updateSurvey(survey.id, req.body);
      res.json(updated);
    })
  );

  // STEP 3: Simplify with helper functions (optional)
  app.put(
    "/api/surveys/:id",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;
      const survey = await getSurvey(req.params.id);

      assertFound(survey, "Survey not found");
      assertAuthorized(survey.creatorId === userId, "Access denied");

      const updated = await updateSurvey(survey.id, req.body);
      res.json(updated);
    })
  );
}

// ============================================================================
// EXAMPLE 6: Complex Error Scenarios
// ============================================================================

/**
 * Handling more complex error scenarios
 */
function exampleComplexErrors(app: Express) {
  app.post(
    "/api/teams/:teamId/members",
    isAuthenticated,
    asyncHandler(async (req: any, res) => {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { email } = validateInput(addMemberSchema, req.body) as { email: string };

      // Check if team exists
      const team = await getTeam(teamId);
      assertFound(team, "Team not found");

      // Check if user is team admin
      const membership = await getTeamMembership(teamId, userId);
      assertAuthorized(
        membership?.role === "admin",
        "Access denied - team admin access required"
      );

      // Check if user to add exists
      const userToAdd = await getUserByEmail(email);
      assertFound(userToAdd, "User not found");

      // Check if user is already a member
      const existingMember = await getTeamMembership(teamId, userToAdd.id);
      if (existingMember) {
        throw new BadRequestError("User is already a team member");
      }

      const member = await addTeamMember(teamId, userToAdd.id);
      res.json({ success: true, data: member });
    })
  );
}

// ============================================================================
// EXAMPLE 7: Error Handling in Middleware
// ============================================================================

/**
 * Custom middleware can also throw errors that will be caught
 */
function requireTeamMember(req: any, res: any, next: any) {
  // Wrap async middleware with asyncHandler too
  return asyncHandler(async (req: any, res, next) => {
    const userId = req.user?.claims?.sub;
    assertAuthenticated(userId);

    const { teamId } = req.params;
    const membership = await getTeamMembership(teamId, userId);

    assertAuthorized(
      membership !== null,
      "Access denied - you are not a member of this team"
    );

    req.teamMembership = membership;
    next();
  })(req, res, next);
}

// Use in routes
function exampleMiddlewareErrors(app: Express) {
  app.get(
    "/api/teams/:teamId/projects",
    isAuthenticated,
    requireTeamMember,
    asyncHandler(async (req: any, res) => {
      const { teamId } = req.params;
      const projects = await getTeamProjects(teamId);
      res.json(projects);
    })
  );
}

// ============================================================================
// Mock functions (for example purposes only)
// ============================================================================

const db: any = {};
const z: any = {};

async function getSurvey(id: string): Promise<any> {
  return null;
}
async function createSurvey(data: any): Promise<any> {
  return null;
}
async function updateSurvey(id: string, data: any): Promise<any> {
  return null;
}
async function getTeam(id: string): Promise<any> {
  return null;
}
async function getTeamMembership(teamId: string, userId: string): Promise<any> {
  return null;
}
async function getUserByEmail(email: string): Promise<any> {
  return null;
}
async function addTeamMember(teamId: string, userId: string): Promise<any> {
  return null;
}
async function getTeamProjects(teamId: string): Promise<any> {
  return [];
}
const addMemberSchema = z.object({ email: z.string().email() });
