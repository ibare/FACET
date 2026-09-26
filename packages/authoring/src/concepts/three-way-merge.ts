/**
 * threeWayMerge 개념 선언.
 *
 * canonical facet 은 `facet:threeWayMerge` — 여섯 줄 조상(base)에서 갈라진 우리 쪽과 그쪽을 3-way 로 합친다.
 * 손잡이 둘: 우리 쪽이 한 일(한 줄 고침 · 덩이 옮김, 처음 한 줄 고침) · 그쪽이 고친 줄 t(1~6, 처음 4).
 * 한 줄 고침에서는 t = 3 · 4 · 5 가 충돌이다 — 같은 줄(4)만이 아니라 바로 옆 줄도. t = 2 · 6 처럼 사이에 안정 줄이 하나라도
 * 끼면 깨끗이 합쳐진다. 덩이 옮김에서는 여섯 가운데 다섯이 충돌하고 t = 4 하나만 깨끗하다.
 *
 * ── 묶음 안에서의 자리 (완제품 둘 + 조각 일곱 가운데 병합 쪽)
 *
 * 조각 넷은 각각 한 장면이다 — 누가 고쳤는지 조상이 가른다(`ancestorAsReferee`) · 한쪽만 고친 자리는 그쪽 줄을
 * 옮겨 담는다(`oneSideChanged`) · 같은 줄을 둘이 다르게 고치면 멈춘다(`bothTouchedSameLine`) · 옮김은 지움과 넣음이다
 * (`moveLooksLikeRewrite`). 이쪽은 손잡이로 **충돌의 경계가 어디인가**를 몰아 본다 — 경계는 "같은 줄" 이 아니라 두 고침
 * 사이에 아무도 안 건드린 줄이 끼어 있느냐다. 그래서 definition 은 unchanged line between · adjacent · chunks ·
 * moved block widens 를 쥐고, 조각들이 독점한 who changed · take the edited side · both versions between markers ·
 * no move operation 을 쓰지 않는다.
 *
 * 전제 (설명 글 `threeWayMerge.md`):
 *  - 줄 diff 는 LCS 로 걷는 diff 이고 글자 그대로 견준다. 바꿈은 없다.
 *  - 이 모형은 git 의 xdiff 병합을 단순화한 diff3 이다. 붙어 있는 두 고침은 git 도 이 모형도 충돌로 본다. diff 알고리즘과
 *    충돌 구간을 줄이는 세부 규칙은 다르다.
 *  - 충돌 표식 뒤의 `ours` · `theirs` 는 git 에서는 브랜치 이름이나 커밋이다. diff3 · zdiff3 꼴(`|||||||`)은 쓰지 않는다.
 *  - 파일 줄은 가상 표기다. 코드 패널은 덩이 판정만 IR 하나에서 여섯 언어로 옮긴 것이고 diff 자체는 패널 밖이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const threeWayMergeConcept: FacetConceptSource = {
  id: 'threeWayMerge',
  label: 'Three-Way Merge (Where Clean Merges Turn into Conflicts)',
  canonicalFacet: 'facet:threeWayMerge',

  surface: {
    definition:
      'A three-way merge splits the files into chunks at lines neither side touched, so two edits combine cleanly only if an unchanged line lies between them; adjacent edits or a moved block end in conflict.',
    exemplarKeywords: [
      'three-way merge',
      'git merge conflict',
      'why did git report a conflict',
      'diff3 algorithm',
      'merge base',
      'adjacent line changes conflict',
      'conflict on neighbouring lines',
      'moving code causes merge conflicts',
      'cherry-pick conflict',
      'xdiff merge',
    ],
  },

  briefing: {
    observable: [
      'Four columns: Ours, Ancestor, Theirs and Merged result. The ancestor is six lines, from `let rate = 2` to `show cost(3)`. With the defaults, ours changes line 4 to `    let c = n * rate * 2` and theirs changes the same line to `    let c = n + rate`; the round opens "Ours: edited one line · theirs edited ancestor line 4".',
      'A round takes four or five steps. Bands over the ancestor mark the lines each side touched ("Ancestor lines touched — ours 4 · theirs 4"); the untouched lines are stable, and "Stable lines cut the files into 3 chunks"; each chunk gets a verdict tag — stable, take ours, take theirs, same change or conflict.',
      'When a chunk conflicts, it swells inside the result between `<<<<<<< ours`, `=======` and `>>>>>>> theirs` ("Conflict at ancestor lines 4: ours 1 lines vs theirs 1 lines"), and the round ends "The merge stops: a person has to choose between the markers". A clean round ends "No conflict: every chunk had a side to take".',
      'With ours editing line 4, "Line they edited" 3, 4 and 5 conflict and 1, 2 and 6 merge cleanly. Moving from 3 to 2 opens line 3 as a stable line between the two bands and the conflict disappears; 3 and 5 conflict although they are different lines from 4.',
      'With "moved a block", ours moves lines 1–2 below line 5 without changing a character. The line diff records that as a deletion at the top and an insertion further down, so ours now touches two places, and five of the six settings conflict; only line 4 merges cleanly.',
      'Readouts are Stable lines, Conflicts and Result lines (markers included): at the defaults 5, 1 and 10. Lines are compared as exact text with no substitution. The model is a simplified diff3 that, like git, treats edits on adjacent lines as one conflict; git names branches after the markers instead of `ours` and `theirs`.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "What we did" with two positions (edited one line — the default — and moved a block) and a six-position "Line they edited" slider from 1 to 6, starting at 4. Each change replays the merge; bands and result lines glide from their previous places.',
        'The move that makes the idea land is stepping "Line they edited" from 4 down to 2: 4 and 3 conflict, 2 does not, because only at 2 is there an untouched line between the two edits. Switching to "moved a block" and stepping again shows the conflicts spreading.',
        'The code panel, labelled "Chunk verdicts (diff3)", shows the per-chunk decision in a chosen language (Python, JavaScript, TypeScript, Java, C++ or C#) — stable lines closing chunks and the conflict, result-line and stable-line counts. The line diff itself is outside the code. It carries one meaning across the languages.',
      ],
    },

    useWhen: [
      'The article needs to explain why git reported a conflict when two people changed different lines, and wants the rule in view: the edits must be separated by at least one line nobody touched.',
      'A reader asks why reorganising or moving code in one branch produces conflicts across a whole file when another branch edits nearby, and the article wants the two sides of that move shown as separate touched regions.',
    ],

    avoidWhen: [
      'The article is about how to resolve a conflict, merge tools or choosing ours and theirs strategies. The screen stops at the conflict markers.',
      'The subject is the commit graph — finding the merge base, rebasing or fast-forwarding. Only the three versions of one file appear.',
      'The subject is semantic or structural merging of code. Every comparison here is on whole lines of text.',
    ],

    contrastWith: [
      {
        concept: 'ancestorAsReferee',
        note: 'Using the ancestor to tell who changed a line is the ingredient; the merge claim is about what happens when both sides changed things near each other, and where the line between clean and conflicting falls.',
      },
      {
        concept: 'oneSideChanged',
        note: 'Taking the changed side where only one side changed is the easy verdict; the whole merge is judged by when that verdict is no longer available, which includes edits that never touch the same line.',
      },
      {
        concept: 'bothTouchedSameLine',
        note: 'Two different edits to one line are the obvious conflict. The wider claim is that edits merely next to each other also conflict, because nothing unchanged separates them.',
      },
      {
        concept: 'moveLooksLikeRewrite',
        note: 'That a line diff sees a move as a deletion plus an insertion is a fact about diffing two files; in a merge the consequence is that a move touches two regions and invites conflicts at both.',
      },
      {
        concept: 'pickOneOut',
        note: 'Applying one commit elsewhere carries a single change onto a new base, and it succeeds or conflicts by the same three-way rule; this is that rule on its own, without any commit history.',
      },
      {
        concept: 'whereTheyParted',
        note: 'Finding the common ancestor is a search in commit history; the merge takes that ancestor as given and works only on the lines of three files.',
      },
    ],
  },
};
