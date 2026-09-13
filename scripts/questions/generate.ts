import path from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import {
  integerArgument,
  optionalStringArgument,
  parseArguments,
  reportCliError,
} from './lib/cli.ts';
import { generateDrafts } from './lib/generation.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';

config({ path: '.env.local', override: false, quiet: true });

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const chapter = integerArgument(args, 'chapter');
  const count = integerArgument(args, 'count', 5);
  const conceptIds = optionalStringArgument(args, 'concepts')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_QUESTION_MODEL;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required in the process environment.');
  }
  if (!model) {
    throw new Error('OPENAI_QUESTION_MODEL is required in the process environment.');
  }

  const client = new OpenAI({ apiKey });
  const paths = createQuestionWorkspacePaths();
  const result = await generateDrafts({
    paths,
    chapter,
    count,
    model,
    conceptIds,
    createResponse: (request) => client.responses.create(request),
  });

  process.stdout.write(
    `Wrote ${result.questions.length} unapproved draft questions to ${path.relative(paths.rootDir, result.outputPath)}.\n`,
  );
}

main().catch(reportCliError);
