'use server';

import { Filter, MemosCount, NewMemo, Note } from './type';
import { prisma } from '.';
import { generateTags } from './aiActions';
import { Desc } from '../store/filter';
import { format } from 'date-fns';


export const getRecordsActions = async (config: {
    page_size?: number;
    page?: number;
    filter?: Filter;
    desc?: Desc;
}) => {
    const { page_size = 20, page = 1, filter, desc = Desc.DESC } = config;
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
        let tagNames: string[] = [];
        if (tags && tags.length > 0) {
            tagNames = tags;
        } else {
            // Start tag generation asynchronously
            generateTags(content).then(async (generatedTags) => {
                if (generatedTags.length > 0) {
                    await prisma.memo.update({
                        where: { id: memo.id },
                        data: {
                            tags: {
                                connectOrCreate: generatedTags.map((name: string) => ({
                                    where: { name },
                                    create: { name }
                                }))
                            }
                        }
                    });
                }
            }).catch(error => {
                console.error("标签生成失败:", error);
            });
        }
        const memo = await prisma.memo.create({
            data: {
                content,
                images: images || [],
                createdAt: created_time ? new Date(created_time) : new Date(),
                updatedAt: last_edited_time ? new Date(last_edited_time) : new Date(),
                tags: {
                },
                link: link ? {
                    create: link
                } : undefined
            },
            include: {
                link: true,
                tags: true
            }
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
        
        // Update memo with new data in a transaction
        const memo = await prisma.$transaction(async (tx) => {
            // Delete existing link
            await tx.link.deleteMany({ where: { memoId: id } });

            // Update memo first
            const updatedMemo = await tx.memo.update({
                where: { id },
                data: {
                    content,
                    images: images || [],
                    link: link ? {
                        create: link
                    } : undefined
                },
                include: {
                    link: true,
                    tags: true
                }
            });

            // Generate tags asynchronously
            generateTags(content).then(async (tagNames) => {
                if (tagNames.length > 0) {
                    await prisma.memo.update({
                        where: { id },
                        data: {
                            tags: {
                                set: [], // First disconnect all existing tags
                                connectOrCreate: tagNames.map((name: string) => ({
                                    where: { name },
                                    create: { name }
                                }))
                            }
                        }
                    });
                }
            }).catch(error => {
                console.error("标签生成失败:", error);
            });

            return updatedMemo;
        });

        return memo.id;
    } catch (error) {
        console.error(error);
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
        const tagNames = await generateTags(memo?.content || '');
        
        await prisma.memo.update({
            where: { id: memoId },
            data: {
                tags: {
                    set: [], // First disconnect all existing tags
                    connectOrCreate: tagNames.map((name: string) => ({
                        where: { name },
                        create: { name }
                    }))
                }
            }
        });
        console.log('新生成的标签:', tagNames);
        return memo;
        } catch (error) {
        console.error(error);
        return null;
    }
};
