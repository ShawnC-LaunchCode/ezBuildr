
import { Request, Response, NextFunction } from "express";
import { checkPermission } from "./checkPermission";

export function requireWorkspace(req: Request, res: Response, next: NextFunction) {
    const workspaceId = req.headers['x-workspace-id'] as string || req.query.workspaceId as string;

    if (!workspaceId) {
        return res.status(400).json({ error: "Context Error: Missing Workspace ID" });
    }

    // Attach to request for downstream use
    (req as any).workspaceId = workspaceId;
    next();
}

export function enforce(action: string, getResourceId?: (req: Request) => string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const workspaceId = (req as any).workspaceId;
        if (!workspaceId) {
            return res.status(400).json({ error: "Context Error: Missing Workspace ID" });
        }

        const userId = req.user.id;
        const resourceId = getResourceId ? getResourceId(req) : undefined;
        // In a real implementation we might infer resourceType from the route or arguments
        const resourceType = resourceId ? 'workflow' : undefined; // Simplified default

        try {
            const hasPermission = await checkPermission(userId, workspaceId, action, resourceType, resourceId);
            if (!hasPermission) {
                return res.status(403).json({ error: "Forbidden: Insufficient Permissions" });
            }
            next();
        } catch (err) {
            console.error("Permission Check Failed:", err);
            return res.status(500).json({ error: "Authorization Error" });
        }
    };
}
