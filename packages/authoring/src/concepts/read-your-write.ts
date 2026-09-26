/**
 * readYourWrite 개념 선언.
 *
 * canonical facet 은 `facet:readYourWrite` — 사본 셋(`r1` 리더 · `r2` · `r3` 뒤따르는 사본)이 `k = 3` · 번호 1 로 서고,
 * 클라이언트 A 가 틱 0 에 `r1` 에 `k = 5` 를 써 번호 2 를 제 손에 든다. A 의 읽기는 번호 2 를 들고 가서 못 미치는 사본에
 * 돌려보내지고, 같은 `r2` 가 번호 0 인 B 에게는 옛 값 3 을 내준다. 스스로 재생하고 멈춘다(걸음 아홉).
 *
 * ── 묶음 안에서의 자리
 *
 * `consistencyModel`(완제품)은 가십 속도와 읽기 규칙을 돌려 옛값 읽기 ↔ 돌려보냄의 맞바꿈을 보인다. 이쪽은 그 규칙
 * 하나의 장면 — **쓴 사람 한 명**이 번호를 들고 다니고, 보장은 그 사람의 것이지 다른 사람의 것이 아니다. 그래서
 * definition 은 own write · version the client remembers · another client 쪽 낱말을 쥐고, 가십 · fanout · 라운드 ·
 * 도장이 이긴다는 말을 쓰지 않는다.
 *
 * 전제 (화면 각주 없음 — 설명 글 `readYourWrite.md`):
 *  - 틱은 예로 정한 단위다. 사본이 새 번호를 받는 틱(`r3` 3 · `r2` 5)은 데이터가 준다 — 복제가 왜 늦는지는 말하지 않는다.
 *  - 읽기가 처음 물을 사본도 데이터가 준다.
 *  - 번호를 들고 다니는 것은 한 방법이다. 리더에서 읽거나 쓴 뒤 잠깐 리더에 붙는 방식도 쓴다.
 *  - 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const readYourWriteConcept: FacetConceptSource = {
  id: 'readYourWrite',
  label: 'Read-Your-Writes (Client Carries Its Write Version)',
  canonicalFacet: 'facet:readYourWrite',

  surface: {
    definition:
      'A client that remembers the version of its own write and is turned away by any replica behind that version always reads back what it wrote, while another client can still get the old value there.',
    exemplarKeywords: [
      'read-your-writes consistency',
      'read-after-write consistency',
      'session consistency',
      'I updated my profile but still see the old one',
      'client-side version token',
      'causal consistency token',
      'MongoDB causally consistent session',
      'sticky session to the primary',
      'read from replica after write',
      'per-client consistency guarantee',
    ],
  },

  briefing: {
    observable: [
      'Three replicas stand side by side: `r1` marked "leader", `r2` and `r3` marked "follower". All start at `k = 3`, "number 1". Two clients, "Client A" and "Client B", each show "number 0" and an empty "values read" list.',
      'At "Tick 0" Client A writes `k = 5` to `r1`: the leader goes to number 2 and Client A now carries number 2 ("Client A now carries number 2").',
      'At Tick 1 A\'s read goes first to `r2`. The replica shows `1 < 2` and turns A away ("r2 is at number 1, below the 2 that Client A carries. Turned away. Next: r3."); `r3` does the same, and `r1` answers with `2 ≥ 2`, so A reads 5. A counter "Turned away" climbs with each refusal.',
      'At Tick 2 Client B reads from the same lagging `r2`. B carries number 0, the replica shows `1 ≥ 0`, and B reads the old value 3.',
      'At Tick 3 `r3` catches up ("r3 catches up with r1: k = 5, number 2"). At Tick 4 A goes to `r2` again, is turned away once, and reads 5 from `r3`.',
      'The run ends after nine steps counting the start: A has read 5 and 5, B has read 3, "Turned away: 3", and the replicas stand at `r1` 5 / number 2, `r2` 3 / number 1, `r3` 5 / number 2 — `r2` stays behind for the whole run.',
      'Ticks are an example unit, and when each follower receives the new number (`r3` at tick 3, `r2` at tick 5, after the run ends) is given by the data, not explained. Which replica each read tries first is also given. Carrying a version number is one way to provide this guarantee; systems also send the writer\'s reads to the leader, or pin them there for a while after a write. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine steps by itself and stops after A\'s last read.',
        'A Replay button and a playback strip sit below it. Dragging back to Tick 2 holds the moment the replica that just turned A away serves B the old value.',
        'Every value, number and tick is fixed, so an article can quote the captions and comparisons such as `1 < 2` exactly as they appear.',
      ],
    },

    useWhen: [
      'The article explains why a user who just saved something can see the old version on the next page load when reads go to replicas, and how a version token held by that user fixes it.',
      'A reader assumes read-your-writes means everyone sees the new value; the article needs the case where the same stale replica correctly serves the old value to a different client.',
    ],

    avoidWhen: [
      'The subject is why or by how much replication lags. The catch-up times here are simply given.',
      'The article is about monotonic reads, consistent prefix or linearizability in general. Only the guarantee for one writer reading its own write is shown.',
      'The topic is conflicting writes from several clients. There is a single write and a single writer.',
    ],

    contrastWith: [
      {
        concept: 'consistencyModel',
        note: 'The guarantee itself belongs to one writer and holds whatever the replicas are doing. How often that writer is sent elsewhere depends on how fast the replicas converge, which is where the trade against gossip speed comes in.',
      },
      {
        concept: 'replicationLag',
        note: 'Lag is the cause: a follower answers before the write has reached it. Read-your-writes is a remedy scoped to the writer, leaving everyone else exposed to the same lag.',
      },
      {
        concept: 'eventuallyAgrees',
        note: 'Eventual convergence promises that replicas agree once writes stop and says nothing about what a reader sees before that. Read-your-writes adds a promise for that window, but only to the client that wrote.',
      },
    ],
  },
};
