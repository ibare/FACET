/**
 * cacheInvalidation 개념 선언.
 *
 * canonical facet 은 `facet:cacheInvalidation` — 컨테이너 이미지 층 여섯(바탕 0 · 의존 목록 넣기 1 · 의존 설치 60 ·
 * 소스 넣기 1 · 빌드 20 · 테스트 10 초, 합 92)을 쌓는다. 손잡이 둘은 층 차례(의존 먼저 · 소스 먼저, 처음 소스 먼저)와
 * 바뀐 파일(`app.src` · `deps.txt`, 처음 `app.src`). 다시 드는 초가 31 · 92 · 92 · 91 로 갈린다 — 처음 칸(소스 먼저 ×
 * app.src)은 92 초로 캐시가 없는 것과 같고, 층 차례만 돌리면 31 초.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `invalidationCascade` 는 열쇠를 층마다 한 걸음씩 새로 셈하며 "앞 층 열쇠를 품으니 뒤가 전부 번진다" 는 장면을
 * 보인다. 이쪽은 그 번짐을 전제로 **층 차례와 바뀐 파일을 돌려** 비싼 층이 "다시" 띠 안에 드는지, 다시 드는 초가
 * 얼마인지를 견준다. 그래서 definition 은 where a frequently edited file enters · order · expensive dependency install ·
 * stays cached 를 쥐고, 조각이 쥔 key includes the previous key · own inputs identical 을 쓰지 않는다.
 *
 * 전제 (설명 글 `cacheInvalidation.md`): Docker 같은 층 캐시 꼴 — 실제 도구는 파일을 가져오는 층이면 파일 체크섬을,
 * 명령 층이면 명령 글자를 캐시 가르는 데 쓰고 세부는 도구마다 다르다. 여기서는 명령 글자 대신 층 식별자. 열쇠와 지문은
 * FNV-1a 32 비트(화면은 앞 여섯 자, 실제는 SHA-256 등). 층의 초는 예로 정한 값. 층은 갈래 없는 한 줄.
 * "자주 바뀌는 것을 뒤에" 는 흔한 권고이지 모든 경우의 답이 아니다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheInvalidationConcept: FacetConceptSource = {
  id: 'cacheInvalidation',
  label: 'Layer Cache Invalidation (Order Decides the Cost)',
  canonicalFacet: 'facet:cacheInvalidation',

  surface: {
    definition:
      'Where a frequently edited file is copied in a layered image build decides how much cache survives an edit: placed after a slow dependency install it leaves that install cached, placed first it reruns everything.',
    exemplarKeywords: [
      'Docker layer caching',
      'Dockerfile instruction order',
      'COPY package.json before COPY .',
      'npm install runs on every build',
      'docker build cache miss',
      'order layers from least to most frequently changed',
      'container image build time',
      'CI build cache',
      'cache busting',
      'speed up docker build',
    ],
  },

  briefing: {
    observable: [
      'Six layers form a table with columns Layer, File, Seconds, Last key, New key and Verdict: Base 0 s, Add dependency list (`deps.txt`) 1 s, Install dependencies 60 s, Add source (`app.src`) 1 s, Build 20 s, Test 10 s. A File fingerprints strip sits above, and a "Redo seconds" bar below.',
      'Each round has four steps. It opens "Layer order: Source first · every last key is in the cache", then changes one file — "Changed: app.src · fingerprint 1e7ccc → 908844" (or `deps.txt` 5472b1 → 5372b0) — then fills the New key column at once, and finally sums the seconds of the redone layers.',
      'The Verdict column gives each layer one of three labels: "Cached", "Redo · own file" when the file it copies changed, or "Redo · layer above" when only the key above it changed. The caption names the first layer with a new key, for example "First new key at layer 2: Add source".',
      'In the starting cell, Source first with `app.src` changed, Add source sits second, so every layer after Base is redone: 1 cached, 5 redone, "Seconds of redone layers: 1 + 1 + 60 + 20 + 10" — 92 s, the same as building with no cache.',
      'Switching the order to Deps first moves Add source to fourth place: Base, the dependency list and Install dependencies stay Cached, and only Add source, Build and Test are redone — 31 s. Changing `deps.txt` instead gives 92 s with Deps first and 91 s with Source first; either way the install reruns.',
      'Readouts Cached, Redone and Redo seconds show 3, 3, 31 or 1, 5, 92 (Deps first), and 1, 5, 92 or 2, 4, 91 (Source first), for `app.src` and `deps.txt` respectively. Keys and fingerprints are short FNV-1a hashes shown as six hex digits, a layer\'s key uses its step name where a real tool would use the command text, and the seconds are example values; the screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: "Layer order" with Deps first and Source first (starting at Source first), and "Changed file" with `app.src` and `deps.txt` (starting at `app.src`). Each change replays a four-step round and then waits.',
        'The move that makes the idea land is flipping Layer order while `app.src` is the changed file: Add source jumps past the dependency layers, the 60-second install leaves the redo range, and Redo seconds falls from 92 to 31.',
        'There is no code panel; the table, the verdict labels and the seconds bar carry the whole argument.',
      ],
    },

    useWhen: [
      'The article gives the advice to copy dependency manifests and install before copying source code in a Dockerfile, and needs the four combinations with their seconds to show why.',
      'A reader asks why a one-line source change reinstalls all dependencies in CI, and the article wants the cheap fix — reordering layers — to cut the redo time on screen.',
    ],

    avoidWhen: [
      'The article is about cache expiry by time, CDN caches or invalidating entries in an application cache. Nothing here expires; keys change only because inputs do.',
      'The subject is a build graph with branches where a change reaches only its dependents. The layers here are a single line.',
      'The point is the exact Dockerfile syntax or a particular tool\'s checksum rules. Layers are named by task, not by instruction.',
    ],

    contrastWith: [
      {
        concept: 'invalidationCascade',
        note: 'That a new key forces every later layer to redo is the mechanism; choosing the layer order so the expensive layers sit before the frequently changing file is the practice that follows from it.',
      },
      {
        concept: 'incrementalBuild',
        note: 'Both reuse earlier results unless an input changed. A dependency graph lets a change reach only the targets that use it; a linear layer chain makes position the deciding factor.',
      },
      {
        concept: 'cacheTtl',
        note: 'A time-to-live cache discards entries when a countdown ends, whether or not anything changed. A content-keyed layer cache never expires by time; it misses exactly when an input, or an earlier key, is different.',
      },
    ],
  },
};
