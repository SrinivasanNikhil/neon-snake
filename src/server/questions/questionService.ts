import { v4 as uuidv4 } from 'uuid';
import type {
  QuizQuestionPayload,
  QuizResultPayload,
} from '../../shared/protocol';
import type { ChapterId, DifficultyLevel } from '../../shared/types';
import { questionFeedback, sanitizeQuestion, type QuestionWithAnswer } from '../../shared/questionSchema';
import { QUESTIONS, type Question } from '../../shared/questions';

type ActiveAttempt =
  | {
    id: string;
    playerId: string;
    kind: 'legacy';
    question: Question;
  }
  | {
    id: string;
    playerId: string;
    kind: 'approved';
    question: QuestionWithAnswer;
  };

type ServiceQuestion =
  | { kind: 'legacy'; question: Question }
  | { kind: 'approved'; question: QuestionWithAnswer };

type PlayerQuestionState = {
  chapter: ChapterId;
  targetDifficulty: DifficultyLevel;
  servedQuestionIds: Set<string>;
};

const questionId = (question: ServiceQuestion): string =>
  question.kind === 'approved' ? question.question.id : `legacy-${question.question.id}`;

const questionDifficulty = (question: ServiceQuestion): DifficultyLevel =>
  question.kind === 'approved'
    ? question.question.difficulty as DifficultyLevel
    : 1;

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

const CHAPTER_SOURCES: Record<ChapterId, { url: string; title: string }> = {
  3: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/203-singleentity.html',
    title: 'Chapter 3: The Single Entity',
  },
  4: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/204-onetomany.html',
    title: 'Chapter 4: The One-to-Many Relationship',
  },
  5: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/205-manytomany.html',
    title: 'Chapter 5: The Many-to-Many Relationship',
  },
  6: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/206-recursive.html',
    title: 'Chapter 6: One-to-One and Recursive Relationships',
  },
  7: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/207-datamodeling.html',
    title: 'Chapter 7: Data Modeling',
  },
  8: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/208-normalization.html',
    title: 'Chapter 8: Normalization and Other Data Modeling Methods',
  },
  9: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/209-relational-model.html',
    title: 'Chapter 9: The Relational Model and Relational Algebra',
  },
  10: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/Data-Management.pdf#page=214',
    title: 'Chapter 10: SQL',
  },
};

export type AnswerEvaluation = {
  correct: boolean;
  payload: Omit<QuizResultPayload, 'scoreDelta' | 'lengthDelta'>;
};

/** Keeps answer keys and adaptive selection state server-side. Approved chapter
 * content is preferred; the in-code bank remains a safe development fallback.
 */
export class QuestionService {
  private readonly attempts = new Map<string, ActiveAttempt>();
  private readonly questionsByChapter = new Map<ChapterId, ServiceQuestion[]>();
  private readonly playerStates = new Map<string, PlayerQuestionState>();

  constructor(
    questions: Question[] = QUESTIONS,
    private readonly random: () => number = Math.random,
    approvedQuestions: QuestionWithAnswer[] = [],
  ) {
    for (let chapter = 3; chapter <= 10; chapter += 1) {
      const approved = approvedQuestions
        .filter((question) => question.status === 'approved' && question.chapter === chapter)
        .map((question) => ({ kind: 'approved', question }) as const);
      const legacy = questions
        .filter((question) => question.chapter === chapter)
        .map((question) => ({ kind: 'legacy', question }) as const);
      this.questionsByChapter.set(
        chapter as ChapterId,
        approved.length > 0 ? approved : legacy,
      );
    }
  }

  startPlayerRun(
    playerId: string,
    chapter: ChapterId,
    targetDifficulty: DifficultyLevel,
  ): void {
    this.clearPlayerAttempt(playerId);
    this.playerStates.set(playerId, {
      chapter,
      targetDifficulty,
      servedQuestionIds: new Set(),
    });
  }

  createAttempt(playerId: string, chapter: ChapterId): QuizQuestionPayload | null {
    this.clearPlayerAttempt(playerId);
    const questions = this.questionsByChapter.get(chapter) ?? [];
    if (questions.length === 0) return null;

    const playerState = this.playerState(playerId, chapter);
    let available = questions.filter(
      (question) => !playerState.servedQuestionIds.has(questionId(question)),
    );
    if (available.length === 0) {
      playerState.servedQuestionIds.clear();
      available = questions;
    }

    const nearestDistance = Math.min(
      ...available.map((question) =>
        Math.abs(questionDifficulty(question) - playerState.targetDifficulty)),
    );
    const nearestQuestions = available.filter(
      (question) =>
        Math.abs(questionDifficulty(question) - playerState.targetDifficulty) ===
        nearestDistance,
    );
    const selected = nearestQuestions[
      Math.floor(this.random() * nearestQuestions.length)
    ] ?? nearestQuestions[0];
    if (!selected) return null;
    playerState.servedQuestionIds.add(questionId(selected));
    const attemptId = uuidv4();
    this.attempts.set(attemptId, { id: attemptId, playerId, ...selected } as ActiveAttempt);

    if (selected.kind === 'approved') {
      const question = sanitizeQuestion(selected.question);
      return {
        attemptId,
        questionId: question.id,
        chapter,
        difficulty: question.difficulty as DifficultyLevel,
        prompt: question.prompt,
        options: shuffled(question.options, this.random),
      };
    }

    const question = selected.question;

    return {
      attemptId,
      questionId: `legacy-${question.id}`,
      chapter,
      difficulty: 1,
      prompt: question.question,
      options: shuffled(
        question.options.map((text, index) => ({
          id: String.fromCharCode(97 + index),
          text,
        })),
        this.random,
      ),
    };
  }

  evaluate(
    playerId: string,
    attemptId: string,
    optionId: string,
  ): AnswerEvaluation | null {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.playerId !== playerId) return null;

    if (attempt.kind === 'approved') {
      if (!attempt.question.options.some(({ id }) => id === optionId)) return null;
      const correct = optionId === attempt.question.correctOptionId;
      const feedback = questionFeedback(attempt.question);
      this.recordOutcome(playerId, correct);
      this.attempts.delete(attemptId);
      return {
        correct,
        payload: {
          success: correct,
          correctOptionId: feedback.correctOptionId,
          explanation: feedback.explanation,
          reviewConcept: feedback.reviewConcept,
          sourceUrl: feedback.source.url,
          sourceTitle: feedback.source.title,
        },
      };
    }

    const answerIndex = optionId.toLocaleLowerCase().charCodeAt(0) - 97;
    if (answerIndex < 0 || answerIndex >= attempt.question.options.length) return null;

    const source = CHAPTER_SOURCES[attempt.question.chapter as ChapterId];
    const correct = answerIndex === attempt.question.correctAnswer;
    this.recordOutcome(playerId, correct);
    this.attempts.delete(attemptId);
    return {
      correct,
      payload: {
        success: correct,
        correctOptionId: String.fromCharCode(97 + attempt.question.correctAnswer),
        explanation:
          'This transitional question is awaiting its reviewed, chapter-specific explanation.',
        reviewConcept: source.title,
        sourceUrl: source.url,
        sourceTitle: source.title,
      },
    };
  }

  clearAttempt(attemptId: string): void {
    this.attempts.delete(attemptId);
  }

  clearPlayerAttempt(playerId: string): void {
    for (const [attemptId, attempt] of this.attempts) {
      if (attempt.playerId === playerId) this.attempts.delete(attemptId);
    }
  }

  endPlayerRun(playerId: string): void {
    this.clearPlayerAttempt(playerId);
    this.playerStates.delete(playerId);
  }

  private playerState(playerId: string, chapter: ChapterId): PlayerQuestionState {
    const current = this.playerStates.get(playerId);
    if (current?.chapter === chapter) return current;

    const created: PlayerQuestionState = {
      chapter,
      targetDifficulty: 1,
      servedQuestionIds: new Set(),
    };
    this.playerStates.set(playerId, created);
    return created;
  }

  private recordOutcome(playerId: string, correct: boolean): void {
    const state = this.playerStates.get(playerId);
    if (!state) return;
    const nextDifficulty = state.targetDifficulty + (correct ? 1 : -1);
    state.targetDifficulty = Math.max(
      1,
      Math.min(5, nextDifficulty),
    ) as DifficultyLevel;
  }
}
