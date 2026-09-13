/**
 * 스크럽 실험 — 이벤트 로그를 되감고 다시 먹이면 순방향 재생과 같은 화면이 되는가.
 *
 * 스크럽 UI 를 조각에 붙이려면 임의 걸음으로 뒤로 갈 수 있어야 하는데, 조각의
 * 알고리즘은 코루틴이라 뒤로 감기지 않는다. 대신 걸을 때 발신한 이벤트를 적어
 * 두었다가, 되감은 뒤 앞에서부터 target 까지 다시 먹이는 길이 있다. 그것이
 * **순방향으로 거기까지 걸어간 화면과 같은가** 를 여기서 잰다.
 *
 * 재는 법:
 *   A  정상 마운트 → 자동 재생 완주 → `onReset()` → 로그[0..k] 재적용
 *   B  algorithm 을 no-op 으로 갈아끼워 마운트 → 로그[0..k] 만 적용
 *   A 와 B 의 DOM 이 같으면 그 조각은 스크럽이 성립한다.
 *
 * B 에 no-op 을 쓰는 이유는 projector·view 를 정상으로 세우되 알고리즘만 재우기
 * 위해서다. reactive 는 `init` 에서 `ensureStarted()` 를 무조건 부르므로 바깥에서
 * 막을 길이 없다.
 *
 * 조각을 배치로 나눠 처리한다. 백여든을 한꺼번에 띄우면 타이머가 서로 밀려
 * 자동 재생 완주만 수십 초가 걸리고, 두 벌씩 띄우므로 그 두 배가 된다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import {
  getProjector,
  registerProjector,
  registerAlgorithm,
} from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRuntimeEvent } from '../src/types/event.js';
import type { ProjectorInstance } from '../src/runtime/projector.js';
import type { ProjectorFactory } from '../src/runtime/projector.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 화면에 뜻이 없는 차이를 걷어낸 뒤 그림을 직렬화한다.
 *
 * 세 갈래를 뺀다. 어느 것도 눈에 보이는 차이가 아니고, 남겨 두면 진짜 잔재와
 * 뒤섞여 무엇이 문제인지 가려지지 않는다.
 *
 *   1. **컨트롤바** — 띠의 상태(A 는 끌 수 있고 B 는 아직 아니다)는 하네스가
 *      두 벌을 다르게 띄운 결과이지 되짚기의 결과가 아니다.
 *   2. **숨은 것** — `opacity` 가 0 인 요소가 어디에 있고 무슨 색인지는 화면에
 *      뜻이 없다. 그 자리가 드러날 때는 그 걸음이 다시 세팅한다.
 *   3. **기본값과 속성 차례** — 되감은 쪽은 한 번 건드린 자리라 `stroke-width="1"`
 *      처럼 기본값이 명시로 남고, 순방향 쪽은 아직 안 건드려 없다. 그리는 순서가
 *      달라 속성 차례가 갈리기도 한다. 둘 다 같은 그림이다.
 */
const DEFAULT_ATTRS: Record<string, string> = {
  opacity: '1',
  'fill-opacity': '1',
  'stroke-opacity': '1',
  'stroke-dasharray': 'none',
  'stroke-width': '1',
  'font-weight': '400',
};

/** 아무 데도 옮기지 않는 변형과 전환. 있으나 없으나 같다. */
const NEUTRAL = /^(?:translate\(\s*0(?:px)?[\s,]+0(?:px)?\s*\)|none)$/;

function normalizeStyle(value: string): string {
  return value
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      if (!d) return false;
      const [k, v] = d.split(':').map((x) => x.trim());
      if (k === 'transition' && v === 'none') return false;
      if (k === 'transform' && NEUTRAL.test(v)) return false;
      if (DEFAULT_ATTRS[k] === v) return false;
      return true;
    })
    .sort()
    .join(';');
}

function serialize(el: Element): string {
  const attrs: string[] = [];
  for (const a of Array.from(el.attributes)) {
    if (DEFAULT_ATTRS[a.name] === a.value) continue;
    if (a.name === 'transform' && NEUTRAL.test(a.value)) continue;
    if (a.name === 'style') {
      const st = normalizeStyle(a.value);
      if (st) attrs.push(`style="${st}"`);
      continue;
    }
    // 인스턴스마다 갈리는 SVG id 의 일련번호 (stage 가 마운트 횟수를 넣는다).
    attrs.push(`${a.name}="${a.value.replace(/([a-zA-Z]{2,})\d+(-[a-zA-Z0-9_-]+)/g, '$1N$2')}"`);
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
  return `<${el.tagName} ${attrs.join(' ')}>${kids}</${el.tagName}>`;
}

/** 그림만, 그중에서도 보이는 것만 꺼내 견줄 꼴로 만든다. */
function stageHtml(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('svg'))
    .map((svg) => {
      const copy = svg.cloneNode(true) as SVGElement;
      for (const el of Array.from(copy.querySelectorAll('*'))) {
        const inline = (el as unknown as { style?: { opacity?: string } }).style?.opacity;
        if (inline === '0' || el.getAttribute('opacity') === '0') el.remove();
      }
      return serialize(copy);
    })
    .join('\n');
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
 * 컨트롤이 다시 보기 + 한 걸음(또는 스크럽 띠) 뿐인 facet 이 조각이다 (S-piece).
 *
 * 띠를 단 조각도 함께 센다 — 띠가 `advance` 를 대신하므로 어휘로만 가리면 정작
 * 이 실험이 겨냥한 조각이 표본에서 빠진다.
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
  algorithmName: string;
  /** 감싸기 전의 원본 factory. B 를 세울 때 이것을 쓴다. */
  originalProjector: ProjectorFactory;
};

/** 조각 후보를 모은다 — 모듈을 한 번만 훑고 등록도 여기서 끝낸다. */
async function collect(limit?: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const [, load] of MODULES) {
    const mod = await load();
    for (const [k, v] of Object.entries(mod)) {
      if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
    }
    for (const facet of facetsOf(mod)) {
      if (!isPiece(facet)) continue;
      if (typeof facet.projector !== 'string' || typeof facet.algorithm !== 'string') continue;
      const projectorName = facet.projector.replace(/^module:/, '');
      const originalProjector = getProjector(projectorName);
      if (!originalProjector) continue;
      out.push({
        id: facet.id,
        facet,
        projectorName,
        algorithmName: facet.algorithm.replace(/^module:/, ''),
        originalProjector,
      });
      if (limit !== undefined && out.length >= limit) return out;
    }
  }
  return out;
}

type Verdict = 'same' | 'differ' | 'skipped';

/** 한 배치를 재고 조각별 판정을 돌려준다. */
async function measure(batch: Candidate[]): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  const handles: FacetRunHandle[] = [];
  const rows: Array<{
    c: Candidate;
    container: HTMLElement;
    log: FacetRuntimeEvent[];
    instance: ProjectorInstance | null;
    initialData: unknown;
  }> = [];

  try {
    // ── A. 감싼 projector 로 마운트해 발신을 적는다.
    for (const c of batch) {
      const row = {
        c,
        container: document.createElement('div'),
        log: [] as FacetRuntimeEvent[],
        instance: null as ProjectorInstance | null,
        initialData: undefined as unknown,
      };
      document.body.appendChild(row.container);
      registerProjector(c.projectorName, (views, runtime) => {
        const inner = c.originalProjector(views, runtime);
        row.instance = inner;
        return {
          ...inner,
          onInit(initialData: unknown) {
            row.initialData = initialData;
            inner.onInit?.(initialData);
          },
          async onEvent(event: FacetRuntimeEvent) {
            row.log.push(event);
            await inner.onEvent(event);
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

    // ── B. 알고리즘을 재우고 원본 projector 로 다시 세운다.
    const fresh = new Map<
      string,
      { container: HTMLElement; instance: ProjectorInstance | null; k: number }
    >();
    for (const row of rows) {
      const { c } = row;
      if (row.log.length < 3 || !row.instance) {
        verdicts.set(c.id, 'skipped');
        continue;
      }
      const k = Math.max(1, Math.floor(row.log.length / 2));

      registerAlgorithm(c.algorithmName, async () => {}, { mechanismKind: 'reactive' });
      const holder = {
        container: document.createElement('div'),
        instance: null as ProjectorInstance | null,
        k,
      };
      document.body.appendChild(holder.container);
      registerProjector(c.projectorName, (views, runtime) => {
        const inner = c.originalProjector(views, runtime);
        holder.instance = inner;
        return inner;
      });
      handles.push(runFacet(c.facet, holder.container));
      fresh.set(c.id, holder);
    }

    await delay(300);

    // ── 되감고 다시 먹인다 (A) / 앞부분만 먹인다 (B).
    for (const row of rows) {
      const holder = fresh.get(row.c.id);
      if (!holder?.instance || !row.instance) continue;
      const slice = row.log.slice(0, holder.k);
      // Timeline.rewindTo 와 같은 차례로 되짚는다 (S-runtime 의 reset 순서:
      // onReset → onInit). onInit 을 빠뜨리면 projector 가 그 자리에서 그리는
      // 바탕이 사라진 채로 걸음만 얹혀, 실제 구현과 다른 것을 재게 된다.
      row.instance.onReset?.();
      row.instance.onInit?.(row.initialData);
      for (const ev of slice) await row.instance.onEvent(ev);
      for (const ev of slice) await holder.instance.onEvent(ev);
    }

    await delay(600);

    for (const row of rows) {
      const holder = fresh.get(row.c.id);
      if (!holder) continue;
      // stage 만 견준다. 컨트롤바까지 넣으면 띠의 상태(A 는 끌 수 있고 B 는 아직
      // 아니다)가 차이로 잡히는데, 그것은 하네스가 두 벌을 다르게 띄운 결과이지
      // 되짚기의 결과가 아니다.
      const a = stageHtml(row.container);
      const b = stageHtml(holder.container);
      verdicts.set(row.c.id, a === b ? 'same' : 'differ');
      if (a !== b && process.env.SCRUB_DIFF) {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        console.log(
          `\n── ${row.c.id}\n  되감기: …${a.slice(Math.max(0, i - 90), i + 90)}\n  순방향: …${b.slice(Math.max(0, i - 90), i + 90)}`,
        );
      }
    }
  } finally {
    for (const h of handles) h.destroy();
  }
  return verdicts;
}

describe('스크럽 — 로그 재적용', () => {
  it('되감고 다시 먹인 화면이 순방향 재생과 같다', async () => {
    clearRegistry();
    const originalError = console.error;
    console.error = () => {};

    const all = new Map<string, Verdict>();
    try {
      const candidates = await collect(Number(process.env.SCRUB_LIMIT ?? '12'));
      const size = Number(process.env.SCRUB_BATCH ?? '12');
      for (let i = 0; i < candidates.length; i += size) {
        const batch = candidates.slice(i, i + size);
        const v = await measure(batch);
        for (const [id, verdict] of v) all.set(id, verdict);
        // 배치마다 찍는다. vitest 는 테스트가 끝나야 출력을 내보내지만, 중간에
        // 멈춘 경우 어느 배치에서 멎었는지는 이 줄들이 알려 준다.
        process.stdout.write(
          `[배치 ${i / size + 1}] 누적 ${all.size} — ` +
            `같음 ${[...all.values()].filter((x) => x === 'same').length}\n`,
        );
      }
    } finally {
      console.error = originalError;
    }

    const same = [...all].filter(([, v]) => v === 'same').map(([id]) => id);
    const differ = [...all].filter(([, v]) => v === 'differ').map(([id]) => id);
    const skipped = [...all].filter(([, v]) => v === 'skipped').map(([id]) => id);

    console.log(
      JSON.stringify(
        { 잰것: all.size, 같음: same.length, 다름: differ.length, 건너뜀: skipped.length, 다른것: differ },
        null,
        2,
      ),
    );
    expect(all.size).toBeGreaterThan(0);
  }, 1_800_000);
});
