/**
 * spread-in-turn 무대 — 도는 차례 표.
 *
 * 왼쪽에 서버 차례대로 테두리에 놓인 원판과 그 가운데 바늘(차례 표)이 있다. 위에는
 * 도착할 요청 줄이, 오른쪽에는 서버마다 받은 요청이 쌓이는 줄이 있다. 요청 조각의
 * 너비는 무게에 비례한다 — 줄에서도, 서버에 쌓여서도 같은 모양이다.
 *
 * 걸음 하나: 줄의 머리 요청이 바늘이 가리키는 서버의 줄 끝으로 날아가 붙고(무게와
 * 상관없이), 바늘이 다음 서버로 한 칸(한 바퀴의 1/N) 돈다.
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
import type { SpreadScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 흐름 시간 — 요청이 날아가 붙고, 그다음 바늘이 돈다 (합 500ms) */
const FLY_MS = 280;
const TURN_MS = 220;

function fail(why: string): never {
  throw new Error(`spread-in-turn 무대: ${why}`);
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

export const spreadInTurnStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    const PAD = 16;
    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);

    // 가로 — 원판 칸 · 이름표 칸 · 쌓임 칸
    const DIAL_W = Math.min(150, Math.round(W * 0.24));
    const TAG_X = PAD + DIAL_W + 8;
    const TAG_W = Math.min(100, Math.round(W * 0.16));
    const SEG_X = TAG_X + TAG_W;
    const SEG_GAP = 2;
    const CHIP_H = 24;

    // 세로 — 캡션 · 요청 줄 · 서버 줄
    const CAP_Y = 24;
    const QLABEL_Y = 52;
    const QCHIP_Y = 60;
    const ROWS_TOP = 108;
    const ROWS_BOTTOM = H - 36;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, s: string, size: number, fill: string, anchor: string, weight = 'normal', parent: Element = svg): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        fill,
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
      }, parent);
      node.textContent = s;
      return node;
    }

    function serverName(id: string): string {
      switch (id) {
        case 's1':
          return t('label.s1', 'Server A');
        case 's2':
          return t('label.s2', 'Server B');
        case 's3':
          return t('label.s3', 'Server C');
        default:
          return fail(`표시 이름이 없는 서버 ${id}`);
      }
    }

    function serverMark(id: string): string {
      switch (id) {
        case 's1':
          return t('label.s1.mark', 'A');
        case 's2':
          return t('label.s2.mark', 'B');
        case 's3':
          return t('label.s3.mark', 'C');
        default:
          return fail(`표지가 없는 서버 ${id}`);
      }
    }

    /** 바탕에서 정해지는 자리 — 단위 너비 · 줄 높이 · 원판 */
    function layout(scene: SpreadScene) {
      const n = scene.servers.length;
      const total = scene.requests.reduce((a, r) => a + r.weight, 0);
      const count = scene.requests.length;
      // 한 서버가 모든 요청을 받아도 줄 안에 들도록 — 무게 합이 상한이다
      const segRoom = W - PAD - SEG_X - SEG_GAP * (count - 1);
      const queueRoom = W - PAD - TAG_X - SEG_GAP * 2 * (count - 1);
      const unit = Math.min(22, Math.floor(segRoom / total), Math.floor(queueRoom / total));
      if (unit < 8) fail(`무게 합 ${total} 이 너무 커서 단위가 ${unit}px 이다`);
      const rowPitch = (ROWS_BOTTOM - ROWS_TOP) / n;
      const rowY = (i: number) => ROWS_TOP + rowPitch * i + rowPitch / 2;
      const cx = PAD + DIAL_W / 2;
      const cy = (ROWS_TOP + ROWS_BOTTOM) / 2 - 8;
      const radius = Math.min(DIAL_W / 2 - 20, rowPitch * n / 2 - 30);
      const angle = (i: number) => -90 + (360 / n) * i;
      return { n, unit, rowY, cx, cy, radius, angle };
    }

    type Layout = ReturnType<typeof layout>;

    function queueX(scene: SpreadScene, L: Layout, k: number): number {
      let x = TAG_X;
      for (let j = scene.arrived; j < k; j += 1) x += scene.requests[j].weight * L.unit + SEG_GAP * 2;
      return x;
    }

    function stackX(scene: SpreadScene, L: Layout, server: number, depth: number): number {
      let x = SEG_X;
      const stack = scene.stacks[server];
      for (let j = 0; j < depth; j += 1) x += scene.requests[stack[j]].weight * L.unit + SEG_GAP;
      return x;
    }

    function chip(parent: Element, x: number, y: number, weight: number, id: string, unit: number, fill: string, stroke: string, ink: string, strokeW = 1): SVGGElement {
      const g = el('g', {}, parent);
      const w = weight * unit;
      el('rect', { x, y, width: w, height: CHIP_H, rx: 3, fill, stroke, 'stroke-width': strokeW }, g);
      // 무게의 단위를 칸으로 — 셀 수 있게
      for (let u = 1; u < weight; u += 1) {
        el('line', { x1: x + u * unit, y1: y + CHIP_H - 5, x2: x + u * unit, y2: y + CHIP_H, stroke: ink, 'stroke-opacity': 0.35, 'stroke-width': 1 }, g);
      }
      label(x + w / 2, y + CHIP_H / 2 - 1, id, XS, ink, 'middle', 'normal', g);
      return g;
    }

    type Handles = { flying: SVGGElement | null; queue: SVGGElement | null; hand: SVGGElement | null };

    function drawStatic(scene: SpreadScene): Handles {
      svg.textContent = '';
      const L = layout(scene);
      const tint = categorical(L.n, 'pastel');
      const step = scene.step;
      const handles: Handles = { flying: null, queue: null, hand: null };

      // 캡션 — 지금 일어나는 일만
      const pointerId = scene.servers[scene.pointer];
      const waiting = scene.requests.length - scene.arrived;
      const caption =
        step.kind === 'start'
          ? t('caption.start', 'Next in turn: {server} · Waiting: {n}', { server: serverName(pointerId), n: waiting })
          : t('caption.pick', '{request} (weight {weight}) → {server} · Next in turn: {next}', {
              request: scene.requests[step.request].id,
              weight: scene.requests[step.request].weight,
              server: serverName(scene.servers[step.server]),
              next: serverName(scene.servers[step.next]),
            });
      label(PAD, CAP_Y, caption, parseFloat(fontSizes.md), colors.text, 'start', '600');

      // 요청 줄
      label(TAG_X, QLABEL_Y, t('label.queue', 'Arriving requests'), XS, colors.textMuted, 'start');
      const queue = el('g', {}, svg);
      handles.queue = queue;
      for (let k = scene.arrived; k < scene.requests.length; k += 1) {
        const r = scene.requests[k];
        chip(queue, queueX(scene, L, k), QCHIP_Y, r.weight, r.id, L.unit, colors.bgSubtle, colors.border, colors.text);
      }

      // 서버 줄 — 이름표 · 받은 수 · 쌓인 무게 · 받은 요청
      for (let i = 0; i < L.n; i += 1) {
        const id = scene.servers[i];
        const y = L.rowY(i);
        const on = scene.pointer === i;
        el('rect', { x: TAG_X, y: y - 7 - SM / 2 - 2, width: 10, height: 10, rx: 2, fill: tint[i], stroke: colors.border }, svg);
        label(TAG_X + 16, y - 9, serverName(id), SM, colors.text, 'start', on ? '700' : '600');
        if (scene.received !== null && scene.load !== null) {
          label(TAG_X, y + 7, t('label.received', 'Received: {n}', { n: scene.received[i] }), XS, colors.textMuted, 'start');
          label(TAG_X, y + 21, t('label.load', 'Load: {n}', { n: scene.load[i] }), XS, colors.textMuted, 'start');
        }
        el('line', { x1: SEG_X, y1: y + CHIP_H / 2 + 3, x2: W - PAD, y2: y + CHIP_H / 2 + 3, stroke: colors.border, 'stroke-width': 1 }, svg);
        const stack = scene.stacks[i];
        for (let d = 0; d < stack.length; d += 1) {
          const r = scene.requests[stack[d]];
          const fresh = step.kind === 'pick' && step.request === stack[d];
          const g = chip(svg, stackX(scene, L, i, d), y - CHIP_H / 2, r.weight, r.id, L.unit, tint[i], fresh ? colors.accent : colors.border, colors.stateInk, fresh ? 2.5 : 1);
          if (fresh) handles.flying = g;
        }
      }

      // 원판 — 서버 차례대로 테두리에, 바늘이 차례 표
      el('circle', { cx: L.cx, cy: L.cy, r: L.radius, fill: 'none', stroke: colors.border, 'stroke-width': 1.5 }, svg);
      for (let i = 0; i < L.n; i += 1) {
        const a = (L.angle(i) * Math.PI) / 180;
        const sx = L.cx + L.radius * Math.cos(a);
        const sy = L.cy + L.radius * Math.sin(a);
        const on = scene.pointer === i;
        el('circle', { cx: sx, cy: sy, r: 13, fill: tint[i], stroke: on ? colors.accent : colors.border, 'stroke-width': on ? 3 : 1 }, svg);
        label(sx, sy + 0.5, serverMark(scene.servers[i]), SM, colors.stateInk, 'middle', '700');
      }
      const hand = el('g', { transform: `rotate(${r2(L.angle(scene.pointer))} ${r2(L.cx)} ${r2(L.cy)})` }, svg);
      handles.hand = hand;
      const tip = L.radius - 17;
      el('line', { x1: L.cx, y1: L.cy, x2: L.cx + tip - 7, y2: L.cy, stroke: colors.text, 'stroke-width': 3, 'stroke-linecap': 'round' }, hand);
      el('polygon', { points: `${r2(L.cx + tip)},${r2(L.cy)} ${r2(L.cx + tip - 9)},${r2(L.cy - 5)} ${r2(L.cx + tip - 9)},${r2(L.cy + 5)}`, fill: colors.text }, hand);
      el('circle', { cx: L.cx, cy: L.cy, r: 4, fill: colors.text }, svg);
      label(L.cx, L.cy + L.radius + 26, t('label.turn', 'Turn pointer'), XS, colors.textMuted, 'middle');

      return handles;
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = () => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(k));
          if (k >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function play(next: SpreadScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'pick') return fail('pick 이 아닌 걸음을 흘리려 했다');
      const L = layout(next);
      const handles = drawStatic(next);
      const { flying, queue, hand } = handles;
      if (flying === null || queue === null || hand === null) return fail('흘릴 손잡이를 찾지 못했다');

      // 1) 머리 요청이 줄에서 서버 줄 끝으로 — 나머지 줄은 한 칸 당긴다
      // 날아가는 요청은 늘 줄의 머리에서 떠난다
      const fromX = TAG_X;
      const fromY = QCHIP_Y;
      const toX = stackX(next, L, step.server, next.stacks[step.server].length - 1);
      const toY = L.rowY(step.server) - CHIP_H / 2;
      const dx = fromX - toX;
      const dy = fromY - toY;
      const shift = next.requests[step.request].weight * L.unit + SEG_GAP * 2;
      const turnFrom = L.angle(step.server);
      const delta = (((step.next - step.server) % L.n) + L.n) % L.n || L.n;
      const turnTo = turnFrom + (360 / L.n) * delta;
      hand.setAttribute('transform', `rotate(${r2(turnFrom)} ${r2(L.cx)} ${r2(L.cy)})`);
      flying.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
      queue.setAttribute('transform', `translate(${r2(shift)} 0)`);
      await tween(FLY_MS, mine, (k) => {
        flying.setAttribute('transform', `translate(${r2(dx * (1 - k))} ${r2(dy * (1 - k))})`);
        queue.setAttribute('transform', `translate(${r2(shift * (1 - k))} 0)`);
      });
      if (destroyed || mine !== gen) return;
      flying.removeAttribute('transform');
      queue.removeAttribute('transform');

      // 2) 바늘이 한 칸 돈다 — 무게와 상관없이 늘 같은 각
      await tween(TURN_MS, mine, (k) => {
        hand.setAttribute('transform', `rotate(${r2(turnFrom + (turnTo - turnFrom) * k)} ${r2(L.cx)} ${r2(L.cy)})`);
      });
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    const renderer: SceneRenderer<SpreadScene> = {
      render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const flows =
          opts.animate && prev !== null && next.step.kind === 'pick' && prev.arrived === next.arrived - 1;
        if (!flows) {
          drawStatic(next);
          return;
        }
        return play(next, mine);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
