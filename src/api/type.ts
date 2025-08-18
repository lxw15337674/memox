import { LinkType } from "../components/Editor/LinkAction";
import type { Tag, Link, NewTag, NewLink } from "../db/schema";

// 导出数据库类型（除了 NewMemo，我们会自定义）
export type { Tag, Link, NewTag, NewLink };

// 前端使用的 Memo 类型，images 已经被解析为数组
export interface Memo {
  id: string;
  content: string;
  images: string[];  // 在 API 层面已经被解析为数组
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  embedding: ArrayBuffer | null;
}

// 扩展 Memo 类型以便与前端兼容
export interface MemoWithTags extends Memo {
  tags: Tag[];
  link?: Link | null;
}

// 自定义 NewMemo 接口，用于前端创建 memo
export interface NewMemo {
  content: string;
  images?: string[];
  link?: LinkType;
  tags?: string[];
}

interface Filter {
  conjunction?: "and" | "or";
  conditions?: Array<{
    field_name: string;
    operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "isNotEmpty" | "isGreater" | "isGreaterEqual" | "isLess" | "isLessEqual" | "like" | "in";
    value: Array<string>;
  }>;
  children?: Array<{
    conjunction: "and" | "or";
    conditions?: Array<{
      field_name: string;
      operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "isNotEmpty" | "isGreater" | "isGreaterEqual" | "isLess" | "isLessEqual" | "like" | "in";
      value: Array<string>;
    }>;
  }>;
};
export interface DailyStats {
  date: string;
  count: number;
}

export interface MemosCount {
  dailyStats: DailyStats[];
  total: number;
  daysCount: number;
}


export type Note = Memo & {
  tags: Tag[];
  link?: Link;
}

export interface TagWithCount extends Tag {
  memoCount: number;
}

export interface AIInsight {
  type: '思考模式' | '情感规律' | '主题关联' | '回避盲点' | '成长轨迹';
  title: string;
  content: string;
  evidence: string;
  suggestion: string;
  confidence: '高' | '中' | '低';
}

export interface InsightResponse {
  overview: string;
  insights: AIInsight[];
  patterns: {
    time_patterns: string;
    topic_frequency: string;
    emotional_trends: string;
    writing_style: string;
  };
  questions_to_ponder: string[];
}

export interface InsightRequest {
  timeRange?: { start: Date; end: Date };
  maxMemos?: number;
}

// API响应类型定义
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp?: string;
}



export interface CreateMemoRequest {
  content: string;
  images?: string[];
  link?: LinkType;
  tags?: string[];
}

export interface UpdateMemoRequest {
  content?: string;
  images?: string[];
  link?: LinkType;
  tags?: string[];
}



export type { Filter };