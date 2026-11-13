import type { Metadata } from 'next';
import './globals.css';
import { headers } from 'next/headers';
export const metadata: Metadata = {
  title: 'Модус Трейд · Обратная связь',
  description: 'Локальная система обратной связи сотрудников',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') || undefined;
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.lang=localStorage.getItem('locale')||'ru'}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
