import { describe, expect, it } from 'vitest';
import { loadCorpus } from './lib/corpus.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';
import {
  validateQuestion,
  validateQuestionCollection,
} from './lib/validation.ts';
import { validQuestion } from './test-helpers.ts';

describe('question validation', () => {
  it('loads the complete chapter 3-10 corpus', async () => {
    const corpus = await loadCorpus(createQuestionWorkspacePaths());
    expect([...corpus.chapters.keys()]).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('accepts a chapter-, concept-, and source-matched question', async () => {
    const corpus = await loadCorpus(createQuestionWorkspacePaths());
    expect(validateQuestion(validQuestion(), corpus)).toEqual([]);
  });

  it('rejects concept and source mismatches and noncanonical URLs', async () => {
    const corpus = await loadCorpus(createQuestionWorkspacePaths());
    const issues = validateQuestion(
      validQuestion({
        conceptIds: ['ch04-two-table-join'],
        source: {
          url: 'http://www.richardtwatson.com/open/Reader/chapter',
          title: 'Wrong title',
          section: 'Wrong section',
        },
      }),
      corpus,
    );
    const messages = issues.map(({ message }) => message).join('\n');
    expect(messages).toContain('does not belong to chapter 3');
    expect(messages).toContain('canonical HTTPS URL');
    expect(messages).toContain('Source title must be exactly');
    expect(messages).toContain('must exactly match a section');
  });

  it('rejects all/none answers and normalized duplicate options', async () => {
    const corpus = await loadCorpus(createQuestionWorkspacePaths());
    const issues = validateQuestion(
      validQuestion({
        options: [
          { id: 'a', text: 'All of the above' },
          { id: 'b', text: 'WHERE price > 20!' },
          { id: 'c', text: 'where price 20' },
          { id: 'd', text: 'GROUP BY price' },
        ],
      }),
      corpus,
    );
    const messages = issues.map(({ message }) => message).join('\n');
    expect(messages).toContain('forbidden all/none/combined-answer pattern');
    expect(messages).toContain('distinct after punctuation and case normalization');
  });

  it('rejects duplicate IDs and normalized stems across a collection', async () => {
    const corpus = await loadCorpus(createQuestionWorkspacePaths());
    const first = validQuestion();
    const second = validQuestion({
      prompt: `${first.prompt.toLocaleUpperCase()}!`,
    });
    const issues = validateQuestionCollection([first, second], corpus);
    const messages = issues.map(({ message }) => message).join('\n');
    expect(messages).toContain('Duplicate question ID');
    expect(messages).toContain('Question stem duplicates');
  });
});
