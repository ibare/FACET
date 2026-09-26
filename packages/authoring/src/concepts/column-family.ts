/**
 * columnFamily 개념 선언.
 *
 * canonical facet 은 `facet:columnFamily` — 표 `users`(줄 열 · 칸 넷 `name` · `city` · `visits` · `score`)를 세 묶음 방식으로
 * 담는다: 한 묶음(`all`) · 둘씩(`profile` = name · city, `activity` = visits · score) · 칸마다. 쪽 하나에 칸 여덟, 묶음마다
 * 따로 쪽을 연다. 손잡이 둘 — 칸 묶음 · 묻는 칸(1 ~ 4, 뒤에서부터). 읽은 쪽이 가장 적은 담는 법이 묻는 칸 1 칸마다(2) →
 * 2 둘씩(3) → 3 · 4 한 묶음(5) 으로 옮겨 간다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `columnOriented` 는 줄 방향과 칸 방향 둘을 나란히 두고 한 칸(`SUM(amount)`)만 묻는다. 이쪽은 그 둘을 **묶음 손잡이의
 * 두 끝**으로 두고 가운데(컬럼 패밀리)를 더하며, 묻는 칸 수를 돌려 가장 싼 묶음이 옮겨 가는 것을 쥔다. 그래서 definition 은
 * families · grouping · how many columns · shifts 를 쥐고, 조각이 독점한 single column · sum · unused cells come
 * along 을 쓰지 않는다.
 *
 * 전제 (설명 글 `columnFamily.md`): 자료는 예로 정한 것 · 쪽 하나에 칸 여덟 · 줄 열쇠는 칸으로 세지 않는다 · 압축 · 캐시
 * 없음 · 한 묶음은 줄 방향, 칸마다는 칸 방향과 같은 셈 · 실제 넓은 칸 저장소(HBase · Cassandra 류)는 묶음 단위로 파일을
 * 따로 둔다 · 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const columnFamilyConcept: FacetConceptSource = {
  id: 'columnFamily',
  label: 'Column Families (Grouping Columns Between Row and Column Storage)',
  canonicalFacet: 'facet:columnFamily',

  surface: {
    definition:
      'Grouping columns into families stored apart sets how many pages a query reads: narrow groups win when few columns are requested, one wide group wins when most are, and families of columns used together sit between.',
    exemplarKeywords: [
      'column family',
      'wide-column store',
      'Cassandra column family',
      'HBase column families',
      'Bigtable locality groups',
      'row store vs column store trade-off',
      'hybrid row-column storage',
      'group columns read together',
      'vertical partitioning',
      'pages read per query',
    ],
  },

  briefing: {
    observable: [
      'The table `users` has ten rows, keys `u1` to `u10`, and four columns `name`, `city`, `visits`, `score`. A query in SQL sits above it, from `SELECT score FROM users` (one column asked) to `SELECT name, city, visits, score FROM users` (four); columns are asked from the right.',
      'In the store step the forty cells leave the table, each carrying its row key, and gather into the pages of each family — eight cells to a page, and no page shared by two families. One family `all` fills 5 pages; Pairs fill `profile` 3 pages and `activity` 3 pages (8, 8, 4 cells); Per column gives each column 2 pages (8 and 2).',
      'In the lift step every page of a family holding any asked column comes up whole, and the unused cells on those pages are brought along dimmed. The caption names the families lifted and the pages read, like "Families lifted: activity · pages read: 3".',
      'The count step reads "Cells fetched: 20 · cells used: 20" (for Pairs with two columns asked), and a bar chart "Pages read by each layout" sets One family, Pairs and Per column side by side, with a mark on the shortest bar.',
      'Pages read across the handles: One family 5 whatever is asked; Pairs 3, 3, 6, 6 for 1 to 4 columns; Per column 2, 4, 6, 8. The fewest moves from Per column (1 column) to Pairs (2 columns) to One family (3 and 4 columns). At 3 columns Pairs and Per column tie at 6, both above One family. Cells fetched: One family always 40, Pairs 20, 20, 40, 40, Per column 10, 20, 30, 40 — always equal to cells used.',
      'The data is an example and eight cells per page is chosen to make the count visible. Row keys are not counted as cells, and there is no compression or cache. One family is the same arithmetic as row-oriented storage and Per column the same as column-oriented storage. Real wide-column stores keep each family in its own files; the separate pages here are that idea simplified. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Grouping" — One family, Pairs or Per column (starting at Pairs) — and "Columns asked" — 1, 2, 3 or 4 (starting at 2). Each round is four steps — start, store, lift, count — then waits for a handle.',
        'The move that makes the idea land is raising "Columns asked" from 1 to 4 while watching the three bars: the shortest passes from Per column to Pairs to One family. Turning "Grouping" moves the cells from one set of pages into another.',
        'Readouts under the controls: Pages read, Cells fetched and Cells used.',
        'The code panel, labelled "Counting pages read", starts empty with a "+ Add language" button; the chosen language shows the page-counting functions and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article presents column families as a middle ground and needs to show when that middle wins: with columns that are read together grouped, a query for just those reads fewer pages than either extreme.',
      'A reader wants to see that neither row storage nor column storage is always better, and that the answer turns on how many columns a query asks for.',
    ],

    avoidWhen: [
      'The article is about Cassandra partitioning, clustering keys or wide rows with dynamic columns. The table here has fixed columns and a single store.',
      'The subject is compression or encoding in columnar formats such as Parquet. No compression is modelled.',
      'The point is memory cache behaviour when looping over a matrix. The units read here are disk pages.',
    ],

    contrastWith: [
      {
        concept: 'columnOriented',
        note: 'Storing each column apart is one end of the grouping range, and it wins when a query needs a single column; column families add the middle ground and ask where the cheapest grouping moves as a query needs more columns.',
      },
      {
        concept: 'rowVsColumnWalk',
        note: 'Walking a matrix by rows or by columns is about how a loop reuses cache lines already in memory; column families concern which disk pages a query must fetch at all.',
      },
      {
        concept: 'documentKv',
        note: 'Both hold that storage layout decides which query is cheap. For column families the layout is how columns are grouped into pages; for documents and key-value pairs it is whether related records are split, nested or sealed under a key.',
      },
    ],
  },
};
