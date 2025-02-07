// 'use server';

import axios from "axios";


export async function uploadToGalleryServer(
    file: File,
): Promise<string | null> {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post(`/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (!response.data[0]?.src) {
            throw new Error('Upload response missing file URL');
        }

        const url = `${response.data[0].src}`;
        return url;
    } catch (error: any) {
        console.error(`File upload failed: ${error.message}`);
        if (error.response?.status === 403) {
            console.error('CORS error: Access forbidden');
        }
        return null;
    }
}
