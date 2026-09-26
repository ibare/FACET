/**
 * atomicCell 개념 선언.
 *
 * canonical facet 은 `facet:atomicCell` — 표 `recipes` 세 줄의 `ingredients` 칸에 재료가 쉼표로 이어 적혀 있다
 * (`'egg, milk, flour'` …). `WHERE ingredients = 'egg'` 는 칸 전체와 견주어 0 줄. 칸을 풀어 값마다 한 줄씩
 * `recipe_ingredients` 에 두면 줄이 3 → 7, `WHERE ingredient = 'egg'` 가 2 줄(pancake · omelet)을 집는다.
 * 걸음 여섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `normalForms` 는 UNF → 1NF 를 단계 손잡이 한 칸으로 지나가며 고칠 줄 수와 함께 센다. 이쪽은 **조건이 칸
 * 글자 전체와 견준다는 것 하나** — 목록 칸 안의 값으로는 줄을 찾을 수 없다는 것을 쥔다. 그래서 definition 은
 * list · whole cell · equality condition · one row per value 를 독점하고, 사본 · 단계 · 종속을 쓰지 않는다.
 *
 * 전제 (설명 글 `atomicCell.md`): 조건은 SQL 그대로(`@notation native`) · 같음은 값 전체 · 무엇을 쪼갤 수 없는 값으로
 * 볼지는 쓰임에 달렸다 · 배열 · JSON 형 칸과 그 안을 찾는 연산은 이 표 모형 밖 · 데이터는 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const atomicCellConcept: FacetConceptSource = {
  id: 'atomicCell',
  label: 'One Value per Cell (Unpacking a List Column)',
  canonicalFacet: 'facet:atomicCell',

  surface: {
    definition:
      'An equality condition compares a cell\'s entire value, so a comma-separated list packed into one cell cannot be matched by any single item; unpacking it into one row per value lets the same condition find them.',
    exemplarKeywords: [
      'first normal form',
      '1NF',
      'atomic values',
      'multivalued attribute',
      'comma-separated values in a column',
      'repeating group',
      'WHERE column = value finds nothing',
      'LIKE %value% workaround',
      'junction table',
      'one value per cell',
    ],
  },

  briefing: {
    observable: [
      'Table `recipes` with columns `recipe` and `ingredients` and three rows: `pancake` holds `egg, milk, flour`, `omelet` holds `egg, salt`, `bread` holds `flour, salt`. The caption reads "Rows: 3. Values packed into ingredients cells: 7."',
      'The condition `WHERE ingredients = \'egg\'` is tried on each row and every cell gets a ≠ mark: "Each whole ingredients cell is compared with \'egg\'. Matching rows: 0." Two recipes contain egg, but no cell equals `egg`.',
      'Three steps unpack one recipe each into a new table `recipe_ingredients` (`recipe`, `ingredient`): "pancake: values released from one cell: 3. Rows now: 3.", then omelet (5 rows), then bread (7 rows). The recipe name is repeated on each unpacked row.',
      'The last step runs `WHERE ingredient = \'egg\'` on the new table: the two `egg` rows get =, the other five ≠, and "Matching rows: 2". Both conditions stay on screen, 0 above and 2 below.',
      'The comparison is equality of the whole value, not substring search. What counts as indivisible depends on use, and some databases offer array or JSON columns with operators to search inside them; the data is a made-up example and the conditions are written as SQL. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps by itself and stops with both conditions and their counts in view.',
        'A Replay button and a playback strip sit below it. Setting the first condition\'s row of ≠ marks against the second condition\'s two = marks is the comparison the screen builds toward.',
      ],
    },

    useWhen: [
      'The article explains the first normal form and needs a practical failure, not a definition: a plain equality search that returns nothing even though the data is there.',
      'A reader is storing tags or items as a comma-separated string in one column and needs to see why a query on one item does not work and what the one-row-per-item table looks like.',
    ],

    avoidWhen: [
      'The article is about full-text search, LIKE patterns or array and JSON column operators. Only whole-value equality is shown.',
      'The subject is redundancy across rows or splitting tables by dependencies. The only change here is turning a list into rows.',
      'The point is joining the unpacked table back to the original. No join is shown.',
    ],

    contrastWith: [
      {
        concept: 'normalForms',
        note: 'One value per cell is where normalization starts and concerns whether a value can be matched at all. The higher forms are about how many rows repeat a fact once every cell holds a single value.',
      },
      {
        concept: 'nestedDocument',
        note: 'A document store embraces a list inside one record and gives operators to search inside it. The relational table instead expects one value per cell and moves the items into rows.',
      },
      {
        concept: 'setOfRows',
        note: 'Unpacking multiplies rows so each value has its own. What a table of rows is — an unordered set where duplicates collapse — is a separate claim about the rows themselves.',
      },
    ],
  },
};
