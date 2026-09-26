/**
 * timestampVsFingerprint 개념 선언.
 *
 * canonical facet 은 `facet:timestampVsFingerprint` — 규칙 셋(`main.o ← main.c`, `util.o ← util.c`,
 * `app ← main.o · util.o`)을 두 쪽에 나란히 세운다. `util.c` 를 10:05 에 한 글자도 바꾸지 않고 다시 저장하면,
 * 왼쪽 "Judged by time" 은 `util.o`(10:06) · `app`(10:07) 을 다시 세워 2, 오른쪽 "Judged by fingerprint" 는 지문
 * `9b20a5` 가 그대로라 0. 걸음 다섯(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `incrementalBuild` 는 판정 방식 셋과 고친 모양 셋을 손잡이로 돌린다. 이 조각은 그중 **한 사건(내용 그대로 다시
 * 저장)을 두 판정이 동시에 받아 갈라지는** 장면 하나다 — 출력 지문도, 주석 고침도 없다. 그래서 definition 은 saved again
 * with identical content · newer · sees no change · rebuilds nothing 을 쥐고, 완제품의 early cutoff · comment-only ·
 * how far up the graph 를 쓰지 않는다. `onlyWhatChanged` 와는 "무엇이 바뀌었나를 어떻게 아나" 대 "바뀐 것이 어디로
 * 번지나" 로 갈린다.
 *
 * 전제 (설명 글 `timestampVsFingerprint.md`): 왼쪽은 make 꼴, 오른쪽은 Bazel 같은 내용 지문 꼴. 오른쪽은 대상 입력을
 * "이번에 다시 세워졌는가" 로 판정하고 조기 차단은 넣지 않았다. 지문은 FNV-1a 32 비트 앞 여섯 자(실제는 SHA-256 등).
 * 시:분 시각과 "세우는 데 1 분" 은 예로 정한 값. 소스 내용은 어느 언어도 아닌 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const timestampVsFingerprintConcept: FacetConceptSource = {
  id: 'timestampVsFingerprint',
  label: 'Timestamp vs Content Fingerprint on a Resave',
  canonicalFacet: 'facet:timestampVsFingerprint',

  surface: {
    definition:
      'When a source file is saved again with identical content, a build judging by modification time sees it as newer and rebuilds its dependents, while one comparing content fingerprints sees no change and rebuilds nothing.',
    exemplarKeywords: [
      'mtime vs content hash',
      'touch triggers rebuild',
      'file saved without changes rebuilds',
      'modification time comparison',
      'make newer than target',
      'content hashing build tool',
      'Bazel digest',
      'git checkout updates timestamps',
      'spurious rebuild',
      'stale detection by timestamp',
    ],
  },

  briefing: {
    observable: [
      'Two panels stand side by side, "Judged by time" and "Judged by fingerprint", each with the same three rules: `main.o` from `main.c`, `util.o` from `util.c`, `app` from both objects. The sources hold `show add(2, 3)` and `function add(a, b)`. The time panel tags each file with a time (`main.c` 09:00, `util.c` 09:02, objects 09:10, `app` 09:11); the fingerprint panel tags sources with fingerprints (`0ab5a2`, `9b20a5`) and targets with "kept" fingerprints.',
      'The start reads "After the last build: file times and kept fingerprints." Then one save lands on both panels at once: "Saved again: util.c 10:05". On the time side `util.c` now reads 10:05; on the fingerprint side its fingerprint is still `9b20a5`.',
      'The two panels judge the same target in the same step. For `main.o` the time side shows `09:00 ≤ 09:10` and keeps it; the fingerprint side shows the stored and current fingerprints equal.',
      'For `util.o` the time side shows `10:05 > 09:10` and rebuilds it, stamping 10:06; the fingerprint side shows `9b20a5 = 9b20a5` and keeps it.',
      'For `app` the time side shows `10:06 > 09:11` and rebuilds it at 10:07; the fingerprint side reports "No input rebuilt" and keeps it. The counters end at "Rebuilt: 2" on the left and "Rebuilt: 0" on the right.',
      'Five steps including the start. The fingerprint side decides a target input by whether it was rebuilt this time, not by the content of its output. Fingerprints are short FNV-1a hashes shown as six hex digits, the times are example values, and the source lines are in a small language-neutral notation; the screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one target per step on both panels together, and stops after `app`.',
        'A Replay button and a timeline strip sit below. Dragging the strip to the `util.o` step holds the one moment where the two panels disagree side by side.',
        'The files, times and the save are fixed, so an article can quote every comparison exactly as it appears.',
      ],
    },

    useWhen: [
      'A reader wonders why touching a file, switching branches or regenerating an unchanged file triggers a rebuild, and the article needs the time comparison to fire while the content is visibly identical.',
      'The article argues for content hashing in a build tool and needs one event on which the two rules give different answers, with the rebuild counts side by side.',
    ],

    avoidWhen: [
      'The edit in the article really changes the content. On a real change both rules here rebuild the same targets.',
      'The subject is stopping the rebuild when a rebuilt output turns out identical. Neither panel compares outputs.',
      'The point is the cost of hashing large trees. Only the outcome of each rule is shown, not how long it takes.',
    ],

    contrastWith: [
      {
        concept: 'incrementalBuild',
        note: 'A resave is the one edit on which time and content disagree. Placing both rules among a wider set of strategies and edits shows that content hashing still rebuilds on a comment change unless outputs are compared too.',
      },
      {
        concept: 'onlyWhatChanged',
        note: 'Deciding whether a file changed comes before deciding what must be redone because of it; this claim is about the first decision, that one about the second.',
      },
      {
        concept: 'invalidationCascade',
        note: 'Both use content fingerprints. Here an unchanged fingerprint stops work at once; in a chained layer key, one changed fingerprint alters every key after it regardless of their own inputs.',
      },
    ],
  },
};
