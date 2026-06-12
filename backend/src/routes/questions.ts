import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all questions with filters
router.get('/', async (req, res) => {
  try {
    const { chapterId, knowledgePointIds, difficulty, questionType, page = '1', limit = '20' } = req.query;

    const where: any = {};

    if (chapterId) where.chapterId = parseInt(chapterId as string);
    if (difficulty) where.difficulty = difficulty;
    if (questionType) where.questionType = questionType;

    if (knowledgePointIds) {
      const ids = (knowledgePointIds as string).split(',').map(id => parseInt(id));
      where.questionKnowledgePoints = {
        some: {
          knowledgePointId: { in: ids }
        }
      };
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: {
          chapter: true,
          questionKnowledgePoints: {
            include: { knowledgePoint: true }
          },
          questionTags: {
            include: { tag: true }
          }
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.question.count({ where })
    ]);

    res.json({
      data: questions,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Get single question
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const question = await prisma.question.findUnique({
      where: { id: parseInt(id) },
      include: {
        chapter: true,
        questionKnowledgePoints: {
          include: { knowledgePoint: true }
        },
        questionTags: {
          include: { tag: true }
        },
        images: true
      }
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(question);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// Create question
router.post('/', async (req, res) => {
  try {
    const { content, plainText, questionType, difficulty, chapterId, knowledgePointIds, tagIds } = req.body;

    const question = await prisma.question.create({
      data: {
        content,
        plainText,
        questionType,
        difficulty,
        chapterId: chapterId ? parseInt(chapterId) : null,
        questionKnowledgePoints: knowledgePointIds ? {
          create: knowledgePointIds.map((kpId: number) => ({
            knowledgePointId: kpId
          }))
        } : undefined,
        questionTags: tagIds ? {
          create: tagIds.map((tagId: number) => ({
            tagId
          }))
        } : undefined
      },
      include: {
        chapter: true,
        questionKnowledgePoints: {
          include: { knowledgePoint: true }
        },
        questionTags: {
          include: { tag: true }
        }
      }
    });

    res.status(201).json(question);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// Update question
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, plainText, questionType, difficulty, chapterId, knowledgePointIds, tagIds } = req.body;

    // Delete existing relations
    await prisma.questionKnowledgePoint.deleteMany({
      where: { questionId: parseInt(id) }
    });
    await prisma.questionTag.deleteMany({
      where: { questionId: parseInt(id) }
    });

    // Update question with new relations
    const question = await prisma.question.update({
      where: { id: parseInt(id) },
      data: {
        content,
        plainText,
        questionType,
        difficulty,
        chapterId: chapterId ? parseInt(chapterId) : null,
        questionKnowledgePoints: knowledgePointIds ? {
          create: knowledgePointIds.map((kpId: number) => ({
            knowledgePointId: kpId
          }))
        } : undefined,
        questionTags: tagIds ? {
          create: tagIds.map((tagId: number) => ({
            tagId
          }))
        } : undefined
      },
      include: {
        chapter: true,
        questionKnowledgePoints: {
          include: { knowledgePoint: true }
        },
        questionTags: {
          include: { tag: true }
        }
      }
    });

    res.json(question);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.question.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

export default router;
