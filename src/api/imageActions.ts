'use server'
import { createApi } from 'unsplash-js';
import { Random } from 'unsplash-js/dist/methods/photos/types';

export const getRandomImage = async () => {
    const unsplash = createApi({
        accessKey: process.env.UNSPLASH_ACCESS_CODE!,
    });
    const res = await unsplash.photos.getRandom({
        query: 'wallpapers',
        orientation: 'landscape',
    }).catch((e: any) => {
        console.error(e);
    });
    return (res?.response as Random).urls?.regular;
};