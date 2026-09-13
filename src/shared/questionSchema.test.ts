import { describe, expect, it } from 'vitest';
import {
  QuestionBankSchema,
  QuestionSchema,
  sanitizeQuestion,
  type QuestionWithAnswer,
} from './questionSchema';

function validQuestion(overrides: Partial<QuestionWithAnswer> = {}): QuestionWithAnswer {
  return {
    schemaVersion: 1,
    id: 'ch03-single-entity-001',
    chapter: 3,
    conceptIds: ['single-entity'],
    kind: 'concept',
    difficulty: 1,
    prompt: 'Which description best identifies an entity in a data model?',
    options: [
      { id: 'a', text: 'A thing about which data is stored' },
      { id: 'b', text: 'A single SQL keyword' },
      { id: 'c', text: 'A database connection' },
      { id: 'd', text: 'A report sorting rule' },
    ],
    correctOptionId: 'a',
    explanation: 'An entity represents a thing about which the database stores facts.',
    reviewConcept: 'Entity, attribute, and identifier',
    source: {
      url: 'https://www.richardtwatson.com/open/Reader/_book/203-singleentity.html',
      title: 'Chapter 3: The Single Entity',
      section: 'The relational model',
    },
    provenance: 'curated',
    status: 'approved',
    ...overrides,
  };
}

describe('QuestionSchema', () => {
  it('accepts a complete approved question', () => {
    expect(QuestionSchema.parse(validQuestion()).chapter).toBe(3);
  });

  it('requires the answer to match one unique option', () => {
    expect(() =>
      QuestionSchema.parse(validQuestion({ correctOptionId: 'missing' })),
    ).toThrow(/correctOptionId/);
  });

  it('rejects duplicate option IDs and text', () => {
    const question = validQuestion();
    question.options[1] = { ...question.options[0] };
    expect(() => QuestionSchema.parse(question)).toThrow(/unique/);
  });

  it('requires canonical textbook source metadata', () => {
    const question = validQuestion();
    question.source.url = 'https://example.com/chapter-3';
    expect(() => QuestionSchema.parse(question)).toThrow(/richardtwatson/);
  });

  it('requires generation metadata for AI-generated drafts', () => {
    expect(() =>
      QuestionSchema.parse(validQuestion({ provenance: 'ai-generated', status: 'draft' })),
    ).toThrow(/generation/);
  });

  it('redacts answer and feedback fields from client questions', () => {
    const payload = sanitizeQuestion(validQuestion());
    expect(payload).not.toHaveProperty('correctOptionId');
    expect(payload).not.toHaveProperty('explanation');
    expect(payload).not.toHaveProperty('source');
    expect(payload.options).toHaveLength(4);
  });

  it('rejects duplicate IDs and prompts across a bank', () => {
    const question = validQuestion();
    expect(() => QuestionBankSchema.parse([question, question])).toThrow(/unique/);
  });
});
