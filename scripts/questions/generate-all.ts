import { config } from 'dotenv';
import OpenAI from 'openai';
import { generateDrafts } from './lib/generation.ts';
import { loadCorpus } from './lib/corpus.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';
import { loadWorkspaceQuestions } from './lib/validation.ts';
import { integerArgument, parseArguments, reportCliError } from './lib/cli.ts';

config({ path: '.env.local', override: false, quiet: true });

const MAX_ATTEMPTS_PER_SECTION = 3;

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const targetPerChapter = integerArgument(args, 'target', 20);
  if (targetPerChapter < 1 || targetPerChapter > 100) {
    throw new Error('Target must be an integer from 1 through 100.');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_QUESTION_MODEL;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required in the process environment.');
  if (!model) throw new Error('OPENAI_QUESTION_MODEL is required in the process environment.');

  const paths = createQuestionWorkspacePaths();
  const corpus = await loadCorpus(paths);
  const client = new OpenAI({ apiKey });

  for (const chapter of [...corpus.chapters.keys()].sort((left, right) => left - right)) {
    const card = corpus.chapters.get(chapter)!;
    const workspace = await loadWorkspaceQuestions(paths);
    const existing = workspace.questions.filter((question) => question.chapter === chapter);
    if (existing.length >= targetPerChapter) {
      process.stdout.write(`Chapter ${chapter}: already has ${existing.length} candidates.\n`);
      continue;
    }

    const base = Math.floor(targetPerChapter / card.sections.length);
    const remainder = targetPerChapter % card.sections.length;
    const desiredBySection = new Map(
      card.sections.map((section, index) => [section.title, base + (index < remainder ? 1 : 0)]),
    );

    process.stdout.write(`Chapter ${chapter}: generating ${targetPerChapter - existing.length} candidates.\n`);
    for (const section of card.sections) {
      const current = existing.filter((question) => question.source.section === section.title).length;
      const needed = Math.max(0, (desiredBySection.get(section.title) ?? 0) - current);
      if (needed === 0) continue;

      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SECTION; attempt += 1) {
        try {
          const result = await generateDrafts({
            paths,
            chapter,
            count: needed,
            model,
            conceptIds: section.concepts.map(({ id }) => id),
            createResponse: (request) => client.responses.create(request),
          });
          process.stdout.write(
            `  ${section.title}: wrote ${result.questions.length} drafts (${attempt}/${MAX_ATTEMPTS_PER_SECTION}).\n`,
          );
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          process.stderr.write(
            `  ${section.title}: attempt ${attempt} failed validation; retrying if possible.\n`,
          );
        }
      }

      if (lastError) {
        throw new Error(
          `Chapter ${chapter}, section "${section.title}" failed after ${MAX_ATTEMPTS_PER_SECTION} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        );
      }
    }
  }
}

main().catch(reportCliError);
