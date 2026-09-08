/**
 * relationalTablesAndKeys 개념 선언.
 *
 * canonical facet 은 `facet:relationalTablesAndKeys` — 두 격자 + 기본키 칩 +
 * 외래키 참조선 + 카디널리티 범례.
 *
 * reactive 다. 기본키를 다른 후보키로 바꿔 보는 토글이 핵심 조작.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const relationalTablesAndKeysConcept: FacetConceptSource = {
  id: 'relationalTablesAndKeys',
  label: 'Tables and Keys',
  domain: 'database',
  canonicalFacet: 'facet:relationalTablesAndKeys',

  surface: {
    definition:
      'Named grids of same-shaped rows where a primary key identifies each row uniquely and a foreign key in another grid points at that value, binding the two together.',
    exemplarKeywords: [
      'relational database',
      'table and row',
      'primary key',
      'foreign key',
      'candidate key',
      'referential integrity',
      'one to many relationship',
      'join',
      'normalization',
      'entity relationship diagram',
    ],
  },

  briefing: {
    observable: [
      'Selecting a foreign key value draws a line to the exact row it points at, so a reference is a visible link rather than a coincidence of equal numbers.',
      'Selecting a primary key row shows how many rows elsewhere point back at it — the "many" side of the relationship counted rather than asserted.',
      'A foreign key value with no matching row is called out, which is what referential integrity prevents.',
      'The primary key can be switched to a different candidate key, and the whole diagram re-anchors. This is the moment it becomes clear that "primary" is a choice among candidates, not a property of the column.',
      'A legend names the marks: PK, alternate key, FK, and the crow\'s-foot cardinality symbols for exactly-one and many.',
      'A row that nothing points at yet is distinguished from one that is referenced, so the two directions of the relationship stay separate.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet: clicking cells and rows to trace references, a Toggle PK control to re-anchor on another candidate key, an auto-demo and Reset.',
        'Toggle PK is the control worth pointing at — the diagram staying valid under a different anchor is the argument that candidate keys are real.',
        'Tracing a foreign key and then tracing back from the primary key side is how to show that one relationship has two readings.',
      ],
    },

    useWhen: [
      'The reader treats a foreign key as a note rather than a binding. Following the value from one grid into another is what makes it a binding.',
      'The article is about why a primary key must be unique, which shows the moment a duplicate makes a row unidentifiable.',
    ],


    avoidWhen: [
      'The article is about SQL query syntax or the join algorithms underneath. This shows what a relationship is, not how a query engine resolves one.',
      'The subject is normalization forms. The tables here are given in their final shape and never decompose.',
      'The point is a document or graph database. The grid shape and fixed columns are the premise of this screen.',
    ],

    contrastWith: [
      {
        concept: 'hashTableChaining',
        note: 'A primary key identifies a row; a hash key locates a slot. One is about identity, the other about address — the word "key" carries both.',
      },
    ],
  },
};
