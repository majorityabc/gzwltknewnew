import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all knowledge points
router.get('/', async (req, res) => {
  try {
    const { chapterId } = req.query;
    const where: any = {};

    if (chapterId) {
      where.chapterId = parseInt(chapterId as string);
    }

    const knowledgePoints = await prisma.knowledgePoint.findMany({
      where,
      include: {
        chapter: true
      },
      orderBy: { name: 'asc' }
    });
    res.json(knowledgePoints);
  } catch (error) {
    console.error('Error fetching knowledge points:', error);
    res.status(500).json({ error: 'Failed to fetch knowledge points' });
  }
});

// Create knowledge point
router.post('/', async (req, res) => {
  try {
    const { name, chapterId, description } = req.body;
    const knowledgePoint = await prisma.knowledgePoint.create({
      data: {
        name,
        chapterId: chapterId ? parseInt(chapterId) : null,
        description
      }
    });
    res.status(201).json(knowledgePoint);
  } catch (error) {
    console.error('Error creating knowledge point:', error);
    res.status(500).json({ error: 'Failed to create knowledge point' });
  }
});

// Update knowledge point
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, chapterId, description } = req.body;
    const knowledgePoint = await prisma.knowledgePoint.update({
      where: { id: parseInt(id) },
      data: {
        name,
        chapterId: chapterId ? parseInt(chapterId) : null,
        description
      }
    });
    res.json(knowledgePoint);
  } catch (error) {
    console.error('Error updating knowledge point:', error);
    res.status(500).json({ error: 'Failed to update knowledge point' });
  }
});

// Delete knowledge point
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.knowledgePoint.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: 'Knowledge point deleted successfully' });
  } catch (error) {
    console.error('Error deleting knowledge point:', error);
    res.status(500).json({ error: 'Failed to delete knowledge point' });
  }
});

export default router;
