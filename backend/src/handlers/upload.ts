import { Router, Request, Response } from 'express';
import multer from 'multer';
import { S3Service } from '../services/s3/S3Service';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxFileSize },
  fileFilter: (_req, file, cb) => {
    if (config.uploadAllowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

export function createUploadRoutes(): Router {
  const router = Router();

  /**
   * POST /api/upload/temp
   * Upload a file to S3 without linking it to any entity.
   * The returned URL is stored in the form state on the client and included
   * in the entity create/update payload when the form is saved.
   */
  router.post('/temp', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const entity = (req.body.entity as string) || 'uploads';
      const folder = entity === 'fumetti' ? 'uploads/fumetti' : 'uploads/personaggi';

      const s3Service = new S3Service();
      const { cdnUrl: url, key } = await s3Service.uploadImage(
        req.file.buffer,
        folder,
        req.file.originalname,
        req.file.mimetype
      );

      res.json({ url, key });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
