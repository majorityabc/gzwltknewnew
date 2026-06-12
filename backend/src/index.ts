import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { requireAuth } from './middleware/auth';
import authRouter from './routes/auth';
import questionsRouter from './routes/questions';
import chaptersRouter from './routes/chapters';
import knowledgePointsRouter from './routes/knowledgePoints';
import tagsRouter from './routes/tags';
import uploadRouter from './routes/upload';
import exportRouter from './routes/export';
import paypalRouter from './routes/paypal';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Auth routes (no auth required for these)
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/questions', requireAuth, questionsRouter);
app.use('/api/chapters', requireAuth, chaptersRouter);
app.use('/api/knowledge-points', requireAuth, knowledgePointsRouter);
app.use('/api/tags', requireAuth, tagsRouter);
app.use('/api/upload', requireAuth, uploadRouter);
app.use('/api/export', requireAuth, exportRouter);

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Physics Question Bank API is running' });
});

// PayPal routes (no auth required for payment flow)
app.use('/api/paypal', paypalRouter);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
