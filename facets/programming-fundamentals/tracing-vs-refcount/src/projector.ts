/**
 * 수거 두 방식 — 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * 운동의 길이는 걸음 간격의 일부를 **그때그때의 재생 속도**로 나눈 것이다 (`runtime.getSpeed()`).
 * 캡션은 걸음이 한 일을 셈한 값으로만 말한다 — 결론 글자는 두지 않는다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { StageData, TracingVsRefcountStage } from './tracing-vs-refcount-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pairs = (v: unknown): [string, string][] | null => {
  if (!Array.isArray(v)) return null;
  const out: [string, string][] = [];
  for (const e of v) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string') return null;
    out.push([e[0], e[1]]);
  }
  return out;
};

export const tracingVsRefcountProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TracingVsRefcountStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let stepMs = 1000;
  const ms = (): number => (stepMs * 0.7) / Math.max(0.01, runtime?.getSpeed() ?? 1);

  const readStageData = (data: unknown): StageData | null => {
    if (typeof data !== 'object' || data === null) return null;
    const d = data as Record<string, unknown>;
    const objects = Array.isArray(d.objects) && d.objects.every((o) => typeof o === 'string') ? (d.objects as unknown[]).map(String) : null;
    const edges = pairs(d.edges);
    const cycleEdges = pairs(d.cycleEdges);
    const roots: { name: string; to: string }[] = [];
    if (Array.isArray(d.roots)) {
      for (const r of d.roots) {
        if (typeof r !== 'object' || r === null) return null;
        const rr = r as Record<string, unknown>;
        const name = str(rr.name);
        const to = str(rr.to);
        if (name === null || to === null) return null;
        roots.push({ name, to });
      }
    }
    if (!objects || !edges || !cycleEdges) return null;
    return { objects, roots, edges, cycleEdges, cycle: num(d.cycle) === 1 ? 1 : 0 };
  };

  return {
    onInit(data) {
      const d = data as Record<string, unknown> | null;
      const s = num(d?.stepMs);
      if (s !== null) stepMs = s;
      const sd = readStageData(data);
      if (sd) stage?.build(sd);
    },
    onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase?.(str(p.phase));
          return;
        }
        case 'round-start': {
          const cycle = num(p.cycle) ?? 0;
          if (!Array.isArray(p.counts)) throw new Error('tracingVsRefcountProjector: round-start 의 counts 가 목록이 아니다');
          const counts = p.counts.map((c, i) => {
            if (typeof c !== 'number' || !Number.isFinite(c)) throw new Error(`tracingVsRefcountProjector: round-start 의 counts[${i}] 가 수가 아니다`);
            return c;
          });
          code?.clearHighlight?.();
          stage?.startRound(cycle, counts, ms());
          const roots = Array.isArray(p.roots) ? p.roots.filter((r): r is string => typeof r === 'string') : [];
          stage?.setCaption(tr('caption.start', 'Roots held: {names}', { names: roots.join(', ') }));
          return;
        }
        case 'root-dropped': {
          const root = str(p.root);
          const object = str(p.object);
          const count = num(p.count);
          if (root === null || object === null || count === null) return;
          stage?.dropRoot(root, object, count, ms());
          stage?.setCaption(
            `${tr('caption.dropped', 'Dropped: {name}', { name: root })} · ${tr('caption.count', 'Count of {obj}: {n}', { obj: object, n: count })}`,
          );
          return;
        }
        case 'rc-freed': {
          const object = str(p.object);
          if (object === null) return;
          const lowered: { object: string; count: number }[] = [];
          if (Array.isArray(p.lowered)) {
            for (const l of p.lowered) {
              if (typeof l !== 'object' || l === null) continue;
              const ll = l as Record<string, unknown>;
              const o = str(ll.object);
              const c = num(ll.count);
              if (o !== null && c !== null) lowered.push({ object: o, count: c });
            }
          }
          stage?.refcountFree(object, lowered, ms());
          const parts = [tr('caption.freedByCounting', 'Freed by counting: {obj}', { obj: object })];
          for (const l of lowered) parts.push(tr('caption.count', 'Count of {obj}: {n}', { obj: l.object, n: l.count }));
          stage?.setCaption(parts.join(' · '));
          return;
        }
        case 'marked': {
          const object = str(p.object);
          const root = str(p.root);
          if (object === null || root === null) return;
          stage?.mark(object, root, str(p.via), ms());
          stage?.setCaption(tr('caption.marked', 'Marked: {obj}', { obj: object }));
          return;
        }
        case 'swept': {
          const object = str(p.object);
          if (object === null) return;
          const freed = p.freed === true;
          stage?.sweep(object, freed, p.leftover === true, ms());
          stage?.setCaption(
            freed ? tr('caption.swept', 'Swept: {obj}', { obj: object }) : tr('caption.kept', 'Kept: {obj}', { obj: object }),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
