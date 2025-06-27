// 检测是否在浏览器环境中运行

export const isBrowser = (): boolean => {
    return typeof window !== 'undefined';
};

export const isServer = (): boolean => {
    return typeof window === 'undefined';
};

export default isBrowser; 