const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("../src/generated/prisma/client");

async function main() {
  const adapter = new PrismaLibSql({ url: "file:./dev.db" });
  const prisma = new PrismaClient({ adapter });

  // 人教版高中物理必修一
  const tb1 = await prisma.textbook.create({
    data: {
      name: "人教版高中物理必修一",
      grade: "高一",
      sortOrder: 1,
    },
  });

  // 必修一章节
  const ch1 = await prisma.chapter.create({
    data: {
      textbookId: tb1.id,
      title: "第一章 运动的描述",
      sortOrder: 1,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch1.id, name: "质点 参考系", sortOrder: 1 },
      { chapterId: ch1.id, name: "时间 位移", sortOrder: 2 },
      { chapterId: ch1.id, name: "位置变化快慢的描述——速度", sortOrder: 3 },
      { chapterId: ch1.id, name: "速度变化快慢的描述——加速度", sortOrder: 4 },
    ],
  });

  const ch2 = await prisma.chapter.create({
    data: {
      textbookId: tb1.id,
      title: "第二章 匀变速直线运动的研究",
      sortOrder: 2,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch2.id, name: "实验：探究小车速度随时间变化的规律", sortOrder: 1 },
      { chapterId: ch2.id, name: "匀变速直线运动的速度与时间的关系", sortOrder: 2 },
      { chapterId: ch2.id, name: "匀变速直线运动的位移与时间的关系", sortOrder: 3 },
      { chapterId: ch2.id, name: "自由落体运动", sortOrder: 4 },
    ],
  });

  const ch3 = await prisma.chapter.create({
    data: {
      textbookId: tb1.id,
      title: "第三章 相互作用——力",
      sortOrder: 3,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch3.id, name: "重力与弹力", sortOrder: 1 },
      { chapterId: ch3.id, name: "摩擦力", sortOrder: 2 },
      { chapterId: ch3.id, name: "牛顿第三定律", sortOrder: 3 },
      { chapterId: ch3.id, name: "力的合成和分解", sortOrder: 4 },
      { chapterId: ch3.id, name: "共点力的平衡", sortOrder: 5 },
    ],
  });

  const ch4 = await prisma.chapter.create({
    data: {
      textbookId: tb1.id,
      title: "第四章 运动和力的关系",
      sortOrder: 4,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch4.id, name: "牛顿第一定律", sortOrder: 1 },
      { chapterId: ch4.id, name: "实验：探究加速度与力、质量的关系", sortOrder: 2 },
      { chapterId: ch4.id, name: "牛顿第二定律", sortOrder: 3 },
      { chapterId: ch4.id, name: "力学单位制", sortOrder: 4 },
      { chapterId: ch4.id, name: "牛顿运动定律的应用", sortOrder: 5 },
      { chapterId: ch4.id, name: "超重和失重", sortOrder: 6 },
    ],
  });

  // 人教版高中物理必修二
  const tb2 = await prisma.textbook.create({
    data: {
      name: "人教版高中物理必修二",
      grade: "高一",
      sortOrder: 2,
    },
  });

  const ch5 = await prisma.chapter.create({
    data: {
      textbookId: tb2.id,
      title: "第五章 抛体运动",
      sortOrder: 1,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch5.id, name: "曲线运动", sortOrder: 1 },
      { chapterId: ch5.id, name: "运动的合成与分解", sortOrder: 2 },
      { chapterId: ch5.id, name: "实验：探究平抛运动的特点", sortOrder: 3 },
      { chapterId: ch5.id, name: "抛体运动的规律", sortOrder: 4 },
    ],
  });

  const ch6 = await prisma.chapter.create({
    data: {
      textbookId: tb2.id,
      title: "第六章 圆周运动",
      sortOrder: 2,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch6.id, name: "圆周运动", sortOrder: 1 },
      { chapterId: ch6.id, name: "向心力", sortOrder: 2 },
      { chapterId: ch6.id, name: "向心加速度", sortOrder: 3 },
      { chapterId: ch6.id, name: "生活中的圆周运动", sortOrder: 4 },
    ],
  });

  const ch7 = await prisma.chapter.create({
    data: {
      textbookId: tb2.id,
      title: "第七章 万有引力与宇宙航行",
      sortOrder: 3,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch7.id, name: "行星的运动", sortOrder: 1 },
      { chapterId: ch7.id, name: "万有引力定律", sortOrder: 2 },
      { chapterId: ch7.id, name: "万有引力理论的成就", sortOrder: 3 },
      { chapterId: ch7.id, name: "宇宙航行", sortOrder: 4 },
      { chapterId: ch7.id, name: "相对论时空观与牛顿力学的局限性", sortOrder: 5 },
    ],
  });

  const ch8 = await prisma.chapter.create({
    data: {
      textbookId: tb2.id,
      title: "第八章 机械能守恒定律",
      sortOrder: 4,
    },
  });

  await prisma.knowledgePoint.createMany({
    data: [
      { chapterId: ch8.id, name: "功与功率", sortOrder: 1 },
      { chapterId: ch8.id, name: "重力势能", sortOrder: 2 },
      { chapterId: ch8.id, name: "动能和动能定理", sortOrder: 3 },
      { chapterId: ch8.id, name: "机械能守恒定律", sortOrder: 4 },
      { chapterId: ch8.id, name: "实验：验证机械能守恒定律", sortOrder: 5 },
    ],
  });

  console.log("✅ 种子数据已创建：2本课本，8个章节，34个知识点");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
