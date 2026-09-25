/**
 * shortestFirst 개념 선언.
 *
 * canonical facet 은 `facet:shortestFirst` — 틱 0 에 모두 와 있는 A 7 · B 4 · C 1 · D 3 을 도착 차례로 세운 뒤,
 * 가장 짧은 것을 한 자리씩 앞으로 당긴다. 대기 합 30 → 21 → 16 → 13, 평균 7.50 → 3.25. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `schedulingPolicy` 는 도착이 흩어진 일감에서 비선점 SJF 가 거의 못 줄이는 것을 보인다. 이쪽은 모두가 와
 * 있을 때의 한 셈 — **한 일의 길이는 뒤에 선 수만큼 대기 합에 곱해 들어가므로 짧은 것부터가 합을 가장 작게
 * 한다** — 하나다. 틱마다의 누적(`convoyEffect`) · 계속 오는 도착(`starvationOfLong`)은 없다. definition 은
 * all present · increasing length · minimizes · counted once for every job after it 을 독점한다.
 *
 * 전제: 틱 단위, CPU 하나, 입출력 없음, 바꾸는 비용 0. 동률은 줄에 먼저 선 것(이 예에는 없다).
 * SJF 는 길이를 미리 안다고 가정한다 — 실제로는 지난 실행에서 짐작한다. 새 도착이 없어 기아는 드러나지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shortestFirstConcept: FacetConceptSource = {
  id: 'shortestFirst',
  label: 'Shortest Job First Minimizes Average Wait',
  canonicalFacet: 'facet:shortestFirst',

  surface: {
    definition:
      'When all jobs are present, ordering them by increasing length minimizes total waiting, because each job\'s length is counted once in the wait of every job placed after it.',
    exemplarKeywords: [
      'shortest job first',
      'SJF scheduling',
      'SJF is optimal for average waiting time',
      'proof that SJF minimizes waiting time',
      'shortest processing time first',
      'exchange argument',
      'sort jobs by burst time',
      'SPT rule',
      'minimize average completion time',
    ],
  },

  briefing: {
    observable: [
      'Four jobs sit in rows, all ready at tick 0: "Ready at tick 0: A, B, C, D", with lengths A 7, B 4, C 1, D 3 drawn as "Length (ticks)".',
      'To the right of each row a band shows what runs ahead of it while it waits ("Running ahead while waiting (ticks)"). Going down the rows the band grows by one job each time, so a job\'s length reappears once in every row below it; labels like `7×3` under the bands give each column\'s height.',
      'In arrival order A · B · C · D the waits are 0, 7, 11, 12: "In arrival order — wait total: 30 · average: 7.50". The longest job is first, so its 7 is multiplied into three rows.',
      'Then shortest-first pulls the shortest remaining job up one slot at a time: "Shortest left: C → slot 1 — wait total: 21 · average: 5.25"; A and B shift down one row and D stays put. D goes to slot 2 (total 16), B to slot 3 (13), and A takes the last slot, where no one stands behind it, so the total stays 13.',
      'The final step overlays the arrival-order waits as dotted lines: "Average wait — arrival order: 7.50 · shortest first: 3.25". Total run time is 15 ticks in both orders; only who waits for whom changed. The totals in the middle steps are for "already-picked jobs first, the rest in arrival order".',
      'Ticks are model units; one CPU, no I/O, no switching cost. Lengths are assumed known in advance, and no new job arrives, so the risk of a long job being postponed indefinitely does not arise here.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through seven steps and stops on the comparison of the two averages.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to the first pull holds C jumping to the front with the two rows it passed shifting down.',
      ],
    },

    useWhen: [
      'The article claims SJF is optimal for average waiting time and wants the reason shown, not asserted: a length placed early is paid once by every job behind it.',
      'A reader asks why putting short jobs first helps when total work is unchanged, and the article needs the same four jobs in both orders with the sums 30 and 13.',
    ],

    avoidWhen: [
      'The article is about jobs arriving over time, preemption, or shortest remaining time first. All four are present at tick 0 and nothing interrupts.',
      'The subject is starvation of long jobs under SJF. No new jobs arrive, so no job is postponed.',
      'The article is about predicting burst lengths (exponential averaging). Lengths are given.',
    ],

    contrastWith: [
      {
        concept: 'convoyEffect',
        note: 'The convoy effect shows waiting accumulating behind a long job at the front; shortest-first is the argument for why moving that job to the back minimizes the total.',
      },
      {
        concept: 'starvationOfLong',
        note: 'Shortest-first is optimal for a fixed set of jobs. With arrivals that keep coming, the same rule can postpone a long job without limit.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'The optimality holds when every job is present at once. When a long job has already started, non-preemptive shortest-first gains almost nothing, and the benefit requires preemption.',
      },
    ],
  },
};
