// zustand-middleware-computed 的 package.json exports 未映射类型文件，
// 在 moduleResolution: bundler 下无法解析其自带 .d.ts。
// 这里按其真实签名补一个模块声明（仅类型，不影响运行时）。
declare module 'zustand-middleware-computed' {
  import type { StateCreator } from 'zustand';

  export type Computed<
    S extends Record<string, any>,
    C extends Record<string, any>,
  > = {
    [K in keyof C as K extends keyof S ? never : K]: (state: S & C) => C[K];
  };

  const computed: <T extends object, A extends object>(
    f: StateCreator<T, [], [], T>,
    compute: Computed<T, A>,
  ) => StateCreator<T & A, [], [], T & A>;

  export default computed;
}
