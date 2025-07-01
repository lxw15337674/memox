# AI服务层重构 - OpenAI版本

## 概述

本次重构将AI相关的接口统一提取到独立的服务层中，并**完全迁移到OpenAI SDK**，提供了更标准化的API调用、更好的错误处理和可维护性。

## 🚀 重大更新

### **从自定义API迁移到OpenAI标准**
- ✅ 使用官方OpenAI SDK替代axios
- ✅ 标准化的ChatCompletion API
- ✅ 优化的消息格式和提示词结构
- ✅ 更强的类型安全和错误处理

## 架构设计

### 🏗️ 服务层结构

```
src/services/
├── types.ts              # 类型定义
├── aiService.ts           # AI对话服务
├── embeddingService.ts    # 向量嵌入服务
├── index.ts              # 统一导出
└── README.md             # 文档说明
```

### 📋 功能分层

#### 1. **AI服务** (`aiService.ts`)
- **OpenAI SDK集成** - 官方SDK调用
- **智能模型配置** - 不同功能使用最适合的模型
- **标准消息格式** - ChatCompletion消息结构
- **标签生成服务** - 优化的提示词设计
- **文本润色服务** - 多版本输出格式
- **多轮对话支持** - 支持复杂对话场景

#### 2. **嵌入服务** (`embeddingService.ts`)
- 向量生成（单个/批量）
- 相似度计算
- 向量格式转换
- 向量验证

#### 3. **类型定义** (`types.ts`)
- 完整的类型定义
- 接口规范
- 配置类型

## 使用方法

### 🔧 基础使用

```typescript
// 导入服务
import { generateTags, polishContent, callAI } from '@/services';

// 生成标签
const tags = await generateTags(content, {
  existingTags: ['学习', '工作'],
  maxTags: 2
});

// 润色文本
const polished = await polishContent(content);

// AI对话 
const response = await callAI({
  messages: [
    { role: 'system', content: '系统角色设定' },
    { role: 'user', content: '用户提问' }
  ],
  model: 'deepseek-ai/DeepSeek-V3',
  temperature: 0.7,
  maxTokens: 1000
});

// 多轮对话
const messages = [
  { role: 'system', content: '你是专业助手' },
  { role: 'user', content: '第一个问题' },
  { role: 'assistant', content: 'AI回复' },
  { role: 'user', content: '后续问题' }
];
const reply = await callAI({ messages });
```

### 🎯 向量操作

```typescript
import { generateEmbedding, calculateCosineSimilarity } from '@/services';

// 生成向量
const embedding = await generateEmbedding('文本内容');

// 计算相似度
const similarity = calculateCosineSimilarity(vec1, vec2);
```

## 改进特性

### ✨ 主要改进

1. **统一错误处理**
   - 自定义错误类型
   - 详细错误信息
   - 结构化错误处理

2. **重试机制**
   - 指数退避算法
   - 可配置重试次数
   - 网络错误自动重试

3. **类型安全**
   - 完整的TypeScript类型
   - 接口规范
   - 编译时错误检查

4. **配置集中化**
   - 统一的配置管理
   - 环境变量支持
   - 默认值设置

5. **代码复用**
   - 公共逻辑提取
   - 避免重复代码
   - 更好的维护性

### 🔄 兼容性

- ✅ 保持原有API接口不变
- ✅ Server Actions继续正常工作
- ✅ 前端组件无需修改
- ✅ 向后兼容

## 迁移指南

### 已完成的迁移

1. **`src/api/aiActions.ts`** → 使用新的服务层
2. **`app/api/ai/insights/route.ts`** → 使用`callAI`
3. **`app/api/ai/search/route.ts`** → 使用`generateEmbedding`和`callAI`

### 待迁移（如需要）

- **`app/api/ai/related/route.ts`** - 可以使用`generateEmbedding`服务
- 其他直接调用AI API的地方

## 配置说明

### 🔧 环境变量

```bash
# OpenAI API配置
AI_BASE_URL=https://api.openai.com/v1  # 或自定义API地址  
AI_API_KEY=sk-your_api_key_here        # OpenAI API密钥
AI_MODEL=gpt-3.5-turbo                 # 默认模型

# 可选：不同功能使用不同模型
AI_TAG_MODEL=gpt-3.5-turbo            # 标签生成模型
AI_POLISH_MODEL=gpt-4                 # 文本润色模型
AI_INSIGHT_MODEL=gpt-4                # 洞察分析模型
AI_SEARCH_MODEL=gpt-3.5-turbo         # 语义搜索模型

# 嵌入服务配置
SILICONFLOW_API_KEY=your_embedding_key_here
```

### 🎛️ 模型配置

```typescript
const MODEL_CONFIGS = {
  'tag-generation': {
    model: 'gpt-3.5-turbo',
    temperature: 0.3,     // 更准确的标签
    maxTokens: 100
  },
  'text-polish': {
    model: 'gpt-4',
    temperature: 0.7,     // 更有创意的润色
    maxTokens: 1000
  },
  'insight-analysis': {
    model: 'gpt-4',
    temperature: 0.6,     // 平衡创意和准确性
    maxTokens: 2000
  }
  // ...
}
```

## 错误处理

### 错误类型

1. **AIServiceError** - AI服务相关错误
2. **EmbeddingServiceError** - 向量服务相关错误

### 使用示例

```typescript
try {
  const result = await generateTags(content, options);
} catch (error) {
  if (error instanceof AIServiceError) {
    console.error('AI服务错误:', error.code, error.message);
  } else {
    console.error('未知错误:', error);
  }
}
```

## 性能优化

### 内置优化

1. **请求重试** - 网络问题自动重试
2. **错误分类** - 不同错误类型不同处理策略
3. **超时控制** - 避免长时间等待
4. **批量处理** - 支持批量向量生成

### 监控建议

- 监控API调用成功率
- 监控平均响应时间
- 监控错误类型分布

## 未来扩展

### 可能的改进方向

1. **缓存机制** - 减少重复API调用
2. **限流控制** - 避免API配额超限
3. **模型切换** - 支持多种AI模型
4. **离线模式** - 本地模型支持
5. **性能监控** - 详细的性能指标

## 🎉 迁移完成

### ✅ 已完成的重大改进

1. **🔄 完全迁移到OpenAI SDK**
   - 替换所有的axios调用
   - 使用标准的ChatCompletion API
   - 更好的错误处理和重试机制

2. **📝 提示词格式优化**
   - 从单一长字符串改为结构化消息
   - System/User消息分离
   - 更符合ChatGPT的对话格式

3. **🎛️ 智能模型配置**
   - 不同功能使用最适合的模型
   - 可通过环境变量灵活配置
   - 自动参数优化（temperature、maxTokens）

4. **🚀 新增功能**
   - 统一AI调用接口 (`callAI`)
   - 模型配置管理 (`getModelConfig`, `updateModelConfig`)
   

5. **🛡️ 增强的错误处理**
   - OpenAI特有错误类型处理
   - 更详细的错误信息
   - 自动重试和超时控制

### 🔧 配置迁移

**旧配置**：
```bash
NEXT_PUBLIC_AI_API_URL=https://bhwa233-api.vercel.app/api/ai/chat
```

**新配置**：
```bash
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-your_key_here
AI_MODEL=gpt-3.5-turbo
```

### 📊 性能提升

- ⚡ 更快的响应时间（官方SDK优化）
- 🎯 更准确的结果（优化的提示词格式）
- 💪 更稳定的连接（内置重试机制）
- 📈 更好的Token利用率（精确计算）

---

> 💡 这次迁移不仅提升了技术架构，还为未来支持更多AI功能（如流式响应、多模态等）打下了坚实基础。OpenAI SDK的标准化使得维护和扩展变得更加容易。 