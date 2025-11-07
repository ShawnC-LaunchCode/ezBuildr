import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { surveyRepository, responseRepository, fileRepository, questionRepository } from "../repositories";
import { createLogger } from "../logger";

const logger = createLogger({ module: "files-routes" });
import { isAuthenticated } from "../googleAuth";
import { upload, isFileTypeAccepted, deleteFile, getFilePath, fileExists } from "../services/fileService";

/**
 * Helper function to get expected MIME type from file extension
 */
function getMimeTypeFromExtension(ext: string): string | null {
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
  };
  return mimeMap[ext.toLowerCase()] || null;
}

/**
 * Rate limiting for file uploads
 */
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 file upload requests per windowMs
  message: {
    success: false,
    errors: ['Too many file upload attempts, please try again later.']
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Register file-related routes
 * Handles file upload, download, and deletion
 */
export function registerFileRoutes(app: Express): void {

  /**
   * POST /api/upload
   * Upload files with authentication and authorization
   */
  app.post('/api/upload', uploadRateLimit, isAuthenticated, upload.array('files', 5), async (req: Request, res: Response) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, errors: ['No files provided'] });
      }

      const { answerId } = req.body;
      if (!answerId) {
        return res.status(400).json({ success: false, errors: ['Answer ID is required'] });
      }

      // Verify ownership through answer -> response -> survey chain
      const answer = await responseRepository.findAnswerById(answerId);
      if (!answer) {
        return res.status(404).json({ success: false, errors: ['Answer not found'] });
      }

      const response = await responseRepository.findById(answer.responseId);
      if (!response) {
        return res.status(404).json({ success: false, errors: ['Response not found'] });
      }

      const survey = await surveyRepository.findById(response.surveyId);
      if (!survey) {
        return res.status(404).json({ success: false, errors: ['Survey not found'] });
      }

      // Check if user is survey creator
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ['Unauthorized - no user ID'] });
      }
      const isCreator = survey.creatorId === userId;

      if (!isCreator) {
        return res.status(403).json({ success: false, errors: ['Access denied'] });
      }

      // Get question config for server-side validation
      const question = await questionRepository.findById(answer.questionId);
      if (!question || question.type !== 'file_upload') {
        return res.status(400).json({ success: false, errors: ['Invalid question for file upload'] });
      }

      const config = question.options as any;
      if (!config) {
        return res.status(400).json({ success: false, errors: ['No file upload configuration found'] });
      }

      if (config.required && req.files.length === 0) {
        return res.status(400).json({ success: false, errors: ['Files are required for this question'] });
      }

      // Check existing files count to enforce maxFiles limit
      const existingFiles = await fileRepository.findByAnswer(answerId);
      const uploadedFilesCount = Array.isArray(req.files) ? req.files.length : 0;
      const totalFiles = existingFiles.length + uploadedFilesCount;
      if (config.maxFiles && totalFiles > config.maxFiles) {
        return res.status(400).json({
          success: false,
          errors: [`Cannot upload ${uploadedFilesCount} files. Maximum ${config.maxFiles} files allowed, you already have ${existingFiles.length} files.`]
        });
      }

      const uploadedFiles = [];
      const errors = [];

      for (const file of req.files as Express.Multer.File[]) {
        try {
          // Validate file type
          if (config.acceptedTypes && config.acceptedTypes.length > 0 && !isFileTypeAccepted(file.mimetype, config.acceptedTypes)) {
            errors.push(`File type ${file.mimetype} not allowed for ${file.originalname}`);
            await deleteFile(file.filename);
            continue;
          }

          // Validate file size
          if (config.maxFileSize && file.size > config.maxFileSize) {
            errors.push(`File ${file.originalname} exceeds maximum size limit of ${Math.round(config.maxFileSize / 1024 / 1024)}MB`);
            await deleteFile(file.filename);
            continue;
          }

          // Check file extension matches MIME type
          const ext = path.extname(file.originalname).toLowerCase();
          const expectedMimeType = getMimeTypeFromExtension(ext);
          if (expectedMimeType && expectedMimeType !== file.mimetype) {
            errors.push(`File ${file.originalname} has mismatched extension and content type`);
            await deleteFile(file.filename);
            continue;
          }

          // Store file metadata in database
          const fileMetadata = await fileRepository.create({
            answerId,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          });

          uploadedFiles.push(fileMetadata);
        } catch (error) {
          logger.error({ error }, 'Error processing file');
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Error processing ${file.originalname}: ${errorMessage}`);
        }
      }

      res.json({
        success: uploadedFiles.length > 0,
        files: uploadedFiles,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error({ error }, "Error uploading files");
      res.status(500).json({ success: false, errors: ['Failed to upload files'] });
    }
  });

  /**
   * GET /api/files/:fileId/download
   * Download a file with authentication and access control
   */
  app.get('/api/files/:fileId/download', isAuthenticated, async (req, res) => {
    try {
      const fileId = req.params.fileId;
      const fileMetadata = await fileRepository.findById(fileId);

      if (!fileMetadata) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Verify ownership through file -> answer -> response -> survey chain
      const answer = await responseRepository.findAnswerById(fileMetadata.answerId);
      if (!answer) {
        return res.status(404).json({ message: 'Associated answer not found' });
      }

      const response = await responseRepository.findById(answer.responseId);
      if (!response) {
        return res.status(404).json({ message: 'Associated response not found' });
      }

      const survey = await surveyRepository.findById(response.surveyId);
      if (!survey) {
        return res.status(404).json({ message: 'Associated survey not found' });
      }

      // Check if user is survey creator
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: 'Access denied - no user ID' });
      }
      const userId = req.user.claims.sub;
      const isCreator = survey.creatorId === userId;

      if (!isCreator) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const filePath = getFilePath(fileMetadata.filename);

      if (!(await fileExists(fileMetadata.filename))) {
        return res.status(404).json({ message: 'File not found on disk' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileMetadata.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.originalName}"`);
      res.setHeader('Content-Length', fileMetadata.size.toString());

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      logger.error({ error }, "Error downloading file");
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  /**
   * GET /api/answers/:answerId/files
   * Get files by answer ID with authentication and access control
   */
  app.get('/api/answers/:answerId/files', isAuthenticated, async (req, res) => {
    try {
      const answerId = req.params.answerId;

      // Verify ownership through answer -> response -> survey chain
      const answer = await responseRepository.findAnswerById(answerId);
      if (!answer) {
        return res.status(404).json({ message: 'Answer not found' });
      }

      const response = await responseRepository.findById(answer.responseId);
      if (!response) {
        return res.status(404).json({ message: 'Response not found' });
      }

      const survey = await surveyRepository.findById(response.surveyId);
      if (!survey) {
        return res.status(404).json({ message: 'Survey not found' });
      }

      // Check if user is survey creator
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: 'Access denied - no user ID' });
      }
      const userId = req.user.claims.sub;
      const isCreator = survey.creatorId === userId;

      if (!isCreator) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const files = await fileRepository.findByAnswer(answerId);
      res.json(files);
    } catch (error) {
      logger.error({ error }, "Error fetching files");
      res.status(500).json({ message: "Failed to fetch files" });
    }
  });

  /**
   * DELETE /api/files/:fileId
   * Delete a file with authentication and access control
   */
  app.delete('/api/files/:fileId', isAuthenticated, async (req, res) => {
    try {
      const fileId = req.params.fileId;
      const fileMetadata = await fileRepository.findById(fileId);

      if (!fileMetadata) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Verify ownership through file -> answer -> response -> survey chain
      const answer = await responseRepository.findAnswerById(fileMetadata.answerId);
      if (!answer) {
        return res.status(404).json({ message: 'Associated answer not found' });
      }

      const response = await responseRepository.findById(answer.responseId);
      if (!response) {
        return res.status(404).json({ message: 'Associated response not found' });
      }

      const survey = await surveyRepository.findById(response.surveyId);
      if (!survey) {
        return res.status(404).json({ message: 'Associated survey not found' });
      }

      // Check if user is survey creator
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: 'Access denied - no user ID' });
      }
      const userId = req.user.claims.sub;
      const isCreator = survey.creatorId === userId;

      if (!isCreator) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Delete file from filesystem
      await deleteFile(fileMetadata.filename);

      // Delete file metadata from database
      await fileRepository.delete(fileId);

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      logger.error({ error }, "Error deleting file");
      res.status(500).json({ message: "Failed to delete file" });
    }
  });
}
