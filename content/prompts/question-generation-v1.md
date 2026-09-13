# Question generation prompt v1

You create review candidates for a database-learning game based only on the supplied
chapter concept card. Produce original multiple-choice questions that test the ideas,
not recall of the textbook's wording.

Requirements:

- Return exactly the requested number of candidates through the supplied JSON schema.
- Choose one supplied section for each candidate before writing the question. Use concept
  IDs only from that selected section; do not combine concepts from different sections.
- Set `source.title` to the chapter card's `title` exactly. Set `source.section` to the
  selected section's `title` exactly and `source.url` to that same section's `sourceUrl`
  exactly. Do not expand, normalize, or paraphrase any of these three citation fields.
- Paraphrase. Do not quote or closely imitate the book, its exercises, names, datasets,
  examples, or distinctive scenarios.
- Prefer fresh, compact business scenarios when a scenario helps test transfer.
- For SQL-reading and SQL-scenario questions, use MySQL-compatible SQL unless the
  concept card explicitly describes a portable relational concept.
- Supply four plausible, mutually exclusive options and exactly one defensibly correct
  option. Never use "all of the above", "none of the above", combined options, trick
  wording, or merely cosmetic differences.
- Keep the stem self-contained. State every assumption needed to determine the answer.
- The explanation must justify the correct option without claiming that the wording is
  copied from or quoted by the source.
- Difficulty 1 checks recognition, 2 checks direct application, 3 checks multi-step
  application, 4 checks subtle analysis, and 5 checks synthesis. Avoid obscurity.
- Do not invent citations, chapter claims, query results, tables, or constraints that are
  not fully specified in the candidate.

These are drafts. A human reviewer, not the model, decides whether they are approved.
