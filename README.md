# Physics Question Bank

高中物理题库管理系统

## 功能特性

- 富文本编辑器，支持公式、图片、表格
- 多维度标签管理（章节、知识点、难度、题型）
- 灵活的筛选功能
- Word 文档导出

## 技术栈

### 后端
- Node.js + Express
- PostgreSQL + Prisma
- TypeScript

### 前端
- React 18 + TypeScript
- Ant Design 5
- React Quill (富文本编辑器)
- Zustand (状态管理)

## 快速开始

### 前置要求

- Node.js 18+
- PostgreSQL 14+

### 安装步骤

1. 安装后端依赖
```bash
cd backend
npm install
```

2. 配置数据库
```bash
# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件，配置数据库连接
# DATABASE_URL="postgresql://用户名:密码@localhost:5432/数据库名?schema=public"
```

3. 初始化数据库
```bash
npm run prisma:migrate
npm run prisma:generate
```

4. 启动后端服务
```bash
npm run dev
```

5. 安装前端依赖
```bash
cd ../frontend
npm install
```

6. 启动前端服务
```bash
npm run dev
```

7. 访问应用
打开浏览器访问 http://localhost:3000

## 使用说明

### 创建题目
1. 点击"新建题目"按钮
2. 在编辑器中输入或粘贴题目内容（支持从 Word 粘贴）
3. 添加公式：点击工具栏的公式按钮
4. 上传图片：点击工具栏的图片按钮
5. 选择章节、知识点、难度、题型
6. 点击"确定"保存

### 筛选题目
- 在左侧筛选面板选择条件
- 支持按章节、知识点、难度、题型筛选
- 知识点支持多选

### 导出题目
1. 在题目列表中勾选要导出的题目
2. 点击"导出 Word"按钮
3. 自动下载 Word 文档

## 项目结构

```
physics-question-bank/
├── backend/                 # 后端项目
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── index.ts        # 入口文件
│   ├── prisma/
│   │   └── schema.prisma   # 数据库模型
│   └── package.json
│
├── frontend/               # 前端项目
│   ├── src/
│   │   ├── components/    # 组件
│   │   ├── pages/         # 页面
│   │   ├── services/      # API 服务
│   │   ├── stores/        # 状态管理
│   │   └── App.tsx
│   └── package.json
│
└── README.md
```

## 开发计划

- [x] 基础架构搭建
- [x] 题目 CRUD
- [x] 标签系统
- [x] 筛选功能
- [x] Word 导出
- [ ] 公式编辑优化
- [ ] 批量操作
- [ ] 数据备份

## License

MIT
