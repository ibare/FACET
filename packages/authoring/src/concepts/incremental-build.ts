/**
 * incrementalBuild 개념 선언.
 *
 * canonical facet 은 `facet:incrementalBuild` — 규칙 다섯(`lex.o ← lex.c · util.h`, `parse.o ← parse.c · util.h`,
 * `emit.o ← emit.c`, `front.a ← lex.o · parse.o`, `tool ← front.a · emit.o`)과 소스 넷. `lex.c` 를 10:05 에 저장한 뒤
 * 대상을 하나씩 판정한다. 손잡이 둘은 판정 방식(시각 · 입력 지문 · 출력 지문, 처음 입력 지문)과 고친 모양(그대로 저장 ·
 * 주석만 · 코드, 처음 주석만). 다시 세운 수가 시각 3·3·3 / 입력 지문 0·3·3 / 출력 지문 0·1·3 으로 계단을 이룬다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `onlyWhatChanged` 는 "바뀐 것에 기대는 대상만 다시 세운다" 는 한 장면(무엇이 바뀌었는지는 주어진다),
 * `timestampVsFingerprint` 는 그대로 저장 하나를 시각과 입력 지문이 나란히 받는 장면이다. 이쪽은 판정 방식을 **손잡이로
 * 갈아 끼워** 셋째 판정(출력 지문 · 조기 차단)까지 올리고, 고친 모양을 돌려 "다시" 가 막히는 자리가 내려오는 것을 맡는다.
 * 그래서 definition 은 three ways · early cutoff · comment edit · how far up 을 쥐고, 조각들이 쥔 leaves the previous
 * output in place · saved again with identical content · rebuilds nothing 을 쓰지 않는다.
 *
 * 전제 (설명 글 `incrementalBuild.md`):
 *  - 장난감 번역 — 결과 지문은 "대상 이름 | 주석 줄을 뺀 입력 내용" 의 지문. 실제 컴파일러 결과에는 줄 번호 같은 디버그
 *    정보가 들어 주석만 고쳐도 결과가 달라질 수 있다.
 *  - 지문은 FNV-1a 32 비트(화면은 앞 여섯 자). 실제 도구는 SHA-256 같은 더 긴 해시.
 *  - 시각 · 저장 시각 10:05 · 세우는 데 1 분은 예로 정한 값.
 *  - 도구마다 나눠 적는다 — 시각 판정은 make 꼴, ninja 도 기본은 시각이고 규칙에 `restat` 을 달면 결과 파일 시각이 그대로일 때
 *    위를 멈출 수 있다, 출력 지문의 멈춤(조기 차단)은 Bazel 같은 내용 해시 도구의 꼴이며 make 에는 없다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const incrementalBuildConcept: FacetConceptSource = {
  id: 'incrementalBuild',
  label: 'Incremental Build (Timestamp, Input Hash, Output Hash)',
  canonicalFacet: 'facet:incrementalBuild',

  surface: {
    definition:
      'Whether an incremental build compares timestamps, input content hashes, or output hashes with early cutoff decides how far up the graph a resave, a comment-only edit or a real code edit forces rebuilds.',
    exemplarKeywords: [
      'incremental build',
      'early cutoff',
      'Bazel action cache',
      'content-addressed build',
      'ninja restat',
      'Makefile timestamps',
      'why did my whole project rebuild',
      'comment change triggers rebuild',
      'rebuild avoidance',
      'up-to-date check',
      'build system change detection',
      'output hash unchanged stops propagation',
    ],
  },

  briefing: {
    observable: [
      'Four sources (`lex.c`, `parse.c`, `emit.c`, `util.h`) and five targets (`lex.o`, `parse.o`, `emit.o`, `front.a`, `tool`) stand as a graph, each with a time tag and a fingerprint tag; the arrows point from a target to its inputs. A line above states the current rule, for example "Rebuild if an input\'s fingerprint changed or the input was rebuilt".',
      'Each round opens "Before saving · edit: comment only" and then saves `lex.c`: "Saved: lex.c — time 09:00 → 10:05 · fingerprint 26b393 → ef96b1". The changed line of `lex.c` is shown in place; with "saved as is" the fingerprint caption says it is unchanged.',
      'Targets are then judged one by one, `lex.o`, `parse.o`, `emit.o`, `front.a`, `tool`: "Rebuild: lex.o — lex.c fingerprint 26b393 → ef96b1", "Keep: parse.o — no input counts as changed", "Rebuild: front.a — lex.o was rebuilt". A rebuilt target gets a new time (10:06, 10:07, 10:08) and a new result fingerprint.',
      'A reach marker tracks how far the change has climbed: "rising" as it passes a rebuilt target, "stops here" where it is blocked, "reached the top" at `tool`. The tag the current rule reads — time or fingerprint — is framed at each node.',
      'Across the nine combinations the number rebuilt is 3, 3, 3 for timestamp (saved as is, comment only, code), 0, 3, 3 for input fingerprint and 0, 1, 3 for output fingerprint. Under output fingerprint with a comment-only edit, `lex.o` is rebuilt but its result fingerprint is unchanged — "Same result: lex.o … rebuilt, but not passed up" — and `front.a` and `tool` are kept.',
      'Under timestamp with "saved as is" or "comment only", the three rebuilt targets end with the same result fingerprints they had before: the rebuild happened but produced nothing new. In all nine cells `parse.o` and `emit.o` are kept.',
      'Results are a toy: a target\'s result fingerprint is computed from its name and its inputs with comment lines removed, so a real compiler that embeds line numbers could behave differently. Fingerprints are short FNV-1a hashes shown as six hex digits, and all times are example values; the screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: "Verdict by" with timestamp, input fingerprint and output fingerprint (starting at input fingerprint), and "Edit to lex.c" with saved as is, comment only and code (starting at comment only). Readouts "Rebuilt" and "Kept" count the round.',
        'The move that makes the idea land is holding the edit at "comment only" and stepping the verdict from timestamp to input fingerprint to output fingerprint: the point where the rebuild stops climbs down from the top to just above `lex.o`. Switching the edit to "saved as is" then shows timestamp alone still rebuilding three targets.',
        'The code panel, titled "Verdict and propagation", starts empty with a "+ Add language" button; the chosen language shows the rule applied to each target and highlights keep, rebuild or hold as each target is judged. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article compares make-style timestamp checks with content-hash build systems and needs one project where the three strategies do measurably different amounts of work for the same edit.',
      'A reader asks why editing a comment rebuilt everything, and the article wants to show which strategy stops that and at which node the propagation is cut off.',
    ],

    avoidWhen: [
      'The article is only about the idea that untouched parts of a build are skipped, without caring how a change is detected. The three verdict rules would distract.',
      'The subject is remote caching, distributed builds or sandboxing. Everything here is a single local rebuild.',
      'The point is layer caches in container images, where each key includes the previous layer\'s key. Nothing here chains keys that way.',
    ],

    contrastWith: [
      {
        concept: 'onlyWhatChanged',
        note: 'Skipping targets whose inputs did not change assumes the build already knows what changed; the strategies differ precisely in how they decide that, and so in how much they skip.',
      },
      {
        concept: 'timestampVsFingerprint',
        note: 'Timestamp against input hash is one pair of strategies meeting one kind of edit. Adding output hashing and varying the edit shows a ladder in which each step filters out one more kind of non-change.',
      },
      {
        concept: 'cacheInvalidation',
        note: 'Both reuse earlier results unless something upstream changed. In a build graph the change travels only to the targets that use it; in a linear layer cache every later layer is keyed on the one before, so it travels to the end.',
      },
      {
        concept: 'pinWhatWasChosen',
        note: 'A lockfile keeps dependency choices identical between runs so results are reproducible; incremental build assumes inputs may change and decides how much of the previous output is still valid.',
      },
    ],
  },
};
