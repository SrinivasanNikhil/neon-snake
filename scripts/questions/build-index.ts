import path from 'node:path';
import { reportCliError } from './lib/cli.ts';
import { buildApprovedIndex } from './lib/index.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';

async function main(): Promise<void> {
  const paths = createQuestionWorkspacePaths();
  const index = await buildApprovedIndex(paths);
  process.stdout.write(
    `Built ${path.relative(paths.rootDir, paths.indexPath)} with ${index.questionCount} approved questions (${index.checksum}).\n`,
  );
}

main().catch(reportCliError);
