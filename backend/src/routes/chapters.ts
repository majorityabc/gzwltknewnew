import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all chapters
router.get('/', async (req, res) => {
  try {
    const chapters = await prisma.chapter.findMany({
      include: {
        parent: true,
        children: true
      },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(chapters);
  } catch (error) {
    console.error('Error fetching chapters:', error);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

// Create chapter
router.post('/', async (req, res) => {
  try {
    const { name, parentId, sortOrder } = req.body;
    const chapter = await prisma.chapter.create({
      data: {
        name,
        parentId: parentId ? parseInt(parentId) : null,
        sortOrder
      }
    });
    res.status(201).json(chapter);
  } catch (error) {
    console.error('Error creating chapter:', error);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// Update chapter
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId, sortOrder } = req.body;
    const chapter = await prisma.chapter.update({
      where: { id: parseInt(id) },
      data: {
        name,
        parentId: parentId ? parseInt(parentId) : null,
        sortOrder
      }
    });
    res.json(chapter);
  } catch (error) {
    console.error('Error updating chapter:', error);
    res.status(500).json({ error: 'Failed to update chapter' });
  }
});

// Delete chapter
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.chapter.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: 'Chapter deleted successfully' });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

export default router;
