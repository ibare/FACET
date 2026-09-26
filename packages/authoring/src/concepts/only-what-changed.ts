/**
 * onlyWhatChanged 개념 선언.
 *
 * canonical facet 은 `facet:onlyWhatChanged` — 대상 일곱(`lex.o` · `parse.o` · `check.o` · `emit.o` ← 소스 하나씩,
 * `front.a ← lex.o · parse.o`, `back.a ← check.o · emit.o`, `tool ← front.a · back.a`)의 지난번 결과가 남은 채로
 * `emit.c` 하나를 고친다. 대상을 입력이 앞에 오는 차례로 하나씩 들여다보며 바뀐 입력이 있으면 다시, 없으면 그대로.
 * 끝에 다시 세움 3(`emit.o` · `back.a` · `tool`) · 그대로 4. 걸음 아홉(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `incrementalBuild` 는 "바뀌었는지를 무엇으로 아느냐" 를 손잡이로 갈아 끼우고, 짝 조각
 * `timestampVsFingerprint` 는 그 판정 둘을 나란히 견준다. 이 조각은 판정 방식을 묻지 않는다 — 무엇이 고쳐졌는지는
 * 주어지고, 주장은 "바뀜은 기대는 쪽으로만, 위로만 번진다" 하나다. 그래서 definition 은 depend on it · every other
 * target keeps its previous output · a sibling is not rebuilt 쪽을 쥐고, timestamp · hash · early cutoff 를 쓰지 않는다.
 *
 * 전제 (설명 글 `onlyWhatChanged.md`): 도구가 바뀜을 어떻게 알아내는지는 다루지 않는다. 다시 세운 결과가 우연히
 * 같아도 위는 멈추지 않는다(make 처럼 "다시 세웠으면 바뀐 것"). 대상의 출력 내용은 그리지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const onlyWhatChangedConcept: FacetConceptSource = {
  id: 'onlyWhatChanged',
  label: 'Rebuild Only What Depends on the Edit',
  canonicalFacet: 'facet:onlyWhatChanged',

  surface: {
    definition:
      'After one source file is edited, a rebuild redoes only the targets that depend on it, directly or through other redone targets, and every other target keeps its previous output untouched.',
    exemplarKeywords: [
      'rebuild only what changed',
      'skip unchanged targets',
      'minimal rebuild',
      'dirty targets',
      'out-of-date targets',
      'change propagates to dependents',
      'reuse previous build output',
      'recompile only affected files',
      'make only rebuilds what is needed',
    ],
  },

  briefing: {
    observable: [
      'Four sources (`lex.c`, `parse.c`, `check.c`, `emit.c`) sit under seven targets: an object file for each source, `front.a` from `lex.o` and `parse.o`, `back.a` from `check.o` and `emit.o`, and `tool` from both archives. At the start every target is tagged "previous" and a counter reads "Rebuilt: 0   Kept: 0   Not yet checked: 7".',
      'The first step marks `emit.c` "edited". The targets are then checked one at a time in the order `lex.o`, `parse.o`, `check.o`, `emit.o`, `front.a`, `back.a`, `tool`.',
      '`lex.o`, `parse.o` and `check.o` each show "Kept: … — no changed input" and turn "kept". `emit.o` shows "Rebuilt: emit.o — changed input: emit.c".',
      '`front.a` is kept because neither of its inputs changed. `back.a` is rebuilt ("changed input: emit.o") and then `tool` ("changed input: back.a").',
      'The run ends at "Rebuilt: 3   Kept: 4   Not yet checked: 0": only the narrow line `emit.o → back.a → tool` was redone. `check.o` feeds the rebuilt `back.a` yet stays kept, since change travels only toward the targets that use it.',
      'Nine steps including the start. Which source was edited is given, not detected, and a rebuilt target always counts as changed for the targets above it; the screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one target per step, and stops after `tool` is checked.',
        'A Replay button and a timeline strip sit below. Dragging the strip to the `back.a` step shows `check.o` already kept beneath a target that is being rebuilt.',
        'The graph and the edited file are fixed, so an article can quote the step captions and the final count as they appear.',
      ],
    },

    useWhen: [
      'The reader believes an edit forces the whole project to rebuild, and the article needs a case where most targets keep their previous output and only one path to the top is redone.',
      'The article warns that rebuilding a target does not drag its other inputs along, and needs a sibling input that stays kept under a rebuilt parent.',
    ],

    avoidWhen: [
      'The article is about how a build detects that a file changed — timestamps, hashes or anything else. That question is taken as already answered here.',
      'The subject is stopping propagation when a rebuilt output happens to be identical. A rebuilt target here always passes the change upward.',
      'The point is the first, clean build of a project. Every target here already has a previous output.',
    ],

    contrastWith: [
      {
        concept: 'incrementalBuild',
        note: 'Redoing only dependents is the shared goal; which files count as changed depends on the detection strategy, and that choice decides how much is actually skipped.',
      },
      {
        concept: 'timestampVsFingerprint',
        note: 'This claim takes the set of changed files as given and asks where the change travels; that one asks whether a save with identical content should count as a change in the first place.',
      },
      {
        concept: 'invalidationCascade',
        note: 'In a graph, a change reaches only the targets that use it, so siblings survive. In a single chain of layers, each key includes the one before it, so a change reaches everything after it.',
      },
      {
        concept: 'merkleTree',
        note: 'Both confine the effect of one changed leaf to the path above it. A hash tree recomputes digests along that path; a build redoes work along it and reuses everything off the path.',
      },
    ],
  },
};
