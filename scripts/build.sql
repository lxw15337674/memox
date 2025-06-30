-- 1. 安全地删除旧的表和索引
DROP INDEX IF EXISTS memos_embedding_idx;
DROP INDEX IF EXISTS memo_embeddings_idx;
DROP TABLE IF EXISTS memo_vectors;
DROP TABLE IF EXISTS _MemoToTag;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS memos;

-- 2. 重新创建所有基础表
CREATE TABLE memos (
    id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    images TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- 直接在这里定义向量列
    embedding F32_BLOB(1024) 
);

CREATE TABLE links (
    id TEXT PRIMARY KEY NOT NULL,
    link TEXT NOT NULL,
    text TEXT,
    memo_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    FOREIGN KEY (memo_id) REFERENCES memos(id)
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE _MemoToTag (
    A TEXT NOT NULL,
    B TEXT NOT NULL,
    FOREIGN KEY(A) REFERENCES memos(id),
    FOREIGN KEY(B) REFERENCES tags(id),
    PRIMARY KEY (A, B)
);

-- 3. 用新的、正确的语法创建向量索引
CREATE INDEX memos_embedding_idx ON memos(libsql_vector_idx(embedding));