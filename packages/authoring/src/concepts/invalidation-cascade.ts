/**
 * invalidationCascade 개념 선언.
 *
 * canonical facet 은 `facet:invalidationCascade` — 층 여섯(바탕 · 의존 목록 넣기 `deps.txt` · 의존 설치 · 소스 넣기
 * `app.src` · 빌드 · 테스트)의 열쇠를 첫 층부터 한 걸음에 하나씩 새로 셈한다. 층 열쇠 = 지문(앞 층 열쇠 | 층 이름 |
 * 가져오는 파일의 지문). `deps.txt` 가 `left-pad 1.0` → `left-pad 1.1` 로 바뀌어 둘째 층 열쇠가 `356a3c` → `0e2e00`,
 * 그 뒤 넷도 줄줄이 달라진다. 끝에 꺼내 씀 1 · 다시 5, 그 가운데 넷은 제 입력이 그대로인데 앞 층 때문에.
 * 걸음 일곱(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `cacheInvalidation` 은 층 차례와 바뀐 파일을 손잡이로 돌려 다시 드는 초를 견준다. 이 조각은 차례를 고정하고
 * **열쇠가 앞 층 열쇠를 품는 사슬** 자체를 한 층씩 보인다 — 제 입력이 그대로인 층도 캐시를 못 쓴다는 주장 하나다.
 * 그래서 definition 은 key built from the previous layer's key · own inputs are identical · every layer after it 을 쥐고,
 * 완제품의 order · where to place · expensive install · seconds 를 쓰지 않는다.
 *
 * 전제 (설명 글 `invalidationCascade.md`): Docker 같은 층 캐시 꼴, 층 이름은 명령 문법이 아니라 할 일의 이름.
 * 지문은 FNV-1a 32 비트 앞 여섯 자(실제는 SHA-256 등). 다시 한 층의 결과가 우연히 같아도 뒤를 멈추는 장치는 없다 —
 * 열쇠는 결과가 아니라 입력으로 셈하기 때문이다. 파일 내용은 예로 정한 값이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const invalidationCascadeConcept: FacetConceptSource = {
  id: 'invalidationCascade',
  label: 'A Changed Layer Key Cascades to Every Later Layer',
  canonicalFacet: 'facet:invalidationCascade',

  surface: {
    definition:
      'A layer cache key that folds in the previous layer\'s key changes whenever any earlier key does, so one altered file forces a cache miss on every later layer, even those whose own inputs are identical.',
    exemplarKeywords: [
      'docker layer cache key',
      'cache key includes parent layer',
      'invalidates all subsequent layers',
      'chained cache keys',
      'layer cache miss cascade',
      'why later layers are not reused',
      'build step cache key derivation',
      'hash of previous layer',
      'cache miss propagates downstream',
    ],
  },

  briefing: {
    observable: [
      'Two file cards sit at the top: `deps.txt` changed from `left-pad 1.0` to `left-pad 1.1`, its fingerprint `5472b1 → 5372b0`, and `app.src` holding `show greet()` with fingerprint `1e7ccc`, unchanged.',
      'Below, six layers form rows with columns Layer, Key above, File print, New key and Cache: Base, Add deps list (`deps.txt`), Install deps, Add source (`app.src`), Build, Test. Each row shows its new key as the key above, the layer name and its file print joined by `|`.',
      'The rows are computed one per step from the top. Base keeps key `ef227b`, finds it in the cache and shows "Reused". Add deps list takes the new `deps.txt` print, its key becomes `0e2e00` instead of `356a3c`, and the caption reads "…is not in the cache — redo." with "Its own file print changed."',
      'Each following layer receives that new key in its Key above cell, so its own key changes too. For Install deps, Add source, Build and Test the caption adds "Its own input is unchanged — only the key above changed." — Add source is redone even though `app.src` is the same as before.',
      'The run ends with "Reused: 1 · Redone: 5 · redone only because of the layer above: 4". Seven steps including the start.',
      'Keys and prints are short FNV-1a hashes shown as six hex digits, and a layer\'s key uses its task name rather than a real instruction. A redone layer whose output happens to match the old one does not stop the chain, because keys are computed from inputs; the screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one layer per step, and stops after Test.',
        'A Replay button and a timeline strip sit below. Dragging the strip to the Add source step holds a layer whose own file is unchanged while its key is still new.',
        'The file contents and the layer list are fixed, so an article can quote every key and caption exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader expects a layer whose files did not change to come from the cache, and the article needs the step where that layer misses anyway because the key above it changed.',
      'The article explains how a layered build derives its cache keys and needs the chain — previous key, name, file print — computed row by row.',
    ],

    avoidWhen: [
      'The article is about choosing the order of layers to save time. The order here is fixed and no times are shown.',
      'The subject is a build graph where only dependents of a change are redone. Here every later layer is affected, related or not.',
      'The point is cache eviction or expiry. Every old key is still in the cache; misses come only from new keys.',
    ],

    contrastWith: [
      {
        concept: 'cacheInvalidation',
        note: 'The chained key explains why everything after a change is redone; how to arrange layers so that the redone part is cheap is the decision built on that explanation.',
      },
      {
        concept: 'hashChain',
        note: 'Both fold the previous hash into the next, so one early change alters every later value. A hash chain uses that to reveal tampering; a layer cache uses it to decide which work can be reused.',
      },
      {
        concept: 'onlyWhatChanged',
        note: 'In a dependency graph an edit reaches only the targets that consume it, and siblings are spared. Chaining each key to the one before removes that sparing: position alone decides who is affected.',
      },
      {
        concept: 'timestampVsFingerprint',
        note: 'Both judge change by content fingerprints. Comparing a file\'s own fingerprint lets unchanged work be skipped; folding the previous key into each key means an unchanged file does not save a later layer.',
      },
    ],
  },
};
