import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import axios from 'axios';

const GALLERY_URL = 'https://gallery233.pages.dev';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Convert File to Buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Compress image using Sharp
        const compressedBuffer = await sharp(buffer)
            .avif({ quality: 90 })
            .toBuffer();

        // Prepare form data for gallery server
        const uploadFormData = new FormData();
        uploadFormData.append('file', new Blob([compressedBuffer], { type: 'image/avif' }), 'img.avif');

        // Upload to gallery server
        const response = await axios.post(`${GALLERY_URL}/upload`, uploadFormData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (!response.data[0]?.src) {
            throw new Error('Upload response missing file URL');
        }

        const url = `${GALLERY_URL}${response.data[0].src}`;
        const stats = {
            originalSize: file.size,
            compressedSize: compressedBuffer.length,
            compressionRatio: ((1 - compressedBuffer.length / file.size) * 100).toFixed(2)
        };

        return NextResponse.json({ url, stats });

    } catch (error) {
        console.error('File upload failed:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
} 