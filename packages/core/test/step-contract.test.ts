/**
 * 걸음 계약 — `onEvent` 가 돌아왔을 때 그 걸음의 화면은 다 섰는가.
 *
 * 조각을 바깥에서 다루려면 (되짚기·길이 재기·걸음 단위 접근성) 걸음이 언제 끝나는지
 * 알 수 있어야 한다. 그 앎의 유일한 통로가 `projector.onEvent` 가 돌려주는 Promise 다.
 * 그것이 풀렸는데 화면이 더 변하면, 바깥에서는 걸음의 끝을 알 길이 없다.
 *
 * S-piece 가 이미 조건부로 말해 두었다 — "`onEvent` 가 애니메이션을 `await` 하지 않고
 * 띄워 보내기만 하면 … 애니메이션을 기다리게 고치는 편이 옳다." 다만 괄호 안 단서라
 * 강제가 아니다. 이 검사는 그것이 실제로 얼마나 지켜지는지 잰다.
 *
 * 재는 법: 걸음 이벤트를 먹이고 `await` 가 풀린 **직후**의 그림과, 잠시 뒤의 그림을
 * 견준다. 다르면 그 걸음은 자기가 끝났다고 말해 놓고 아직 그리고 있었던 것이다.
 *
 * CSS transition 은 여기 걸리지 않는다 — DOM 속성을 곧바로 목표값으로 두고 렌더링만
 * 보간하므로 그림(직렬화한 DOM)이 흔들리지 않는다. 걸리는 것은 프레임마다 속성을
 * 고쳐 쓰는 tween 과, 나중에 깨어나 화면을 고치는 지연 발화다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import { getProjector, registerProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRuntimeEvent } from '../src/types/event.js';
import type { ProjectorFactory } from '../src/runtime/projector.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 그림을 견줄 꼴로. 화면에 뜻이 없는 것은 걷어낸다 (`scrub-replay` 와 같은 잣대). */
function stageHtml(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('svg'))
    .map((svg) => svg.innerHTML)
    .join('\n');
}

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
  const only = new Set((process.env.STEP_ONLY ?? '').split(',').filter(Boolean));
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

type Row = {
  c: Candidate;
  container: HTMLElement;
  /** 걸음을 몇 개 쟀나. */
  steps: number;
  /** 그중 자기가 끝났다고 말해 놓고 더 그린 걸음. */
  broke: number;
  /** 아직 지켜보는 중인 걸음의 직후 해시. */
  pending: Array<{ at: number; want: string }>;
};

/**
 * 걸음 하나가 끝난 뒤 얼마를 더 지켜볼지.
 *
 * 자동 재생의 걸음 간격(`stepMs`) 은 대개 700~900 이라 그보다 짧아야 다음 걸음과
 * 섞이지 않는다. 지연 발화는 대체로 이 안에 드러난다.
 */
const WATCH_MS = 320;

async function measure(batch: Candidate[]): Promise<Map<string, { steps: number; broke: number }>> {
  const out = new Map<string, { steps: number; broke: number }>();
  const handles: FacetRunHandle[] = [];
  const rows: Row[] = [];

  try {
    for (const c of batch) {
      const row: Row = { c, container: document.createElement('div'), steps: 0, broke: 0, pending: [] };
      document.body.appendChild(row.container);
      registerProjector(c.projectorName, (views, runtime) => {
        const inner = c.originalProjector(views, runtime);
        return {
          ...inner,
          async onEvent(event: FacetRuntimeEvent) {
            await inner.onEvent(event);
            if (event.silent === true) return;
            row.steps += 1;
            // 걸음이 끝났다고 말한 자리. 여기서부터 지켜본다.
            row.pending.push({ at: Date.now(), want: hash(stageHtml(row.container)) });
          },
        };
      });
      handles.push(runFacet(c.facet, row.container));
      rows.push(row);
    }

    /** 지켜보는 시간이 지난 걸음을 판정한다. */
    const sweep = (force: boolean): void => {
      const now = Date.now();
      for (const row of rows) {
        const keep: Row['pending'] = [];
        for (const p of row.pending) {
          if (!force && now - p.at < WATCH_MS) {
            keep.push(p);
            continue;
          }
          if (hash(stageHtml(row.container)) !== p.want) row.broke += 1;
        }
        row.pending = keep;
      }
    };

    // 자동 재생이 멎을 때까지. 그동안 걸음마다 지켜본 결과를 걷는다.
    const total = (): number => rows.reduce((a, r) => a + r.steps, 0);
    const started = Date.now();
    let last = total();
    let quietSince = Date.now();
    while (Date.now() - started < 60_000) {
      await delay(80);
      sweep(false);
      const now = total();
      if (now !== last) {
        last = now;
        quietSince = Date.now();
        continue;
      }
      if (Date.now() - quietSince >= 1_200) break;
    }
    await delay(WATCH_MS + 100);
    sweep(true);

    for (const row of rows) out.set(row.c.id, { steps: row.steps, broke: row.broke });
  } finally {
    for (const h of handles) h.destroy();
  }
  return out;
}

describe('걸음 계약', () => {
  it('onEvent 가 돌아왔을 때 그 걸음의 화면은 다 서 있는가', async () => {
    clearRegistry();
    const originalError = console.error;
    console.error = () => {};

    const all = new Map<string, { steps: number; broke: number }>();
    try {
      const candidates = await collect(Number(process.env.STEP_LIMIT ?? '12'));
      const size = Number(process.env.STEP_BATCH ?? '12');
      for (let i = 0; i < candidates.length; i += size) {
        const v = await measure(candidates.slice(i, i + size));
        for (const [id, r] of v) all.set(id, r);
        const keep = [...all.values()].filter((r) => r.broke === 0).length;
        process.stdout.write('[배치 ' + (i / size + 1) + '] 누적 ' + all.size + ' — 지킴 ' + keep + '\n');
      }
    } finally {
      console.error = originalError;
    }

    const kept = [...all].filter(([, r]) => r.broke === 0).map(([id]) => id);
    const broke = [...all].filter(([, r]) => r.broke > 0);

    console.log(
      JSON.stringify(
        {
          잰것: all.size,
          지킴: kept.length,
          어김: broke.length,
          지킨것: kept,
          어긴것: broke.map(([id, r]) => id + ' (' + r.broke + '/' + r.steps + ')'),
        },
        null,
        2,
      ),
    );
    expect(all.size).toBeGreaterThan(0);
  }, 1_800_000);
});
