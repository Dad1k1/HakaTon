import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { AppealType, Priority, Status } from '@prisma/client';
import { db } from '../src/lib/db';
import { terminal } from '../src/lib/domain';
import { z } from 'zod';
const schema = z
  .array(
    z.object({
      number: z.number().int().min(1).max(20),
      type: z.enum(['Проблема', 'Предложение', 'Положительный отзыв']),
      category: z.string(),
      author: z.string(),
      assignee: z.string(),
      priority: z.enum(['Низкий', 'Средний', 'Высокий']),
      status: z.enum([
        'Новое',
        'На рассмотрении',
        'В работе',
        'Ожидает уточнения',
        'Реализовано',
        'Отклонено',
        'Закрыто',
      ]),
      description: z.string().min(1),
      recommendedNextStep: z.string(),
    }),
  )
  .length(20);
export async function importDataset(file = 'data/dataset.json') {
  const rows = schema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (new Set(rows.map((r) => r.number)).size !== 20)
    throw new Error('Dataset numbers must be unique');
  const types: Record<string, AppealType> = {
    Проблема: 'PROBLEM',
    Предложение: 'SUGGESTION',
    'Положительный отзыв': 'PRAISE',
  };
  const priorities: Record<string, Priority> = {
    Низкий: 'LOW',
    Средний: 'MEDIUM',
    Высокий: 'HIGH',
  };
  const statuses: Record<string, Status> = {
    Новое: 'NEW',
    'На рассмотрении': 'REVIEW',
    'В работе': 'IN_PROGRESS',
    'Ожидает уточнения': 'WAITING',
    Реализовано: 'IMPLEMENTED',
    Отклонено: 'REJECTED',
    Закрыто: 'CLOSED',
  };
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(638182)`;
      for (const r of rows) {
        if (await tx.appeal.findUnique({ where: { number: r.number } })) continue;
        const author = await tx.user.findFirstOrThrow({ where: { name: r.author } });
        const assignee = await tx.user.findFirstOrThrow({ where: { name: r.assignee } });
        const category = await tx.category.findFirstOrThrow({ where: { ru: r.category } });
        const createdAt = new Date(Date.UTC(2026, 10, 1 + (r.number % 7), 8));
        const dueAt = new Date(
          createdAt.getTime() + { LOW: 10, MEDIUM: 5, HIGH: 2 }[priorities[r.priority]] * 86400000,
        );
        const status = statuses[r.status];
        const completedAt = terminal.includes(status)
          ? new Date(createdAt.getTime() + 86400000)
          : null;
        const firstResponseAt = status === 'NEW' ? null : new Date(createdAt.getTime() + 7200000);
        const result =
          status === 'IMPLEMENTED'
            ? `Демонстрационный результат: ${r.recommendedNextStep.replace(/^Пример результата:\s*/, '')}`
            : status === 'REJECTED'
              ? 'Демонстрационный результат: сейчас нет подходящего помещения; к вопросу вернутся при перепланировке.'
              : status === 'CLOSED'
                ? 'Демонстрационный результат: отзыв передан организаторам обучения, формат встреч сохранён.'
                : null;
        const a = await tx.appeal.create({
          data: {
            number: r.number,
            title: r.description.split(/(?<=[.!?])\s/)[0].slice(0, 180),
            description: r.description,
            recommendedNextStep: r.recommendedNextStep,
            sourceAuthor: r.author,
            sourceAssignee: r.assignee,
            demo: true,
            type: types[r.type],
            priority: priorities[r.priority],
            status,
            categoryId: category.id,
            authorId: author.id,
            departmentId: author.departmentId,
            assigneeId: assignee.id,
            createdAt,
            dueAt,
            firstResponseAt,
            completedAt,
            result,
            demoResult: !!result,
          },
        });
        await tx.history.create({
          data: {
            appealId: a.id,
            actorId: author.id,
            action: 'demoImported',
            changes: { source: 'dataset.docx', demoDates: true, generatedTitle: true },
            createdAt,
          },
        });
        if (firstResponseAt)
          await tx.comment.create({
            data: {
              appealId: a.id,
              authorId: assignee.id,
              body:
                status === 'WAITING'
                  ? `Демонстрационное уточнение: ${r.recommendedNextStep}`
                  : (result ?? `Демонстрационный ответ: ${r.recommendedNextStep}`),
              createdAt: firstResponseAt,
            },
          });
      }
      // Do not move an already-used sequence backwards; gaps after rollbacks are expected.
      await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Appeal"','number'),GREATEST(20,(SELECT COALESCE(MAX(number),20) FROM "Appeal"),(SELECT last_value FROM "Appeal_number_seq")),true)`;
    },
    { timeout: 30000 },
  );
}
if (process.argv[1]?.endsWith('import.ts'))
  importDataset(process.argv[2])
    .then(() => console.log('20 source records imported; existing records preserved.'))
    .finally(() => db.$disconnect());
