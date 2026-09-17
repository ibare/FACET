/**
 * matchFromBack 개념 선언.
 *
 * canonical facet 은 `facet:matchFromBack` — 조각(piece)이다. 글
 * `here is a simple example` 스물넷이 고정된 줄로 깔리고, 패턴 `example` 일곱이
 * 그 아래 슬래브로 다섯 자리를 옮겨 다닌다. 표지가 슬래브 오른쪽 끝에서 왼쪽으로
 * 짚어 오고, 본 글자 위에만 눈금이 선다. 끝에 가서 눈금 없는 열하나가 줄에서
 * 내려앉고 마지막 캡션이 견줌 열다섯 · 안 본 글자 열하나를 말한다. 계기도 코드
 * 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `badCharSkip` 과는 **방향과 근거**로 갈랐다. 이쪽 definition 의 주어는
 * **견주는 방향** 이다 — 마지막 글자부터 거꾸로 짚기에 뒤에서 한 번 어긋나면 자리
 * 하나가 통째로 닫히고 앞은 끝내 읽히지 않는다는 것. 저쪽은 **미는 거리의 출처**
 * (텍스트에서 만난 어긋난 글자)를 주어로 삼는다. 둘 다 "어긋나면 민다" 로 줄지
 * 않게, 이쪽은 아예 미는 말을 definition 에서 뺐다 — 얼마나 뛰는지는 이 화면이
 * 답하지 않는 질문이라 그것이 사실과도 맞는다.
 *
 * 같은 문자열 검색 형제인 `naiveShiftByOne`(버리는 일) · `prefixSuffixJump`(패턴이
 * 제 안에 가진 근거) 와도 주어가 겹치지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matchFromBackConcept: FacetConceptSource = {
  id: 'matchFromBack',
  label: 'Matching from the Back (Why the Front Goes Unread)',
  canonicalFacet: 'facet:matchFromBack',

  surface: {
    definition:
      'Comparing a pattern against an alignment from its final character backward, so that a single mismatch at the back settles the whole alignment while the characters ahead of it are never read.',
    exemplarKeywords: [
      'matching from the right',
      'comparing the pattern backwards',
      'right-to-left comparison',
      'Boyer-Moore scan order',
      'rule out a position in one comparison',
      'characters the search never examines',
      'sublinear string search',
      'reading less than the whole text',
      'why compare the last character first',
      'the front of the pattern is never looked at',
    ],
  },

  briefing: {
    observable: [
      'The text stands as a fixed row of cells and the pattern sits below it as a slab that slides to each position it is tried at, so the distance the slab travels can be read against the characters it passes over.',
      'A marker starts at the right end of the slab and steps leftward one cell at a time, dragging a trail behind it, so how far back into the pattern the comparison has come shows as a length rather than being asserted.',
      'Each compared pair is joined by a vertical thread and the pattern cell lifts toward the text; it stays lifted when the two agree and settles back down when they do not.',
      'When the comparison fails, the pattern cells in front of the break turn into dashed empty outlines, so the part of the pattern that was never consulted is marked on the slab itself, and the slab dips before moving on.',
      'The very first position fails on its first comparison and the caption puts the characters left unread at six, with all six front cells dashed; at a later position four characters agree from the right before the fifth breaks and the caption names the four, leaving two dashed.',
      'Small ticks accumulate above the text row, one over each character that was actually compared, and they stay, so the characters that were never touched are the ones with no tick over them.',
      'At the end the pattern is found and the slab rises against the text, then every text cell without a tick dims and drops out of the row, leaving standing only what was read; the closing caption gives fifteen comparisons and eleven characters never looked at.',
      'The five positions the slab visits are not adjacent and the gaps between them differ, and nothing on screen accounts for the size of any gap — the run simply arrives at the next position.',
    ],

    screen: {
      affordances: [
        'The screen runs the whole sweep by itself and stops on the closing tally, with the unread characters left dropped out of the text row.',
        'Two buttons: Replay, and a step control that rewinds and walks the same run one move at a time, which is the way to stop on a single leftward step of the marker.',
        'The text and the pattern are fixed, so an article can name the position where the pattern is found and the two counts in the closing caption.',
      ],
    },

    useWhen: [
      'The article claims a search can dismiss a position without reading all of it, and the reader has been given no reason to believe that yet: one comparison at the rightmost cell closing a position, with the six cells ahead of it left dashed, is the thing that has to be seen.',
      'The reader treats the order in which characters are compared as an arbitrary implementation detail. Both outcomes sit on the same text — one alignment dies on its first comparison, another gives up four agreeing characters before breaking — and neither of them costs reading the alignment through.',
      'The prose is about to state a rule keyed to the character that failed, and that rule cannot even be posed until the reader knows which character fails first, which is settled by the end the comparison starts from.',
    ],

    avoidWhen: [
      'The article asks how far the pattern moves after a mismatch. The positions tried here are stepped through one after another and nothing on screen accounts for the distance between them.',
      'The subject is anything prepared ahead of the search — a table built over the pattern, an index built over the text. Nothing is computed here before the first comparison.',
      'The article means walking a collection in reverse, reversing a string, or reading an array from its end. What runs backward here is the comparison inside one alignment, while the pattern itself still advances forward through the text.',
      'The article needs every occurrence, or a count of them. The run stops at the first full match.',
      'The subject is matching a window by a fingerprint rather than character by character, or a structure built over the text such as sorted suffixes or an automaton driven by many patterns at once.',
    ],

    contrastWith: [
      {
        concept: 'boyerMoore',
        note: 'The direction and the method built on it: this settles which end an alignment is decided from, while that joins the decision to a skip rule and counts what the pair together leaves unread across a whole text.',
      },
      {
        concept: 'badCharSkip',
        note: 'Two halves of one method: this settles which end the comparison starts from, and that settles how far the pattern travels once the comparison has failed.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Both decide one alignment before moving on, but starting at the front means everything counted as matched had to be read, while starting at the back can close an alignment with most of it never read at all.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Both cash in on a mismatch, but one asks how much of an already matched run may be carried forward, while this asks which end to compare from so that a mismatch is reached sooner and costs less.',
      },
      {
        concept: 'binarySearch',
        note: 'Both reach an answer without reading everything, but one requires the data to be ordered and throws away half on the strength of a comparison of values, while this requires no ordering and leaves characters unread because one disagreement condemns an entire alignment.',
      },
    ],
  },
};
