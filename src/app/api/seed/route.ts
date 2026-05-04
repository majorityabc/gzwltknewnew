import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromCookies } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    // Clean existing data
    await prisma.problemKnowledgePoint.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.knowledgePoint.deleteMany();
    await prisma.chapter.deleteMany();
    await prisma.textbook.deleteMany();

    const seedData = [
      {
        name: "人教版高中物理必修一",
        grade: "高一",
        chapters: [
          "第一章 运动的描述",
          "第二章 匀变速直线运动的研究",
          "第三章 相互作用——力",
          "第四章 运动和力的关系",
        ],
      },
      {
        name: "人教版高中物理必修二",
        grade: "高一",
        chapters: [
          "第五章 抛体运动",
          "第六章 圆周运动",
          "第七章 万有引力与宇宙航行",
          "第八章 机械能守恒定律",
        ],
      },
      {
        name: "人教版高中物理必修三",
        grade: "高二",
        chapters: [
          "第九章 静电场及其应用",
          "第十章 静电场中的能量",
          "第十一章 电路及其应用",
          "第十二章 电能 能量守恒定律",
          "第十三章 电磁感应与电磁波初步",
        ],
      },
      {
        name: "人教版高中物理选择性必修一",
        grade: "高二",
        chapters: [
          "第一章 动量守恒定律",
          "第二章 机械振动",
          "第三章 机械波",
          "第四章 光",
        ],
      },
      {
        name: "人教版高中物理选择性必修二",
        grade: "高二",
        chapters: [
          "第一章 安培力与洛伦兹力",
          "第二章 电磁感应",
          "第三章 交变电流",
          "第四章 电磁振荡与电磁波",
          "第五章 传感器",
        ],
      },
      {
        name: "人教版高中物理选择性必修三",
        grade: "高二",
        chapters: [
          "第一章 分子动理论",
          "第二章 气体、固体和液体",
          "第三章 热力学定律",
          "第四章 原子结构和波粒二象性",
          "第五章 原子核",
        ],
      },
    ];

    let tbCount = 0;
    let chCount = 0;

    for (let tbi = 0; tbi < seedData.length; tbi++) {
      const tb = seedData[tbi];
      const textbook = await prisma.textbook.create({
        data: { name: tb.name, grade: tb.grade, sortOrder: tbi },
      });
      tbCount++;

      for (let ci = 0; ci < tb.chapters.length; ci++) {
        await prisma.chapter.create({
          data: { textbookId: textbook.id, title: tb.chapters[ci], sortOrder: ci },
        });
        chCount++;
      }
    }

    return NextResponse.json({
      data: { textbooks: tbCount, chapters: chCount },
    });
  } catch (e) {
    console.error("Seed error:", e);
    return NextResponse.json({ error: "种子数据写入失败" }, { status: 500 });
  }
}
