# Learning content and offline question authoring

This directory contains a versioned, paraphrased concept corpus for chapters 3-10 of
Richard T. Watson's *Data Management*. It does not contain scraped chapter prose or copied
exercises. Each concept links back to the author's canonical source.

The AI workflow is deliberately offline. Generation creates review candidates only; it is
not part of the game server and can never publish a question automatically. The implementation
uses the official OpenAI JavaScript SDK's Responses API with strict Structured Outputs and
`store: false`. See the official [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
and [API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).

## Layout

- `corpus/manifest.json`: the chapter manifest and source attribution.
- `corpus/chapters/ch03.json` through `ch10.json`: paraphrased concept cards.
- `prompts/question-generation-v1.md`: the reviewed generation policy.
- `questions/drafts/`: unapproved AI output. Runtime code must never load it.
- `questions/approved/`: one approved question per JSON file.
- `questions/reviews/`: human review metadata and content checksums.
- `questions/audits/`: advisory automated semantic audits; never treated as approval.
- `questions/review-packets/`: human-readable chapter packets with decisions and notes.
- `questions/index.json`: deterministic, checksummed index built only from approvals.

Chapter 10's generated HTML link currently returns 404, so its concept card cites the
official book PDF and the author's official Chapter 10 answer page instead.

## Commands

Generation loads `.env.local` without overriding existing process variables. It reads only
`OPENAI_API_KEY` and `OPENAI_QUESTION_MODEL`; the package scripts and deployed game do not expose
either value to Vite. Never use a `VITE_` variable for the key, commit it, or configure it on the
deployed game service.

Generate one or more unapproved candidates:

```sh
OPENAI_QUESTION_MODEL=gpt-5.4-mini npm run questions:generate -- --chapter 3 --count 5
```

Optionally restrict generation to comma-separated concept IDs:

```sh
npm run questions:generate -- \
  --chapter 5 \
  --count 3 \
  --concepts ch05-associative-entity,ch05-mapping
```

Validate the corpus, active drafts, approvals, and review records:

```sh
npm run questions:validate
```

Run an advisory semantic audit and export human-readable review packets:

```sh
OPENAI_REVIEW_MODEL=gpt-5.4 npm run questions:audit
npm run questions:review-packets
```

An audit verdict is not an approval. It is a second-pass editing aid for the human reviewer.

After a person reviews a draft, approve exactly one question:

```sh
npm run questions:approve -- \
  --id ch03-ai-example-1 \
  --reviewer "Reviewer name" \
  --notes "Checked correctness, ambiguity, source fit, and paraphrasing." \
  --confirm-human-review
```

Approval refuses missing or automation-like reviewer names, missing confirmation, invalid
questions, and existing output files. It preserves the source draft and records checksums for
both the draft and approved form.

Build the runtime candidate index:

```sh
npm run questions:index
```

The index builder ignores drafts, verifies each review record and source-draft checksum,
sorts approved questions deterministically, and checksums the final question array.

## Required human review

Before approval, check:

- factual and SQL correctness;
- exactly one defensible answer;
- plausible, mutually exclusive options without all/none combinations;
- chapter, concept, and cited-section fit;
- a fully specified and accessible stem;
- useful explanation and review guidance;
- original paraphrasing with no copied prose, exercises, or distinctive source scenarios.

Automated validation is a gate, not a substitute for this review.
