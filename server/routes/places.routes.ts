import { Router } from "express";
import rateLimit from "express-rate-limit";
// @ts-ignore - TODO: fix type
import apicache from "apicache";

import { creatorOrRunTokenAuth } from "../middleware/runTokenAuth";
import { googlePlacesService } from "../services/GooglePlacesService";
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const cache = apicache.middleware;

const placesRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: { error: "Too many places requests" }
});

// Allow either standard user session/JWT OR a valid run token (for preview/public runners)
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.use(creatorOrRunTokenAuth);

// Protect these routes to logged-in users to prevent abuse of our API key
// If requireAuth isn't globally applied to /api, apply it here.
// Checking routes/index.ts, most routes use specific registration functions.
// Let's assume we can just use the router and apply middleware if needed.
// Given strict instructions not to assume, I'll check auth middleware usage in other files if needed, 
// but requireAuth is safe guess or I can skip if covered by parent.
// For now, I'll make it open but suggest adding auth. 
// Actually, looking at `routes/index.ts`: `registerAuthRoutes(app)` etc.
// `server/middleware/auth.ts` probably exists. 

const sanitizeAutocompleteCache = (req: any, res: any, next: any) => {
    const input = (req.query.input || '').toString().toLowerCase().trim();
    const lat = req.query.lat ? parseFloat(req.query.lat as string).toFixed(4) : '';
    const lng = req.query.lng ? parseFloat(req.query.lng as string).toFixed(4) : '';
    const radius = req.query.radius ? parseFloat(req.query.radius as string).toFixed(0) : '';
    // SEC-010: Normalize URL so apicache uses a sanitized, bloated-free key
    req.originalUrl = req.url = `/api/places/autocomplete?i=${encodeURIComponent(input)}&l=${lat}&g=${lng}&r=${radius}`;
    next();
};

router.get("/autocomplete", placesRateLimit, sanitizeAutocompleteCache, cache("15 minutes"), asyncHandler(async (req, res) => {
    try {
        const input = req.query.input as string;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const radius = req.query.radius ? parseFloat(req.query.radius as string) : undefined;

        if (!input) {
            res.status(400).json({ error: "Input is required" });
            return;
        }
        const suggestions = await googlePlacesService.getAutocompleteSuggestions(input, lat, lng, radius);
        res.json(suggestions);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch suggestions" });
    }
}));

router.get("/details", placesRateLimit, cache("1 hour"), asyncHandler(async (req, res) => {
    try {
        const placeId = req.query.placeId as string;
        if (!placeId) {
            res.status(400).json({ error: "Place ID is required" });
            return;
        }
        const details = await googlePlacesService.getPlaceDetails(placeId);
        if (!details) {
            res.status(404).json({ error: "Place not found" });
            return;
        }
        res.json(details);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch details" });
    }
}));

export const placesRouter = router;
