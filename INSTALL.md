# 物理题库管理系统 - 安装指南

## 数据库配置

### 方式一：使用本地 PostgreSQL（推荐用于开发）

1. 安装 PostgreSQL
   - Windows: 下载 https://www.postgresql.org/download/windows/
   - 或使用 Docker: `docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres`

2. 创建数据库
```sql
CREATE DATABASE physics_question_bank;
```

3. 配置环境变量
编辑 `backend/.env` 文件：
```
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/physics_question_bank?schema=public"
```

4. 初始化数据库
```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
```

### 方式二：使用 SQLite（最简单，无需安装数据库）

1. 修改 `backend/prisma/schema.prisma`
将第一行改为：
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

2. 修改 `backend/.env`
```
DATABASE_URL="file:./dev.db"
```

3. 初始化数据库
```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
```

## 启动应用

### 启动后端
```bash
cd backend
npm run dev
```
后端运行在 http://localhost:3001

### 启动前端
```bash
cd frontend
npm run dev
```
前端运行在 http://localhost:3000

## 初始数据

首次启动后，建议先添加一些基础数据：

### 添加章节
- 力学
- 电磁学
- 光学
- 热学
- 原子物理

### 添加知识点
- 牛顿第二定律
- 动能定理
- 欧姆定律
- 电磁感应
- 等等...

## 常见问题

### 1. 数据库连接失败
- 检查 PostgreSQL 是否启动
- 检查 .env 文件中的数据库连接字符串
- 确认数据库已创建

### 2. 端口被占用
- 修改 backend/.env 中的 PORT
- 修改 frontend/vite.config.ts 中的 server.port

### 3. 图片上传失败
- 确保 backend/uploads 目录有写入权限
- 检查文件大小是否超过 5MB

## 下一步

系统已经可以使用了！你可以：
1. 创建题目
2. 添加标签
3. 筛选题目
4. 导出 Word

后续可以根据需要添加更多功能。
