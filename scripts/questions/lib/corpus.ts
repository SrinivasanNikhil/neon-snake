import path from 'node:path';
import { z } from 'zod';
import { readJsonFile } from './json.ts';
import type { QuestionWorkspacePaths } from './paths.ts';

const identifier = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,79}$/i);
const chapterNumber = z.number().int().min(3).max(10);

const ManifestChapterSchema = z.object({
  chapter: chapterNumber,
  file: z.string().regex(/^ch(?:0[3-9]|10)\.json$/),
  title: z.string().trim().min(1),
  sourceUrl: z.string().url(),
});

export const CorpusManifestSchema = z.object({
  schemaVersion: z.literal(1),
  corpusVersion: z.string().trim().min(1),
  title: z.string().trim().min(1),
  attribution: z.object({
    author: z.string().trim().min(1),
    work: z.string().trim().min(1),
    landingPage: z.string().url(),
  }),
  chapters: z.array(ManifestChapterSchema).length(8),
});

const ConceptSchema = z.object({
  id: identifier,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(10),
});

const CorpusSectionSchema = z.object({
  title: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  concepts: z.array(ConceptSchema).min(1),
});

export const CorpusChapterSchema = z.object({
  schemaVersion: z.literal(1),
  chapter: chapterNumber,
  title: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  summary: z.string().trim().min(20),
  sections: z.array(CorpusSectionSchema).min(1),
});

export type CorpusManifest = z.infer<typeof CorpusManifestSchema>;
export type CorpusChapter = z.infer<typeof CorpusChapterSchema>;

export type LoadedCorpus = {
  manifest: CorpusManifest;
  chapters: Map<number, CorpusChapter>;
};

export async function loadCorpus(paths: QuestionWorkspacePaths): Promise<LoadedCorpus> {
  const manifest = CorpusManifestSchema.parse(await readJsonFile(paths.manifestPath));
  const manifestChapterNumbers = manifest.chapters.map(({ chapter }) => chapter);

  if (new Set(manifestChapterNumbers).size !== manifestChapterNumbers.length) {
    throw new Error('Corpus manifest contains duplicate chapter numbers.');
  }

  const expectedChapters = [3, 4, 5, 6, 7, 8, 9, 10];
  if (expectedChapters.some((chapter) => !manifestChapterNumbers.includes(chapter))) {
    throw new Error('Corpus manifest must contain each chapter from 3 through 10.');
  }

  const chapters = new Map<number, CorpusChapter>();
  const globalConceptIds = new Set<string>();

  for (const entry of manifest.chapters) {
    const chapterPath = path.join(paths.chaptersDir, entry.file);
    const card = CorpusChapterSchema.parse(await readJsonFile(chapterPath));

    if (
      card.chapter !== entry.chapter ||
      card.title !== entry.title ||
      card.sourceUrl !== entry.sourceUrl
    ) {
      throw new Error(`Corpus card ${entry.file} does not match its manifest entry.`);
    }

    assertCanonicalWatsonUrl(card.sourceUrl, `${entry.file} sourceUrl`);

    for (const section of card.sections) {
      assertCanonicalWatsonUrl(section.sourceUrl, `${entry.file} section sourceUrl`);
      for (const concept of section.concepts) {
        if (globalConceptIds.has(concept.id)) {
          throw new Error(`Duplicate corpus concept ID: ${concept.id}`);
        }
        globalConceptIds.add(concept.id);
      }
    }

    chapters.set(card.chapter, card);
  }

  return { manifest, chapters };
}

export function assertCanonicalWatsonUrl(value: string, label = 'source URL'): void {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.richardtwatson.com' ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith('/open/Reader/')
  ) {
    throw new Error(`${label} must be a canonical HTTPS URL on www.richardtwatson.com/open/Reader/.`);
  }
}

export function conceptIdsForChapter(chapter: CorpusChapter): Set<string> {
  return new Set(
    chapter.sections.flatMap((section) => section.concepts.map(({ id }) => id)),
  );
}
