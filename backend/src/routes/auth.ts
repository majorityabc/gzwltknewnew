import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
