'use client';
import * as React from 'react';
import { Settings } from 'lucide-react';
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from '../ui/switch';
import useConfigStore from '@/store/config';
import PasswordInput from '../PasswordInput';
import { Separator } from '../ui/separator';
import { useRouter } from 'next/navigation';
import { useToast } from '../ui/use-toast';
import { useState } from 'react';
// import { downloadFile, uploadFile } from '../../utils/file';
// import { parseMastodonData } from '../../utils/importData';
import useImportMemos from './useImportMemos';
import Icon from '../Icon';
import { clearAllDataAction } from '@/api/dbActions';
export function Setting() {
    const { config, setConfig, resetGeneralConfig } = useConfigStore()
    const { toast } = useToast()
    const [editCode, setEditCode] = useState(config.codeConfig.editCode)
    const router = useRouter()
    const { importData, memos, importedMemos, loading } = useImportMemos()

    const formatMastodonData = () => {
        toast({
            variant: "destructive",
            title: "功能暂不可用",
            description: "Mastodon导入功能正在维护中",
            duration: 2000
        })
    }

    const handleClearData = async () => {
        try {
            await clearAllDataAction();
            toast({
                title: "清空成功",
                description: "所有数据已被清空",
                duration: 2000
            });
            router.refresh();
        } catch (error) {
            toast({
                variant: "destructive",
                title: "清空失败",
                description: "操作过程中出现错误",
                duration: 2000
            });
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" >
                    <Settings size={20} className="rotate-0 scale-100 transition-all" />
                    <span className="sr-only">Settings</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-68 max-h-[80vh] overflow-auto no-scrollbar" >
                <DialogHeader>
                    <DialogTitle>设置</DialogTitle>
                    <DialogDescription>
                        个性化设置
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex items-center justify-between space-x-4">
                        <Label className="flex flex-col space-y-1">
                            <span>
                                简洁模式
                            </span>
                            <span className="text-xs font-normal leading-snug text-muted-foreground">
                                简洁模式下，不显示笔记的创建时间和修改时间,默认为关闭
                            </span>
                        </Label>
                        <Switch checked={
                            config.generalConfig.isSimpleMode
                        } onCheckedChange={(checked) => {
                            setConfig(config => {
                                config.generalConfig.isSimpleMode = checked
                                return config
                            })
                        }} />
                    </div>
                    <Button type="reset" className="w-full" variant="destructive" onClick={resetGeneralConfig}>
                        重置设置
                    </Button>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                        <Label className="flex flex-col space-y-1 ">
                            <span>
                                访问密码
                            </span>
                        </Label>
                        <PasswordInput disabled className="w-full  " value={config.codeConfig.accessCode} />
                    </div>
                    <Button type="submit" className="w-full" variant="destructive" onClick={() => {
                        resetGeneralConfig()
                        router.push('/login')
                    }}>
                        重置密码
                    </Button>
                    <Separator className="my-4" />

                    <div className="space-y-4">
                        <Label className="flex flex-col space-y-1">
                            <span className="text-lg font-semibold">
                                数据导入
                            </span>
                        </Label>

                        <div className="space-y-2">
                            <Label className="flex flex-col space-y-1">
                                <span>
                                    从Excel导入
                                </span>
                                <span className="text-xs font-normal leading-snug text-muted-foreground">
                                    支持.xlsx或.xls格式，表格需包含content列，可选tags、images、created_time、last_edited_time、link列
                                </span>
                            </Label>
                            <Button type="submit" className="w-full" onClick={importData} disabled={loading}>
                                {
                                    loading ? (<><Icon.Loader2 size={20} className="animate-spin mr-1" />{`已上传${importedMemos}/${memos}条数据`}</>) : '导入Excel文件'
                                }
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex flex-col space-y-1">
                                <span>
                                    从Mastodon导入
                                </span>
                                <span className="text-xs font-normal leading-snug text-muted-foreground">
                                    上传从Mastodon导出的JSON文件，将其格式化为支持导入的JSON文件
                                </span>
                            </Label>
                            <Button type="submit" className="w-full" onClick={formatMastodonData}>
                                上传Mastodon数据文件
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex flex-col space-y-1">
                                <span>
                                    从JSON导入
                                </span>
                                <span className="text-xs font-normal leading-snug text-muted-foreground">
                                    导入格式化后的JSON数据
                                </span>
                            </Label>
                            <Button type="submit" className="w-full" onClick={importData} disabled={loading}>
                                {
                                    loading ? (<><Icon.Loader2 size={20} className="animate-spin mr-1" />{`已上传${importedMemos}/${memos}条数据`}</>) : '导入JSON文件'
                                }
                            </Button>
                        </div>
                    </div>

                    {/* <div className="space-y-4">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full">
                                    清空所有数据
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>确认清空数据？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        此操作将删除所有备忘录数据，包括内容、标签和链接。此操作不可撤销。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearData}>
                                        确认清空
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div> */}
                </div>
            </DialogContent>
        </Dialog>
    );
}
