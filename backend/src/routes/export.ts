import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as cheerio from 'cheerio';

const router = Router();
const prisma = new PrismaClient();

// Export questions to Word
router.post('/word', async (req, res) => {
  try {
    const { questionIds } = req.body;

    if (!questionIds || questionIds.length === 0) {
      return res.status(400).json({ error: 'No questions selected' });
    }

    // Fetch questions
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds.map((id: string) => parseInt(id)) } },
      include: {
        chapter: true,
        questionKnowledgePoints: {
          include: { knowledgePoint: true }
        },
        questionTags: {
          include: { tag: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    // Build Word document
    const sections: Paragraph[] = [];

    // Title
    sections.push(
      new Paragraph({
        text: '物理题库',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400 }
      })
    );

    // Questions
    for (const [index, question] of questions.entries()) {
      // Question number and content
      const $ = cheerio.load(question.content);
      const plainText = $.text();

      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}. `,
              bold: true,
              size: 24
            }),
            new TextRun({
              text: plainText,
              size: 24
            })
          ],
          spacing: { after: 200 }
        })
      );

      // Metadata
      const metadata: string[] = [];
      if (question.chapter) {
        metadata.push(`章节：${question.chapter.name}`);
      }
      if (question.questionKnowledgePoints.length > 0) {
        const kps = question.questionKnowledgePoints.map(qkp => qkp.knowledgePoint.name).join('、');
        metadata.push(`知识点：${kps}`);
      }
      if (question.difficulty) {
        metadata.push(`难度：${question.difficulty}`);
      }
      if (question.questionType) {
        metadata.push(`题型：${question.questionType}`);
      }

      if (metadata.length > 0) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: metadata.join(' | '),
                italics: true
              })
            ],
            spacing: { after: 200 }
          })
        );
      }

      // Separator
      sections.push(
        new Paragraph({
          text: '',
          spacing: { after: 400 }
        })
      );
    }

    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: sections
      }]
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=physics-questions-${Date.now()}.docx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting to Word:', error);
    res.status(500).json({ error: 'Failed to export to Word' });
  }
});

export default router;
