import { Router } from "express";

import { creatorOrRunTokenAuth } from "../middleware/runTokenAuth";
import { googlePlacesService } from "../services/GooglePlacesService";

const router = Router();

// Allow either standard user session/JWT OR a valid run token (for preview/public runners)
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

router.get("/autocomplete", async (req, res) => {
    try {
        const input = req.query.input as string;
        const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
        const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
        const radius = req.query.radius ? parseFloat(req.query.radius as string) : undefined;

        if (!input) {
            return res.status(400).json({ error: "Input is required" });
        }
        const suggestions = await googlePlacesService.getAutocompleteSuggestions(input, lat, lng, radius);
        res.json(suggestions);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch suggestions" });
    }
});

router.get("/details", async (req, res) => {
    try {
        const placeId = req.query.placeId as string;
        if (!placeId) {
            return res.status(400).json({ error: "Place ID is required" });
        }
        const details = await googlePlacesService.getPlaceDetails(placeId);
        if (!details) {
            return res.status(404).json({ error: "Place not found" });
        }
        res.json(details);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch details" });
    }
});

export const placesRouter = router;
