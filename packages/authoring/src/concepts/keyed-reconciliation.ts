/**
 * keyedReconciliation 개념 선언.
 *
 * canonical facet 은 `facet:keyedReconciliation` — 완제품. 손잡이 둘(키 모드 · 목록
 * 바뀜)을 조합해 열다섯 판을 모두 돌려 볼 수 있다. 옛/새 목록 미리보기 위에 실제
 * 목록이 있고, 실제 목록의 각 노드는 키 모드에 따라 자리(`p:<번호>`)나 값(`k:<문자열>`)
 * 으로 정체성을 지킨다. 판마다 고침·만듦·지움·옮김 수를 계기로 세고, 끝에는 눌린
 * 칸이 옳은 값 곁에 남았는지 · 엉뚱한 값 곁으로 샜는지 · 지워진 노드와 함께
 * 사라졌는지를 캡션으로 밝힌다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **모드 자체를 손잡이로 쥔 것**을 맡는다 — 같은 목록 변화를 위치
 * 매칭과 키 매칭 양쪽으로 돌려 결과가 갈리는 것을 견주는 것이 요점이고, definition
 * 의 주어도 "매칭 방식의 선택"이다. 조각 넷은 각각 이 매칭이 구체적으로 무엇을
 * 하는지의 한 대목만 고정해서 보여준다 — `sideBySideTrees`(트리 전체를 훑는 매칭의
 * 틀) · `typeChangeRebuild`(그 틀에서 종류가 다를 때) · `missingKeyRemount`(위치
 * 매칭 한 가지가 목록에서 상태를 잘못 붙이는 사례) · `keyReorder`(키 매칭이 차례
 * 바뀜에서 옮김을 최소로 줄이는 사례). exemplarKeywords 는 "React/가상 DOM
 * 재조정"이라는 응용 자리를 이 개념에만 두고, 조각들은 각자의 좁은 현상 어휘를
 * 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keyedReconciliationConcept: FacetConceptSource = {
  id: 'keyedReconciliation',
  label: 'Keyed Reconciliation (Position vs. Key Matching)',
  canonicalFacet: 'facet:keyedReconciliation',

  surface: {
    definition:
      'Matching old and new list nodes by position or by an explicit key before applying a change: the choice decides how many patches, creations, deletions and moves the same list edit produces, and whether state attached to a node follows its value or drifts onto a different one.',
    exemplarKeywords: [
      'React reconciliation',
      'virtual DOM diffing',
      'key prop in a list',
      'keyed vs unkeyed rendering',
      'position-based matching',
      'list diffing algorithm',
      'patch create delete move counts',
      'state follows the wrong element',
      'why React asks for a key',
      'diffing algorithm for UI trees',
    ],
  },

  briefing: {
    observable: [
      'Two small chip rows above the main list preview the old and the new list side by side, tag included, with a dot marking the chip that carries the checked item.',
      'A segmented slider switches the key mode among none, by position and by key; a second segmented slider switches the list change among prepend, append, remove first, reverse and change tag.',
      'The real list below is the only thing that actually moves: nodes patch their text in place, new nodes rise from the side, removed nodes shrink and fade, and reordered nodes slide to a new row — all without touching nodes the step did not name.',
      'A metrics row tallies patched, created, deleted and moved, reset to zero at the start of every round even when a round changes nothing.',
      'The code panel highlights compare-tag, patch, create, delete or move in step with whichever move is currently animating.',
      'When the change also swaps the list tag, every node is deleted and recreated regardless of which key mode is selected — key mode only matters when the tag stays the same.',
      'A closing caption states outright whether the checked mark stayed on the same value, ended up beside a different one, or disappeared with a deleted node.',
    ],

    screen: {
      affordances: [
        'Play, step, pause, reset and a speed slider drive one round of the animation at a time.',
        'A key-mode slider (none / by position / by key) and a list-change slider (prepend / append / remove first / reverse / change tag) pick which of fifteen combinations plays next; changing either one replays the round from its start.',
        'A code panel beside the stage highlights the phase of the algorithm currently running.',
      ],
    },

    useWhen: [
      'The article claims a list needs keys and the reader has no way to see what goes wrong without one — this plays the same edit under "none" and under "by key" back to back and counts the difference in patches, creates, deletes and moves.',
      'The point is that matching mode, not the edit itself, decides whether a piece of attached state (a checked box) survives on the right value. The closing caption names exactly where that state ended up under each mode.',
      'The article wants a single screen that covers several kinds of list edits (insert at front, insert at back, remove, reverse) rather than committing to one, since the second slider swaps the edit without touching the key-mode question.',
    ],

    avoidWhen: [
      'The subject is a single edit under a single fixed matching rule and nothing is compared against an alternative. A narrower screen that is not asking "what if we matched differently" says that more directly.',
      'The article is about tree structure — nested elements of different types swapping out subtrees. This works on a flat list; the tag-change round tears down and rebuilds everything rather than showing a partial subtree rebuild.',
      'The claim concerns the visitor order or per-property patching used to compare one pair of nodes, rather than which of several node pairs get matched to each other in the first place.',
    ],

    contrastWith: [
      {
        concept: 'sideBySideTrees',
        note: 'This holds the matching rule as a variable across a flat list of siblings; that concept fixes position-based matching and instead walks a nested tree top to bottom, one pair of nodes at a time.',
      },
      {
        concept: 'typeChangeRebuild',
        note: "Changing the tag here discards and recreates the whole list at once as one demonstration of what a type mismatch costs; that concept isolates the same bail-out rule inside a tree walk, one mismatched branch among matching siblings.",
      },
      {
        concept: 'missingKeyRemount',
        note: 'This lets a reader turn key mode on and off and compare the counts; that concept fixes key mode off and follows a single insertion all the way to where the checked state ends up, without an alternative to compare against.',
      },
      {
        concept: 'keyReorder',
        note: 'This treats reordering as one of five edits a slider can select, alongside insertion and removal; that concept isolates reordering alone and exposes the lookup table and the stay-or-slide rule behind why some keys move and others do not.',
      },
    ],
  },
};
