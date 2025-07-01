'use server';

import { Filter, MemosCount, NewMemo, Note } from './type';
import { prisma } from '.';
import { generateTags } from './aiActions';
import { waitUntil } from '@vercel/functions';

import { Desc } from '../store/filter';
import { format } from 'date-fns';


export const getRecordsActions = async (config: {
    page_size?: number;
    page?: number;
    filter?: Filter;
    desc?: Desc;
}) => {
    const { page_size = 30, page = 1, filter, desc = Desc.DESC } = config;
    try {
        const filterWhere = filter ? buildWhereClause(filter) : {};
        const where = {
            ...filterWhere,
            deleted_at: null
        };

        if (desc === Desc.RANDOM) {
            // 方案二：两步查询法
            // 1. 只查询符合条件的 ID 列表
            const memoIds = await prisma.memo.findMany({
                where,
                select: { id: true },
            });
            const total = memoIds.length;

            // 2. 在应用层对 ID 进行洗牌
            const shuffledIds = memoIds.map(m => m.id).sort(() => Math.random() - 0.5);

            // 3. 根据分页获取当前页的 ID
            const pageIds = shuffledIds.slice((page - 1) * page_size, page * page_size);

            if (pageIds.length === 0) {
                return { items: [], total };
            }

            // 4. 获取完整数据，并保持随机顺序
            const items = await prisma.memo.findMany({
                where: { id: { in: pageIds } },
                include: { link: true, tags: true },
            });

            const sortedItems = items.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));

            return {
                items: sortedItems as Note[],
                total,
            };
        }


        const [items, total] = await Promise.all([
            prisma.memo.findMany({
                take: page_size,
                skip: (page - 1) * page_size,
                where,
                orderBy: {
                    createdAt: desc === Desc.DESC ? 'desc' : 'asc'
                },
                include: {
                    link: true,
                    tags: true
                }
            }),
            prisma.memo.count({ where })
        ]);
        return {
            items: items as Note[],
            total,
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
        const { content, images, link, created_time, last_edited_time, tags } = newMemo;
        const tagNames: string[] = tags && tags.length > 0 ? tags : [];
        
        // 使用事务包装所有数据库操作，减少数据库往返
        const memo = await prisma.$transaction(async (tx) => {
            // 在单个事务中创建备忘录和关联实体
            return await tx.memo.create({
                data: {
                    content,
                    images: images || [],
                    createdAt: created_time ? new Date(created_time) : new Date(),
                    updatedAt: last_edited_time ? new Date(last_edited_time) : new Date(),
                    tags: {
                        connectOrCreate: tagNames.map((name: string) => ({
                            where: { name },
                            create: { name }
                        }))
                    },
                    link: link ? {
                        create: link
                    } : undefined
                },
                include: {
                    tags: true,
                    link: true
                }
            });
        });
        
        return memo;
    } catch (error) {
        console.error("添加失败:", error);
        throw error;
    }
};

export const deleteMemo = async (id: string) => {
    try {
        await prisma.memo.update({
            where: { id },
            data: {
                deleted_at: new Date(),
            }
        });
        console.log("软删除成功");
    } catch (error) {
        console.error("软删除失败:", error);
        throw error;
    }
};

export const getMemoByIdAction = async (id: string) => {
    try {
        const memo = await prisma.memo.findUnique({
            where: { id, deleted_at: null },
            include: {
                link: true,
                tags: true
            }
        });

        if (!memo) return null;
        return memo;
    } catch (error) {
        console.error(error);
        return null;
    }
};

// 快速更新memo，不进行AI标签生成（适用于频繁保存场景）
export const updateMemoQuickAction = async (id: string, newMemo: NewMemo) => {
    try {
        const { content, images, link } = newMemo;

        const updatedMemo = await prisma.$transaction(async (tx) => {
            const existingMemo = await tx.memo.findUnique({
                where: { id },
                select: {
                    link: { select: { id: true } }
                }
            });

            if (!existingMemo) {
                throw new Error('Memo not found');
            }

            return await tx.memo.update({
                where: { id },
                data: {
                    content,
                    images: images || [],
                    updatedAt: new Date(),
                    link: {
                        ...((!existingMemo?.link && !link) ? {} :
                            (!link ? { delete: true } :
                                (!existingMemo?.link ? { create: { url: link.url, text: link.text } } :
                                    { update: { url: link.url, text: link.text } })))
                    }
                },
                include: {
                    link: true,
                    tags: true
                }
            });
        });

        return updatedMemo.id;
    } catch (error) {
        console.error("快速更新失败:", error);
        return null;
    }
};

// 完整更新memo，包含AI标签生成（适用于完成编辑后的最终保存）
export const updateMemoAction = async (id: string, newMemo: NewMemo) => {
    try {
        const { content, images, link } = newMemo;

        // 使用事务优化数据库操作，减少往返次数
        const updatedMemo = await prisma.$transaction(async (tx) => {
            // 获取现有的memo数据（仅在需要时查询必要字段）
            const existingMemo = await tx.memo.findUnique({
                where: { id },
                select: {
                    content: true,
                    link: { select: { id: true } }
                }
            });

            if (!existingMemo) {
                throw new Error('Memo not found');
            }

            // 更新memo - 合并所有更新操作到单次查询
            return await tx.memo.update({
                where: { id },
                data: {
                    content,
                    images: images || [],
                    updatedAt: new Date(),
                    link: {
                        // 优化link处理逻辑
                        ...((!existingMemo?.link && !link) ? {} : 
                            (!link ? { delete: true } : 
                                (!existingMemo?.link ? { create: { url: link.url, text: link.text } } :
                                    { update: { url: link.url, text: link.text } })))
                    }
                },
                include: {
                    link: true,
                    tags: true
                }
            });
        });

        // 异步处理标签生成和更新 - 不阻塞主响应
        const backgroundTagUpdate = async () => {
            console.log(`[waitUntil] Starting background tag generation for memo: ${id}`);

            const tagNames = await generateTags(updatedMemo.content);

            await prisma.memo.update({
                where: { id },
                data: {
                    tags: {
                        set: [], // 清除现有标签
                        connectOrCreate: tagNames.map((name: string) => ({
                            where: { name },
                            create: { name }
                        }))
                    }
                }
            });
        };
        // 使用 waitUntil 确保标签更新在后台完成，不影响响应速度
        waitUntil(backgroundTagUpdate());

        // 立即返回更新结果，不等待标签生成
        return updatedMemo.id;
    } catch (error) {
        console.error("更新失败:", error);
        return null;
    }
};

function buildWhereClause(filter: Filter) {
    const where: any = {};
    const conditions = filter.conditions || [];

    conditions.forEach(condition => {
        if (condition.field_name === "content") {
            where.content = {
                contains: condition.value[0]
            };
            return;
        }
        if (condition.field_name === "tags") {
            where.tags = {
                some: {
                    name: {
                        in: condition.value
                    }
                }
            };
            return;
        }
        if (condition.field_name === "created_time") {
            const date = new Date(condition.value[0]);
            where.createdAt = {
                gte: new Date(date.setHours(0, 0, 0, 0)),
                lt: new Date(date.setHours(24, 0, 0, 0))
            };
            return;
        }
        if (condition.field_name === "images") {
            if (condition.operator === "isNotEmpty") {
                where.images = {
                    isEmpty: false
                };
            } else if (condition.operator === "isEmpty") {
                where.images = {
                    isEmpty: true
                };
            }
            return;
        }
    });

    return where;
}

export const getTagsAction = async () => {
    const tags = await prisma.tag.findMany();
    return tags;
};

export const getTagsWithCountAction = async () => {
    const tagsWithCount = await prisma.tag.findMany({
        include: {
            _count: {
                select: {
                    memos: true // 统计与每个标签关联的 memos 数量
                }
            }
        },
    });

    return tagsWithCount
        .map(tag => ({
            ...tag,
            memoCount: tag._count.memos
        }))
        .sort((a, b) => b.memoCount - a.memoCount); // Sort by memoCount in descending order
};



// 获取按日期分组的备忘录数量，获取备忘录总数，获取记录天数
export const getCountAction = async (): Promise<MemosCount> => {
    try {
        // 获取所有备忘录
        const memos = await prisma.memo.findMany({
            where: { deleted_at: null },
            select: {
                createdAt: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        // 按日期分组统计
        const groupByDate = memos.reduce((acc: Record<string, number>, memo) => {
            const date = format(memo.createdAt, 'yyyy/MM/dd');
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
        console.error("获取按日期分组的备忘录失败:", error);
        throw new Error("获取备忘录数据失败");
    }
};

export const clearAllDataAction = async () => {
    try {
        await prisma.link.deleteMany({});
        await prisma.tag.deleteMany({});
        await prisma.memo.updateMany({
            where: { deleted_at: null },
            data: {
                deleted_at: new Date(),
            }
        });
        return { success: true };
    } catch (error) {
        console.error("清空数据失败:", error);
        throw error;
    }
};

export const deleteTagAction = async (tagName: string) => {
    const tag = await prisma.tag.delete({
        where: {
            name: tagName,
        },
    });
    return tag;
};

export const updateTagAction = async (oldName: string, newName: string) => {
    const updatedTag = await prisma.$transaction(async (tx) => {
        // First check if the new name already exists
        const existingTag = await tx.tag.findUnique({
            where: { name: newName }
        });

        if (existingTag) {
            throw new Error('Tag with this name already exists');
        }

        // Get all memos that have the old tag
        const memosWithOldTag = await tx.memo.findMany({
            where: {
                tags: {
                    some: {
                        name: oldName
                    }
                },
                deleted_at: null
            },
            include: {
                tags: true
            }
        });

        // Delete the old tag
        await tx.tag.delete({
            where: { name: oldName }
        });

        // Create the new tag
        const newTag = await tx.tag.create({
            data: { name: newName }
        });

        // Update all memos to use the new tag
        await Promise.all(
            memosWithOldTag.map((memo) =>
                tx.memo.update({
                    where: { id: memo.id },
                    data: {
                        tags: {
                            connect: [
                                ...memo.tags
                                    .filter((tag) => tag.name !== oldName)
                                    .map((tag) => ({ id: tag.id })),
                                { id: newTag.id }
                            ]
                        }
                    }
                })
            )
        );

        return newTag;
    });

    return updatedTag;
};

// 手动触发标签重新生成（同步版本，用于用户主动触发）
export const updateMemoTagsAction = async (memoId: string) => {
    try {
        const memo = await prisma.memo.findUnique({
            where: { id: memoId, deleted_at: null }
        });
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
            await prisma.memo.update({
                where: { id: memoId },
                data: {
                    tags: {
                        set: [],
                        connectOrCreate: tagNames.map((name: string) => ({
                            where: { name },
                            create: { name }
                        }))
                    }
                }
            });
        }

        return { id: memoId, tags: tagNames };
    } catch (error) {
        console.error(`Error updating tags for memo ${memoId}:`, error);
        return null;
    }
};

export const regenerateMemeTags = async (memoId: string) => {
    try {
        const memo = await prisma.memo.findUnique({
            where: { id: memoId, deleted_at: null },
            include: {
                tags: true, // include existing tags
                link: true,
            },
        });
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

        const updatedMemo = await prisma.memo.update({
            where: { id: memoId },
            data: {
                tags: {
                    set: [], // Disconnect existing tags first
                    connectOrCreate: tagNames.map((name: string) => ({
                        where: { name },
                        create: { name }
                    }))
                }
            },
            include: {
                tags: true,
                link: true
            }
        });
        console.log(`Tags updated for memo: ${memoId}`, tagNames);
        return updatedMemo;

    } catch (error) {
        console.error(`Error regenerating tags for memo ${memoId}:`, error);
        return null;
    }
};


