'use server';

import { Filter, MemosCount, NewMemo, Note } from './type';
import { NewMemo as DrizzleNewMemo } from '../db/schema';
import { db as client } from '../db';
import * as schema from '../db/schema';
import { generateTags } from './aiActions';
import { waitUntil } from '@vercel/functions';
import { eq, and, desc, asc, count, isNull, isNotNull, gte, lt, inArray, like, sql } from 'drizzle-orm';
import { Desc } from '../store/filter';
import { format } from 'date-fns';


export const getRecordsActions = async (config: {
    page_size?: number;
    page?: number;
    filter?: Filter;
    desc?: Desc;
}) => {
    const { page_size = 30, page = 1, filter, desc: sortDesc = Desc.DESC } = config;
    try {
        const filterConditions = filter ? buildWhereClause(filter) : [];
        const whereConditions = [
            ...filterConditions,
            isNull(schema.memos.deletedAt)
        ];

        if (sortDesc === Desc.RANDOM) {
            // 使用数据库原生RANDOM()函数进行随机排序
            const items = await client
                .select({
                    id: schema.memos.id,
                    content: schema.memos.content,
                    images: schema.memos.images,
                    createdAt: schema.memos.createdAt,
                    updatedAt: schema.memos.updatedAt,
                    deletedAt: schema.memos.deletedAt,
                    embedding: schema.memos.embedding,
                    link: {
                        id: schema.links.id,
                        url: schema.links.link,
                        text: schema.links.text,
                        memoId: schema.links.memoId
                    }
                })
                .from(schema.memos)
                .leftJoin(schema.links, eq(schema.memos.id, schema.links.memoId))
                .where(and(...whereConditions))
                .orderBy(sql`RANDOM()`)
                .limit(page_size)
                .offset((page - 1) * page_size);

            // 获取总数（用于分页）
            const totalResult = await client
                .select({ count: count() })
                .from(schema.memos)
                .where(and(...whereConditions));
            const total = totalResult[0]?.count || 0;

            if (items.length === 0) {
                return { items: [], total };
            }

            // 获取标签信息
            const memoIds = items.map(item => item.id);
            const tagsData = await client
                .select({
                    memoId: schema.memoTags.memoId,
                    tagId: schema.tags.id,
                    tagName: schema.tags.name,
                    tagCreatedAt: schema.tags.createdAt
                })
                .from(schema.memoTags)
                .innerJoin(schema.tags, eq(schema.memoTags.tagId, schema.tags.id))
                .where(inArray(schema.memoTags.memoId, memoIds));

            // 组装数据
            const itemsWithTags = items.map(item => {
                const tags = tagsData
                    .filter(mt => mt.memoId === item.id)
                    .map(mt => ({ id: mt.tagId, name: mt.tagName, createdAt: mt.tagCreatedAt }));
                return {
                    ...item,
                    images: JSON.parse(item.images || '[]'),
                    tags,
                    link: item.link && item.link.id ? {
                        id: item.link.id,
                        link: item.link.url,
                        text: item.link.text,
                        createdAt: item.createdAt,
                        memoId: item.link.memoId
                    } : undefined
                };
            });

            return {
                items: itemsWithTags as Note[],
                total,
            };
        }

        // 普通查询
        const [items, totalResult] = await Promise.all([
            client
                .select({
                    id: schema.memos.id,
                    content: schema.memos.content,
                    images: schema.memos.images,
                    createdAt: schema.memos.createdAt,
                    updatedAt: schema.memos.updatedAt,
                    deletedAt: schema.memos.deletedAt,
                    link: {
                        id: schema.links.id,
                        url: schema.links.link,
                        text: schema.links.text,
                        memoId: schema.links.memoId
                    }
                })
                .from(schema.memos)
                .leftJoin(schema.links, eq(schema.memos.id, schema.links.memoId))
                .where(and(...whereConditions))
                .orderBy(sortDesc === Desc.DESC ? desc(schema.memos.createdAt) : asc(schema.memos.createdAt))
                .limit(page_size)
                .offset((page - 1) * page_size),
            client
                .select({ count: count() })
                .from(schema.memos)
                .where(and(...whereConditions))
        ]);

        // 获取标签
        const memoIds = items.map(item => item.id);
        const memoTags = memoIds.length > 0 ? await client
            .select({
                memoId: schema.memoTags.memoId,
                tagId: schema.memoTags.tagId,
                tagName: schema.tags.name,
                tagCreatedAt: schema.tags.createdAt
            })
            .from(schema.memoTags)
            .innerJoin(schema.tags, eq(schema.memoTags.tagId, schema.tags.id))
            .where(inArray(schema.memoTags.memoId, memoIds)) : [];

        // 组装数据
        const itemsWithTags = items.map(item => {
            const tags = memoTags
                .filter(mt => mt.memoId === item.id)
                .map(mt => ({ id: mt.tagId, name: mt.tagName, createdAt: mt.tagCreatedAt }));
            return {
                ...item,
                images: JSON.parse(item.images || '[]'),
                tags,
                link: item.link && item.link.id ? {
                    id: item.link.id,
                    link: item.link.url,
                    text: item.link.text,
                    createdAt: item.createdAt,
                    memoId: item.link.memoId
                } : undefined
            };
        });

        return {
            items: itemsWithTags as Note[],
            total: totalResult[0].count,
        }
    } catch (error) {
        console.error("数据获取失败:", error);
        throw error;
    }
};

export const getMemosDataActions = async ({ filter, desc = Desc.DESC, page = 1 }: {
    filter?: Filter;
    desc?: Desc;
    page?: number;
} = {}) => {
    try {
        const data = await getRecordsActions({
            desc,
            page_size: 30,
            page,
            filter
        });
        return data;
    } catch (error) {
        console.error("memos获取失败:", error);
        throw error;
    }
};

export const createNewMemo = async (newMemo: NewMemo) => {
    try {
        const { content, images, link, tags } = newMemo;
        const tagNames: string[] = tags && tags.length > 0 ? tags : [];
        
        // 使用事务包装所有数据库操作，减少数据库往返
        const memo = await client.transaction(async (tx) => {
            // 创建memo
            const memoData = {
                content,
                images: JSON.stringify(images || []),
            } satisfies typeof schema.memos.$inferInsert;
            const [newMemo] = await tx
                .insert(schema.memos)
                .values(memoData)
                .returning();

            // 处理标签
            const memoTags = [];
            for (const tagName of tagNames) {
                // 查找或创建标签
                let [tag] = await tx
                    .select()
                    .from(schema.tags)
                    .where(eq(schema.tags.name, tagName));
                
                if (!tag) {
                    [tag] = await tx
                        .insert(schema.tags)
                        .values({ name: tagName })
                        .returning();
                }

                // 创建memo-tag关联
                await tx
                    .insert(schema.memoTags)
                    .values({
                        memoId: newMemo.id,
                        tagId: tag.id
                    });
                
                memoTags.push(tag);
            }

            // 处理链接
            let memoLink = null;
            if (link) {
                [memoLink] = await tx
                    .insert(schema.links)
                    .values({
                        link: link.url,
                        text: link.text,
                        memoId: newMemo.id
                    })
                    .returning();
            }

            return {
                ...newMemo,
                images: JSON.parse(newMemo.images || '[]'),
                tags: memoTags,
                link: memoLink
            };
        });
        
        // 异步生成AI标签，不阻塞响应
        console.log(`[Server Action] 为新创建的 memo ${memo.id} 启动后台AI标签生成`);
        waitUntil(regenerateMemeTags(memo.id));

        return memo;
    } catch (error) {
        console.error("添加失败:", error);
        throw error;
    }
};

export const deleteMemo = async (id: number) => {
    try {
        await client
            .update(schema.memos)
            .set({ deletedAt: new Date().toISOString() })
            .where(eq(schema.memos.id, Number(id)));
        console.log("软删除成功");
    } catch (error) {
        console.error("软删除失败:", error);
        throw error;
    }
};

export const getMemoByIdAction = async (id: number) => {
    try {
        const [memo] = await client
            .select({
                id: schema.memos.id,
                content: schema.memos.content,
                images: schema.memos.images,
                createdAt: schema.memos.createdAt,
                updatedAt: schema.memos.updatedAt,
                deletedAt: schema.memos.deletedAt,
                embedding: schema.memos.embedding,
                link: {
                    id: schema.links.id,
                    url: schema.links.link,
                    text: schema.links.text,
                    memoId: schema.links.memoId
                }
            })
            .from(schema.memos)
            .leftJoin(schema.links, eq(schema.memos.id, schema.links.memoId))
            .where(and(eq(schema.memos.id, Number(id)), isNull(schema.memos.deletedAt)));

        if (!memo) return null;

        // 获取标签
        const memoTags = await client
            .select({
                tagId: schema.memoTags.tagId,
                tagName: schema.tags.name,
                tagCreatedAt: schema.tags.createdAt
            })
            .from(schema.memoTags)
            .innerJoin(schema.tags, eq(schema.memoTags.tagId, schema.tags.id))
            .where(eq(schema.memoTags.memoId, id));

        return {
            ...memo,
            images: JSON.parse(memo.images || '[]'),
            tags: memoTags.map(mt => ({ id: mt.tagId, name: mt.tagName, createdAt: mt.tagCreatedAt })),
            link: memo.link && memo.link.id ? {
                id: memo.link.id,
                link: memo.link.url,
                text: memo.link.text,
                createdAt: memo.createdAt,
                memoId: memo.link.memoId
            } : undefined
        };
    } catch (error) {
        console.error(error);
        return null;
    }
};

// 快速更新memo，不进行AI标签生成（适用于频繁保存场景）
export const updateMemoQuickAction = async (id: number, newMemo: NewMemo) => {
    try {
        const { content, images, link } = newMemo;

        const updatedMemo = await client.transaction(async (tx) => {
            // 检查memo是否存在
            const [existingMemo] = await tx
                .select({ id: schema.memos.id })
                .from(schema.memos)
                .where(and(eq(schema.memos.id, Number(id)), isNull(schema.memos.deletedAt)));

            if (!existingMemo) {
                throw new Error('Memo not found');
            }

            // 更新memo
            await tx
                .update(schema.memos)
                .set({
                    content,
                    images: JSON.stringify(images || []),
                    updatedAt: new Date().toISOString()
                })
                .where(eq(schema.memos.id, Number(id)));

            // 处理链接
            if (link) {
                // 删除现有链接
                await tx
                    .delete(schema.links)
                    .where(eq(schema.links.memoId, id));
                
                // 创建新链接
                await tx
                    .insert(schema.links)
                    .values({
                        link: link.url,
                        text: link.text,
                        memoId: id
                    });
            } else {
                // 如果没有链接，删除现有链接
                await tx
                    .delete(schema.links)
                    .where(eq(schema.links.memoId, id));
            }

            return { id };
        });

        return updatedMemo.id;
    } catch (error) {
        console.error("快速更新失败:", error);
        return null;
    }
};

// 完整更新memo，包含AI标签生成（适用于完成编辑后的最终保存）
export const updateMemoAction = async (id: number, newMemo: NewMemo) => {
    try {
        const { content, images, link } = newMemo;

        // 使用事务优化数据库操作，减少往返次数
        const updatedMemo = await client.transaction(async (tx) => {
            // 检查memo是否存在
            const [existingMemo] = await tx
                .select({ id: schema.memos.id })
                .from(schema.memos)
                .where(and(eq(schema.memos.id, Number(id)), isNull(schema.memos.deletedAt)));

            if (!existingMemo) {
                throw new Error('Memo not found');
            }

            // 更新memo
            await tx
                .update(schema.memos)
                .set({
                    content,
                    images: JSON.stringify(images || []),
                    updatedAt: new Date().toISOString()
                })
                .where(eq(schema.memos.id, Number(id)));

            // 处理链接
            if (link) {
                // 删除现有链接
                await tx
                    .delete(schema.links)
                    .where(eq(schema.links.memoId, id));
                
                // 创建新链接
                await tx
                    .insert(schema.links)
                    .values({
                        link: link.url,
                        text: link.text,
                        memoId: id
                    });
            } else {
                // 如果没有链接，删除现有链接
                await tx
                    .delete(schema.links)
                    .where(eq(schema.links.memoId, id));
            }

            return { id };
        });

        // 异步处理标签生成和更新 - 不阻塞主响应
        waitUntil(regenerateMemeTags(id));

        // 立即返回更新结果，不等待标签生成
        return id;
    } catch (error) {
        console.error("更新失败:", error);
        return null;
    }
};

function buildWhereClause(filter: Filter) {
    const conditions = filter.conditions || [];
    const whereConditions: any[] = [];

    conditions.forEach(condition => {
        if (condition.field_name === "content") {
            whereConditions.push(like(schema.memos.content, `%${condition.value[0]}%`));
            return;
        }
        if (condition.field_name === "tags") {
            // 对于标签过滤，需要子查询
            const tagSubquery = client
                .select({ memoId: schema.memoTags.memoId })
                .from(schema.memoTags)
                .innerJoin(schema.tags, eq(schema.memoTags.tagId, schema.tags.id))
                .where(inArray(schema.tags.name, condition.value));
            whereConditions.push(inArray(schema.memos.id, tagSubquery));
            return;
        }
        if (condition.field_name === "created_time") {
            const date = new Date(condition.value[0]);
            const startOfDay = new Date(date.setHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setHours(23, 59, 59, 999));
            whereConditions.push(
                and(
                    gte(schema.memos.createdAt, startOfDay.toISOString()),
                    lt(schema.memos.createdAt, endOfDay.toISOString())
                )
            );
            return;
        }
        if (condition.field_name === "images") {
            if (condition.operator === "isNotEmpty") {
                whereConditions.push(sql`json_array_length(${schema.memos.images}) > 0`);
            } else if (condition.operator === "isEmpty") {
                whereConditions.push(sql`json_array_length(${schema.memos.images}) = 0`);
            }
            return;
        }
    });

    return whereConditions;
}

export const getTagsAction = async () => {
    const tags = await client.select().from(schema.tags);
    return tags;
};

export const getTagsWithCountAction = async () => {
    const tagsWithCount = await client
        .select({
            id: schema.tags.id,
            name: schema.tags.name,
            createdAt: schema.tags.createdAt,
            memoCount: count(schema.memoTags.memoId)
        })
        .from(schema.tags)
        .leftJoin(schema.memoTags, eq(schema.tags.id, schema.memoTags.tagId))
        .leftJoin(schema.memos, and(
            eq(schema.memoTags.memoId, schema.memos.id),
            isNull(schema.memos.deletedAt)
        ))
        .groupBy(schema.tags.id, schema.tags.name, schema.tags.createdAt)
          .orderBy(desc(count(schema.memoTags.memoId)));
 
     return tagsWithCount;
};



// 获取按日期分组的笔记数量，获取笔记总数，获取记录天数
export const getCountAction = async (): Promise<MemosCount> => {
    try {
        // 获取所有笔记
        const memos = await client
            .select({ createdAt: schema.memos.createdAt })
            .from(schema.memos)
            .where(isNull(schema.memos.deletedAt))
            .orderBy(asc(schema.memos.createdAt));

        // 按日期分组统计
        const groupByDate = memos.reduce((acc: Record<string, number>, memo) => {
            const date = format(new Date(memo.createdAt), 'yyyy/MM/dd');
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});

        // 计算总数和记录天数
        const total = memos.length;
        const daysCount = Object.keys(groupByDate).length;

        // 获取每日统计数据
        const dailyStats = Object.entries(groupByDate).map(([date, count]) => ({
            date,
            count
        }));

        return {
            dailyStats,
            total,
            daysCount
        };
    } catch (error) {
        console.error("获取按日期分组的笔记失败:", error);
        throw new Error("获取笔记数据失败");
    }
};

export const clearAllDataAction = async () => {
    try {
        await client.delete(schema.links);
        await client.delete(schema.memoTags);
        await client.delete(schema.tags);
        await client
            .update(schema.memos)
            .set({ deletedAt: new Date().toISOString() })
            .where(isNull(schema.memos.deletedAt));
        return { success: true };
    } catch (error) {
        console.error("清空数据失败:", error);
        throw error;
    }
};

export const deleteTagAction = async (tagName: string) => {
    const [tag] = await client
        .delete(schema.tags)
        .where(eq(schema.tags.name, tagName))
        .returning();
    return tag;
};

export const updateTagAction = async (oldName: string, newName: string) => {
    const updatedTag = await client.transaction(async (tx) => {
        // First check if the new name already exists
        const [existingTag] = await tx
            .select()
            .from(schema.tags)
            .where(eq(schema.tags.name, newName));

        if (existingTag) {
            throw new Error('Tag with this name already exists');
        }

        // Get the old tag
        const [oldTag] = await tx
            .select()
            .from(schema.tags)
            .where(eq(schema.tags.name, oldName));

        if (!oldTag) {
            throw new Error('Old tag not found');
        }

        // Update the tag name directly
        const [newTag] = await tx
            .update(schema.tags)
            .set({ name: newName })
            .where(eq(schema.tags.id, Number(oldTag.id)))
            .returning();

        return newTag;
    });

    return updatedTag;
};

// 手动触发标签重新生成（同步版本，用于用户主动触发）
export const updateMemoTagsAction = async (memoId: number) => {
    try {
        const [memo] = await client
            .select()
            .from(schema.memos)
            .where(and(eq(schema.memos.id, Number(memoId)), isNull(schema.memos.deletedAt)));
        
        if (!memo) {
            console.error(`Memo with id ${memoId} not found.`);
            return null;
        }

        if (!memo.content || memo.content.trim().length < 5) {
            console.log(`Content too short for tag generation: ${memoId}`);
            return memo;
        }

        // 同步生成标签（用户主动触发时可以等待）
        const tagNames = await generateTags(memo.content);

        if (tagNames && tagNames.length > 0) {
            await client.transaction(async (tx) => {
                // 删除现有的标签关联
                await tx
                    .delete(schema.memoTags)
                    .where(eq(schema.memoTags.memoId, memoId));

                // 为每个标签创建或查找，然后关联
                for (const tagName of tagNames) {
                    let [tag] = await tx
                        .select()
                        .from(schema.tags)
                        .where(eq(schema.tags.name, tagName));
                    
                    if (!tag) {
                        [tag] = await tx
                            .insert(schema.tags)
                            .values({ name: tagName })
                            .returning();
                    }

                    await tx
                        .insert(schema.memoTags)
                        .values({
                            memoId: memoId,
                            tagId: tag.id
                        });
                }
            });
        }

        return { id: memoId, tags: tagNames };
    } catch (error) {
        console.error(`Error updating tags for memo ${memoId}:`, error);
        return null;
    }
};

export const regenerateMemeTags = async (memoId: number) => {
    try {
        const [memo] = await client
            .select({
                id: schema.memos.id,
                content: schema.memos.content,
                images: schema.memos.images,
                createdAt: schema.memos.createdAt,
                updatedAt: schema.memos.updatedAt,
                deletedAt: schema.memos.deletedAt,
                link: {
                    id: schema.links.id,
                    url: schema.links.link,
                    text: schema.links.text,
                    memoId: schema.links.memoId
                }
            })
            .from(schema.memos)
            .leftJoin(schema.links, eq(schema.memos.id, schema.links.memoId))
            .where(and(eq(schema.memos.id, Number(memoId)), isNull(schema.memos.deletedAt)));
        
        if (!memo) {
            console.error(`Memo with id ${memoId} not found.`);
            return null;
        }

        // if content is too short, no need to call AI
        if (!memo.content || memo.content.trim().length < 5) {
            console.log(`Content too short for tag generation: ${memoId}`);
            return memo;
        }

        const tagNames = await generateTags(memo.content);

        const updatedTags = await client.transaction(async (tx) => {
            // 删除现有的标签关联
            await tx
                .delete(schema.memoTags)
                .where(eq(schema.memoTags.memoId, memoId));

            const tags = [];
            // 为每个标签创建或查找，然后关联
            for (const tagName of tagNames) {
                let [tag] = await tx
                    .select()
                    .from(schema.tags)
                    .where(eq(schema.tags.name, tagName));
                
                if (!tag) {
                    [tag] = await tx
                        .insert(schema.tags)
                        .values({ name: tagName })
                        .returning();
                }

                await tx
                    .insert(schema.memoTags)
                    .values({
                        memoId: memoId,
                        tagId: tag.id
                    });
                
                tags.push(tag);
            }
            return tags;
        });

        const updatedMemo = {
            ...memo,
            tags: updatedTags,
            link: memo.link?.id ? memo.link : null
        };
        
        console.log(`Tags updated for memo: ${memoId}`, tagNames);
        return updatedMemo;

    } catch (error) {
        console.error(`Error regenerating tags for memo ${memoId}:`, error);
        return null;
    }
};

// 查询关联数量少于指定阈值的标签
export const getUnderUsedTagsAction = async (threshold: number = 10) => {
    try {
        const tagsWithCount = await client
            .select({
                id: schema.tags.id,
                name: schema.tags.name,
                memoCount: count(schema.memoTags.memoId)
            })
            .from(schema.tags)
            .leftJoin(schema.memoTags, eq(schema.tags.id, schema.memoTags.tagId))
            .leftJoin(schema.memos, and(
                eq(schema.memoTags.memoId, schema.memos.id),
                isNull(schema.memos.deletedAt)
            ))
            .groupBy(schema.tags.id, schema.tags.name)
            .having(sql`count(${schema.memoTags.memoId}) < ${threshold}`);

        return tagsWithCount;
    } catch (error) {
        console.error("获取低频标签失败:", error);
        throw error;
    }
};

// 批量删除低频标签
export const deleteUnderUsedTagsAction = async (threshold: number = 10) => {
    try {
        const result = await client.transaction(async (tx) => {
            // 查询所有标签及其关联的备忘录数量
            const tagsWithCount = await tx
                .select({
                    id: schema.tags.id,
                    name: schema.tags.name,
                    memoCount: count(schema.memoTags.memoId)
                })
                .from(schema.tags)
                .leftJoin(schema.memoTags, eq(schema.tags.id, schema.memoTags.tagId))
                .leftJoin(schema.memos, and(
                    eq(schema.memoTags.memoId, schema.memos.id),
                    isNull(schema.memos.deletedAt)
                ))
                .groupBy(schema.tags.id, schema.tags.name);

            // 筛选出关联数量少于阈值的标签
            const tagsToDeleteIds = tagsWithCount
                .filter(tag => tag.memoCount < threshold)
                .map(tag => tag.id);

            if (tagsToDeleteIds.length === 0) {
                return {
                    deletedCount: 0,
                    deletedTags: []
                };
            }

            // 记录要删除的标签信息
            const deletedTagsInfo = tagsWithCount
                .filter(tag => tagsToDeleteIds.includes(tag.id))
                .map(tag => ({
                    id: tag.id,
                    name: tag.name,
                    memoCount: tag.memoCount
                }));

            // 批量删除标签
            await tx
                .delete(schema.tags)
                .where(inArray(schema.tags.id, tagsToDeleteIds));

            return {
                deletedCount: tagsToDeleteIds.length,
                deletedTags: deletedTagsInfo
            };
        });

        console.log(`成功删除 ${result.deletedCount} 个低频标签`);
        return result;
    } catch (error) {
        console.error("删除低频标签失败:", error);
        throw error;
    }
};


