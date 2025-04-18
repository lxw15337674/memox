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
        const where = filter ? buildWhereClause(filter) : {};

        const [items, total] = await Promise.all([
            prisma.memo.findMany({
                take: page_size,
                skip: (page - 1) * page_size,
                where,
                orderBy: {
                    createdAt: desc ? 'desc' : 'asc'
                },
                include: {
                    link: true,
                    tags: true
                }
            }),
            prisma.memo.count({ where })
        ]);
        const sortedItems = desc === Desc.RANDOM ? items.sort(() => Math.random() - 0.5) : items;
        return {
            items: sortedItems as Note[],
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
        await prisma.memo.delete({
            where: { id }
        });
        console.log("删除成功");
    } catch (error) {
        console.error("删除失败:", error);
        throw error;
    }
};

export const getMemoByIdAction = async (id: string) => {
    try {
        const memo = await prisma.memo.findUnique({
            where: { id },
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

export const updateMemoAction = async (id: string, newMemo: NewMemo) => {
    try {
        const { content, images, link } = newMemo;

        // 获取现有的memo数据
        const existingMemo = await prisma.memo.findUnique({
            where: { id },
            include: { link: true }
        });

        // 更新memo
        const updatedMemo = await prisma.memo.update({
            where: { id },
            data: {
                content,
                images: images || [],
                link: {
                    // 如果当前没有link且新数据也没有link，不做任何操作
                    ...((!existingMemo?.link && !link) ? {} : 
                    // 如果新数据没有link但原来有，删除原有link
                    (!link ? { delete: true } : 
                    // 如果原来没有link但现在有，创建新link
                    (!existingMemo?.link ? { create: { url: link.url, text: link.text } } :
                    // 如果都有link，更新现有link
                    { update: { url: link.url, text: link.text } })))
                }
            },
            include: {
                link: true,
                tags: true
            }
        });

        // 处理标签生成和更新
        const tagNames = await generateTags(content);
        if (tagNames.length > 0) {
            await prisma.memo.update({
                where: { id },
                data: {
                    tags: {
                        set: [],
                        connectOrCreate: (tagNames ?? [])?.map((name: string) => ({
                            where: { name },
                            create: { name }
                        }))
                    }
                }
            });
        }
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
        await prisma.memo.deleteMany({});
        await prisma.tag.deleteMany({});
        await prisma.link.deleteMany({});
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
                }
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

export const regenerateMemeTags = async (memoId: string) => {
    try {
        const memo = await getMemoByIdAction(memoId);
        if (!memo) {
            console.error(`Memo with id ${memoId} not found.`);
            return null;
        }

        // Define the background task for tag generation and update
        const backgroundTask = async () => {
            try {
                console.log(`[waitUntil] Starting background tag generation for memo: ${memoId}`);
                // Use the original generateTags which calls the AI
                const tagNames = await generateTags(memo.content || '');

                // Update the memo with the generated tags
                await prisma.memo.update({
                    where: { id: memoId },
                    data: {
                        tags: {
                            set: [], // Disconnect existing tags first
                            connectOrCreate: tagNames.map((name: string) => ({
                                where: { name },
                                create: { name }
                            }))
                        }
                    }
                });
                console.log(`[waitUntil] Background tags updated for memo: ${memoId}`, tagNames);

            } catch (error) {
                console.error(`[waitUntil] Error in background tag generation/update for memo ${memoId}:`, error);
                // Consider more robust error logging/handling for background tasks
            }
        };

        // Schedule the background task using waitUntil
        // NOTE: This assumes waitUntil is available in the execution context.
        waitUntil(backgroundTask());

        console.log(`Tag regeneration initiated via waitUntil for memo: ${memoId}`);
        // Return the memo immediately, the background task runs after the response
        return memo;
    } catch (error) {
        // This catches errors in the main flow (e.g., getMemoByIdAction)
        console.error(`Error initiating tag regeneration for memo ${memoId}:`, error);
        return null;
    }
};
