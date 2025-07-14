import { Memo } from "@prisma/client";
import { Tag } from "@prisma/client";
import { Link } from "@prisma/client";
import { LinkType } from "../components/Editor/LinkAction";

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


type Note = Memo & {
  tags: Tag[];
  link?: Link;
}

export interface NewMemo {
  content: string;
  images?: string;
  link?: LinkType
  created_time?: string;
  last_edited_time?: string;
  tags?: string[];
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

export type { Filter, Note };