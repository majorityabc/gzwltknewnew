-- ============================================
-- 物理题库 Supabase (PostgreSQL) 建表语句
-- 在 Supabase SQL Editor 中粘贴执行即可
-- ============================================

-- 1. 课本
CREATE TABLE textbooks (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    grade      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 章节（自引用树形结构）
CREATE TABLE chapters (
    id          SERIAL PRIMARY KEY,
    textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    parent_id   INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 课时
CREATE TABLE lessons (
    id         SERIAL PRIMARY KEY,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 知识点
CREATE TABLE knowledge_points (
    id         SERIAL PRIMARY KEY,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 题目
CREATE TABLE problems (
    id            SERIAL PRIMARY KEY,
    content       TEXT NOT NULL,           -- TipTap JSON
    difficulty    INTEGER NOT NULL DEFAULT 1,
    lesson_title  TEXT,                    -- 课时标题
    question_type TEXT,                    -- 题型：单选/多选/实验/计算
    source_date   TEXT,                    -- 来源日期
    remarks       TEXT,                    -- 备注
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 题目-知识点 关联表（多对多）
CREATE TABLE problem_knowledge_points (
    problem_id         INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    knowledge_point_id INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, knowledge_point_id)
);

-- 7. 用户
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 可选：创建索引加速查询
-- ============================================
CREATE INDEX idx_chapters_textbook_id ON chapters(textbook_id);
CREATE INDEX idx_chapters_parent_id ON chapters(parent_id);
CREATE INDEX idx_knowledge_points_chapter_id ON knowledge_points(chapter_id);
CREATE INDEX idx_problems_created_at ON problems(created_at);
