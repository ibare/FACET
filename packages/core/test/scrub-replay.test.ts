/**
 * 스크럽 계측 — 되짚은 화면이 순방향으로 거기까지 걸어간 화면과 같은가.
 *
 * 스크럽은 조각이 자료가 고정된 순수 함수라는 데 기댄다. 같은 걸음이 언제나 같은
 * 이벤트를 내므로, 걸을 때 발신을 적어 두었다가 되감은 뒤 다시 먹이면 그 걸음의
 * 화면이 되살아난다 (`runtime/timeline.ts`). 그 전제를 여기서 잰다.
 *
 * ## 한 벌로 잰다
 *
 * 처음에는 조각마다 두 벌을 띄웠다 — 되짚은 것과, algorithm 을 재운 채 로그 앞부분만
 * 먹인 것. 두 벌은 비싸고(배치 24 에서 멎었다) 인스턴스가 달라 SVG id 의 일련번호
 * 같은 **하네스가 만든 차이**가 섞인다.
 *
 * 지금은 한 벌이다. 순방향으로 걸어가는 동안 걸음마다 화면의 해시를 적어 두었다가,
 * 완주 후 되짚어 그 걸음으로 가서 해시를 견준다. 화면을 통째로 쥐지 않으므로 조각
 * 백여든을 재도 메모리가 늘지 않는다. 어긋난 조각은 `SCRUB_DIFF` 로 다시 돌린다.
 *
 * 걸음의 해시는 **다음 걸음을 먹이기 직전**에 찍는다. 그 자리가 앞 걸음의 안정된
 * 끝 상태다 — 걸음 직후에 찍으면 애니메이션 한복판을 재게 된다.
 *
 * ## 재는 잣대는 "화면에 뜻이 있는 차이"
 *
 * 컨트롤바는 뺀다. `opacity` 가 0 인 것도 뺀다. `stroke-width="1"` 같은 기본값과
 * 그리는 순서에서 온 속성 차례도 뺀다 — 되감은 쪽은 한 번 건드린 자리라 기본값이
 * 명시로 남고 순방향 쪽은 아직 안 건드려 없을 뿐, 같은 그림이다.
 *
 * ## 되짚는 차례는 실제 구현과 같아야 한다
 *
 * `onReset` → `onInit` → 로그. Timeline 이 그 차례로 되짚고, S-runtime 이 reset
 * 순서로 못박은 것도 그것이다. 한때 `onReset` 만 부르고 쟀는데 그 한 줄로 72 종 중
 * 아홉이 갈렸다 — 하네스가 실제 구현과 다른 것을 재고 있었다.
 *
 * ## 장면(scene) 조각은 여기서 재지 않는다
 *
 * 위의 전제 — "되감고 로그를 다시 먹이면 그 걸음의 화면이 되살아난다" — 가 장면
 * 방식에는 해당하지 않는다. 장면을 쥐고 있으므로 `rewindTo` 가 로그를 다시 먹이지
 * 않고 그 걸음의 장면을 꺼내 곧바로 그린다 (`runtime/timeline.ts`). 그래서
 * `collect()` 가 `projector` 를 선언한 조각만 고른다.
 *
 * 장면 조각의 되짚기는 `scripts/scene-audit.mjs` 가 실제 Chrome 으로 잰다 — 흔들림
 * (되짚은 뒤 화면이 저 혼자 바뀌는가) 과 왕복어긋남 둘 다, happy-dom 이 레이아웃도
 * 페인트도 셈하지 않아 여기서는 잴 수 없는 것들이다.
 *
 * 그러니 `SCRUB_ONLY` 에 장면 조각의 id 를 주면 고를 것이 없어 실패한다. 그것이
 * 계측의 빈틈이 아니라 잣대가 갈린 자리다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import { getProjector, registerProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRuntimeEvent } from '../src/types/event.js';
import type { ProjectorInstance, ProjectorFactory } from '../src/runtime/projector.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 화면에 뜻이 없는 속성. 있으나 없으나 같은 그림이다. */
const DEFAULT_ATTRS: Record<string, string> = {
  opacity: '1',
  'fill-opacity': '1',
  'stroke-opacity': '1',
  'stroke-dasharray': 'none',
  'stroke-width': '1',
  'font-weight': '400',
};

/**
 * 아무 것도 하지 않는 변형과 전환.
 *
 * `translate(0,0)` · `scale(1)` · `rotate(0)` 은 있으나 없으나 같은 그림이다.
 * 되감은 쪽은 한 번 건드린 자리라 중립값이 명시로 남고, 순방향 쪽은 아직 안 건드려
 * 없을 뿐이다.
 */
const NEUTRAL =
  /^(?:translate\(\s*0(?:px)?[\s,]+0(?:px)?\s*\)|scale\(\s*1(?:\s*,\s*1)?\s*\)|rotate\(\s*0(?:deg)?\s*\)|none)$/;

function normalizeStyle(value: string): string {
  return value
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      if (!d) return false;
      const [k, v] = d.split(':').map((x) => x.trim());
      if (k === 'transition' && v === 'none') return false;
      if (k === 'transform' && NEUTRAL.test(v)) return false;
      return DEFAULT_ATTRS[k] !== v;
    })
    .sort()
    .join(';');
}

function serialize(el: Element): string {
  const attrs: string[] = [];
  // 선을 안 그리면 선 굵기는 뜻이 없다.
  const noStroke = el.getAttribute('stroke') === 'none';
  for (const a of Array.from(el.attributes)) {
    if (DEFAULT_ATTRS[a.name] === a.value) continue;
    if (noStroke && (a.name === 'stroke-width' || a.name === 'stroke-dasharray')) continue;
    if (a.name === 'transform' && NEUTRAL.test(a.value)) continue;
    if (a.name === 'style') {
      const st = normalizeStyle(a.value);
      if (st) attrs.push('style="' + st + '"');
      continue;
    }
    attrs.push(a.name + '="' + a.value + '"');
  }
  attrs.sort();
  const kids = Array.from(el.childNodes)
    .map((n) =>
      n.nodeType === 1
        ? serialize(n as Element)
        : n.nodeType === 3
          ? (n.textContent ?? '').trim()
          : '',
    )
    .filter(Boolean)
    .join('');
  return '<' + el.tagName + ' ' + attrs.join(' ') + '>' + kids + '</' + el.tagName + '>';
}

/** 그림만, 그중에서도 보이는 것만 꺼내 견줄 꼴로 만든다. */
function stageHtml(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('svg'))
    .map((svg) => {
      const copy = svg.cloneNode(true) as SVGElement;
      for (const el of Array.from(copy.querySelectorAll('*'))) {
        const st = (el as unknown as { style?: { opacity?: string; display?: string } }).style;
        const hidden =
          st?.opacity === '0' ||
          el.getAttribute('opacity') === '0' ||
          st?.display === 'none' ||
          el.getAttribute('display') === 'none';
        if (hidden) el.remove();
      }
      return serialize(copy);
    })
    .join('\n');
}

/** FNV-1a. 화면을 통째로 쥐지 않으려고 해시만 남긴다. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function facetsOf(mod: Record<string, unknown>): FacetJson[] {
  const out: FacetJson[] = [];
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      const id = (v as { id: string }).id;
      if (id.startsWith('facet:')) out.push(v as FacetJson);
    }
  }
  return out;
}

/**
 * 조각인지 컨트롤로 가린다 (S-piece). 띠 갈래(`seek`)도 함께 센다 — 어휘로만
 * 가리면 정작 이 계측이 겨냥한 조각이 표본에서 빠진다.
 */
function isPiece(facet: FacetJson): boolean {
  for (const block of Object.values(facet.blocks)) {
    const spec = block as { type?: unknown; controls?: unknown };
    if (spec.type !== 'control-bar' || !Array.isArray(spec.controls)) continue;
    const actions = spec.controls.map((c) => (c as { action?: unknown }).action);
    return (
      actions.length === 2 &&
      actions.includes('reset') &&
      (actions.includes('advance') || actions.includes('seek'))
    );
  }
  return false;
}

type Candidate = {
  id: string;
  facet: FacetJson;
  projectorName: string;
  originalProjector: ProjectorFactory;
};

async function collect(limit?: number): Promise<Candidate[]> {
  const only = new Set((process.env.SCRUB_ONLY ?? '').split(',').filter(Boolean));
  const out: Candidate[] = [];
  for (const [, load] of MODULES) {
    const mod = await load();
    for (const [k, v] of Object.entries(mod)) {
      if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
    }
    for (const facet of facetsOf(mod)) {
      if (!isPiece(facet)) continue;
      if (only.size > 0 && !only.has(facet.id)) continue;
      if (typeof facet.projector !== 'string') continue;
      const projectorName = facet.projector.replace(/^module:/, '');
      const originalProjector = getProjector(projectorName);
      if (!originalProjector) continue;
      out.push({ id: facet.id, facet, projectorName, originalProjector });
      if (only.size === 0 && limit !== undefined && out.length >= limit) return out;
    }
  }
  return out;
}

type Verdict = 'same' | 'differ' | 'skipped';

type Row = {
  c: Candidate;
  container: HTMLElement;
  log: FacetRuntimeEvent[];
  /** 걸음 s (1부터) 가 끝나는 로그 인덱스(배타). */
  ends: number[];
  /** 걸음 s 의 안정된 끝 화면 해시. 다음 걸음을 먹이기 직전에 찍는다. */
  stepHash: string[];
  /** 진단할 때만 쥐는 그림 원본. 어긋난 자리를 눈으로 보려면 해시로는 모자란다. */
  stepHtml: string[];
  instance: ProjectorInstance | null;
  initialData: unknown;
  /** 되짚어 가 본 걸음. */
  k?: number;
};

/** 한 배치를 재고 조각별 판정을 돌려준다. */
async function measure(batch: Candidate[]): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  const handles: FacetRunHandle[] = [];
  const rows: Row[] = [];

  try {
    for (const c of batch) {
      const row: Row = {
        c,
        container: document.createElement('div'),
        log: [],
        ends: [],
        stepHash: [],
        stepHtml: [],
        instance: null,
        initialData: undefined,
      };
      document.body.appendChild(row.container);
      registerProjector(c.projectorName, (views, runtime) => {
        const inner = c.originalProjector(views, runtime);
        row.instance = inner;
        return {
          ...inner,
          onInit(initialData: unknown) {
            // Timeline 과 같이 사본을 쥔다. 참조를 쥐면 algorithm 이 제자리에서
            // 고친 뒤의 자료로 되짚게 되어, 실제 구현과 다른 것을 재게 된다.
            row.initialData = structuredClone(initialData);
            inner.onInit?.(initialData);
          },
          async onEvent(event: FacetRuntimeEvent) {
            // 먹이기 직전이 앞 걸음의 안정된 끝 상태다.
            if (row.ends.length > row.stepHash.length) {
              const html = stageHtml(row.container);
              row.stepHash.push(hash(html));
              if (process.env.SCRUB_DIFF) row.stepHtml.push(html);
            }
            row.log.push(event);
            await inner.onEvent(event);
            if (event.silent !== true) row.ends.push(row.log.length);
          },
        };
      });
      handles.push(runFacet(c.facet, row.container));
      rows.push(row);
    }

    // 발신이 멎으면 자동 재생이 끝난 것이다.
    const total = (): number => rows.reduce((a, r) => a + r.log.length, 0);
    const started = Date.now();
    let last = total();
    let quietSince = Date.now();
    while (Date.now() - started < 45_000) {
      await delay(200);
      const now = total();
      if (now !== last) {
        last = now;
        quietSince = Date.now();
        continue;
      }
      if (Date.now() - quietSince >= 1_100) break;
    }

    // 아직 못 찍은 걸음들. 지연 애니메이션이 앉기를 기다린 뒤 찍는다.
    await delay(1_300);
    for (const row of rows) {
      while (row.stepHash.length < row.ends.length) {
        const html = stageHtml(row.container);
        row.stepHash.push(hash(html));
        if (process.env.SCRUB_DIFF) row.stepHtml.push(html);
      }
    }

    // ── 되짚어 절반 걸음으로 간다. Timeline.rewindTo 와 같은 차례로.
    for (const row of rows) {
      const n = row.ends.length;
      if (n < 3 || !row.instance) {
        verdicts.set(row.c.id, 'skipped');
        continue;
      }
      const k = Math.max(1, Math.floor(n / 2));
      row.k = k;
      row.instance.onReset?.();
      row.instance.onInit?.(structuredClone(row.initialData));
      for (let i = 0; i < row.ends[k - 1]; i++) await row.instance.onEvent(row.log[i]);
    }

    await delay(1_300);

    for (const row of rows) {
      if (row.k === undefined) continue;
      const after = hash(stageHtml(row.container));
      const want = row.stepHash[row.k - 1];
      verdicts.set(row.c.id, after === want ? 'same' : 'differ');
      if (after !== want && process.env.SCRUB_DIFF) {
        const fwd = row.stepHtml[row.k - 1] ?? '';
        const back = stageHtml(row.container);
        let i = 0;
        while (i < fwd.length && i < back.length && fwd[i] === back[i]) i++;
        console.log(
          '\n── ' + row.c.id + '  걸음 ' + row.k + '/' + row.ends.length + '\n' +
            '  순방향: …' + fwd.slice(Math.max(0, i - 100), i + 130) + '\n' +
            '  되짚기: …' + back.slice(Math.max(0, i - 100), i + 130),
        );
      }
    }
  } finally {
    for (const h of handles) h.destroy();
  }
  return verdicts;
}

describe('스크럽 — 되짚은 화면이 순방향과 같은가', () => {
  it('조각을 재고 어긋난 것을 모은다', async () => {
    clearRegistry();
    const originalError = console.error;
    console.error = () => {};

    const all = new Map<string, Verdict>();
    try {
      const candidates = await collect(Number(process.env.SCRUB_LIMIT ?? '12'));
      const size = Number(process.env.SCRUB_BATCH ?? '12');
      for (let i = 0; i < candidates.length; i += size) {
        const v = await measure(candidates.slice(i, i + size));
        for (const [id, verdict] of v) all.set(id, verdict);
        process.stdout.write(
          '[배치 ' + (i / size + 1) + '] 누적 ' + all.size + ' — 같음 ' +
            [...all.values()].filter((x) => x === 'same').length + '\n',
        );
      }
    } finally {
      console.error = originalError;
    }

    const differ = [...all].filter(([, v]) => v === 'differ').map(([id]) => id);
    const skipped = [...all].filter(([, v]) => v === 'skipped').map(([id]) => id);

    console.log(
      JSON.stringify(
        {
          잰것: all.size,
          같음: all.size - differ.length - skipped.length,
          다름: differ.length,
          건너뜀: skipped.length,
          다른것: differ,
        },
        null,
        2,
      ),
    );
    expect(all.size).toBeGreaterThan(0);
  }, 1_800_000);
});
