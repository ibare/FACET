/**
 * resolveSymbols 개념 선언.
 *
 * canonical facet 은 `facet:resolveSymbols` — 오브젝트 파일 셋(main.o · shape.o · calc.o)의 항목 여덟을 링커가 차례로
 * 읽는다. `U 이름` 은 정의가 아직 없으면 기다림 줄에 서고, 뒤 파일에서 같은 이름의 `D` 가 나오는 순간 이어진다. 이미
 * 정의된 이름은 기다리지 않는다. 빈 자리 넷이 모두 메워진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `linker` 는 차례와 라이브러리 꼴을 바꿔 링크가 깨지는가와 고친 수를 본다. 형제 `relocateAddresses` 는 주소를
 * 셈해 칸을 고친다. 이쪽은 **주소 없이 이름만 잇는** 장면 — 기다리던 자리가 정의를 만나 이어진다. 그래서 definition 은
 * unresolved · waiting · defined · 이어진다 쪽 낱말을 쥐고, library · address · section · 차례를 바꾼다는 말을 넣지 않는다.
 *
 * 전제: 셋 다 오브젝트 파일이라 모두 링크에 들어간다(라이브러리 묶음의 포함 여부는 다루지 않는다). 항목은 이름과 D · U 만 둔다 —
 * 실제 오브젝트 파일에는 약한 정의 · 지역 심볼 · 섹션이 더 붙는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const resolveSymbolsConcept: FacetConceptSource = {
  id: 'resolveSymbols',
  label: 'Symbol Resolution: A Used Name Waits for Its Definition',
  canonicalFacet: 'facet:resolveSymbols',

  surface: {
    definition:
      'Reading object files in sequence, the linker keeps each used-but-undefined name as an unresolved reference until a later file defines that name; a name already defined is resolved immediately.',
    exemplarKeywords: [
      'symbol resolution',
      'unresolved symbol',
      'undefined symbol U in nm output',
      'defined symbol D',
      'extern function in another file',
      'separate compilation',
      'symbol table of an object file',
      'how the linker finds a function',
      'multiple definition error',
    ],
  },

  briefing: {
    observable: [
      'Three object files in reading order with their entries: `main.o` — `D main` · `U area` · `U width`; `shape.o` — `D area` · `U square`; `calc.o` — `D square` · `D width` · `U area`. `D` means the file defines the name, `U` means it uses a name it does not define — a hole to fill. The start caption: "The linker reads the files in order. Each U entry is a hole to fill."',
      'One entry per step. `main.o` `U area` and `U width` find no definition and join the waiting line ("main.o uses area, not defined yet. The hole waits."); the "Waiting" counter reaches 2.',
      '`shape.o` `D area` fills the waiting `main.o` hole ("Holes filled by this definition: 1"), then `U square` joins the line.',
      '`calc.o` `D square` fills the `shape.o` hole and `D width` fills the `main.o` hole; the link line for `width` runs under the middle file, past `shape.o`.',
      'The last entry, `calc.o` `U area`, is joined at once because `shape.o` already defined it: "calc.o uses area, already defined in shape.o. Filled at once." The same name waited when `main.o` asked for it and did not when `calc.o` did — the difference is file order.',
      'The run takes nine steps and ends "Holes filled: 4 / 4" with four definitions (`main`, `area`, `square`, `width`); the waiting line was longest, 2, after the fourth and sixth steps. No addresses are computed.',
      'All three are object files, so every file is included; entries carry only a name and D or U. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one entry per step, and stops after the last entry of `calc.o`.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to the `shape.o` `D area` step holds the moment the waiting hole in `main.o` is joined.',
        'The files and their order are fixed, so an article can quote every entry and every join as shown.',
      ],
    },

    useWhen: [
      'The article explains how a call to a function defined in another source file gets connected, and needs the hole left by the compiler and the definition that fills it.',
      'A reader asks why the same missing name sometimes has to wait and sometimes resolves at once, and the article wants both cases for one name in one run.',
    ],

    avoidWhen: [
      'The article is about static libraries being skipped or link order causing failures. Every file here is always included and all holes are filled.',
      'The subject is computing final addresses or patching instructions. Only which file defines which name is decided.',
      'The point is variable lookup through nested scopes in one program. These are names across separately compiled files.',
    ],

    contrastWith: [
      {
        concept: 'linker',
        note: 'Resolution with every file included always succeeds when each name is defined somewhere. The linker claim adds libraries that join only on demand, which lets the order make a link fail.',
      },
      {
        concept: 'relocateAddresses',
        note: 'Resolution decides which definition a name refers to; relocation then decides the numeric address written into the instruction that uses it.',
      },
      {
        concept: 'resolveToDeclaration',
        note: 'Both bind a use to a definition. Scope resolution does it inside one compilation by nesting; symbol resolution does it between compiled files by name alone.',
      },
    ],
  },
};
