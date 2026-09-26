/**
 * parserStops 개념 선언.
 *
 * canonical facet 은 `facet:parserStops` — 조각. 속성 없는 `<script src>` 줄을 만나면
 * HTML 파서가 그 자리에서 멈춰 자원이 도착하고 실행을 마칠 때까지 다음 줄을 읽지
 * 않는다는 것 하나만 보인다. 문서 여섯 줄과 자원 하나(`chart.js`)는 고정.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (deferVsAsync 와)
 *
 * 둘 다 문서 속 script 줄의 파싱 영향을 다룬다. 갈라 세운 것은 **무엇이 멈추는가**다.
 *
 *   이 개념        속성이 아예 없을 때 파서 자체가 멈춰 선다는 것. 시각은 흐르는데
 *                  읽는 자리는 그대로다.
 *   deferVsAsync   속성이 있을 때(둘 다) 파서는 멈추지 않는다는 것 — 대신 두 스크립트가
 *                  "언제 실행되는가" 의 차례가 갈린다.
 *
 * 어휘 배타 — 이쪽은 freeze · stall · halt · reading position 을 쓰고, 저쪽의
 * execution order · document order · arrival order 를 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const parserStopsConcept: FacetConceptSource = {
  id: 'parserStops',
  label: 'Parser Stops (Unattributed Script Freezes Reading)',
  canonicalFacet: 'facet:parserStops',

  surface: {
    definition:
      'An HTML `<script src>` tag carrying no `defer` or `async` attribute halts the parser at that exact line until the script file arrives and finishes executing, before any later markup is read.',
    exemplarKeywords: [
      'parser-blocking script',
      'render-blocking script tag',
      'script with no attribute',
      'synchronous script tag',
      'blocking script',
      'HTML parser stalls on script',
      'script freezes parsing',
      'wait for script before continuing to parse',
      'why put script tags at the bottom of body',
      'plain script tag versus defer or async',
    ],
  },

  briefing: {
    observable: [
      'Six document lines sit in a column, each with a small dot beside it — grey while unread, highlighted while the parser sits on it, a different color once read — and a triangular cursor marks the current line.',
      'The instant the cursor reaches the unattributed `<script src="chart.js">` line, that dot switches to the stalled color and a request panel appears below naming the file.',
      'A bar in that panel fills toward the file\'s total size while an elapsed-time readout keeps counting upward, and the cursor does not move at all while it fills.',
      'Only once the bar reaches full does the cursor advance past the script line, and the closing caption states the exact number of milliseconds the reading position spent frozen there.',
      'An unread-lines count in the corner drops by one with every line the parser finishes, including the frozen script line, which only counts as read once the stall ends.',
    ],

    screen: {
      affordances: [
        'A Replay button and a timeline scrub strip beneath the stage are the only controls — the six lines and the one script are fixed, so the reader can drag to any moment of the read, including the middle of the stall.',
      ],
    },

    useWhen: [
      'The article says a script tag in the head "slows down the page" without showing what that delay actually is — a reading position that stops moving while a network request runs, then resumes exactly where it left off.',
      'The reader needs to see that nothing about later markup — later paragraphs, later tags — is touched or skipped during the stall; the parser is not working around the script, it is simply not advancing.',
    ],

    avoidWhen: [
      'The article compares `defer` against `async`. Both keep the parser moving; only the complete absence of either attribute produces the freeze shown here.',
      'The subject is why a stylesheet leaves the screen blank after the DOM is complete. That is a paint delay after parsing finishes, not a parser stall.',
      'The point is which head resources block first paint in general, across several resources of different kinds.',
      'The article means `document.write` specifically inserting new markup mid-parse rather than a plain external script request.',
    ],

    contrastWith: [
      {
        concept: 'deferVsAsync',
        note: 'This is the frozen case: no attribute leaves the parser stopped in place until the script finishes. That shows what happens once either attribute is added instead — the parser never stops, and the two scripts merely finish in a different order.',
      },
      {
        concept: 'criticalPath',
        note: 'This isolates one script with no attribute freezing the parser; that lets the reader choose none, defer, or async instead and watch the parser-stop disappear along with the rest of the same document\'s timeline.',
      },
    ],
  },
};
