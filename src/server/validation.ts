import { z } from 'zod';
import { CHAPTER_IDS } from '../shared/gameConfig';

const chapterValues = new Set<number>(CHAPTER_IDS);
const ChapterIdSchema = z
  .number()
  .int()
  .refine((chapter) => chapterValues.has(chapter), 'chapter must be from 3 through 10');

export const JoinPayloadSchema = z.object({
  profileId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .transform((name) => name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(24)),
  chapter: ChapterIdSchema,
  difficulty: z.number().int().min(1).max(5),
});

export const LeaderboardRequestPayloadSchema = z.object({
  chapter: ChapterIdSchema,
});

export const InputPayloadSchema = z.object({
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  left: z.boolean(),
  right: z.boolean(),
  boost: z.boolean(),
});

export const SubmitAnswerPayloadSchema = z.object({
  attemptId: z.string().uuid(),
  optionId: z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,79}$/i),
});
