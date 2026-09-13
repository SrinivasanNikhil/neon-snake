import path from 'node:path';
import { loadVerifiedReview } from './lib/approval.ts';
import { reportCliError } from './lib/cli.ts';
import { loadCorpus } from './lib/corpus.ts';
import { listJsonFiles, readQuestionFile } from './lib/files.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';
import { formatValidationIssues, validateWorkspace, type ValidationIssue } from './lib/validation.ts';

async function main(): Promise<void> {
  const paths = createQuestionWorkspacePaths();
  const corpus = await loadCorpus(paths);
  const issues = await validateWorkspace(paths, corpus);
  const approvalIssues: ValidationIssue[] = [];

  for (const file of await listJsonFiles(paths.approvedDir)) {
    for (const question of await readQuestionFile(file)) {
      try {
        await loadVerifiedReview(paths, question);
      } catch (error) {
        approvalIssues.push({
          file: path.relative(paths.rootDir, file),
          questionId: question.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const allIssues = [...issues, ...approvalIssues];
  if (allIssues.length) {
    throw new Error(formatValidationIssues(allIssues));
  }

  process.stdout.write('Question corpus, drafts, approvals, and review metadata are valid.\n');
}

main().catch(reportCliError);
