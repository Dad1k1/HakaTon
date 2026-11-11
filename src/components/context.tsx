'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Role, Status, Priority, AppealType } from '@prisma/client';
export type Locale = 'ru' | 'kk' | 'en';
export type User = {
  id: string;
  login: string;
  name: string;
  role: Role;
  departmentId: string;
  department?: { name: string };
  blocked: boolean;
  mustChangePassword: boolean;
  locale: Locale;
  theme: 'light' | 'dark';
};
export type Category = {
  id: string;
  code: string;
  ru: string;
  kk: string;
  en: string;
  active: boolean;
};
export type Lookups = {
  categories: Category[];
  departments: { id: string; name: string }[];
  users: Pick<User, 'id' | 'name' | 'role' | 'departmentId'>[];
};
export type Appeal = {
  id: string;
  number: number;
  title: string;
  description: string;
  proposedSolution?: string;
  type: AppealType;
  status: Status;
  priority: Priority;
  categoryId: string;
  departmentId: string;
  assigneeId: string | null;
  authorId: string;
  dueAt: string;
  createdAt: string;
  result: string | null;
  demoResult: boolean;
  demo: boolean;
  version: number;
  recommendedNextStep?: string;
  sourceAuthor?: string;
  sourceAssignee?: string;
  author: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  category: Category;
  department: { id: string; name: string };
  attachments: { id: string; name: string; size: number }[];
  comments: { id: string; body: string; createdAt: string; author: { id: string; name: string } }[];
  history: History[];
};
export type History = {
  id: string;
  action: string;
  reason?: string;
  changes: Record<string, unknown>;
  createdAt: string;
  actor: { name: string };
  appeal?: { id: string; number: number; title: string };
};
export type Notification = {
  id: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
  appeal: { id: string; number: number; title: string };
};
export type Analytics = {
  total: number;
  waiting: number;
  awaitingResponse: number;
  overdue: number;
  implemented: number;
  unassigned: number;
  completed: number;
  completedRate: number | null;
  firstResponseHours: number | null;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  themes: [string, number][];
  recent: History[];
};
type Context = {
  user: User;
  lookups: Lookups;
  locale: Locale;
  theme: 'light' | 'dark';
  setLocale: (l: Locale) => void;
  setTheme: (t: 'light' | 'dark') => void;
  api: <T = unknown>(p: string, body?: unknown) => Promise<T>;
  refresh: () => void;
  revision: number;
  navigate: (params: Record<string, string>) => void;
  query: URLSearchParams;
  notice: (message: string) => void;
  error: string;
  setError: (s: string) => void;
};
export const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export const num = (n: number) => `A-${String(n).padStart(3, '0')}`;
export function date(value: string, locale: Locale, time = false) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}
export function useLoad<T>(endpoint: string) {
  const { api, revision, setError } = useApp();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(undefined);
    api<T>(endpoint)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api, endpoint, revision, setError]);
  return { data, loading };
}

export function departmentName(name: string, locale: Locale) {
  const names: Record<string, [string, string]> = {
    Закупки: ['Сатып алу', 'Procurement'],
    Проектирование: ['Жобалау', 'Design'],
    Бухгалтерия: ['Бухгалтерия', 'Accounting'],
    Продажи: ['Сату', 'Sales'],
    Проекты: ['Жобалар', 'Projects'],
    Офис: ['Кеңсе', 'Office'],
    Управление: ['Басқару', 'Management'],
  };
  return locale === 'ru' ? name : names[name]?.[locale === 'kk' ? 0 : 1] || name;
}
