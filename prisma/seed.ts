import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaLibSql({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const textbookData: { name: string; grade: string; chapters: string[] }[] = [
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
      "第一章 抛体运动",
      "第二章 圆周运动",
      "第三章 万有引力与宇宙航行",
      "第四章 机械能守恒定律",
    ],
  },
  {
    name: "人教版高中物理必修三",
    grade: "高二",
    chapters: [
      "第一章 静电场",
      "第二章 电路及其应用",
      "第三章 电磁感应",
      "第四章 能源与可持续发展",
    ],
  },
  {
    name: "人教版选择性必修一",
    grade: "高二",
    chapters: [
      "第一章 动量守恒定律",
      "第二章 机械振动",
      "第三章 机械波",
      "第四章 光",
    ],
  },
  {
    name: "人教版选择性必修二",
    grade: "高二",
    chapters: [
      "第一章 安培力与洛伦兹力",
      "第二章 电磁感应",
      "第三章 交变电流",
      "第四章 电磁波",
    ],
  },
  {
    name: "人教版选择性必修三",
    grade: "高三",
    chapters: [
      "第一章 分子动理论",
      "第二章 气体、固体和液体",
      "第三章 热力学定律",
      "第四章 原子结构和波粒二象性",
    ],
  },
];

async function main() {
  console.log("开始写入种子数据...\n");

  for (let ti = 0; ti < textbookData.length; ti++) {
    const tb = textbookData[ti];
    const textbook = await prisma.textbook.create({
      data: {
        name: tb.name,
        grade: tb.grade,
        sortOrder: ti,
        chapters: {
          create: tb.chapters.map((title, ci) => ({
            title,
            sortOrder: ci,
          })),
        },
      },
    });
    console.log(`✓ ${textbook.name} (${tb.chapters.length} 章)`);
  }

  const count = await prisma.textbook.count();
  const chapterCount = await prisma.chapter.count();
  console.log(`\n完成！共写入 ${count} 本课本，${chapterCount} 章`);
}

main()
  .catch((e) => {
    console.error("种子数据写入失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
