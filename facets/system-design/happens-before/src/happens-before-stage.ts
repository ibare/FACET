/**
 * happens-before stage — 높이가 곧 램포트 수다.
 *
 * 프로세스마다 세로 사다리 하나. 수 표(알약)가 사건마다 한 칸 오르고, 받기에서는 실려 온 수를 넘어
 * 몇 칸을 **뛴다**. 사건 점은 그 수의 높이에 찍히므로 메시지 화살표는 늘 위로 기운다. 마지막에 묻는
 * 짝은 화살표를 따라 **잇는 길**을 노랗게 긋거나(있을 때) 두 점만 둘러싼다(없을 때) — 같은 높이 ·
 * 더 낮은 높이의 점이 이어지지 않은 채 남는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
} from '@ffacet/core/runtime';
import type { HappensBeforeScene, HbAsk } from './scene.js';

const H = 440;
const NS = 'http://www.w3.org/2000/svg';

const CAPTION_Y = 26;
const HEADER_Y = 62;
const LADDER_TOP = 100;
const LADDER_BOTTOM = 318;
const LEDGER_TOP = 364;
const LEDGER_BOTTOM = H - 18;
const AXIS_X = 30;
const LEFT = 52;
const RIGHT_PAD = 16;
const GAP_MAX = 56;
const DOT_R = 5;
const PILL_W = 30;
const PILL_H = 20;
const TOKEN_W = 22;
const TOKEN_H = 16;
const STEP_MOVE_MS = 500;
const RECEIVE_MS = 600;
const ASK_MS = 600;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(u: number): number {
  return 1 - (1 - u) ** 3;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = text;
  return node;
}

type Handles = {
  pills: Map<string, SVGGElement>;
  climbs: Map<string, SVGLineElement>;
  dots: Map<string, SVGCircleElement>;
  tokens: Map<string, SVGGElement>;
  tails: Map<string, SVGLineElement>;
  arrows: Map<string, { line: SVGLineElement; head: SVGPolygonElement }>;
  paths: Map<number, { line: SVGPolylineElement; length: number }>;
  rings: SVGCircleElement[];
};

export const happensBeforeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function processName(id: string): string {
      switch (id) {
        case 'P1':
          return t('label.P1', 'Process P1');
        case 'P2':
          return t('label.P2', 'Process P2');
        case 'P3':
          return t('label.P3', 'Process P3');
        default:
          throw new Error(`happens-before stage: 프로세스 ${id} 의 표시 이름이 없다`);
      }
    }

    function caption(scene: HappensBeforeScene): string {
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return t('caption.start', 'Each process keeps its own count.');
        case 'local':
          return t('caption.local', '{e}: a local step on {p}. Count {from} → {to}.', {
            e: s.event,
            p: s.process,
            from: s.from,
            to: s.to,
          });
        case 'send':
          return t('caption.send', '{e}: {p} sends {m} carrying {to}. Count {from} → {to}.', {
            e: s.event,
            p: s.process,
            m: s.message,
            from: s.from,
            to: s.to,
          });
        case 'receive':
          return t('caption.receive', '{e}: {p} receives {m}. max({from}, {n}) + 1 = {to}.', {
            e: s.event,
            p: s.process,
            m: s.message,
            from: s.from,
            n: s.carried,
            to: s.to,
          });
        case 'ask': {
          const q = scene.asks[s.index];
          if (!q) throw new Error(`happens-before stage: 물은 짝 ${s.index} 가 없다`);
          return t('caption.ask', 'Ask {a} · {b}: follow the arrows, either way.', { a: q.a, b: q.b });
        }
      }
    }

    function cmp(q: HbAsk): string {
      return q.na < q.nb ? '<' : q.na > q.nb ? '>' : '=';
    }

    type Geo = {
      colX: Map<string, number>;
      y: (n: number) => number;
      at: (id: string) => { x: number; y: number };
      tokenAt: (msg: string) => { x: number; y: number };
      tokenFlight: (msg: string) => { x: number; y: number };
      arrowEnds: (msg: string) => { x1: number; y1: number; x2: number; y2: number };
    };

    function geometry(scene: HappensBeforeScene, top: number): Geo {
      const n = scene.processes.length;
      const span = W - LEFT - RIGHT_PAD;
      const colX = new Map(scene.processes.map((p, i) => [p, LEFT + (span * (i + 0.5)) / n] as const));
      const gap = Math.min(GAP_MAX, (LADDER_BOTTOM - LADDER_TOP) / top);
      const y = (v: number): number => LADDER_BOTTOM - v * gap;
      const xOf = (p: string): number => {
        const x = colX.get(p);
        if (x === undefined) throw new Error(`happens-before stage: 프로세스 ${p} 의 자리가 없다`);
        return x;
      };
      const at = (id: string): { x: number; y: number } => {
        const e = scene.placed.find((q) => q.id === id);
        if (!e) throw new Error(`happens-before stage: 사건 ${id} 가 아직 일어나지 않았다`);
        return { x: xOf(e.process), y: y(e.n) };
      };
      const msgOf = (id: string) => {
        const m = scene.messages.find((q) => q.id === id);
        if (!m) throw new Error(`happens-before stage: 메시지 ${id} 가 없다`);
        return m;
      };
      const tokenFlight = (id: string) => {
        const m = msgOf(id);
        const s = at(m.sender);
        return { x: (s.x + xOf(m.receiver)) / 2, y: y(m.carried) };
      };
      const arrowEnds = (id: string) => {
        const m = msgOf(id);
        if (m.received === null) throw new Error(`happens-before stage: 메시지 ${id} 가 아직 받히지 않았다`);
        const a = at(m.sender);
        const b = at(m.received);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const pad = DOT_R + 2;
        return { x1: a.x + ux * pad, y1: a.y + uy * pad, x2: b.x - ux * pad, y2: b.y - uy * pad };
      };
      const tokenAt = (id: string) => {
        const m = msgOf(id);
        if (m.received === null) return tokenFlight(id);
        const e = arrowEnds(id);
        return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 - 12 };
      };
      return { colX, y, at, tokenAt, tokenFlight, arrowEnds };
    }

    function head(parent: Element, x1: number, y1: number, x2: number, y2: number, fill: string): SVGPolygonElement {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const bx = x2 - ux * 8;
      const by = y2 - uy * 8;
      const pts = [
        [x2, y2],
        [bx - uy * 4, by + ux * 4],
        [bx + uy * 4, by - ux * 4],
      ]
        .map(([px, py]) => `${round(px!)},${round(py!)}`)
        .join(' ');
      return el(parent, 'polygon', { points: pts, fill });
    }

    function drawStatic(scene: HappensBeforeScene): Handles | null {
      svg.textContent = '';
      const handles: Handles = {
        pills: new Map(),
        climbs: new Map(),
        dots: new Map(),
        tokens: new Map(),
        tails: new Map(),
        arrows: new Map(),
        paths: new Map(),
        rings: [],
      };
      const hue = categorical(scene.processes.length, 'vivid');
      const hueOf = (p: string): string => {
        const c = hue[scene.processes.indexOf(p)];
        if (c === undefined) throw new Error(`happens-before stage: 프로세스 ${p} 의 색이 없다`);
        return c;
      };

      label(svg, W / 2, CAPTION_Y, caption(scene), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });

      const n = scene.processes.length;
      const span = W - LEFT - RIGHT_PAD;
      scene.processes.forEach((p, i) => {
        label(svg, LEFT + (span * (i + 0.5)) / n, HEADER_Y, processName(p), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: hueOf(p),
        });
      });

      // init 전(바탕만 있는 장면)이면 이름만 세운다.
      if (scene.top === null || scene.clocks === null) return null;
      const top = scene.top;
      const g = geometry(scene, top);

      // 눈금 — 같은 높이 = 같은 수. 동률이 가로로 나란히 보인다.
      label(svg, AXIS_X, HEADER_Y, t('label.count', 'count'), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      for (let v = 0; v <= top; v += 1) {
        el(svg, 'line', {
          x1: LEFT,
          y1: g.y(v),
          x2: W - RIGHT_PAD,
          y2: g.y(v),
          stroke: colors.border,
          'stroke-dasharray': '2 4',
        });
        label(svg, AXIS_X, g.y(v) + smPx / 3, String(v), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
      }

      // 사다리 기둥
      const pathLayer = el(svg, 'g', {});
      for (const p of scene.processes) {
        const x = g.colX.get(p)!;
        el(svg, 'line', { x1: x, y1: g.y(0), x2: x, y2: g.y(top), stroke: colors.border, 'stroke-width': 1 });
        const now = scene.clocks.find((c) => c.process === p);
        if (!now) throw new Error(`happens-before stage: 프로세스 ${p} 의 수가 없다`);
        handles.climbs.set(
          p,
          el(svg, 'line', {
            x1: x,
            y1: g.y(0),
            x2: x,
            y2: g.y(now.n),
            stroke: hueOf(p),
            'stroke-width': 3,
          }),
        );
      }

      // 물은 짝의 잇는 길 — 기둥 위, 화살표 아래
      scene.asks.forEach((q, i) => {
        const r = q.forward ?? q.backward;
        if (r === null) return;
        const pts = r.map((id) => g.at(id));
        let length = 0;
        for (let k = 1; k < pts.length; k += 1) length += Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y);
        const line = el(pathLayer, 'polyline', {
          points: pts.map((pt) => `${round(pt.x)},${round(pt.y)}`).join(' '),
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 8,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-opacity': 0.7,
        });
        handles.paths.set(i, { line, length });
      });
      svg.appendChild(pathLayer);

      // 메시지 — 가는 중이면 점선 꼬리와 표, 받혔으면 위로 기운 화살표와 표
      for (const m of scene.messages) {
        const s = g.at(m.sender);
        if (m.received === null) {
          const f = g.tokenFlight(m.id);
          handles.tails.set(
            m.id,
            el(svg, 'line', {
              x1: s.x + DOT_R + 2,
              y1: s.y,
              x2: f.x - TOKEN_W / 2,
              y2: f.y,
              stroke: colors.primary,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            }),
          );
        } else {
          const e = g.arrowEnds(m.id);
          const line = el(svg, 'line', {
            x1: e.x1,
            y1: e.y1,
            x2: e.x2,
            y2: e.y2,
            stroke: colors.primary,
            'stroke-width': 1.5,
          });
          handles.arrows.set(m.id, { line, head: head(svg, e.x1, e.y1, e.x2, e.y2, colors.primary) });
        }
      }

      // 사건 점
      const step = scene.step;
      const current = step.kind === 'local' || step.kind === 'send' || step.kind === 'receive' ? step.event : null;
      for (const e of scene.placed) {
        const pt = g.at(e.id);
        if (e.id === current) {
          el(svg, 'circle', { cx: pt.x, cy: pt.y, r: DOT_R + 4, fill: 'none', stroke: colors.itemActive, 'stroke-width': 2 });
        }
        handles.dots.set(e.id, el(svg, 'circle', { cx: pt.x, cy: pt.y, r: DOT_R, fill: colors.text }));
        // 이름은 점의 왼쪽 위 — 받기로 들어오는 화살표는 왼쪽 아래에서 올라온다
        label(svg, pt.x - DOT_R - 3, pt.y - DOT_R - 2, e.id, {
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
      }

      // 마지막으로 물은 짝을 둘러싼다
      const last = scene.asks[scene.asks.length - 1];
      if (last) {
        for (const id of [last.a, last.b]) {
          const pt = g.at(id);
          handles.rings.push(
            el(svg, 'circle', {
              cx: pt.x,
              cy: pt.y,
              r: DOT_R + 6,
              fill: 'none',
              stroke: colors.itemComparing,
              'stroke-width': 2.5,
            }),
          );
        }
      }

      // 메시지 표 — 실려 가는 수
      for (const m of scene.messages) {
        const pos = g.tokenAt(m.id);
        const tok = el(svg, 'g', { transform: `translate(${round(pos.x)},${round(pos.y)})` });
        el(tok, 'rect', {
          x: -TOKEN_W / 2,
          y: -TOKEN_H / 2,
          width: TOKEN_W,
          height: TOKEN_H,
          rx: 4,
          fill: colors.primary,
        });
        label(tok, 0, smPx / 3, String(m.carried), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.textInverse,
        });
        label(tok, 0, -TOKEN_H / 2 - 3, m.id, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        handles.tokens.set(m.id, tok);
      }

      // 수 표(알약) — 프로세스의 지금 수
      for (const c of scene.clocks) {
        const x = g.colX.get(c.process)!;
        const pill = el(svg, 'g', { transform: `translate(${round(x + 10)},${round(g.y(c.n))})` });
        el(pill, 'rect', {
          x: 0,
          y: -PILL_H / 2,
          width: PILL_W,
          height: PILL_H,
          rx: PILL_H / 2,
          fill: colors.bg,
          stroke: hueOf(c.process),
          'stroke-width': 2,
        });
        label(pill, PILL_W / 2, smPx / 3, String(c.n), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        });
        handles.pills.set(c.process, pill);
      }

      // 물은 짝의 장부 — 수의 크기와 잇는 길을 나란히
      if (scene.asks.length > 0) {
        const rowGap = Math.min(26, (LEDGER_BOTTOM - LEDGER_TOP) / scene.asks.length);
        el(svg, 'line', {
          x1: LEFT,
          y1: LEDGER_TOP - 18,
          x2: W - RIGHT_PAD,
          y2: LEDGER_TOP - 18,
          stroke: colors.border,
        });
        scene.asks.forEach((q, i) => {
          const y = LEDGER_TOP + i * rowGap;
          const isLast = i === scene.asks.length - 1;
          label(svg, LEFT, y, `${q.a} · ${q.b}`, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: isLast ? colors.itemComparing : colors.text,
          });
          label(svg, LEFT + 82, y, t('ledger.counts', 'Counts {na} {cmp} {nb}', { na: q.na, cmp: cmp(q), nb: q.nb }), {
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
          const r = q.forward ?? q.backward;
          label(
            svg,
            LEFT + 210,
            y,
            r === null
              ? t('ledger.none', 'Path: none, either way')
              : t('ledger.path', 'Path: {path}', { path: r.join(' → ') }),
            {
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              'font-weight': r === null ? 400 : 700,
              fill: colors.text,
            },
          );
        });
      }

      return handles;
    }

    function tween(mine: number, ms: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const u = Math.min(1, (now - start) / ms);
          frame(u);
          if (u >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame((ts) => {
            frames.delete(id);
            tick(ts);
          });
          frames.add(id);
        };
        tick(start);
      });
    }

    function need<T>(v: T | undefined, what: string): T {
      if (v === undefined) throw new Error(`happens-before stage: 운동할 ${what} 가 없다`);
      return v;
    }

    async function animate(mine: number, next: HappensBeforeScene, h: Handles): Promise<void> {
      const s = next.step;
      if (s.kind === 'start') return;
      if (next.top === null) throw new Error('happens-before stage: 사다리 꼭대기가 없다');
      const g = geometry(next, next.top);

      if (s.kind === 'local' || s.kind === 'send') {
        const pill = need(h.pills.get(s.process), `${s.process} 수 표`);
        const climb = need(h.climbs.get(s.process), `${s.process} 기둥`);
        const dot = need(h.dots.get(s.event), `${s.event} 점`);
        const x = need(g.colX.get(s.process), `${s.process} 자리`);
        const y0 = g.y(s.from);
        const y1 = g.y(s.to);
        const tok = s.kind === 'send' ? need(h.tokens.get(s.message), `${s.message} 표`) : null;
        const tail = s.kind === 'send' ? need(h.tails.get(s.message), `${s.message} 꼬리`) : null;
        const flight = s.kind === 'send' ? g.tokenFlight(s.message) : null;
        await tween(mine, STEP_MOVE_MS, (u) => {
          const e = ease(u);
          const y = y0 + (y1 - y0) * e;
          pill.setAttribute('transform', `translate(${round(x + 10)},${round(y)})`);
          climb.setAttribute('y2', String(round(y)));
          dot.setAttribute('r', String(round(DOT_R * e)));
          if (tok && tail && flight) {
            const tx = x + (flight.x - x) * e;
            tok.setAttribute('transform', `translate(${round(tx)},${round(flight.y)})`);
            tail.setAttribute('x2', String(round(Math.max(x + DOT_R + 2, tx - TOKEN_W / 2))));
          }
        });
        return;
      }

      if (s.kind === 'receive') {
        const pill = need(h.pills.get(s.process), `${s.process} 수 표`);
        const climb = need(h.climbs.get(s.process), `${s.process} 기둥`);
        const dot = need(h.dots.get(s.event), `${s.event} 점`);
        const tok = need(h.tokens.get(s.message), `${s.message} 표`);
        const arrow = need(h.arrows.get(s.message), `${s.message} 화살표`);
        const x = need(g.colX.get(s.process), `${s.process} 자리`);
        const flight = g.tokenFlight(s.message);
        const land = { x: x - TOKEN_W / 2 - 10, y: g.y(s.carried) };
        const rest = g.tokenAt(s.message);
        const ends = g.arrowEnds(s.message);
        const y0 = g.y(s.from);
        const y1 = g.y(s.to);
        const SPLIT = 0.45;
        await tween(mine, RECEIVE_MS, (u) => {
          const a = ease(Math.min(1, u / SPLIT));
          const b = ease(Math.max(0, (u - SPLIT) / (1 - SPLIT)));
          // 1) 표가 받는 쪽 기둥 곁, 실려 온 수의 높이에 닿는다
          // 2) 받는 쪽 수가 그 높이를 넘어 뛰고, 화살표가 이어진다
          const tx = u < SPLIT ? flight.x + (land.x - flight.x) * a : land.x + (rest.x - land.x) * b;
          const ty = u < SPLIT ? flight.y : land.y + (rest.y - land.y) * b;
          tok.setAttribute('transform', `translate(${round(tx)},${round(ty)})`);
          const y = y0 + (y1 - y0) * b;
          pill.setAttribute('transform', `translate(${round(x + 10)},${round(y)})`);
          climb.setAttribute('y2', String(round(y)));
          dot.setAttribute('r', String(round(DOT_R * b)));
          arrow.line.setAttribute('x2', String(round(ends.x1 + (ends.x2 - ends.x1) * b)));
          arrow.line.setAttribute('y2', String(round(ends.y1 + (ends.y2 - ends.y1) * b)));
          arrow.head.setAttribute('visibility', b >= 1 ? 'visible' : 'hidden');
        });
        return;
      }

      // ask
      const q = next.asks[s.index];
      if (!q) throw new Error(`happens-before stage: 물은 짝 ${s.index} 가 없다`);
      const path = q.forward ?? q.backward;
      const drawn = path === null ? null : need(h.paths.get(s.index), `짝 ${s.index} 의 길`);
      await tween(mine, ASK_MS, (u) => {
        const e = ease(u);
        for (const ring of h.rings) ring.setAttribute('r', String(round(DOT_R + 6 + 14 * (1 - e))));
        if (drawn) {
          drawn.line.setAttribute('stroke-dasharray', `${round(drawn.length)} ${round(drawn.length)}`);
          drawn.line.setAttribute('stroke-dashoffset', String(round(drawn.length * (1 - e))));
        }
      });
    }

    const renderer: SceneRenderer<HappensBeforeScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || h === null) return;
        await animate(mine, next, h);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
