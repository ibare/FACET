/**
 * indexChoice 개념 선언.
 *
 * canonical facet 은 `facet:indexChoice` — 표 `orders (id, price)` 줄 열다섯(표 페이지 T1..T8)에 B+ 트리
 * `orders_price_idx` 와 해시 인덱스 `orders_price_hash`(버킷 여덟) 를 둔다. 같은 질의를 표 훑기 · B+ · 해시 세 길에
 * 한꺼번에 걸어 길마다 실제로 읽을 페이지를 세고, 가장 적게 읽는 길로 읽은 뒤 `INSERT INTO orders VALUES (16, 38)` 가
 * 걸린 곳마다 쓴다. 손잡이 둘 — 인덱스(없음 · B+ · 해시 · 둘 다) · 질의(`= 49` · `30–36` · `30–42` · `30–50`).
 * 둘 다 걸렸을 때 고른 길은 해시 2 → B+ 5 → B+ 7 → 표 훑기 8, INSERT 가 쓴 페이지는 인덱스 수 + 1.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 구조 · 한 장면이다 — 잎 사슬을 옆으로 건넘(`leavesLinked`) · 안쪽 열쇠는 길잡이 사본(`allDataInLeaves`) ·
 * 쓰기가 인덱스마다 퍼짐(`indexCostsWrite`) · 해시는 `=` 만 빠름(`exactMatchOnly`). 이쪽은 **같은 질의를 세 길에 동시에
 * 걸고 질의 꼴이 넓어질 때 가장 싼 길이 해시 → B+ → 표 훑기로 옮겨 가는 것**을 쥔다. 그래서 definition 은 access path ·
 * query shape · equality / narrow / wide range · full table scan wins 를 쥐고, 조각들이 독점한 sibling · routing copy ·
 * fan out · scatters 를 쓰지 않는다. 쓰기 쪽 주장은 observable 에만 두고 definition 에 넣지 않았다 (indexCostsWrite 와 붙는다).
 *
 * 전제 (설명 글 `indexChoice.md`): 캐시 없음 · 페이지당 줄 둘 · 비용은 실제로 읽을 페이지(추정이 아니다) · 범위 질의에서
 * 해시 인덱스를 "버킷 전부 연다" 로 둔 것은 비교를 위한 모형이고 실제 해시 인덱스는 범위에 쓰이지 않는다 · 잎에 빈자리가
 * 있어 INSERT 가 나눔을 부르지 않는다 · 동률이면 표 훑기 → B+ → 해시 차례(이 데이터에서 걸리지 않는다) · SQL 은 그대로 쓴
 * 표기(`@notation native`) · 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이고, 트리를 걷지 않고 잎 열쇠를 편 배열로 같은 답을 낸다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const indexChoiceConcept: FacetConceptSource = {
  id: 'indexChoice',
  label: 'Index Choice and Query Shape (Hash vs B+ Tree vs Table Scan)',
  canonicalFacet: 'facet:indexChoice',

  surface: {
    definition:
      'Which access path reads the fewest pages depends on the query shape: a hash index wins an equality lookup, a B+ tree wins a narrow range, and a full table scan wins a wide range.',
    exemplarKeywords: [
      'choosing an index',
      'why does the optimizer ignore my index',
      'full table scan vs index scan',
      'hash index vs B-tree index',
      'B+Tree range query',
      'access path selection',
      'index selectivity',
      'Seq Scan chosen despite an index',
      'PostgreSQL CREATE INDEX USING hash',
      'index maintenance cost on INSERT',
    ],
  },

  briefing: {
    observable: [
      'The table `orders (id, price)` holds fifteen rows on table pages T1 to T8, two rows per page. Beside it stand a B+ tree `orders_price_idx` (root R, inner pages I1 and I2, leaves L1 to L4 joined in a chain) and a hash index `orders_price_hash` with eight buckets, labelled "bucket = price mod 8". An index that is not built stays in place, dimmed and marked "not built".',
      'The query is shown as SQL, e.g. `SELECT * FROM orders WHERE price BETWEEN 30 AND 36`. Under "Pages each path would read" a horizontal bar per path grows to its value, with a vertical reference line at the table scan\'s 8. Captions give each breakdown: "Table scan reads every table page. Pages: 8", "B+ tree: inner 2 + leaves 1 + table pages 2. Pages: 5", "Hash: buckets 8 + table pages 2. Pages: 10".',
      'Widening the query spreads the band over the B+ leaves sideways along the chain (L2, then L2 and L3) and over the hash buckets from one to all eight. With both indexes built the cheapest path moves Hash 2 → B+ 5 → B+ 7 → Table scan 8 across `= 49`, `30–36`, `30–42`, `30–50`; at `30–50` the B+ bar (9) crosses the table-scan line.',
      'The "cheapest" tag lands on the chosen path and a reading dot travels from the query through that path\'s index pages to the table pages of the matching rows: "Cheapest path: B+ tree. Pages read: 5". A hash index is never cheaper than the table scan for any range.',
      'The last step writes `INSERT INTO orders VALUES (16, 38)`: its stem splits into the table page T8, the leaf L2 and the bucket B6 — as many branches as structures built. "INSERT writes one table page and one page per index. Pages written: 3" with both indexes, 2 with one, 1 with none.',
      'Costs here are pages actually read, not estimates; there is no cache; opening all eight buckets for a range is a comparison model — real hash indexes are not used for ranges at all; the leaf has room, so the insert never splits a page; ties would go table scan → B+ → hash but never occur in this data. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Indexes" None / B+ / Hash / Both (starting at Both) and "Query" `= 49` / `30–36` / `30–42` / `30–50` (starting at `30–36`). Each change replays one round from the start; steps for an index that is not built are skipped.',
        'The move that makes the idea land is stepping the Query handle from `= 49` to `30–50` with Both built and watching the "cheapest" tag jump from Hash to B+ tree to Table scan; then switching Indexes to see the INSERT branch count go 1, 2, 3.',
        'Readouts under the controls: Pages read and Pages written.',
        'The code panel, labelled "Counting pages per path", starts empty with a "+ Add language" button and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#, not language-specific behaviour.',
      ],
    },

    useWhen: [
      'The article asks why a database sometimes reads the whole table even though an index exists, and needs to show the crossover point where a range becomes wide enough that the index path costs more pages than a scan.',
      'A reader must decide between a hash index and a B-tree index and needs to see that the answer depends on whether queries use equality or ranges, with an insert cost that grows with every index added.',
    ],

    avoidWhen: [
      'The article is about how the optimizer estimates row counts from statistics. Costs here are exact page counts, not estimates.',
      'The subject is how a B-tree or B+ tree is built, split or balanced. The trees here are fixed and never change shape.',
      'The point is caching, buffer pools or index-only scans. Every page is counted each time it is read and every match fetches its table page.',
    ],

    contrastWith: [
      {
        concept: 'leavesLinked',
        note: 'Walking the leaf chain explains why a B+ tree can serve a range at all; choosing an index asks when that walk still beats reading every table page.',
      },
      {
        concept: 'allDataInLeaves',
        note: 'That every lookup must reach a leaf fixes the floor of a B+ tree\'s cost; the choice between access paths starts from that floor and adds the table pages of the matching rows.',
      },
      {
        concept: 'indexCostsWrite',
        note: 'The write penalty of an index is one side of the trade in isolation; choosing an index weighs it against which query shapes the index actually makes cheaper.',
      },
      {
        concept: 'exactMatchOnly',
        note: 'That hashing destroys key order is the reason a hash index loses on ranges; the choice of index turns that into a rule about which query shape favours which structure.',
      },
      {
        concept: 'costModel',
        note: 'Choosing a path by counting the pages each would really read is the ideal; a real optimizer must choose from estimated row counts, and the estimate can be wrong.',
      },
      {
        concept: 'bTree',
        note: 'A B-tree as a data structure is about keeping keys ordered and balanced under inserts and deletes; as a database index the question is how many pages a given query costs through it compared with other paths.',
      },
      {
        concept: 'hashTableChaining',
        note: 'A hash table resolves one key to one bucket in memory; a hash index applies the same idea to disk pages, which is exactly why it helps equality lookups and not ranges.',
      },
    ],
  },
};
