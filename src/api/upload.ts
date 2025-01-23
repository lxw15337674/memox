import axios from "axios";

const GALLERY_URL = 'https://gallery233.pages.dev';

export async function uploadToGalleryServer(
    file: File,
): Promise<string | null> {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post(`${GALLERY_URL}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (!response.data[0]?.src) {
            throw new Error('Upload response missing file URL');
        }

        const url = `${GALLERY_URL}${response.data[0].src}`;
        return url;
    } catch (error) {
        console.error(`文件上传失败: ${error}`);
        return null;
    }
}
