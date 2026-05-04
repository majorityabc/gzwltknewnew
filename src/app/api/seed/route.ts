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
          {
            title: "第一章 运动的描述",
            points: ["质点 参考系", "时间 位移", "位置变化快慢的描述——速度", "速度变化快慢的描述——加速度"],
          },
          {
            title: "第二章 匀变速直线运动的研究",
            points: ["实验：探究小车速度随时间变化的规律", "匀变速直线运动的速度与时间的关系", "匀变速直线运动的位移与时间的关系", "自由落体运动"],
          },
          {
            title: "第三章 相互作用——力",
            points: ["重力与弹力", "摩擦力", "牛顿第三定律", "力的合成和分解", "共点力的平衡"],
          },
          {
            title: "第四章 运动和力的关系",
            points: ["牛顿第一定律", "实验：探究加速度与力、质量的关系", "牛顿第二定律", "力学单位制", "牛顿运动定律的应用", "超重和失重"],
          },
        ],
      },
      {
        name: "人教版高中物理必修二",
        grade: "高一",
        chapters: [
          {
            title: "第五章 抛体运动",
            points: ["曲线运动", "运动的合成与分解", "实验：探究平抛运动的特点", "抛体运动的规律"],
          },
          {
            title: "第六章 圆周运动",
            points: ["圆周运动", "向心力", "向心加速度", "生活中的圆周运动"],
          },
          {
            title: "第七章 万有引力与宇宙航行",
            points: ["行星的运动", "万有引力定律", "万有引力理论的成就", "宇宙航行", "相对论时空观与牛顿力学的局限性"],
          },
          {
            title: "第八章 机械能守恒定律",
            points: ["功与功率", "重力势能", "动能和动能定理", "机械能守恒定律", "实验：验证机械能守恒定律"],
          },
        ],
      },
    ];

    let tbCount = 0;
    let chCount = 0;
    let kpCount = 0;

    for (const tb of seedData) {
      const textbook = await prisma.textbook.create({
        data: { name: tb.name, grade: tb.grade, sortOrder: tbCount },
      });
      tbCount++;

      for (let ci = 0; ci < tb.chapters.length; ci++) {
        const ch = tb.chapters[ci];
        const chapter = await prisma.chapter.create({
          data: { textbookId: textbook.id, title: ch.title, sortOrder: ci },
        });
        chCount++;

        for (let pi = 0; pi < ch.points.length; pi++) {
          await prisma.knowledgePoint.create({
            data: { chapterId: chapter.id, name: ch.points[pi], sortOrder: pi },
          });
          kpCount++;
        }
      }
    }

    return NextResponse.json({
      data: { textbooks: tbCount, chapters: chCount, knowledgePoints: kpCount },
    });
  } catch (e) {
    console.error("Seed error:", e);
    return NextResponse.json({ error: "种子数据写入失败" }, { status: 500 });
  }
}
