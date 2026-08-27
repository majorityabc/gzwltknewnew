import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { computeContentHash } from "../src/lib/content-utils";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  // 连云数据库时设 DATABASE_SSL=true；自己服务器上的本地 PostgreSQL 留空即可
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const problems = await prisma.problem.findMany({
    select: { id: true, content: true, contentHash: true },
  });
  console.log(`共 ${problems.length} 道题，开始补算 contentHash...`);

  let updated = 0;
  for (const p of problems) {
    const hash = computeContentHash(p.content);
    if (hash === p.contentHash) continue;
    await prisma.problem.update({
      where: { id: p.id },
      data: { contentHash: hash },
    });
    updated++;
    if (updated % 50 === 0) {
      console.log(`已更新 ${updated} 道题...`);
    }
  }

  console.log(`完成！共补算 ${updated} 道题的 contentHash`);
}

main()
  .catch((e) => {
    console.error("补算 contentHash 失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
