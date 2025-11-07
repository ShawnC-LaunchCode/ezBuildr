import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { logger } from '../logger';

const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Handle CommonJS/ESM compatibility for multer
// In Vitest/ESM mode, multer might be wrapped in { default: multer }
// @ts-ignore - multer types don't account for ESM/CommonJS differences
const multerInstance = (multer as any).default || multer;

// File upload configuration
export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
export const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE ? 
  parseInt(process.env.MAX_FILE_SIZE, 10) : 
  10 * 1024 * 1024; // 10MB default
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
];

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.promises.access(UPLOAD_DIR);
  } catch {
    await mkdirAsync(UPLOAD_DIR, { recursive: true });
  }
}

// Configure multer storage
const storage = multerInstance.diskStorage({
  destination: async (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    await ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Generate unique filename while preserving extension
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  }
});

// File filter for validation
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
  
  cb(null, true);
};

// Create multer instance
export const upload = multerInstance({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5 // Max 5 files per request
  }
});

// Validate file upload configuration
export function validateFileUploadConfig(config: any) {
  if (!config) return true; // No restrictions
  
  const errors: string[] = [];
  
  if (config.maxFileSize && typeof config.maxFileSize !== 'number') {
    errors.push('maxFileSize must be a number');
  }
  
  if (config.maxFiles && typeof config.maxFiles !== 'number') {
    errors.push('maxFiles must be a number');
  }
  
  if (config.acceptedTypes && !Array.isArray(config.acceptedTypes)) {
    errors.push('acceptedTypes must be an array');
  }
  
  return errors.length === 0 ? true : errors.join(', ');
}

// Check if file type matches accepted types
export function isFileTypeAccepted(mimeType: string, acceptedTypes?: string[]): boolean {
  if (!acceptedTypes || acceptedTypes.length === 0) {
    return ALLOWED_FILE_TYPES.includes(mimeType);
  }
  
  return acceptedTypes.some(type => {
    if (type.includes('*')) {
      // Handle wildcards like 'image/*'
      const [category] = type.split('/');
      return mimeType.startsWith(category + '/');
    }
    
    if (type.startsWith('.')) {
      // Handle extensions like '.pdf'
      const extension = type;
      // Get mime type for extension (simplified mapping)
      const mimeTypeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.txt': 'text/plain',
        '.csv': 'text/csv'
      };
      return mimeTypeMap[extension] === mimeType;
    }
    
    return type === mimeType;
  });
}

// Delete file from filesystem
export async function deleteFile(filename: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    await unlinkAsync(filePath);
  } catch (error) {
    logger.error('Error deleting file:', error);
    // Don't throw error if file doesn't exist
  }
}

// Get file path
export function getFilePath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

// Check if file exists
export async function fileExists(filename: string): Promise<boolean> {
  try {
    await fs.promises.access(path.join(UPLOAD_DIR, filename));
    return true;
  } catch {
    return false;
  }
}

// Get file stats
export async function getFileStats(filename: string) {
  try {
    const filePath = path.join(UPLOAD_DIR, filename);
    const stats = await fs.promises.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch {
    return null;
  }
}