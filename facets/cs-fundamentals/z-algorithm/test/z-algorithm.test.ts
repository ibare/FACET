/**
 * zAlgorithm — 손잡이 실측 · 갈래 전수 · IR 대조.
 *
 * 셋을 본다.
 *
 *  1. **손잡이가 논증을 지는가** — 네 단에서 빌려오기와 아낀 비교가 단조로 느는가.
 *     사양에 적힌 수와 글자 하나 다르지 않아야 한다.
 *  2. **선언한 문안이 뜰 수 있는가** — 네 단 **각각에서** 갈래 넷(구간 밖 견줌 ·
 *     빌리기 · 이어 견주기 · 구간 옮기기)이 적어도 한 번 일어나는가. 조각
 *     `matchLengthPerSpot` 이 `caption.extend` 를 한 번도 못 띄운 적이 있다 —
 *     화면에 뜰 수 없는 문안은 거짓말이라 기계로 막는다.
 *  3. **코드 패널이 화면과 같은 답을 내는가** — IR 이 셈한 Z 배열과 등장 자리가
 *     algorithm 이 셈한 것과 **손잡이 네 값 전부에서** 같은가.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import { runIR, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  joinedOf,
  naiveZ,
  zAlgorithmFacet,
  zAlgorithmAlgorithm,
  zAlgorithmImperativeIR,
  zHits,
  zTrace,
  registerZAlgorithm,
  type ZAlgorithmData,
} from '../src/index.js';

/** 사양의 실측표. 글을 고른 뒤 잰 것이지, 수에 맞춰 글을 고른 것이 아니다. */
const SPEC = [
  { level: 1, text: 'abbaabbaaabaaa', occ: 1, borrows: 9, saved: 12 },
  { level: 2, text: 'bbaaaabaabaabb', occ: 2, borrows: 11, saved: 16 },
  { level: 3, text: 'baabaabaabaaba', occ: 3, borrows: 13, saved: 20 },
  { level: 4, text: 'aabaabaabaabaa', occ: 4, borrows: 14, saved: 22 },
];

const PHASES = ['borrow', 'collect', 'scan', 'whole', 'window'];

function freshData(): ZAlgorithmData {
  return structuredClone(zAlgorithmFacet.initialData) as unknown as ZAlgorithmData;
}

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
};

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `sleep` 은 곧바로 돌아오고 `waitForInput` 은 대본을 하나씩 내어 준다. 대본이
 * 비면 취소로 만들어 최상위 `catch` 가 조용히 접게 한다 — 러너의 reset / destroy
 * 가 하는 일과 같은 모양이다.
 */
async function drive(script: ReactiveInputEvent[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data: freshData(),
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next !== undefined) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await zAlgorithmAlgorithm(ctx as unknown as FacetContext<ZAlgorithmData>);
  return { events, metrics };
}

/** 한 단씩 끊어 본다 — `text-chosen` 이 단의 경계다. */
function byLevel(events: FacetRuntimeEvent[]): FacetRuntimeEvent[][] {
  const out: FacetRuntimeEvent[][] = [];
  for (const e of events) {
    if (e.type === 'text-chosen') out.push([]);
    if (out.length > 0) out[out.length - 1]!.push(e);
  }
  return out;
}

function payload(e: FacetRuntimeEvent): Record<string, unknown> {
  return (e.payload ?? {}) as Record<string, unknown>;
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

/** 네 단을 차례로 돌린 기록. 대본은 손잡이를 2 · 3 · 4 로 미는 것뿐이다. */
const runAll = (): Promise<Recorded> =>
  drive([
    { type: 'repeat', payload: { value: 2 } },
    { type: 'repeat', payload: { value: 3 } },
    { type: 'repeat', payload: { value: 4 } },
  ]);

describe('선언과 데이터', () => {
  it('등록 이름 · IR id · initialData.type 이 규약대로다', () => {
    expect(zAlgorithmFacet.id).toBe('facet:zAlgorithm');
    expect(zAlgorithmFacet.algorithm).toBe('module:zAlgorithm');
    expect(zAlgorithmFacet.projector).toBe('module:zAlgorithmProjector');
    expect(zAlgorithmFacet.initialData.type).toBe('z-algorithm');
    expect(zAlgorithmImperativeIR.id).toBe('z-algorithm-imperative');
    // projector 이름이 algorithm 이름과 겹치면 `module:` 참조가 어느 쪽인지
    // 말하지 못한다 (register-names 검사와 같은 취지).
    expect(zAlgorithmFacet.projector).not.toBe(zAlgorithmFacet.algorithm);
  });

  it('칸막이는 찾는 것에도 글에도 없다 — 이 전제가 깨지면 답이 틀린다', () => {
    const data = freshData();
    expect(data.separator).toHaveLength(1);
    expect(data.pattern).not.toContain(data.separator);
    for (const text of data.texts) expect(text).not.toContain(data.separator);
  });

  it('글 넷은 되풀이가 늘어나는 차례다 — 사다리를 먼저 정했다', () => {
    const data = freshData();
    expect(data.texts).toEqual(SPEC.map((s) => s.text));
    const occ = data.texts.map((text) => {
      let count = 0;
      for (let i = 0; i + data.pattern.length <= text.length; i += 1) {
        if (text.slice(i, i + data.pattern.length) === data.pattern) count += 1;
      }
      return count;
    });
    expect(occ).toEqual(SPEC.map((s) => s.occ));
  });
});

describe('손잡이가 논증을 진다', () => {
  it('네 단의 빌려오기와 아낀 비교가 사양의 수와 같다', async () => {
    const { events } = await runAll();
    const levels = byLevel(events);
    expect(levels).toHaveLength(4);

    const measured = levels.map((group) => {
      const summary = group.find((e) => e.type === 'summary');
      expect(summary).toBeDefined();
      const p = payload(summary!);
      return {
        level: p.level as number,
        borrows: p.borrows as number,
        saved: p.saved as number,
        occ: p.matches as number,
      };
    });

    expect(measured).toEqual(SPEC.map(({ level, borrows, saved, occ }) => ({ level, borrows, saved, occ })));
  });

  it('빌려오기와 아낀 비교가 단조로 는다 — 갈리지 않으면 손잡이가 뜻이 없다', async () => {
    const { events } = await runAll();
    const summaries = events.filter((e) => e.type === 'summary').map(payload);
    const borrows = summaries.map((p) => p.borrows as number);
    const saved = summaries.map((p) => p.saved as number);
    for (let i = 1; i < borrows.length; i += 1) {
      expect(borrows[i]!).toBeGreaterThan(borrows[i - 1]!);
      expect(saved[i]!).toBeGreaterThan(saved[i - 1]!);
    }
  });

  /*
   * 견줌의 단위가 양쪽에서 같아야 한다. 자리 단위와 글자 단위를 섞으면 한쪽만
   * 꼬리를 더 읽어 대비가 통째로 거짓이 된다 — KMP 완제품이 길이 6 에서 77 대
   * 72 로 갈린 자리다.
   *
   * **같은 표를 낸다는 것이 같은 범위를 같은 뜻으로 돌았다는 증거다.**
   */
  it('곧은 방법과 빠른 방법이 같은 단위로 세어진다 — 같은 표를 낸다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const joined = joinedOf(data.pattern, data.separator, spec.text);
      const slow = naiveZ(joined);
      const fast = zTrace(joined);

      expect(slow.z, `단 ${spec.level} 에서 두 방법의 표가 갈렸다`).toEqual(fast.z);
      // 되빌리는 쪽이 더 견주는 일은 없다.
      expect(fast.compares).toBeLessThanOrEqual(slow.compares);
      expect(slow.compares - fast.compares).toBe(spec.saved);
    }
  });

  /*
   * 계측이 논증과 같은 속도로 움직여야 한다. 아낀 비교가 마지막에 한 번에
   * 튀면 재생 내내 0 으로 보이고, 그러면 "빌릴수록 덜 견준다" 가 화면
   * 어디에도 나타나지 않는다.
   */
  it('아낀 비교가 걸음마다 오르고 마지막에 사양의 수에 닿는다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const joined = joinedOf(data.pattern, data.separator, spec.text);
      const totals = zTrace(joined)
        .steps.map((s) => s.savedTotal)
        .filter((v): v is number => v !== undefined);

      expect(totals.length, `단 ${spec.level} 에 누계가 하나도 안 실렸다`).toBeGreaterThan(0);
      for (let i = 1; i < totals.length; i += 1) {
        expect(totals[i]!, `단 ${spec.level} 의 누계가 뒷걸음쳤다`).toBeGreaterThanOrEqual(totals[i - 1]!);
      }
      expect(totals[totals.length - 1], `단 ${spec.level} 의 마지막 누계`).toBe(spec.saved);
      // 재생 한가운데에서 이미 움직이고 있어야 한다.
      expect(totals[Math.floor(totals.length / 2)]!, `단 ${spec.level} 이 중간까지 0 이다`).toBeGreaterThan(0);
    }
  });

  it('메트릭은 단마다 0 에서 다시 센다 — 이어 세면 두 단째부터 불어난다', async () => {
    const { metrics } = await runAll();
    const last = SPEC[SPEC.length - 1]!;
    expect(metrics['borrow-count']).toBe(last.borrows);
    expect(metrics['saved-compare-count']).toBe(last.saved);
    expect(metrics['match-count']).toBe(last.occ);
  });
});

describe('선언한 문안은 화면에 뜰 수 있어야 한다', () => {
  it('네 단 각각에서 갈래 넷이 적어도 한 번씩 일어난다', async () => {
    const { events } = await runAll();
    const levels = byLevel(events);
    expect(levels).toHaveLength(4);

    const table = levels.map((group, i) => {
      const scans = group.filter((e) => e.type === 'scan').map(payload);
      return {
        단: i + 1,
        // caption.outside — 구간 밖이라 맨 앞부터 견준다
        outside: scans.filter((p) => p.inside !== true).length,
        // caption.borrow — 구간 안이라 거울에서 빌린다
        borrow: group.filter((e) => e.type === 'mirror').length,
        // caption.extend — 빌린 것이 구간 끝에 닿아 이어서 견준다
        extend: scans.filter((p) => p.inside === true).length,
        // caption.window — 구간을 오른쪽으로 옮긴다
        window: group.filter((e) => e.type === 'window').length,
        // caption.match — 표에서 등장 자리가 떨어져 나온다
        match: group.filter((e) => e.type === 'match').length,
      };
    });

    for (const row of table) {
      expect(row.outside, `단 ${row.단} caption.outside`).toBeGreaterThan(0);
      expect(row.borrow, `단 ${row.단} caption.borrow`).toBeGreaterThan(0);
      expect(row.extend, `단 ${row.단} caption.extend`).toBeGreaterThan(0);
      expect(row.window, `단 ${row.단} caption.window`).toBeGreaterThan(0);
      expect(row.match, `단 ${row.단} caption.match`).toBeGreaterThan(0);
    }
  });

  /*
   * 열 언어 검사. `test/facet-i18n.test.ts` 가 전수로 보는 것과 같은 것을 이
   * 패키지 안에서만 본다 — 배치가 도는 중에는 전수를 돌리지 않기 때문이다.
   *
   * 손으로 적은 locale 표가 스무 개 남짓이라 **하나가 빠져도 눈으로는 안 보인다.**
   * 블룸 필터가 그렇게 열여덟 개 모자란 채로 나갔다.
   */
  it('title · description · messages · 라벨이 모두 열 언어를 채운다', () => {
    const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'];

    /** LocaleStr 표 하나를 본다. 홑 문자열(숫자 라벨 등)은 대상이 아니다. */
    const tables: [string, unknown][] = [
      ['title', zAlgorithmFacet.title],
      ['description', zAlgorithmFacet.description],
    ];
    for (const [key, value] of Object.entries(zAlgorithmFacet.messages ?? {})) {
      tables.push([`messages.${key}`, value]);
    }
    const controls = zAlgorithmFacet.blocks.controls as {
      controls: { label?: unknown; action: string }[];
      metrics: { label?: unknown; name: string }[];
    };
    for (const ctrl of controls.controls) {
      if (ctrl.label !== undefined) tables.push([`control.${ctrl.action}`, ctrl.label]);
    }
    for (const metric of controls.metrics) {
      tables.push([`metric.${metric.name}`, metric.label]);
    }
    tables.push(['codePanel.label', (zAlgorithmFacet.blocks.codePanel as { label: unknown }).label]);

    const short: string[] = [];
    for (const [name, table] of tables) {
      if (typeof table !== 'object' || table === null) continue;
      const got = table as Record<string, unknown>;
      const missing = LOCALES.filter((l) => typeof got[l] !== 'string' || got[l] === '');
      if (missing.length > 0) short.push(`${name}: ${missing.join(' ')} 없음`);
    }
    // 표가 하나도 안 모이면 위 검사가 통째로 헛통과한다.
    expect(tables.length).toBeGreaterThan(18);
    expect(short).toEqual([]);
  });

  /*
   * en 이 쓰는 플레이스홀더를 번역이 빠뜨리면 그 언어에서만 값이 안 나온다.
   * 타입도 통과하고 그 언어로 띄워 본 사람만 안다.
   */
  it('en 이 쓰는 플레이스홀더를 번역이 빠뜨리지 않는다', () => {
    const bad: string[] = [];
    for (const [key, table] of Object.entries(zAlgorithmFacet.messages ?? {})) {
      if (typeof table !== 'object' || table === null) continue;
      const got = table as Record<string, string>;
      const want = [...new Set([...(got.en ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))];
      if (want.length === 0) continue;
      for (const [locale, text] of Object.entries(got)) {
        if (locale === 'en') continue;
        const missing = want.filter((p) => !text.includes(`{${p}}`));
        if (missing.length > 0) bad.push(`${key} [${locale}] {${missing.join('} {')}} 빠짐`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('코드가 부르는 문안 키를 facet.ts 가 모두 선언한다', () => {
    const declared = new Set(Object.keys(zAlgorithmFacet.messages ?? {}));
    for (const key of [
      'label.pattern', 'label.mirror', 'label.borrows', 'label.saved', 'label.matches',
      'caption.start', 'caption.whole', 'caption.borrow', 'caption.extend',
      'caption.outside', 'caption.window', 'caption.match', 'caption.summary', 'caption.push',
    ]) {
      expect(declared, `${key} 가 messages 에 없다`).toContain(key);
    }
  });
});

describe('코드 패널이 화면과 같은 답을 낸다', () => {
  it('phase 어휘가 algorithm 과 irs 에서 집합으로 일치한다 (C3)', async () => {
    const { events } = await runAll();
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => payload(e).phase as string),
    );
    expect([...emitted].sort()).toEqual(PHASES);
    expect([...irPhases(zAlgorithmImperativeIR)].sort()).toEqual(PHASES);
  });

  it('IR 이 낸 Z 배열이 algorithm 의 것과 손잡이 네 값 전부에서 같다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const joined = joinedOf(data.pattern, data.separator, spec.text);
      const mine = zTrace(joined).z;

      const theirs = new Array<number>(joined.length).fill(0);
      runIR(zAlgorithmImperativeIR, 'z_array', [joined, theirs as unknown as Value]);

      expect(theirs, `단 ${spec.level} 의 Z 배열이 갈렸다`).toEqual(mine);
    }
  });

  /*
   * 코드 패널에 두 방식을 나란히 두었으므로 **둘 다** 화면과 같은 답을 내야 한다.
   * 곧은 쪽이 다른 표를 내면 "아낀 비교" 가 견주는 두 수의 바탕이 갈린다.
   */
  it('IR 의 곧은 방법도 같은 표를 낸다 — 패널의 두 방식이 갈리지 않는다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const joined = joinedOf(data.pattern, data.separator, spec.text);
      const expected = zTrace(joined).z;

      const naive = new Array<number>(joined.length).fill(0);
      runIR(zAlgorithmImperativeIR, 'z_array_naive', [joined, naive as unknown as Value]);

      expect(naive, `단 ${spec.level} 의 곧은 IR 이 갈렸다`).toEqual(expected);
    }
  });

  it('IR 이 거둔 등장 자리가 algorithm 의 것과 손잡이 네 값 전부에서 같다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const joined = joinedOf(data.pattern, data.separator, spec.text);
      const z = zTrace(joined).z;
      const mine = zHits(z, data.pattern.length, data.separator.length);

      const buffer = new Array<number>(joined.length).fill(-1);
      const count = runIR(zAlgorithmImperativeIR, 'find_all', [
        z as unknown as Value,
        data.pattern.length,
        buffer as unknown as Value,
      ]) as number;

      expect(buffer.slice(0, count), `단 ${spec.level} 의 등장 자리가 갈렸다`).toEqual(mine);
      expect(count).toBe(spec.occ);
    }
  });

  it('찾은 자리가 곧이곧대로 훑은 것과 같다 — 내 코드부터 의심한 뒤에 말한다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const expected: number[] = [];
      for (let i = 0; i + data.pattern.length <= spec.text.length; i += 1) {
        if (spec.text.slice(i, i + data.pattern.length) === data.pattern) expected.push(i);
      }
      const joined = joinedOf(data.pattern, data.separator, spec.text);
      const hits = zHits(zTrace(joined).z, data.pattern.length, data.separator.length);
      expect(hits).toEqual(expected);
    }
  });

  it('여섯 언어가 모두 코드를 낸다', () => {
    for (const tr of [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ]) {
      const { lines } = tr.transpile(zAlgorithmImperativeIR);
      expect(lines.length, `${tr.language} 가 빈 코드를 냈다`).toBeGreaterThan(10);
      // 세 함수가 나란히 서는 것이 이 패널의 몫이다.
      const text = lines.map((l) => l.code).join('\n');
      expect(text).toContain('z_array');
      expect(text).toContain('z_array_naive');
      expect(text).toContain('find_all');
    }
  });
});

/*
 * 띄워 보는 검사. 저장소의 `facet-first-step` 이 전수로 하는 것을 이 패키지
 * 안에서만 한다 — 배치가 도는 중이라 전수는 돌리지 않는다.
 *
 * 시작하자마자 죽는 부류를 잡는 자리다. 그때 러너는 `console.error` 로 삼키고
 * 화면만 빈 채로 남으므로 타입도 빌드도 통과한다.
 */
describe('띄워도 죽지 않는다', () => {
  it('마운트하면 stage 가 그려지고 콘솔에 오류가 남지 않는다', async () => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerZAlgorithm();

    // 코드 패널은 `@ffacet/view-code` 가 주는 것이라 여기서는 대역을 세운다.
    // 이 검사가 보는 것은 stage 가 뜨느냐이지 패널의 생김새가 아니다.
    registerView('code-view', {
      mount: () => ({
        destroy: () => undefined,
        highlightPhase: () => undefined,
        clearHighlight: () => undefined,
      }),
    } as unknown as Parameters<typeof registerView>[1]);

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(
        args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '),
      );
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    let handle: ReturnType<typeof runFacet> | undefined;

    try {
      handle = runFacet(zAlgorithmFacet, host);
      handle.setSpeed(60);

      const stageOf = (): SVGSVGElement | undefined =>
        [...host.querySelectorAll('svg')].find((s) => s.getAttribute('viewBox') === '0 0 720 300');

      expect(stageOf(), 'stage 캔버스가 붙지 않았다').toBeDefined();

      await new Promise((r) => setTimeout(r, 400));

      const stage = stageOf();
      // 컨테이너를 비우면 러너가 먼저 붙여 둔 캔버스가 떨어져 나간다 (S-view).
      expect(stage, 'stage 캔버스가 떨어져 나갔다').toBeDefined();
      expect(stage!.childNodes.length, '캔버스가 비어 있다').toBeGreaterThan(0);
      // 세로는 마운트한 뒤 바뀌지 않는다 — 바뀌면 글 안의 문단이 밀린다 (S-view).
      expect(stage!.getAttribute('viewBox')).toBe('0 0 720 300');
      // 이은 글 스무 칸의 글자가 실제로 떠 있다.
      const glyphs = [...stage!.querySelectorAll('text')].map((t) => t.textContent ?? '');
      expect(glyphs).toContain('$');
      expect(errors).toEqual([]);
    } finally {
      handle?.destroy();
      console.error = original;
      host.remove();
    }
  }, 20_000);
});
