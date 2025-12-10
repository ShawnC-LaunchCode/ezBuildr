
import { Router } from "express";
import { documentAIAssistService } from "../lib/ai/DocumentAIAssistService";
import { requireAuth } from "../middleware/auth";
import multer from "multer";

const router = Router();
const upload = multer(); // Memory storage for parsing

// Middleware
router.use(requireAuth);

/**
 * POST /api/ai/template/analyze
 * Upload a file buffer, get analysis (variables + suggestions)
 */
router.post("/analyze", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file provided" });

        const result = await documentAIAssistService.analyzeTemplate(req.file.buffer, req.file.originalname);
        res.json({ data: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Analysis failed" });
    }
});

/**
 * POST /api/ai/template/suggest-mappings
 * Body: { templateVariables: [...], workflowVariables: [...] }
 */
router.post("/suggest-mappings", async (req, res) => {
    try {
        const { templateVariables, workflowVariables } = req.body;
        const mappings = await documentAIAssistService.suggestMappings(templateVariables, workflowVariables);
        res.json({ data: mappings });
    } catch (err) {
        res.status(500).json({ error: "Mapping suggestion failed" });
    }
});

/**
 * POST /api/ai/template/suggest-improvements
 * Body: { variables: [...] }
 * Returns aliases, formatting suggestions
 */
router.post("/suggest-improvements", async (req, res) => {
    try {
        const { variables } = req.body;
        const result = await documentAIAssistService.suggestImprovements(variables);
        res.json({ data: result });
    } catch (err) {
        res.status(500).json({ error: "Improvement suggestion failed" });
    }
});

export default router;
