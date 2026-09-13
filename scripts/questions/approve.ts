import path from 'node:path';
import {
  parseArguments,
  reportCliError,
  requireStringArgument,
} from './lib/cli.ts';
import { approveQuestion } from './lib/approval.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const paths = createQuestionWorkspacePaths();
  const result = await approveQuestion({
    paths,
    questionId: requireStringArgument(args, 'id'),
    reviewer: requireStringArgument(args, 'reviewer'),
    notes: requireStringArgument(args, 'notes'),
    confirmHumanReview: args.get('confirm-human-review') === true,
  });

  process.stdout.write(
    `Approved ${result.question.id}; wrote ${path.relative(paths.rootDir, result.questionPath)} and ${path.relative(paths.rootDir, result.reviewPath)}.\n`,
  );
}

main().catch(reportCliError);
