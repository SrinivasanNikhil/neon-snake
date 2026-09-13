import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRootDir = path.resolve(
  fileURLToPath(new URL('../../../', import.meta.url)),
);

export type QuestionWorkspacePaths = ReturnType<typeof createQuestionWorkspacePaths>;

export function createQuestionWorkspacePaths(rootDir = defaultRootDir) {
  const contentDir = path.join(rootDir, 'content');
  const corpusDir = path.join(contentDir, 'corpus');
  const questionsDir = path.join(contentDir, 'questions');

  return {
    rootDir,
    contentDir,
    corpusDir,
    manifestPath: path.join(corpusDir, 'manifest.json'),
    chaptersDir: path.join(corpusDir, 'chapters'),
    promptPath: path.join(contentDir, 'prompts', 'question-generation-v1.md'),
    draftsDir: path.join(questionsDir, 'drafts'),
    approvedDir: path.join(questionsDir, 'approved'),
    reviewsDir: path.join(questionsDir, 'reviews'),
    indexPath: path.join(questionsDir, 'index.json'),
  };
}
