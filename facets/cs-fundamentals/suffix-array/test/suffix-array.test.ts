// @vitest-environment happy-dom
/**
 * 접미사 배열 완제품 — 손잡이 실측과 IR↔algorithm 대조.
 *
 * 사양의 검수 조건이 둘이다.
 *   1. 손잡이 네 값에서 이웃 겹침 평균이 단조로 는다.
 *   2. IR 이 내는 정렬 결과와 algorithm 이 내는 정렬 결과가 **네 값 전부에서** 같다.
 *
 * 둘째가 이 파일의 무게중심이다. 코드 패널이 보여 주는 것이 진짜로 도는 코드인지
 * 재는 유일한 방법이고, 문법만 성하고 셈이 틀린 경우를 이것이 잡는다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent, IR, IRExpr, IRStmt, View } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  findBlock,
  neighborOverlaps,
  overlapAverageOf,
  overlapSumOf,
  registerSuffixArray,
  suffixArrayAlgorithm,
  suffixArrayFacet,
  suffixArrayImperativeIR,
  suffixArrayOf,
  type SuffixArrayData,
} from '../src/index.js';

/** 선언이 들고 있는 글 넷. 손으로 옮겨 적지 않는다. */
const TEXTS = (suffixArrayFacet.initialData as unknown as SuffixArrayData).texts;

/** 사양의 실측표. 길이 11 에서 4.00 은 산술적으로 불가능해 4단은 4.50 이다. */
const LADDER = [0, 1.2, 3, 4.5];

function makeData(level: number): SuffixArrayData {
  return {
    type: 'suffix-array',
    texts: TEXTS.map((t) => ({ ...t })),
    level,
    stepMs: 0,
  };
}

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 한 판만 돌린다 — `done` 이 오면 취소한 것으로 쳐서 입력 대기에 들지 않게 한다. */
async function record(level: number): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let finished = false;
  await suffixArrayAlgorithm({
    data: makeData(level),
    get cancelled() {
      return finished;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      if (event.type === 'done') finished = true;
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !finished;
    },
    async waitForInput() {
      throw new Error('cancelled');
    },
    pollInput() {
      return null;
    },
  } as unknown as Parameters<typeof suffixArrayAlgorithm>[0]);
  return { events, metrics };
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

/** IR 로 접미사 배열을 짓는다. 배열을 만드는 어휘가 없어 자리를 미리 잡아 넘긴다. */
function irSuffixArray(text: string): number[] {
  const sa = new Array<number>(text.length).fill(0);
  runIR(suffixArrayImperativeIR, 'build_suffix_array', [text, sa]);
  return sa;
}

describe('손잡이 실측 — 글의 반복성', () => {
  it('네 글의 길이가 모두 같다 (화면 세로가 흔들리지 않으려면)', () => {
    expect(TEXTS.map((t) => t.text.length)).toEqual([11, 11, 11, 11]);
  });

  it('이웃 겹침 평균이 사양의 사다리와 같다', () => {
    const got = TEXTS.map((t) => overlapAverageOf(neighborOverlaps(t.text, suffixArrayOf(t.text))));
    expect(got).toEqual(LADDER);
  });

  it('이웃 겹침 평균이 단조로 는다', () => {
    const got = TEXTS.map((t) => overlapAverageOf(neighborOverlaps(t.text, suffixArrayOf(t.text))));
    for (let i = 1; i < got.length; i += 1) expect(got[i]!).toBeGreaterThan(got[i - 1]!);
  });

  it('되풀이가 심할수록 덩어리가 커진다', () => {
    const sizes = TEXTS.map((t) => findBlock(t.text, suffixArrayOf(t.text), t.pattern).size);
    expect(sizes).toEqual([1, 2, 3, 5]);
  });
});

describe('IR 을 실제로 돌려 본다 (ir-interpreter)', () => {
  it.each(TEXTS.map((t, i) => [i + 1, t.text] as const))(
    '%i단 %s — IR 의 정렬 결과가 algorithm 과 같다',
    (_level, text) => {
      expect(irSuffixArray(text)).toEqual(suffixArrayOf(text));
    },
  );

  it.each(TEXTS.map((t, i) => [i + 1, t.text, t.pattern] as const))(
    '%i단 %s — IR 이 센 등장 자리 수가 algorithm 과 같다',
    (_level, text, pattern) => {
      const sa = suffixArrayOf(text);
      const got = runIR(suffixArrayImperativeIR, 'count_matches', [text, [...sa], pattern]);
      expect(got).toBe(findBlock(text, sa, pattern).size);
    },
  );

  it('꼬리 견주기가 사전 순과 맞는다 — 앞이 같으면 짧은 쪽이 먼저다', () => {
    // banana 의 꼬리 `a`(5) 가 `ana`(3) 보다 앞이다.
    expect(runIR(suffixArrayImperativeIR, 'suffix_less', ['banana', 5, 3])).toBe(true);
    expect(runIR(suffixArrayImperativeIR, 'suffix_less', ['banana', 3, 5])).toBe(false);
  });

  it('없는 패턴은 덩어리가 비어 있다', () => {
    const text = 'abracadabra';
    const sa = suffixArrayOf(text);
    expect(runIR(suffixArrayImperativeIR, 'count_matches', [text, [...sa], 'zz'])).toBe(0);
    expect(findBlock(text, sa, 'zz').size).toBe(0);
  });
});

describe('algorithm 이 내는 것', () => {
  it.each(TEXTS.map((_t, i) => i + 1))('%i단 — 화면이 받는 정렬 결과가 IR 과 같다', async (level) => {
    const { events } = await record(level);
    const sorted = events.find((e) => e.type === 'sorted')?.payload as { sa: number[] };
    expect(sorted.sa).toEqual(irSuffixArray(TEXTS[level - 1]!.text));
  });

  it.each(TEXTS.map((_t, i) => i + 1))('%i단 — 겹침 합과 찾은 자리 수가 맞는다', async (level) => {
    const entry = TEXTS[level - 1]!;
    const { events, metrics } = await record(level);
    const sa = suffixArrayOf(entry.text);
    const overlaps = neighborOverlaps(entry.text, sa);
    // 값이 처음 값 그대로면 delta 를 보내지 않는다 (보내면 0 을 더하는 헛일이다).
    // 그때 배지에 뜨는 것은 선언의 `initial` 이므로 여기서도 0 으로 읽는다 —
    // 1단 `buckminster` 는 글자가 모두 달라 겹침 합이 실제로 0 이다.
    expect(metrics['overlap-sum'] ?? 0).toBe(overlapSumOf(overlaps));
    const done = events.find((e) => e.type === 'done')?.payload as { matches: number };
    expect(done.matches).toBe(findBlock(entry.text, sa, entry.pattern).size);
    expect(metrics['match-count'] ?? 0).toBe(done.matches);
  });

  it('찾은 자리가 줄에서 잇달아 있다 — 한 덩어리라는 주장 그 자체', async () => {
    for (let level = 1; level <= TEXTS.length; level += 1) {
      const { events } = await record(level);
      const ranks = events
        .filter((e) => e.type === 'match')
        .map((e) => (e.payload as { rank: number }).rank);
      expect(ranks.length).toBeGreaterThan(0);
      for (let i = 1; i < ranks.length; i += 1) expect(ranks[i]).toBe(ranks[i - 1]! + 1);
    }
  });

  it('찾은 자리가 글에서 실제로 패턴이 나오는 자리다', async () => {
    for (let level = 1; level <= TEXTS.length; level += 1) {
      const entry = TEXTS[level - 1]!;
      const { events } = await record(level);
      const spots = events
        .filter((e) => e.type === 'match')
        .map((e) => (e.payload as { from: number }).from);
      for (const from of spots) {
        expect(entry.text.slice(from, from + entry.pattern.length)).toBe(entry.pattern);
      }
      // 빠뜨린 자리가 없어야 한다 — 덩어리가 곧 전부라는 주장이기 때문이다.
      let expected = 0;
      for (let i = 0; i + entry.pattern.length <= entry.text.length; i += 1) {
        if (entry.text.startsWith(entry.pattern, i)) expected += 1;
      }
      expect(spots.length).toBe(expected);
    }
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(2);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const emitted = new Set<string>();
    for (let level = 1; level <= TEXTS.length; level += 1) {
      const { events } = await record(level);
      for (const e of events) {
        if (e.type === 'phase') emitted.add((e.payload as { phase: string }).phase);
      }
    }
    expect([...emitted].sort()).toEqual([...irPhases(suffixArrayImperativeIR)].sort());
    expect([...emitted].sort()).toEqual([
      'block-start',
      'compare-pattern',
      'compare-tails',
      'cut',
      'extend-block',
      'go-left',
      'go-right',
      'pick-mid',
      'place',
    ]);
  });
});

describe('여섯 언어 emit (S-transpiler)', () => {
  const ALL = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(ALL.map((t) => [t.id, t] as const))(
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 아홉이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(suffixArrayImperativeIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(suffixArrayImperativeIR)].sort());
      const all = res.lines.map((l) => l.code).join('\n');
      // 정렬이 이름 뒤로 숨지 않았다는 것 — 자리 바꿈과 견줌이 코드에 있다.
      expect(all).toContain('suffix_less');
      expect(all).toContain('count_matches');
    },
  );

  it('C# 예약어를 식별자로 쓰지 않는다', () => {
    const reserved = ['base', 'out', 'ref', 'params', 'lock', 'event', 'object'];
    const names = new Set<string>();
    for (const f of suffixArrayImperativeIR.functions) {
      for (const p of f.params) names.add(p.name);
      const walk = (stmts: IRStmt[]): void => {
        for (const s of stmts) {
          if (s.kind === 'var') names.add(s.name);
          if (s.kind === 'for-range') {
            names.add(s.var);
            walk(s.body);
          } else if (s.kind === 'while') walk(s.body);
          else if (s.kind === 'if') {
            walk(s.then);
            if (s.else) walk(s.else);
          }
        }
      };
      walk(f.body);
    }
    expect([...names].filter((n) => reserved.includes(n))).toEqual([]);
  });
});

describe('IR 어휘의 함정', () => {
  /** 문 안의 모든 식을 훑는다. */
  function eachExpr(stmts: IRStmt[], visit: (e: IRExpr) => void): void {
    const expr = (e: IRExpr): void => {
      visit(e);
      if (e.kind === 'index') {
        expr(e.arr);
        expr(e.idx);
      } else if (e.kind === 'len') expr(e.of);
      else if (e.kind === 'binop') {
        expr(e.l);
        expr(e.r);
      } else if (e.kind === 'unop') expr(e.x);
      else if (e.kind === 'call') for (const a of e.args) expr(a);
    };
    for (const s of stmts) {
      switch (s.kind) {
        case 'var':
          expr(s.init);
          break;
        case 'assign':
          expr(s.target);
          expr(s.expr);
          break;
        case 'if':
          expr(s.cond);
          eachExpr(s.then, visit);
          if (s.else) eachExpr(s.else, visit);
          break;
        case 'for-range':
          expr(s.from);
          expr(s.to);
          eachExpr(s.body, visit);
          break;
        case 'while':
          expr(s.cond);
          eachExpr(s.body, visit);
          break;
        case 'swap':
          expr(s.a);
          expr(s.b);
          break;
        case 'return':
          if (s.expr) expr(s.expr);
          break;
        case 'expr-stmt':
          expr(s.expr);
          break;
        default:
          break;
      }
    }
  }

  const touchesMemory = (e: IRExpr): boolean => {
    if (e.kind === 'index' || e.kind === 'call') return true;
    if (e.kind === 'len') return touchesMemory(e.of);
    if (e.kind === 'binop') return touchesMemory(e.l) || touchesMemory(e.r);
    if (e.kind === 'unop') return touchesMemory(e.x);
    return false;
  };

  it("'&&' 의 오른쪽이 왼쪽 검사에 기대지 않는다", () => {
    // ir-interpreter 의 `evalExpr` 은 binop 의 양쪽을 **둘 다 먼저 셈한 뒤**
    // 연산자를 본다. 짧은 회로가 아니므로 `j > 0 && f(sa[j-1])` 꼴은 j 가 0 일
    // 때도 오른쪽이 돌아 sa[-1] 을 짚는다. 여섯 언어의 실제 `&&` 는 짧은 회로라
    // emit 된 코드는 멀쩡한데, IR 의 뜻을 정하는 것은 인터프리터다.
    //
    // 실제로 이 IR 이 처음에 그 꼴이었고 **검사도 통과했다** — sa[-1] 이
    // undefined 라 NaN 비교가 전부 false 가 되어 우연히 맞는 답이 나왔을 뿐이다.
    // 그래서 답이 아니라 모양을 지킨다.
    const risky: string[] = [];
    for (const f of suffixArrayImperativeIR.functions) {
      eachExpr(f.body, (e) => {
        if (e.kind === 'binop' && (e.op === '&&' || e.op === '||') && touchesMemory(e.r)) {
          risky.push(`${f.name} — '${e.op}' 의 오른쪽이 짚거나 부른다`);
        }
      });
    }
    expect(risky).toEqual([]);
  });

  it('글자를 변수에 담지 않는다 (java 가 char 를 String 으로 낸다)', () => {
    // `a[i] == b[j]` 를 그 자리에서 짚어야 `a.charAt(i) == b.charAt(j)` 가 된다.
    // 변수에 담으면 `String tmp = ….charAt(…)` 이 되어 컴파일되지 않는다.
    const strings = new Set(['text', 'pat']);
    const held: string[] = [];
    for (const f of suffixArrayImperativeIR.functions) {
      const walk = (stmts: IRStmt[]): void => {
        for (const s of stmts) {
          if (
            s.kind === 'var' &&
            s.init.kind === 'index' &&
            s.init.arr.kind === 'var' &&
            strings.has(s.init.arr.name)
          ) {
            held.push(`${f.name} — ${s.name} 이 글자를 담는다`);
          }
          if (s.kind === 'if') {
            walk(s.then);
            if (s.else) walk(s.else);
          } else if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
        }
      };
      walk(f.body);
    }
    expect(held).toEqual([]);
  });

  it('경계 밖을 짚어도 답이 흔들리지 않는다 — 빈 글과 한 글자', () => {
    for (const text of ['', 'a', 'aa']) {
      const sa = new Array<number>(text.length).fill(0);
      runIR(suffixArrayImperativeIR, 'build_suffix_array', [text, sa]);
      expect(sa).toEqual(suffixArrayOf(text));
      const got = runIR(suffixArrayImperativeIR, 'count_matches', [text, [...sa], 'a']);
      expect(got).toBe(findBlock(text, sa, 'a').size);
    }
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('stage 가 그려지고, 재생 내내 캔버스 세로가 변하지 않는다', async () => {
    const seenPhases: string[] = [];
    const fakeCodeView: View = {
      mount(container) {
        const node = document.createElement('div');
        container.appendChild(node);
        return {
          destroy() {
            node.remove();
          },
          highlightPhase(phase: string | null) {
            if (phase) seenPhases.push(phase);
          },
          clearHighlight() {},
        };
      },
    };
    registerSuffixArray();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    // reactive 는 mount 시 스스로 돌기 시작한다 — autoStart 와 무관하다.
    const handle = runFacet(suffixArrayFacet, host);
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 글자 칸 열하나가 마운트 직후에 이미 그려져 있어야 한다 — 캔버스를 비워
    // 버리는 함정(S-view)에 빠지면 여기서 0 이 된다.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThan(11);

    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 9) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // 세로는 마운트 뒤 바뀌지 않는다 (S-view). 네 단의 글 길이가 모두 11 이라
    // 손잡이를 밀어도 줄 수가 그대로인 것이 이것을 떠받친다.
    expect(svg?.getAttribute('viewBox')).toBe(box);
    // 아홉 phase 가 모두 코드 패널까지 닿는다 (code-panel-phase 가 전수로 보는 것).
    expect(new Set(seenPhases).size).toBe(9);

    handle.destroy();
    host.remove();
  }, 20_000);
});
