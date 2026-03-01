
import { Request, Response, NextFunction } from "express";

import { checkPermission } from "./checkPermission";
import { logger } from "../../logger";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function requireWorkspace(req: Request, res: Response, next: NextFunction) {
    const workspaceId = (req.headers['x-workspace-id'] as string) ?? (req.query.workspaceId as string);

    if (!workspaceId) {
        return res.status(400).json({ error: "Context Error: Missing Workspace ID" });
    }

    (req as Record<string, unknown>).workspaceId = workspaceId;
    next();
}

export function enforce(action: string, getResourceId?: (req: Request) => string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const workspaceId = (req as Record<string, unknown>).workspaceId;
        if (!workspaceId) {
            return res.status(400).json({ error: "Context Error: Missing Workspace ID" });
        }

        const userId = req.user.id as string;
        const resourceId = getResourceId ? getResourceId(req) : undefined;
        // In a real implementation we might infer resourceType from the route or arguments
        const resourceType = resourceId ? 'workflow' : undefined; // Simplified default

        try {
            const hasPermission = await checkPermission(userId, workspaceId as string, action, resourceType, resourceId);
            if (!hasPermission) {
                return res.status(403).json({ error: "Forbidden: Insufficient Permissions" });
            }
            next();
        } catch (err) {
            logger.error({ err, userId, action }, "Permission check failed");
            return res.status(500).json({ error: "Authorization Error" });
        }
    };
}
