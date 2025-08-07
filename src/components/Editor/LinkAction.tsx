'use client'

import { useState, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Icon from '../Icon'
import { ExternalLinkIcon, X } from 'lucide-react'
import { fetchTitle } from '../../api/requestActions'
import { toast } from '../ui/use-toast'
export interface LinkType {
    url: string;
    text: string | null;
    id?: string;
    memoId?: string;
    createdAt?: Date;
}
interface Props {
    link: LinkType | undefined
    setLink: (link: LinkType | undefined) => void
}

export default function LinkAction({ link, setLink }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [url, setUrl] = useState(link?.url ?? '')
    const [text, setText] = useState(link?.text ?? '')
    const [loading, setLoading] = useState(false)

    // Update local state when link prop changes
    useEffect(() => {
        setUrl(link?.url ?? '')
        setText(link?.text ?? '')
    }, [link])

    const handleSubmit = async () => {
        setLoading(true)
        setIsOpen(false)
        const title = await fetchTitle(url)
        toast({
            title: `链接已添加`,
            description: `标题为: ${title}`,
            variant: 'default'
        });
        setText(title)
        setLink({ url, text: title })
        setLoading(false)
    }

    const handleClear = () => {
        setUrl('')
        setText('')
        setLink(undefined)
        setIsOpen(false)
        toast({
            title: `链接已清空`,
            variant: 'default'
        });
    }


    const isValidUrl = (string: string) => {
        if (!string) return true
        try {
            new URL(string)
            return true
        } catch (_) {
            return false
        }
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <div className="relative">
                    <Button variant="ghost" size="icon"
                        title={text || '添加链接'}
                        className={`${link?.url ? 'text-blue-800 dark:text-blue-400' : ''}`}>
                        {
                            loading ? (
                                <Icon.Loader2 className="animate-spin" size={20} />
                            ) : <Icon.Link2 size={20} />
                        }
                    </Button>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="url">超链接</Label>
                        <div className="flex items-center space-x-2">
                            <Input
                                id="url"
                                type="url"
                                placeholder="Enter URL"
                                value={url}
                                className="flex-grow truncate"
                                onChange={(e) => setUrl(e.target.value)}
                            />
                            {url && (
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                                    aria-label="Open link in new tab"
                                >
                                    <ExternalLinkIcon className="h-4 w-4" />
                                </a>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="text">标题</Label>
                        <Input
                            disabled
                            id="text"
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSubmit} className="flex-1" disabled={!isValidUrl(url) || loading}>
                            提交
                        </Button>
                        {/* Clear button in popover */}
                        {(link?.url || url) && (
                            <Button
                                variant="destructive"
                                onClick={handleClear}
                                disabled={loading}
                                className="px-4"
                            >
                                清空
                            </Button>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}