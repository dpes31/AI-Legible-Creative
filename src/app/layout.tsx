import type { Metadata } from 'next';
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { Header } from '@/features/workspace/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'ORIGIN | 근거 있는 브랜드 문구',
  description: '고객이 선택할 이유를 근거로 확인하고, 채널별 한국어 문구를 만듭니다.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>
    <WorkspaceProvider><Header /><main className="container page-main">{children}</main></WorkspaceProvider>
  </body></html>;
}
