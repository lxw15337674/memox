# MemoX API 文档

**安全认证** 的完整RESTful API接口，用于memo的增删改查操作。

## 🔐 快速开始

### 1. API认证
所有API都需要认证，支持三种方式：
```bash
# 方式1: X-API-Key header (推荐)
curl -H "X-API-Key: memox-api-2024" http://localhost:3000/api/memos

# 方式2: Authorization header  
curl -H "Authorization: Bearer memox-api-2024" http://localhost:3000/api/memos

# 方式3: 查询参数
curl "http://localhost:3000/api/memos?apiKey=memox-api-2024"
```

### 2. 统一密钥
- **默认密钥**: `memox-api-2024` - 拥有所有API操作权限
- **环境变量**: `MEMOX_API_KEY` - 生产环境请设置自定义密钥

## 🚀 API概览

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/memos` | 创建新memo |
| GET | `/api/memos/{id}` | 获取单个memo |
| PUT | `/api/memos/{id}` | 更新memo |
| DELETE | `/api/memos/{id}` | 删除memo（软删除） |

## 📋 API详细说明

### 1. POST /api/memos - 创建新memo

**请求体：**
```json
{
  "content": "memo内容（必填）",
  "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
  "link": {
    "url": "https://example.com",
    "text": "链接标题"
  },
  "tags": ["标签1", "标签2"]
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "memo_456",
    "content": "memo内容",
    "images": ["https://example.com/image1.jpg"],
    "link": {
      "url": "https://example.com",
      "text": "链接标题"
    },
    "tags": [
      {
        "id": "tag_1",
        "name": "标签1",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "message": "创建memo成功",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**curl示例：**
```bash
curl -X POST "http://localhost:3000/api/memos" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "这是一条新的memo",
    "tags": ["工作", "重要"],
    "link": {
      "url": "https://example.com",
      "text": "相关链接"
    }
  }'
```

### 2. GET /api/memos/{id} - 获取单个memo

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "memo_123",
    "content": "memo内容",
    "images": [],
    "link": null,
    "tags": [
      {
        "id": "tag_1",
        "name": "工作",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "message": "获取memo成功",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**curl示例：**
```bash
curl "http://localhost:3000/api/memos/memo_123"
```

### 3. PUT /api/memos/{id} - 更新memo

**请求体（所有字段可选）：**
```json
{
  "content": "更新后的内容",
  "images": ["https://example.com/new-image.jpg"],
  "link": {
    "url": "https://newlink.com",
    "text": "新链接"
  },
  "tags": ["新标签1", "新标签2"]
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "memo_123",
    "content": "更新后的内容",
    "images": ["https://example.com/new-image.jpg"],
    "link": {
      "url": "https://newlink.com",
      "text": "新链接"
    },
    "tags": [
      {
        "id": "tag_2",
        "name": "新标签1",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T01:00:00Z"
  },
  "message": "更新memo成功",
  "timestamp": "2024-01-01T01:00:00Z"
}
```

**curl示例：**
```bash
curl -X PUT "http://localhost:3000/api/memos/memo_123" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "更新后的memo内容",
    "tags": ["更新", "完成"]
  }'
```

### 4. DELETE /api/memos/{id} - 删除memo

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "memo_123"
  },
  "message": "删除memo成功",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**curl示例：**
```bash
curl -X DELETE "http://localhost:3000/api/memos/memo_123"
```

## 🚨 错误响应格式

所有API的错误响应都采用统一格式：

```json
{
  "success": false,
  "error": "错误描述",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**常见错误状态码：**
- `400` - 请求参数无效
- `404` - 资源不存在
- `500` - 服务器内部错误

## 🔧 JavaScript/TypeScript 客户端示例

```typescript
// API客户端类
class MemoAPI {
  private baseURL = '/api/memos';



  // 创建memo
  async createMemo(data: {
    content: string;
    images?: string[];
    link?: { url: string; text?: string };
    tags?: string[];
  }) {
    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  // 获取单个memo
  async getMemo(id: string) {
    const response = await fetch(`${this.baseURL}/${id}`);
    return response.json();
  }

  // 更新memo
  async updateMemo(id: string, data: {
    content?: string;
    images?: string[];
    link?: { url: string; text?: string };
    tags?: string[];
  }) {
    const response = await fetch(`${this.baseURL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  // 删除memo
  async deleteMemo(id: string) {
    const response = await fetch(`${this.baseURL}/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  }
}

// 使用示例
const memoAPI = new MemoAPI();

// 创建memo
const newMemo = await memoAPI.createMemo({
  content: '这是一条新memo',
  tags: ['工作', '重要'],
  link: {
    url: 'https://example.com',
    text: '相关链接'
  }
});

// 获取单个memo
const memo = await memoAPI.getMemo('memo_123');

// 更新memo
const updatedMemo = await memoAPI.updateMemo('memo_123', {
  content: '更新后的内容',
  tags: ['工作', '已完成']
});

// 删除memo
await memoAPI.deleteMemo('memo_123');
```

## 🎯 与现有架构的兼容性

这些REST API与现有的Server Actions完全兼容：

- **复用现有逻辑**：API内部调用相同的Server Actions
- **数据一致性**：使用相同的数据库操作函数
- **类型安全**：共享TypeScript类型定义
- **性能优化**：保留现有的缓存和优化策略

## 🔗 相关资源

- [Next.js API Routes文档](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Prisma文档](https://www.prisma.io/docs)
- [项目现有Server Actions](../../../src/api/dbActions.ts)
