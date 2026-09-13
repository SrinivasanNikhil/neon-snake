export interface Question {
  id: number;
  chapter: number;
  question: string;
  options: string[];
  correctAnswer: number; // 0-based index
}

export const QUESTIONS: Question[] = [
  // Chapter 1: Data
  {
    id: 1,
    chapter: 1,
    question: "Data redundancy occurs when:",
    options: [
      "Data is stored in multiple file formats",
      "The same data is stored in multiple files or locations unnecessarily",
      "Data is lost during database transmission",
      "Databases are not indexed properly"
    ],
    correctAnswer: 1
  },
  {
    id: 2,
    chapter: 1,
    question: "What is 'data integration' in the context of relational databases?",
    options: [
      "Storing data in a single flat file",
      "Sharing data across different departments/applications",
      "Combining multiple separate data files to eliminate redundancy and allow sharing",
      "Encrypting data before saving it to disk"
    ],
    correctAnswer: 2
  },
  {
    id: 3,
    chapter: 1,
    question: "What does 'program-data independence' mean?",
    options: [
      "Programs can run without any data inputs",
      "The structure of the data can be changed without modifying the programs that access it",
      "Programs are written in a data-independent language like Assembly",
      "Data can only be accessed by one single application"
    ],
    correctAnswer: 1
  },

  // Chapter 2: Information
  {
    id: 4,
    chapter: 2,
    question: "What is the primary difference between data and information?",
    options: [
      "Data is digital while information is analog",
      "Data consists of raw facts, while information is processed, contextualized data that has meaning",
      "Data is stored on disk, whereas information is only stored in RAM",
      "Data is always structured, whereas information is always unstructured"
    ],
    correctAnswer: 1
  },
  {
    id: 5,
    chapter: 2,
    question: "'Hard information' is characterized by:",
    options: [
      "Being difficult for non-technical users to read",
      "Being qualitative, subjective, and opinion-based",
      "Being quantitative, objective, and factual",
      "Being stored in binary raw formats"
    ],
    correctAnswer: 2
  },
  {
    id: 6,
    chapter: 2,
    question: "'Soft information' refers to:",
    options: [
      "Digital data stored on rewriteable soft drives",
      "Opinions, ideas, feelings, and qualitative expressions",
      "Strictly formatted numeric data tables",
      "Database system catalogs and schemas"
    ],
    correctAnswer: 1
  },

  // Chapter 3: Single Entity
  {
    id: 7,
    chapter: 3,
    question: "An 'entity' in database modeling represents:",
    options: [
      "A single column in a table",
      "A single row in a database",
      "Something in the environment about which we want to store data",
      "An SQL query parameter"
    ],
    correctAnswer: 2
  },
  {
    id: 8,
    chapter: 3,
    question: "A unique identifier (primary key) of an entity:",
    options: [
      "Can contain null values",
      "Uniquely distinguishes each instance of the entity from all others",
      "Must always be a numeric field",
      "Is a foreign key pointing to itself"
    ],
    correctAnswer: 1
  },
  {
    id: 9,
    chapter: 3,
    question: "In SQL, which clause is used to sort the rows returned by a query?",
    options: [
      "GROUP BY",
      "ORDER BY",
      "SORT BY",
      "WHERE"
    ],
    correctAnswer: 1
  },
  {
    id: 10,
    chapter: 3,
    question: "What does the regular expression pattern '^Sri' match in SQL REGEXP?",
    options: [
      "Any string that ends with 'Sri'",
      "Any string that contains 'Sri' anywhere",
      "Any string that starts with 'Sri'",
      "Any string that excludes 'Sri'"
    ],
    correctAnswer: 2
  },
  {
    id: 11,
    chapter: 3,
    question: "What is the purpose of the DISTINCT keyword in a SELECT statement?",
    options: [
      "To speed up query execution",
      "To sort the output alphabetically",
      "To eliminate duplicate rows from the query results",
      "To retrieve only NULL values"
    ],
    correctAnswer: 2
  },

  // Chapter 4: One-to-Many Relationship
  {
    id: 12,
    chapter: 4,
    question: "In a relational database, a One-to-Many (1:m) relationship is implemented by:",
    options: [
      "Creating a third mapping table",
      "Placing the primary key of the 'One' side as a foreign key on the 'Many' side",
      "Placing the primary key of the 'Many' side as a foreign key on the 'One' side",
      "Making both tables share the exact same primary key"
    ],
    correctAnswer: 1
  },
  {
    id: 13,
    chapter: 4,
    question: "What does 'referential integrity' mean?",
    options: [
      "No two rows can have the same primary key value",
      "A foreign key value must either match a primary key value in the related table or be NULL",
      "All tables must be in first normal form",
      "Every table must have a foreign key to be referenced"
    ],
    correctAnswer: 1
  },
  {
    id: 14,
    chapter: 4,
    question: "Which SQL clause is used with aggregate functions (like SUM or COUNT) to group rows?",
    options: [
      "WHERE",
      "GROUP BY",
      "ORDER BY",
      "HAVING"
    ],
    correctAnswer: 1
  },
  {
    id: 15,
    chapter: 4,
    question: "In SQL, the HAVING clause is used to:",
    options: [
      "Sort the output rows",
      "Filter rows before they are grouped",
      "Filter grouped rows after the GROUP BY clause is applied",
      "Create a new table schema"
    ],
    correctAnswer: 2
  },

  // Chapter 5: Many-to-Many Relationship
  {
    id: 16,
    chapter: 5,
    question: "How is a Many-to-Many (m:m) relationship represented in a relational database?",
    options: [
      "By placing foreign keys in both entity tables referencing each other",
      "By creating an associative entity (intersection table) with foreign keys pointing to both tables",
      "By using a recursive relationship",
      "It cannot be represented; it must be converted to a 1:1 relationship"
    ],
    correctAnswer: 1
  },
  {
    id: 17,
    chapter: 5,
    question: "The primary key of an associative entity in a Many-to-Many relationship is usually:",
    options: [
      "A simple auto-incrementing integer",
      "A combination of the foreign keys referencing the two related entities",
      "A random UUID",
      "A single foreign key value"
    ],
    correctAnswer: 1
  },
  {
    id: 18,
    chapter: 5,
    question: "To write a query that joins three tables in a Many-to-Many relationship (e.g., Student, Enrollment, Course), how many join conditions are typically needed?",
    options: [
      "One",
      "Two",
      "Three",
      "Four"
    ],
    correctAnswer: 1
  },

  // Chapter 6: One-to-One and Recursive Relationships
  {
    id: 19,
    chapter: 6,
    question: "A recursive relationship occurs when:",
    options: [
      "A table has multiple primary keys",
      "An entity is related to another instance of the same entity type",
      "Two tables have a many-to-many relationship",
      "A query calls itself repeatedly"
    ],
    correctAnswer: 1
  },
  {
    id: 20,
    chapter: 6,
    question: "To represent a recursive relationship in a table, we add:",
    options: [
      "A primary key that references itself",
      "A foreign key that references the primary key of the same table",
      "A new mapping table",
      "An auto-incrementing column"
    ],
    correctAnswer: 1
  },
  {
    id: 21,
    chapter: 6,
    question: "In a One-to-One (1:1) relationship between Table A and Table B, how is it typically enforced?",
    options: [
      "Putting foreign keys in both tables referencing each other",
      "Putting a UNIQUE foreign key in one of the tables referencing the other's primary key",
      "Creating a join table with compound keys",
      "No constraints are needed"
    ],
    correctAnswer: 1
  },

  // Chapter 7: Data Modeling
  {
    id: 22,
    chapter: 7,
    question: "What is the main goal of data modeling?",
    options: [
      "To write SQL queries",
      "To design a clean, accurate conceptual representation of the organization's data requirements",
      "To optimize database indexes",
      "To load data into tables"
    ],
    correctAnswer: 1
  },
  {
    id: 23,
    chapter: 7,
    question: "In a data model, a crow's foot symbol on a relationship line represents:",
    options: [
      "The 'One' side of the relationship",
      "The 'Many' side of the relationship",
      "An optional relationship",
      "A primary key"
    ],
    correctAnswer: 1
  },
  {
    id: 24,
    chapter: 7,
    question: "An attribute in a data model that cannot be divided into simpler parts is called a:",
    options: [
      "Compound attribute",
      "Simple or atomic attribute",
      "Derived attribute",
      "Key attribute"
    ],
    correctAnswer: 1
  },
  {
    id: 25,
    chapter: 7,
    question: "A relationship description in a data model should:",
    options: [
      "Always be an SQL statement",
      "Use a verb phrase that describes how the entities interact",
      "Contain at least one data type",
      "Match the table name exactly"
    ],
    correctAnswer: 1
  }
];
