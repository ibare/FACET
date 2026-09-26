/**
 * linker 개념 선언.
 *
 * canonical facet 은 `facet:linker` — 파일 셋(main.o · shape.o · calc)을 링커가 잇는다. 해석(파일 하나 = 한 걸음) ·
 * 놓기 · 고치기. 손잡이 둘 — 링크 차례(main · shape · calc / calc · main · shape / main · calc · shape, 처음 첫째) ·
 * calc 의 꼴(오브젝트 · 라이브러리, 처음 라이브러리). 라이브러리가 맨 앞에 서는 칸 하나만 "정의 없음" 으로 멈추고,
 * 나머지는 차례에 따라 같은 칸의 수가 옮겨 간다(`shape.o+0` 이 `+12` · `-28` · `-12`).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `resolveSymbols` 는 셋 다 오브젝트인 채 항목 하나씩 기다리다 이어지는 장면, `relocateAddresses` 는 한 차례의 놓기와
 * 칸 고치기 장면이다. 이쪽은 **차례와 꼴을 바꿨을 때 링크가 깨지는가, 고친 수가 어떻게 옮겨 가는가**를 맡는다. 그래서
 * definition 은 link order · static library · undefined symbol · 순서를 바꾼다 쪽 낱말을 쥐고, 조각이 독점한 waiting
 * hole · relocation entry · S − P 공식을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `linker.md` 가 밝힌 것):
 *  - 명령 4 바이트 · 놓는 자리 @1000 · @2000 은 예로 정한 값. 명령은 가상 레지스터 기계의 교과서 표기다.
 *  - 상대 칸은 고칠 명령 자신의 주소에서 잰다(S − P). 실제 CPU 는 대개 다음 명령에서 재서 −4 가 붙는다.
 *  - 한 번 훑는 링커의 규칙이다. 라이브러리를 다시 훑는 링커 · 되풀이 옵션이 따로 있다.
 *  - 코드 패널은 파일이 아니라 잇고 고치는 링커(IR → 여섯 언어)다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linkerConcept: FacetConceptSource = {
  id: 'linker',
  label: 'Linker (Link Order and Static Libraries)',
  canonicalFacet: 'facet:linker',

  surface: {
    definition:
      'Link order decides whether a static library is pulled in and where every section lands, so reordering the same inputs can end in undefined symbols or change the addresses written into the code.',
    exemplarKeywords: [
      'linker',
      'static linking',
      'link order matters',
      'undefined reference error',
      'static library .a archive',
      'libraries must come after objects',
      'ld',
      'gcc -l order',
      'ELF object file',
      'symbol resolution and relocation',
      'executable layout',
    ],
  },

  briefing: {
    observable: [
      'Three file cards: `main.o` (`D main` · `D count` · `U area` · `U width`, four text lines and 8 bytes of data), `shape.o` (`D area` · `U square`, three lines), and `calc` (`D square` · `D width`, three lines and 4 bytes of data), shown as `calc.o` or `libcalc.a` depending on the handle. Address fields start as `@0` and `+0`. A memory band runs text @1000–@1039 and data @2000–@2011, and a "Waiting" list sits above.',
      'Resolving takes one step per file: "Read main.o · Defines main, count · Waiting area, width", then "Read shape.o · Defines area · Filled area · Waiting width, square", then "Read libcalc.a (pulled in) · Defines square, width · Filled square, width". A library card that no waiting name needs is marked "Skipped" and not pulled in.',
      'Placing takes one step per linked file: "Place main.o · text @1000–@1015 · data @2000–@2007", then shape.o at @1016, then calc at @1028 with data @2008.',
      'Patching takes one step per address field: "Patch main.o+0 · ABS count: S = @2000 · load r1, @0 → load r1, @2000", "Patch main.o+4 · REL area: S − P = @1016 − @1004 = +12 · call +0 → call +12", and so on for five fields. The default round has 12 steps.',
      'With order `calc · main · shape` and calc as a library, `libcalc.a` is skipped because nothing is waiting yet, and the round ends in 5 steps with "Undefined" `width` and `square`; nothing is placed or patched. As an object file in the same order, everything links.',
      'Across orders the same fields take new values: `shape.o+0` (the call to `square`) is `+12`, `-28` or `-12`; `main.o+4` (the call to `area`) stays `+12` whenever main and shape sit next to each other and becomes `+24` when calc sits between them; `main.o+8` (width) is `@2008` or `@2000`.',
      'Readouts under the controls, current per step: "Waiting names", "Linked files", "Patched fields".',
      'Four-byte instructions and the start addresses @1000 and @2000 are chosen for the example; relative fields are measured from the patched instruction itself, whereas real CPUs usually measure from the next instruction; the linker makes one pass and never revisits a skipped library. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a three-position "Link order" slider (main · shape · calc, calc · main · shape, main · calc · shape), starting at the first, and a two-position "calc packaged as" slider (Object file, Library), starting at Library. Each round resets the fields to `@0` and `+0` and waits for a handle at the end.',
        'The move that makes the idea land is moving the library to the front and watching the link stop, then switching it to an object file and watching the same order succeed with different numbers.',
        'The code panel, labelled "Linker: resolve, place, patch", starts empty with a "+ Add language" button; the chosen language shows the linker function working on file and symbol numbers, not the files\' own code. It means the same across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains the classic "undefined reference" that disappears when a library is moved to the end of the command line, and needs the one order where a library is passed over.',
      'A reader asks why the addresses in an executable depend on the order object files are given, and the article wants the same call site changing from `+12` to `-28` as files swap places.',
    ],

    avoidWhen: [
      'The article is about dynamic linking, shared libraries, PLT/GOT or loading at run time. Everything here is static and resolved before running.',
      'The subject is weak symbols, duplicate definitions or section alignment. None occur in these three files.',
      'The point is name lookup inside one program\'s scopes. The names here cross file boundaries and are resolved by the linker, not the compiler.',
    ],

    contrastWith: [
      {
        concept: 'resolveSymbols',
        note: 'Filling a used name from a later definition is the resolution step on its own, with every file included. The linker claim adds that a library is included only if a name is already waiting, which makes order decide success.',
      },
      {
        concept: 'relocateAddresses',
        note: 'Patching fields from a fixed layout is one computation. The linker claim is that the layout itself follows the link order, so reordering moves the same fields to new values.',
      },
      {
        concept: 'resolveToDeclaration',
        note: 'Tying a name to its declaration by scope happens inside one compilation. Linking ties names across separately compiled files, after the compiler is done.',
      },
    ],
  },
};
