import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Модус Трейд · Обратная связь',
  description: 'Локальная система обратной связи сотрудников',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.lang=localStorage.getItem('locale')||'ru'}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
