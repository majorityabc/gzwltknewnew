# 高中物理题库管理系统

收集、分类和管理高中物理题目，支持公式渲染和 Word 导出。打开即用，无需登录。

## 功能特性

- **题库浏览**：按课本 → 章节 → 知识点三级结构浏览题目
- **知识点管理**：创建、删除知识点，给题目打/移除知识点标签
- **Word 试卷导入**：上传 .docx 试卷，自动解析公式（OMML → LaTeX）和图片，手动分割题目后分类保存
- **题目编辑**：TipTap 富文本编辑器，支持 LaTeX 公式（KaTeX 渲染）、上下标、图片
- **组卷导出**：把题目加入试卷篮，导出为 Word 文档

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS v4
- Prisma 7 + PostgreSQL（自建或云托管均可）
- TipTap（富文本编辑）+ KaTeX（公式渲染）

## 快速开始

### 前置要求

- Node.js 18+
- 一个 PostgreSQL 数据库（如 Supabase 免费项目）

### 安装步骤

1. 安装依赖

```bash
npm install
```

2. 配置数据库连接

在项目根目录创建 `.env.local`，写入（可参考 `.env.example`）：

```
DATABASE_URL="postgresql://用户名:密码@主机:5432/数据库名"
```

如果连接的是需要加密的云数据库（如 Supabase），再加一行 `DATABASE_SSL="true"`；连自己服务器本机的数据库不用加。

3. 初始化数据库表结构

```bash
npx prisma db push
```

4. 导入初始数据（课本/章节/课时）

```bash
npm run db:seed
```

5. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 http://localhost:3000

## 部署到自己的服务器

1. 在服务器上安装 Node.js 20+ 和 PostgreSQL
2. 在 PostgreSQL 里建一个数据库（例如 `physics_tiku`）和专用账号
3. 把代码上传到服务器，按上面"安装步骤"配置 `.env.local`（主机填 `localhost`），然后依次执行 `npx prisma db push`、`npm run db:seed`
4. 构建并启动：

```bash
npm run build
npm run start   # 默认监听 3000 端口
```

5. 建议用 pm2 守护进程（`pm2 start npm --name tiku -- start`），并用 Nginx 反向代理到 3000 端口对外提供访问

### 从云数据库迁移数据到服务器（可选）

如果旧题库已有数据要搬走：

```bash
# 从旧库导出（把 旧库地址 换成云数据库的 DATABASE_URL）
pg_dump "旧库地址" -f backup.sql

# 导入到服务器的新库
psql "postgresql://用户名:密码@localhost:5432/physics_tiku" -f backup.sql
```

导入后再执行一次 `npm run db:backfill-hashes` 给老题补算查重指纹。

## 项目结构

```
├── prisma/
│   ├── schema.prisma    # 数据库模型（用 db push 同步，无迁移文件）
│   └── seed.ts          # 初始数据脚本
├── src/
│   ├── app/
│   │   ├── page.tsx     # 题库管理主页（浏览/编辑/组卷）
│   │   ├── upload/      # 上传试卷页
│   │   └── api/         # REST API 路由
│   ├── components/      # React 组件（含 TipTap 编辑器）
│   ├── generated/       # Prisma 生成的客户端
│   └── lib/             # docx 解析、OMML→LaTeX、Word 导出等
└── package.json
```

## License

MIT
