import ClientLayout from './ClientLayout';

// 纯 CSR：页面只渲染静态壳，数据全部在客户端获取
export default function Home() {
  return <ClientLayout />;
}
