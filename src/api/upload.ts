import sharp from 'sharp';
import axios from "axios";

const GALLERY_URL = 'https://gallery233.pages.dev';

export async function uploadToGalleryServer(
    file: File,
): Promise<string | null> {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();

        if (!data.url) {
            throw new Error('Upload response missing file URL');
        }

        console.log(`上传成功，图片压缩: ${(data.stats.originalSize / 1024 / 1024).toFixed(2)}MB -> ${(data.stats.compressedSize / 1024 / 1024).toFixed(2)}MB (${data.stats.compressionRatio}%)`);
        return data.url;
    } catch (error) {
        console.error(`文件上传失败: ${error}`);
        return null;
    }
}
