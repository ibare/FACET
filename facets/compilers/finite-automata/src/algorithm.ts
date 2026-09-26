/**
 * finite-automata — 끝에서 k 째 글자를 보는 무늬 `(a|b)*a(a|b)…` 의 NFA 를 부분집합 구성으로 DFA 로 바꾸고,
 * 그 DFA 로 입력 하나를 걷는다.
 *
 * 주장: NFA 는 자리가 k + 1 인데 DFA 는 자리가 2^k 로 두 배씩 는다. 걷는 걸음은 k 와 상관없이 글자 수 그대로이고,
 * 판정은 다 먹은 뒤 멈춘 자리 하나가 한다.
 *
 * 셈의 두 몫:
 *   - 부분집합 구성 (`constructDfa`) — IR 밖의 셈. 코드 패널에 두지 않는다 (irs.ts 머리말).
 *   - DFA 걷기 (`walkDfa` · `accepts`) — IR 과 **같은 함수**를 TS 로 돌린다. 갈고리(hook)가 글자마다 걸음을 모은다.
 *
 * 규약:
 *   - NFA (ε 없음 — 무늬 조각마다 자리): 자리 0 … k. `(a|b)*` = 자리 0 의 제자리 고리, `a` = 0 → 1,
 *     뒤의 `(a|b)` 마다 i → i + 1 두 글자 모두. 시작 0, 받는 자리 k.
 *   - 부분집합 번호: D0 = {0} (ε 가 없어 닫힘은 제자리) · 할 일은 번호 차례 · 덩이 안은 글자 차례(a 다음 b) ·
 *     옮겨 간 모임이 이미 선 덩이와 같으면 그 번호, 아니면 다음 번호로 새로 선다 · 빈 모임이면 던진다.
 *   - 구성 걸음 = 층 하나: 앞 걸음에서 새로 선 덩이들을 번호 차례로 꺼내 글자마다 옮긴다. 첫 층은 D0 이 서는 것,
 *     마지막 층은 새 덩이 없이 옮김만 닫는다 (구성 걸음 = k + 2).
 *   - 걷기: 시작 D0, 글자를 왼쪽부터 하나씩, 글자 하나에 옮김 하나. 판정은 다 먹은 뒤 멈춘 자리 하나로.
 *   - 동률 규칙은 없다 — 셈에 견줌이 없다.
 *
 * 판의 짜임 (reactive):
 *   첫 판 · k 가 바뀐 판 — 시작 · 구성 k + 2 걸음 · 글자마다 한 걸음 · 판정 한 걸음
 *   입력만 바뀐 판       — 시작 (지어 둔 DFA 를 그대로 둔다) · 글자마다 한 걸음 · 판정 한 걸음
 *   판이 끝나면 `waitForInput` → 받은 값으로 다시.
 *
 * 이벤트 (silent 는 phase 하나뿐):
 *   start   { k, rebuild: boolean, pieces: string[], alphabet: string[],
 *             nfa: { states, accept, arcs: { from, to, label }[] }, word: string, dfaStates,
 *             dfaSlots (이번 판 DFA 덩이 수 — 무대가 걸음 0 에서 이 번호 이상인 앞 판 덩이를 접는다) }
 *           — rebuild 가 참이면 DFA 가 빈 자리에서 다시 선다. 거짓이면 지어 둔 DFA 를 둔 채 걷는 길 · 판정만 걷는다.
 *   layer   { index, taken: number[], fresh: { id, set: number[], accepting: boolean, parent: number | null,
 *             letter: string | null, layer, slot, slots }[], moves: { from, letter, to, fresh: boolean }[], total, last: boolean }
 *   phase   { phase }  silent: true
 *   move    { step (1 부터), at (글자 자리, 0 부터), letter, from, to, fromSet: number[], toSet: number[] }
 *   verdict { stop, set: number[], accept (NFA 받는 자리), accepted: boolean }
 *
 * phase 어휘 (irs.ts 와 같다): follow-edge (글자 걸음) · verdict (판정). 시작 · 구성 걸음에는 phase 가 없다.
 *
 * 계기: nfa-states (시작에 이 k 의 값) · dfa-states (구성 걸음마다 선 덩이 수 — k 가 바뀐 판은 시작에 0,
 *       입력만 바뀐 판은 그대로) · walk-steps (시작에 0, 글자 걸음마다 +1). 지금 값을 들고 차이만 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FiniteAutomataData = {
  type: 'finite-automata';
  stepMs: number;
  /** 글자 모임 — 차례가 곧 글자 번호 (a 0 · b 1). IR 의 delta 가 둘씩 편다 */
  alphabet: string[];
  /** NFA 짓는 규칙 — `(loop)*` 뒤에 mark, 그 뒤에 `(tail)` 를 k − 1 번 */
  nfaRule: { loop: string[]; mark: string; tail: string[] };
  /** 손잡이 ① 끝에서 몇째 — 사다리 */
  fromEndLadder: number[];
  /** 손잡이 ② 입력 — 번호 사다리와 그 글 */
  wordLadder: number[];
  words: string[];
  /** 기본값 — 사양이 골랐다 */
  fromEnd: number;
  word: number;
};

export type NfaArc = { from: number; to: number; label: string };
export type Nfa = {
  states: number;
  accept: number;
  /** 옮김 하나하나 — 적힌 차례. letter 는 글자 번호 */
  edges: { from: number; letter: number; to: number }[];
};
export type DfaNode = {
  id: number;
  set: number[];
  accepting: boolean;
  parent: number | null;
  letter: number | null;
  layer: number;
  slot: number;
  slots: number;
};
export type DfaLayer = {
  taken: number[];
  fresh: number[];
  moves: { from: number; letter: number; to: number; fresh: boolean }[];
};
export type Dfa = { nodes: DfaNode[]; delta: number[]; accepting: number[]; layers: DfaLayer[] };

/** 덩이 글자 — `{0, 2}` (작은 수부터, 쉼표 뒤 빈칸 하나) */
export function setText(set: readonly number[]): string {
  return `{${[...set].sort((x, y) => x - y).join(', ')}}`;
}

/** 덩이 이름 — `D3 {0, 2}` */
export function nodeText(id: number, set: readonly number[]): string {
  return `D${id} ${setText(set)}`;
}

/** 무늬 조각 — 앞 조각 `(a|b)*a` 와 뒤 조각 `(a|b)` k − 1 개 */
export function patternPieces(rule: FiniteAutomataData['nfaRule'], k: number): string[] {
  const out = [`(${rule.loop.join('|')})*${rule.mark}`];
  for (let i = 1; i < k; i += 1) out.push(`(${rule.tail.join('|')})`);
  return out;
}

function letterIndex(alphabet: readonly string[], ch: string): number {
  const i = alphabet.indexOf(ch);
  if (i < 0) throw new Error(`글자 모임에 없는 글자: ${ch}`);
  return i;
}

/** NFA — ε 없음. 자리 0 … k, 받는 자리 k */
export function buildNfa(rule: FiniteAutomataData['nfaRule'], alphabet: readonly string[], k: number): Nfa {
  if (!Number.isInteger(k) || k < 1) throw new Error(`k 는 1 이상의 정수: ${k}`);
  const edges: Nfa['edges'] = [];
  for (const ch of rule.loop) edges.push({ from: 0, letter: letterIndex(alphabet, ch), to: 0 });
  edges.push({ from: 0, letter: letterIndex(alphabet, rule.mark), to: 1 });
  for (let i = 1; i < k; i += 1) {
    for (const ch of rule.tail) edges.push({ from: i, letter: letterIndex(alphabet, ch), to: i + 1 });
  }
  return { states: k + 1, accept: k, edges };
}

/** NFA 옮김을 (자리, 자리) 마다 묶은 그림용 목록 — 이름표는 글자를 쉼표로 */
export function nfaArcs(nfa: Nfa, alphabet: readonly string[]): NfaArc[] {
  const out: { from: number; to: number; letters: number[] }[] = [];
  for (const e of nfa.edges) {
    const hit = out.find((a) => a.from === e.from && a.to === e.to);
    if (hit) hit.letters.push(e.letter);
    else out.push({ from: e.from, to: e.to, letters: [e.letter] });
  }
  return out.map((a) => ({
    from: a.from,
    to: a.to,
    label: a.letters
      .sort((x, y) => x - y)
      .map((c) => {
        const ch = alphabet[c];
        if (ch === undefined) throw new Error(`글자 번호 ${c} 가 모임 밖`);
        return ch;
      })
      .join(', '),
  }));
}

/** 부분집합 구성 — 층마다 (꺼낸 덩이 · 새로 선 덩이 · 옮김) */
export function constructDfa(nfa: Nfa, alphabetSize: number): Dfa {
  const sets: number[][] = [[0]];
  const keyOf = (s: readonly number[]): string => s.join(',');
  const index = new Map<string, number>([[keyOf([0]), 0]]);
  const nodes: DfaNode[] = [
    { id: 0, set: [0], accepting: nfa.accept === 0, parent: null, letter: null, layer: 0, slot: 0, slots: 1 },
  ];
  const delta: number[] = [];
  const layers: DfaLayer[] = [{ taken: [], fresh: [0], moves: [] }];
  let frontier = [0];
  while (frontier.length > 0) {
    const fresh: number[] = [];
    const moves: DfaLayer['moves'] = [];
    for (const d of frontier) {
      const from = sets[d];
      if (!from) throw new Error(`덩이 D${d} 가 없다`);
      for (let c = 0; c < alphabetSize; c += 1) {
        const to = new Set<number>();
        for (const e of nfa.edges) if (e.letter === c && from.includes(e.from)) to.add(e.to);
        if (to.size === 0) throw new Error(`빈 모임 — D${d} 에서 글자 ${c} 로 갈 곳이 없다`);
        const set = [...to].sort((x, y) => x - y);
        const key = keyOf(set);
        let id = index.get(key);
        const isFresh = id === undefined;
        if (id === undefined) {
          id = sets.length;
          sets.push(set);
          index.set(key, id);
          fresh.push(id);
          nodes.push({ id, set, accepting: set.includes(nfa.accept), parent: d, letter: c, layer: layers.length, slot: 0, slots: 0 });
        }
        delta[d * alphabetSize + c] = id;
        moves.push({ from: d, letter: c, to: id, fresh: isFresh });
      }
    }
    fresh.forEach((id, slot) => {
      const n = nodes[id];
      if (!n) throw new Error(`덩이 D${id} 가 없다`);
      n.slot = slot;
      n.slots = fresh.length;
    });
    layers.push({ taken: frontier, fresh, moves });
    frontier = fresh;
  }
  return { nodes, delta, accepting: nodes.map((n) => (n.accepting ? 1 : 0)), layers };
}

/** IR `walkDfa` 와 같은 함수 — hook 이 글자마다 (글자 자리, 옮기기 전 · 뒤 자리) 를 받는다 */
export function walkDfa(
  delta: readonly number[],
  word: readonly number[],
  path: number[],
  hook?: (i: number, from: number, to: number) => void,
): number {
  let cur = 0;
  path[0] = 0;
  for (let i = 0; i < word.length; i += 1) {
    const c = word[i];
    if (c === undefined) throw new Error(`글자 자리 ${i} 가 비었다`);
    const nextState = delta[cur * 2 + c];
    if (nextState === undefined) throw new Error(`옮김이 없다 — D${cur} 에서 글자 ${c} (막힘)`);
    hook?.(i, cur, nextState);
    cur = nextState;
    path[i + 1] = cur;
  }
  return cur;
}

/** IR `accepts` 와 같은 함수 — 받으면 1, 아니면 0 */
export function accepts(
  delta: readonly number[],
  accepting: readonly number[],
  word: readonly number[],
  path: number[],
  hook?: (i: number, from: number, to: number) => void,
): number {
  const stop = walkDfa(delta, word, path, hook);
  const v = accepting[stop];
  if (v === undefined) throw new Error(`받음 표에 D${stop} 가 없다`);
  return v;
}

/** 입력 글을 글자 번호 배열로 */
export function encodeWord(alphabet: readonly string[], word: string): number[] {
  return [...word].map((ch) => letterIndex(alphabet, ch));
}

/** 한 조합의 셈 전부 — 화면 · 검사가 함께 쓴다 */
export function solve(data: FiniteAutomataData, k: number, wordIdx: number) {
  const nfa = buildNfa(data.nfaRule, data.alphabet, k);
  const dfa = constructDfa(nfa, data.alphabet.length);
  const text = data.words[wordIdx];
  if (text === undefined) throw new Error(`입력 번호 ${wordIdx} 가 없다`);
  const word = encodeWord(data.alphabet, text);
  const path = new Array<number>(word.length + 1).fill(-1);
  const steps: { i: number; from: number; to: number }[] = [];
  const accepted = accepts(dfa.delta, dfa.accepting, word, path, (i, from, to) => steps.push({ i, from, to }));
  const stop = path[word.length];
  if (stop === undefined || stop < 0) throw new Error('걸은 길이 끝나지 않았다');
  return { nfa, dfa, text, word, path, steps, accepted, stop };
}

function readData(raw: unknown): FiniteAutomataData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData 가 없다');
  const d = raw as Record<string, unknown>;
  const strs = (v: unknown, name: string): string[] => {
    if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) throw new Error(`${name} 는 글 배열이다`);
    return v;
  };
  const nums = (v: unknown, name: string): number[] => {
    if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number')) throw new Error(`${name} 는 수 배열이다`);
    return v;
  };
  const num = (v: unknown, name: string): number => {
    if (typeof v !== 'number') throw new Error(`${name} 는 수다`);
    return v;
  };
  const rule = d.nfaRule;
  if (typeof rule !== 'object' || rule === null) throw new Error('nfaRule 이 없다');
  const r = rule as Record<string, unknown>;
  if (typeof r.mark !== 'string') throw new Error('nfaRule.mark 는 글자다');
  const data: FiniteAutomataData = {
    type: 'finite-automata',
    stepMs: num(d.stepMs, 'stepMs'),
    alphabet: strs(d.alphabet, 'alphabet'),
    nfaRule: { loop: strs(r.loop, 'nfaRule.loop'), mark: r.mark, tail: strs(r.tail, 'nfaRule.tail') },
    fromEndLadder: nums(d.fromEndLadder, 'fromEndLadder'),
    wordLadder: nums(d.wordLadder, 'wordLadder'),
    words: strs(d.words, 'words'),
    fromEnd: num(d.fromEnd, 'fromEnd'),
    word: num(d.word, 'word'),
  };
  if (data.alphabet.length !== 2) throw new Error('글자 모임은 둘이다 — IR 의 delta 가 둘씩 편다');
  if (data.wordLadder.length !== data.words.length) throw new Error('입력 사다리와 입력 글의 수가 다르다');
  if (!data.fromEndLadder.includes(data.fromEnd)) throw new Error(`기본 k ${data.fromEnd} 가 사다리에 없다`);
  if (!data.wordLadder.includes(data.word)) throw new Error(`기본 입력 ${data.word} 가 사다리에 없다`);
  return data;
}

export async function finiteAutomataAlgorithm(ctx: FacetContext<FiniteAutomataData>): Promise<void> {
  const rc = ctx as ReactiveContext<FiniteAutomataData>;
  const data = readData(ctx.data);
  let k = data.fromEnd;
  let wordIdx = data.word;
  /** 지금 화면에 그려진 DFA 의 k — 없으면 null */
  let builtK: number | null = null;

  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, prev === undefined ? value : value - prev);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (): Promise<boolean> => {
    const s = solve(data, k, wordIdx);
    const rebuild = builtK !== k;
    const dfaShown = rebuild ? 0 : s.dfa.nodes.length;
    const nodeOf = (id: number): DfaNode => {
      const n = s.dfa.nodes[id];
      if (!n) throw new Error(`덩이 D${id} 가 없다`);
      return n;
    };
    const letterOf = (c: number): string => {
      const ch = data.alphabet[c];
      if (ch === undefined) throw new Error(`글자 번호 ${c} 가 모임 밖`);
      return ch;
    };

    // #0 시작
    setMetric('nfa-states', s.nfa.states);
    setMetric('dfa-states', dfaShown);
    setMetric('walk-steps', 0);
    await ctx.emit({
      type: 'start',
      payload: {
        k,
        rebuild,
        pieces: patternPieces(data.nfaRule, k),
        alphabet: [...data.alphabet],
        nfa: { states: s.nfa.states, accept: s.nfa.accept, arcs: nfaArcs(s.nfa, data.alphabet) },
        word: s.text,
        dfaStates: dfaShown,
        dfaSlots: s.dfa.nodes.length,
      },
    });
    if (!(await rc.sleep(data.stepMs))) return false;

    // 구성 — 층 하나에 한 걸음
    if (rebuild) {
      let total = 0;
      for (let li = 0; li < s.dfa.layers.length; li += 1) {
        if (ctx.cancelled) return false;
        const layer = s.dfa.layers[li];
        if (!layer) throw new Error(`층 ${li} 가 없다`);
        total += layer.fresh.length;
        setMetric('dfa-states', total);
        await ctx.emit({
          type: 'layer',
          payload: {
            index: li,
            taken: [...layer.taken],
            fresh: layer.fresh.map((id) => {
              const n = nodeOf(id);
              return {
                id: n.id,
                set: [...n.set],
                accepting: n.accepting,
                parent: n.parent,
                letter: n.letter === null ? null : letterOf(n.letter),
                slot: n.slot,
                slots: n.slots,
                layer: n.layer,
              };
            }),
            moves: layer.moves.map((m) => ({ from: m.from, letter: letterOf(m.letter), to: m.to, fresh: m.fresh })),
            total,
            last: li === s.dfa.layers.length - 1,
          },
        });
        if (!(await rc.sleep(data.stepMs))) return false;
      }
      builtK = k;
    }

    // 걷기 — 글자 하나에 한 걸음
    for (const st of s.steps) {
      if (ctx.cancelled) return false;
      await phase('follow-edge');
      setMetric('walk-steps', st.i + 1);
      const c = s.word[st.i];
      if (c === undefined) throw new Error(`글자 자리 ${st.i} 가 비었다`);
      await ctx.emit({
        type: 'move',
        payload: {
          step: st.i + 1,
          at: st.i,
          letter: letterOf(c),
          from: st.from,
          to: st.to,
          fromSet: [...nodeOf(st.from).set],
          toSet: [...nodeOf(st.to).set],
        },
      });
      if (!(await rc.sleep(data.stepMs))) return false;
    }

    // 판정 — 멈춘 자리 하나로
    await phase('verdict');
    await ctx.emit({
      type: 'verdict',
      payload: { stop: s.stop, set: [...nodeOf(s.stop).set], accept: s.nfa.accept, accepted: s.accepted === 1 },
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 우리 손잡이의 사다리 안 값이 올 때까지 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'fromEnd' && data.fromEndLadder.includes(value)) {
          k = value;
          break;
        }
        if (input.type === 'word' && data.wordLadder.includes(value)) {
          wordIdx = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
