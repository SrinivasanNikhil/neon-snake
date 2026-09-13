import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createQuestionWorkspacePaths } from './lib/paths.ts';
import { loadWorkspaceQuestions } from './lib/validation.ts';
import { reportCliError } from './lib/cli.ts';

type AuditReview = {
  questionId: string;
  verdict: 'pass' | 'needs-edit' | 'reject';
  issues: string[];
  rationale: string;
  suggestedFix: string;
};

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

async function main(): Promise<void> {
  const paths = createQuestionWorkspacePaths();
  const workspace = await loadWorkspaceQuestions(paths);
  const outputDir = path.join(paths.contentDir, 'questions', 'review-packets');
  await mkdir(outputDir, { recursive: true });

  for (let chapter = 3; chapter <= 10; chapter += 1) {
    const auditPath = path.join(paths.contentDir, 'questions', 'audits', `ch${String(chapter).padStart(2, '0')}.json`);
    const audit = JSON.parse(await readFile(auditPath, 'utf8')) as {
      model: string;
      auditedAt: string;
      reviews: AuditReview[];
    };
    const reviews = new Map(audit.reviews.map((review) => [review.questionId, review]));
    const questions = workspace.questions
      .filter((question) => question.chapter === chapter && question.status === 'draft')
      .sort((left, right) => left.source.section.localeCompare(right.source.section) || left.id.localeCompare(right.id));

    const lines = [
      `# Chapter ${chapter} question review packet`,
      '',
      `Candidates: ${questions.length}. Automated semantic audit: ${audit.model} at ${audit.auditedAt}.`,
      '',
      '> The automated audit is advisory. A person must verify the source, SQL behavior, answer uniqueness, wording, and explanation before approval.',
      '',
      '## Chapter checklist',
      '',
      '- [ ] Every question was read in full.',
      '- [ ] Every SQL result or constraint claim was independently checked.',
      '- [ ] Every correct answer is uniquely defensible.',
      '- [ ] Every source section supports the tested concept.',
      '- [ ] Wording is original, accessible, and not copied from the book.',
      '- [ ] The chapter has acceptable section and difficulty coverage.',
      '',
    ];

    for (const [index, question] of questions.entries()) {
      const review = reviews.get(question.id);
      const correct = question.options.find(({ id }) => id === question.correctOptionId);
      lines.push(
        `## ${index + 1}. ${question.id}`,
        '',
        `- Human decision: [ ] Approve  [ ] Needs edit  [ ] Reject`,
        `- Section: ${question.source.section}`,
        `- Concepts: ${question.conceptIds.join(', ')}`,
        `- Kind/difficulty: ${question.kind}, ${question.difficulty}/5`,
        `- Automated audit: **${review?.verdict ?? 'not-audited'}**${review?.issues.length ? ` — ${review.issues.join(', ')}` : ''}`,
        '',
      );
      if (review) {
        lines.push(
          `Audit rationale: ${review.rationale}`,
          '',
          ...(review.suggestedFix ? [`Suggested fix: ${review.suggestedFix}`, ''] : []),
        );
      }
      lines.push(
        '### Prompt',
        '',
        question.prompt,
        '',
        '| Option | Text |',
        '| --- | --- |',
        ...question.options.map(({ id, text }) => `| ${id}${id === question.correctOptionId ? ' ✓' : ''} | ${escapeCell(text)} |`),
        '',
        `Correct answer: **${question.correctOptionId} — ${correct?.text ?? 'missing'}**`,
        '',
        `Explanation: ${question.explanation}`,
        '',
        `Review concept: ${question.reviewConcept}`,
        '',
        `Source: [${question.source.title} — ${question.source.section}](${question.source.url})`,
        '',
        'Reviewer notes:',
        '',
        '- ',
        '',
        'Approval command after review:',
        '',
        '```sh',
        `npm run questions:approve -- --id ${question.id} --reviewer "YOUR NAME" --notes "Checked correctness, ambiguity, source fit, and paraphrasing." --confirm-human-review`,
        '```',
        '',
      );
    }

    const outputPath = path.join(outputDir, `ch${String(chapter).padStart(2, '0')}.md`);
    await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
    process.stdout.write(`Wrote ${path.relative(paths.rootDir, outputPath)}.\n`);
  }
}

main().catch(reportCliError);
