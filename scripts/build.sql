-- 1. 安全地删除旧的表和索引
DROP INDEX IF EXISTS memos_embedding_idx;
DROP TABLE IF EXISTS _MemoToTag;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS memos;
DROP TABLE IF EXISTS sync_metadata;

-- 2. 重新创建所有基础表

-- 用于记录同步状态
CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 笔记表，更新了向量维度和添加了 deleted_at
CREATE TABLE memos (
    id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    images TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    embedding F32_BLOB(2560)
);

CREATE TABLE links (
    id TEXT PRIMARY KEY NOT NULL,
    link TEXT NOT NULL,
    text TEXT,
    memo_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE _MemoToTag (
    memo_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    FOREIGN KEY(memo_id) REFERENCES memos(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (memo_id, tag_id)
);

-- 3. 用新的、正确的语法创建向量索引
CREATE INDEX memos_embedding_idx ON memos(libsql_vector_idx(embedding));