/**
 * carry-several-lines 의 무대 — 줄이 갈라지고 솎인다.
 *
 * 깊이마다 세로 한 줄(열)이다. 한 열 안의 자리는 순위다 — 위 `width` 칸이 살아남은 줄,
 * 그 아래 틈을 두고 끊긴 줄. 펼칠 때 가지는 부모 자리에서 뻗어 나와 펼친 차례로 서고,
 * 솎을 때 점수 순위의 칸으로 옮겨 앉는다. 앞 걸음 2등의 자식이 1등 칸으로 올라서는 것이
 * 이 옮겨 앉기에서 보인다. 끊긴 가지는 선이 부모 쪽으로 물러나 반만 남는다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { CarrySeveralLinesNode, CarrySeveralLinesScene } from './scene.js';

const H = 300;
const PAD = 16;
const NODE_W_MAX = 112;
const NODE_H = 26;
const PITCH = 34;
const TOP = 62;
const CUT_GAP = 18;
const EXPAND_MS = 700;
const PRUNE_MS = 900;
const COMPARE_MS = 900;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

const r2 = (v: number): number => {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
};

/** 로그확률 · 점수 표시 — 소수 둘째 자리, 빼기 기호. */
function fmtScore(v: number): string {
  const s = r2(v).toFixed(2);
  return s === '-0.00' ? '0.00' : s.replace('-', '−');
}

const fmtProb = (v: number): string => r2(v).toFixed(2);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(e);
  return e;
}

/** 자리 셈 — 장면만 보고 정한다. */
function geometry(scene: CarrySeveralLinesScene) {
  const length = Math.max(1, scene.length);
  const colSpan = (PIECE_CANVAS_W - 2 * PAD) / (length + 1);
  const nodeW = Math.min(NODE_W_MAX, colSpan - 36);
  const colStep = (PIECE_CANVAS_W - 2 * PAD - nodeW) / length;
  const colX = (d: number): number => PAD + d * colStep;
  const slotY = (slot: number, cut: boolean): number => TOP + slot * PITCH + (cut ? CUT_GAP : 0);
  const isCut = (n: CarrySeveralLinesNode): boolean => n.rank !== null && n.rank >= scene.width;
  /** 솎이기 전 자리 — 펼친 차례. */
  const orderPos = (n: CarrySeveralLinesNode): Pt => ({ x: colX(n.depth), y: slotY(n.order, false) });
  const pos = (n: CarrySeveralLinesNode): Pt => {
    if (n.depth === 0) return { x: colX(0), y: TOP + PITCH / 2 };
    if (n.rank === null) return orderPos(n);
    return { x: colX(n.depth), y: slotY(n.rank, isCut(n)) };
  };
  const dividerY = slotY(scene.width, false) - (PITCH - NODE_H) / 2 + CUT_GAP / 2;
  return { nodeW, colX, pos, orderPos, isCut, dividerY };
}

type Handle = { g: SVGGElement; edge: SVGLineElement | null; at: Pt; from: Pt | null };

export const carrySeveralLinesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<CarrySeveralLinesScene> {
    const root = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function captionsOf(scene: CarrySeveralLinesScene): { text: string; mark: string | null }[] {
      const step = scene.step;
      const byId = new Map(scene.nodes.map((n) => [n.id, n] as const));
      const lineOf = (ids: string[]): string => {
        const last = ids[ids.length - 1];
        return last ?? scene.prompt.join(' ');
      };
      switch (step.kind) {
        case 'init':
          return [
            {
              text: t('caption.init', 'Prompt "{prompt}". Beam width {w}: carry {w} lines for {n} tokens.', {
                prompt: scene.prompt.join(' '),
                w: scene.width,
                n: scene.length,
              }),
              mark: null,
            },
          ];
        case 'expand': {
          const n = scene.nodes.filter((x) => x.depth === step.depth).length;
          return [
            {
              text: t('caption.expand', 'Token {d}: every kept line branches into its next candidates, {n} in all.', {
                d: step.depth,
                n,
              }),
              mark: null,
            },
          ];
        }
        case 'prune': {
          const col = scene.nodes.filter((x) => x.depth === step.depth);
          const kept = Math.min(scene.width, col.length);
          const out = [
            {
              text: t('caption.prune', 'All {n} ranked by score. Top {w} kept, {cut} cut.', {
                n: col.length,
                w: kept,
                cut: col.length - kept,
              }),
              mark: null as string | null,
            },
          ];
          const lead = col.find((x) => x.rank === 0);
          const parent = lead && lead.parent !== null ? byId.get(lead.parent) : undefined;
          if (lead && parent && parent.rank !== null && parent.rank > 0) {
            out.push({
              text: t('caption.overtake', 'The line ranked {was} a step ago now leads: {line} {score}.', {
                was: parent.rank + 1,
                line: lead.id,
                score: fmtScore(lead.score),
              }),
              mark: null,
            });
          }
          return out;
        }
        case 'compare': {
          const v = scene.verdict;
          if (!v) return [];
          const gVars = {
            line: lineOf(v.greedy),
            score: fmtScore(v.greedyScore),
            p: fmtProb(Math.exp(v.greedyScore)),
          };
          const greedyText =
            v.greedyRank === null
              ? t('caption.greedyGone', 'Greedy: {line} ({score}, p {p}). The beam cut its prefix earlier.', gVars)
              : v.greedyRank > scene.width
                ? t('caption.greedyCut', 'Greedy: {line} ({score}, p {p}). In the beam it ranked {rank} and was cut.', {
                    ...gVars,
                    rank: v.greedyRank,
                  })
                : t('caption.greedyKept', 'Greedy: {line} ({score}, p {p}). The beam kept it too, at rank {rank}.', {
                    ...gVars,
                    rank: v.greedyRank,
                  });
          return [
            { text: greedyText, mark: colors.itemComparing },
            {
              text: t('caption.beam', 'Beam: {line} ({score}, p {p}).', {
                line: lineOf(v.beam),
                score: fmtScore(v.beamScore),
                p: fmtProb(Math.exp(v.beamScore)),
              }),
              mark: colors.success,
            },
          ];
        }
        default:
          return [];
      }
    }

    /** 그 장면의 화면 전체. 운동이 만질 손잡이를 돌려준다. */
    function drawStatic(scene: CarrySeveralLinesScene): {
      handles: Map<string, Handle>;
      traces: { path: SVGPolylineElement; length: number }[];
    } {
      root.textContent = '';
      const handles = new Map<string, Handle>();
      const traces: { path: SVGPolylineElement; length: number }[] = [];

      const caps = captionsOf(scene);
      caps.forEach((c, i) => {
        const y = 22 + i * 20;
        const x = c.mark ? PAD + 20 : PAD;
        if (c.mark) {
          svg('line', { x1: PAD, y1: y - 4, x2: PAD + 14, y2: y - 4, stroke: c.mark, 'stroke-width': 3, 'stroke-linecap': 'round' }, root);
        }
        const tx = svg('text', { x, y, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);
        tx.textContent = c.text;
      });

      if (scene.nodes.length === 0) return { handles, traces };

      const geo = geometry(scene);
      const byId = new Map(scene.nodes.map((n) => [n.id, n] as const));
      const v = scene.verdict;
      const greedySet = new Set(v ? v.greedy : []);
      const beamSet = new Set(v ? v.beam : []);

      // 빔 폭의 문턱 — 솎음이 한 번이라도 있었으면
      if (scene.nodes.some((n) => n.depth > 0 && n.rank !== null)) {
        svg(
          'line',
          {
            x1: geo.colX(1) - 10,
            y1: geo.dividerY,
            x2: PIECE_CANVAS_W - PAD,
            y2: geo.dividerY,
            stroke: colors.border,
            'stroke-dasharray': '4 4',
          },
          root,
        );
        const lb = svg(
          'text',
          {
            x: geo.colX(1) - 16,
            y: geo.dividerY + 4,
            'text-anchor': 'end',
            fill: colors.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          },
          root,
        );
        lb.textContent = t('label.width', 'beam width {w}', { w: scene.width });
      }

      const edgeLayer = svg('g', {}, root);
      const traceLayer = svg('g', {}, root);
      const nodeLayer = svg('g', {}, root);

      const rightMid = (p: Pt): Pt => ({ x: p.x + geo.nodeW, y: p.y + NODE_H / 2 });
      const leftMid = (p: Pt): Pt => ({ x: p.x, y: p.y + NODE_H / 2 });
      const stubEnd = (a: Pt, b: Pt): Pt => ({ x: lerp(a.x, b.x, 0.5), y: lerp(a.y, b.y, 0.5) });

      const pathColor = (id: string): string | null =>
        beamSet.has(id) ? colors.success : greedySet.has(id) ? colors.itemComparing : null;

      // 가지 선
      const edges = new Map<string, SVGLineElement>();
      for (const n of scene.nodes) {
        if (n.parent === null) continue;
        const p = byId.get(n.parent);
        if (!p) continue;
        const a = rightMid(geo.pos(p));
        const full = leftMid(geo.pos(n));
        const cut = geo.isCut(n);
        const b = cut ? stubEnd(a, full) : full;
        const kept = n.rank !== null && !cut;
        const line = svg(
          'line',
          {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: cut ? colors.border : kept ? colors.primary : colors.textMuted,
            'stroke-width': kept ? 1.6 : 1.2,
          },
          edgeLayer,
        );
        edges.set(n.id, line);
      }

      // 견줌의 두 줄 — 프롬프트에서 끝까지 이어 긋는다 (상자 밑으로 지나간다)
      if (v) {
        const rootNode = scene.nodes.find((n) => n.depth === 0);
        for (const [ids, color] of [
          [v.greedy, colors.itemComparing],
          [v.beam, colors.success],
        ] as const) {
          if (!rootNode) break;
          const pts: Pt[] = [rightMid(geo.pos(rootNode))];
          for (const id of ids) {
            const n = byId.get(id);
            if (!n) break;
            const prevPt = pts[pts.length - 1] as Pt;
            const full = leftMid(geo.pos(n));
            if (geo.isCut(n)) {
              pts.push(stubEnd(prevPt, full));
              break;
            }
            pts.push(full, rightMid(geo.pos(n)));
          }
          let length = 0;
          for (let i = 1; i < pts.length; i += 1) {
            const a = pts[i - 1] as Pt;
            const b = pts[i] as Pt;
            length += Math.hypot(b.x - a.x, b.y - a.y);
          }
          const path = svg(
            'polyline',
            {
              points: pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' '),
              fill: 'none',
              stroke: color,
              'stroke-width': 3,
              'stroke-linejoin': 'round',
            },
            traceLayer,
          );
          traces.push({ path, length: r2(length) });
        }
      }

      // 상자 — 깊은 것부터 그려 부모가 위에 온다 (펼칠 때 자식이 부모 밑에서 나온다)
      const order = [...scene.nodes].sort((a, b) => b.depth - a.depth);
      for (const n of order) {
        const at = geo.pos(n);
        const cut = geo.isCut(n);
        const kept = n.rank !== null && !cut;
        const hl = pathColor(n.id);
        const g = svg('g', {}, nodeLayer);
        svg(
          'rect',
          {
            x: at.x,
            y: at.y,
            width: geo.nodeW,
            height: NODE_H,
            rx: 5,
            fill: kept ? colors.bgSubtle : colors.bg,
            stroke: hl ?? (n.depth === 0 ? colors.text : cut ? colors.border : kept ? colors.primary : colors.itemComparing),
            'stroke-width': hl ? 2.5 : 1.4,
            ...(cut && !hl ? { 'stroke-dasharray': '3 3' } : {}),
          },
          g,
        );
        const tok = svg(
          'text',
          {
            x: at.x + 8,
            y: at.y + NODE_H / 2 + 5,
            fill: cut ? colors.textMuted : colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
          },
          g,
        );
        tok.textContent = n.token;
        if (n.depth > 0) {
          const sc = svg(
            'text',
            {
              x: at.x + geo.nodeW - 7,
              y: at.y + NODE_H / 2 + 4,
              'text-anchor': 'end',
              fill: colors.textMuted,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
            },
            g,
          );
          sc.textContent = fmtScore(n.score);
        }
        handles.set(n.id, { g, edge: edges.get(n.id) ?? null, at, from: null });
      }
      return { handles, traces };
    }

    /** 한 시계로 흐르는 운동. 끝까지 흘렀으면 true, 끊겼으면 false. */
    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        let done = false;
        const start = performance.now();
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const k = clamp01((performance.now() - start) / ms);
          frame(k);
          if (k >= 1) finish(true);
          else schedule();
        };
        const schedule = (): void => {
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        schedule();
      });
    }

    const place = (h: Handle, dx: number, dy: number, edgeEnd: Pt | null): void => {
      if (dx === 0 && dy === 0) h.g.removeAttribute('transform');
      else h.g.setAttribute('transform', `translate(${r2(dx)},${r2(dy)})`);
      if (h.edge && edgeEnd) {
        h.edge.setAttribute('x2', String(r2(edgeEnd.x)));
        h.edge.setAttribute('y2', String(r2(edgeEnd.y)));
      }
    };

    async function animate(scene: CarrySeveralLinesScene, mine: number): Promise<void> {
      const step = scene.step;
      const { handles, traces } = drawStatic(scene);
      const geo = geometry(scene);
      const byId = new Map(scene.nodes.map((n) => [n.id, n] as const));
      const midY = NODE_H / 2;

      if (step.kind === 'expand') {
        // 가지가 부모 자리에서 뻗어 나와 펼친 차례의 칸에 선다
        const moving = scene.nodes
          .filter((n) => n.depth === step.depth && n.parent !== null)
          .map((n) => {
            const parent = byId.get(n.parent as string);
            const h = handles.get(n.id);
            return parent && h ? { h, from: geo.pos(parent), to: geo.pos(n) } : null;
          })
          .filter((m): m is { h: Handle; from: Pt; to: Pt } => m !== null);
        await tween(EXPAND_MS, mine, (k) => {
          const e = 1 - ease(k);
          for (const m of moving) {
            const dx = (m.from.x - m.to.x) * e;
            const dy = (m.from.y - m.to.y) * e;
            place(m.h, dx, dy, { x: m.to.x + dx, y: m.to.y + dy + midY });
          }
        });
      } else if (step.kind === 'prune') {
        // 펼친 차례의 칸에서 순위의 칸으로 옮겨 앉고, 끊긴 가지는 선이 물러난다
        const moving = scene.nodes
          .filter((n) => n.depth === step.depth && n.parent !== null)
          .map((n) => {
            const parent = byId.get(n.parent as string);
            const h = handles.get(n.id);
            if (!parent || !h) return null;
            const pp = geo.pos(parent);
            return {
              h,
              from: geo.orderPos(n),
              to: geo.pos(n),
              anchor: { x: pp.x + geo.nodeW, y: pp.y + midY },
              cut: geo.isCut(n),
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);
        await tween(PRUNE_MS, mine, (k) => {
          const e = 1 - ease(clamp01(k / 0.6));
          const r = ease(clamp01((k - 0.6) / 0.4));
          for (const m of moving) {
            const dx = (m.from.x - m.to.x) * e;
            const dy = (m.from.y - m.to.y) * e;
            const end = { x: m.to.x + dx, y: m.to.y + dy + midY };
            const tip = m.cut
              ? { x: lerp(end.x, lerp(m.anchor.x, end.x, 0.5), r), y: lerp(end.y, lerp(m.anchor.y, end.y, 0.5), r) }
              : end;
            place(m.h, dx, dy, tip);
          }
        });
      } else if (step.kind === 'compare') {
        // 두 줄을 프롬프트에서부터 끝까지 긋는다
        for (const tr of traces) tr.path.setAttribute('stroke-dasharray', `${tr.length} ${tr.length}`);
        await tween(COMPARE_MS, mine, (k) => {
          const e = 1 - ease(k);
          for (const tr of traces) tr.path.setAttribute('stroke-dashoffset', String(r2(tr.length * e)));
        });
      }

      if (destroyed || mine !== gen) return;
      drawStatic(scene);
    }

    return {
      render(next, _prev, opts): void | Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const moves =
          next.step.kind === 'expand' || next.step.kind === 'prune' || next.step.kind === 'compare';
        if (!opts.animate || !moves) {
          drawStatic(next);
          return;
        }
        return animate(next, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
