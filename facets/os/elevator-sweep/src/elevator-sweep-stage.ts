/**
 * elevator-sweep 의 무대.
 *
 * 위 줄은 요청이 온 차례, 가운데는 실린더 축과 팔, 아래 줄은 받은 차례다.
 * 요청 하나를 받으면 그 조각이 위 줄의 제 칸을 떠나 축 위 제 실린더에서 팔을 만나고
 * 아래 줄 다음 칸으로 내려선다 — 온 차례의 줄이 팔이 가는 자리 차례로 다시 선다.
 * 위 줄에 남은 요청은 축 위 제 자리와 가는 선으로 이어져, 온 차례와 자리 차례가
 * 엇갈리는 것이 선의 엇갈림으로 보인다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ElevatorRequest, ElevatorSweepScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 20;
const CAPTION_Y = 26;
const TOP_LABEL_Y = 54;
const TOP_Y = 80;
const TAG_Y = 112;
const AXIS_Y = 176;
const BOTTOM_LABEL_Y = 238;
const BOTTOM_Y = 268;
const TOKEN_H = 28;
const TOKEN_W_MAX = 58;
const BADGE_R = 8;

const SERVE_MS = 620;
const ARRIVE_MS = 440;
const TURN_MS = 420;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function words(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size: string; fill: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': opts.mono === true ? fonts.mono : fonts.body,
    'font-size': opts.size,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
  node.textContent = body;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 무대가 한 장면을 그리는 데 필요한 자리 셈. 전부 캔버스 폭에서 역산한다. */
type Geometry = {
  slotW: number;
  tokenW: number;
  slotX(i: number): number;
  cylX(cyl: number): number;
};

function geometry(scene: ElevatorSweepScene): Geometry {
  const inner = PIECE_CANVAS_W - MARGIN * 2;
  const slotW = inner / Math.max(1, scene.slots);
  const tokenW = Math.min(TOKEN_W_MAX, slotW - 10);
  const last = Math.max(1, scene.cylinders - 1);
  return {
    slotW,
    tokenW,
    slotX: (i) => MARGIN + slotW * (i + 0.5),
    cylX: (cyl) => MARGIN + (inner * cyl) / last,
  };
}

/** 한 번의 정적 그리기가 운동에 넘기는 손잡이. 그리기마다 새로 만든다. */
type Handles = {
  movingToken: SVGGElement | null;
  arm: SVGGElement | null;
  arrow: SVGGElement | null;
  band: SVGRectElement | null;
  arrivals: SVGGElement[];
};

export const elevatorSweepStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const sm = fontSizes.sm;
    const xs = fontSizes.xs;
    const md = fontSizes.md;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function caption(scene: ElevatorSweepScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return scene.dir === 1
            ? t('caption.start.up', 'Requests wait in arrival order. The arm is heading up.')
            : t('caption.start.down', 'Requests wait in arrival order. The arm is heading down.');
        case 'serve':
          return scene.served.length === scene.arrived.length && scene.served.length === scene.slots
            ? t('caption.last', 'Last request served: cylinder {cyl}, #{order}. Turns: {turns}', {
                cyl: step.cyl,
                order: step.order,
                turns: scene.turns,
              })
            : t('caption.serve', 'Nearest request ahead of the arm is served: cylinder {cyl}, #{order}', {
                cyl: step.cyl,
                order: step.order,
              });
        case 'arrive':
          return t('caption.arrive', 'New requests arrive. Ahead of the arm: this sweep. Behind: after the turn.');
        case 'turn':
          return scene.dir === -1
            ? t('caption.turn.down', 'Nothing left above the arm. It turns down.')
            : t('caption.turn.up', 'Nothing left below the arm. It turns up.');
      }
    }

    function token(
      parent: Element,
      cx: number,
      cy: number,
      g: Geometry,
      cyl: number,
      look: { fill: string; stroke: string; ink: string; dashed?: boolean },
    ): SVGGElement {
      const grp = el(parent, 'g', {});
      const rect = el(grp, 'rect', {
        x: cx - g.tokenW / 2,
        y: cy - TOKEN_H / 2,
        width: g.tokenW,
        height: TOKEN_H,
        rx: 6,
        fill: look.fill,
        stroke: look.stroke,
        'stroke-width': 1.5,
      });
      if (look.dashed === true) rect.setAttribute('stroke-dasharray', '4 3');
      words(grp, cx, cy + 1, String(cyl), { size: md, fill: look.ink, anchor: 'middle', mono: true, weight: '600' });
      return grp;
    }

    function drawStatic(scene: ElevatorSweepScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const handles: Handles = { movingToken: null, arm: null, arrow: null, band: null, arrivals: [] };
      const step = scene.step;
      const servedSet = new Set(scene.served);
      const byId = new Map<number, ElevatorRequest>();
      for (const r of scene.arrived) byId.set(r.id, r);
      const arrivalTag = new Map<number, boolean>();
      if (step.kind === 'arrive') for (const it of step.items) arrivalTag.set(it.id, it.ahead);

      el(svg, 'rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: c.bg });
      words(svg, MARGIN, CAPTION_Y, caption(scene), { size: md, fill: c.text, weight: '600' });

      // 팔 앞쪽 — 가는 방향으로 축 끝까지 옅게 깐다
      const armX = g.cylX(scene.arm);
      const axisL = g.cylX(0);
      const axisR = g.cylX(scene.cylinders - 1);
      const bandX = scene.dir === 1 ? armX : axisL;
      const bandW = scene.dir === 1 ? axisR - armX : armX - axisL;
      handles.band = el(svg, 'rect', {
        x: bandX,
        y: AXIS_Y - 9,
        width: bandW,
        height: 18,
        fill: c.subtreeShadeRight,
      });

      // 축
      el(svg, 'line', { x1: axisL, y1: AXIS_Y, x2: axisR, y2: AXIS_Y, stroke: c.textMuted, 'stroke-width': 1.5 });
      for (const end of [0, scene.cylinders - 1]) {
        const x = g.cylX(end);
        el(svg, 'line', { x1: x, y1: AXIS_Y - 5, x2: x, y2: AXIS_Y + 5, stroke: c.textMuted, 'stroke-width': 1.5 });
        words(svg, x, AXIS_Y + 22, String(end), { size: xs, fill: c.textMuted, anchor: 'middle', mono: true });
      }

      // 줄 이름
      words(svg, MARGIN, TOP_LABEL_Y, t('label.arrived', 'Arrival order'), { size: xs, fill: c.textMuted });
      words(svg, MARGIN, BOTTOM_LABEL_Y, t('label.served', 'Service order'), { size: xs, fill: c.textMuted });

      // 위 줄에 남은 요청 ↔ 축 위 제 자리
      const links = el(svg, 'g', {});
      for (const r of scene.arrived) {
        const x = g.cylX(r.cyl);
        if (servedSet.has(r.id)) {
          el(svg, 'circle', { cx: x, cy: AXIS_Y, r: 2.5, fill: c.ghostOutline });
          continue;
        }
        const line = el(links, 'line', {
          x1: g.slotX(r.id),
          y1: TOP_Y + TOKEN_H / 2,
          x2: x,
          y2: AXIS_Y,
          stroke: c.ghostOutline,
          'stroke-width': 1,
        });
        const dot = el(svg, 'circle', { cx: x, cy: AXIS_Y, r: 4.5, fill: c.itemDefault, stroke: c.text, 'stroke-width': 1.5 });
        if (arrivalTag.has(r.id)) {
          const grp = el(svg, 'g', {});
          grp.appendChild(line);
          grp.appendChild(dot);
          handles.arrivals.push(grp);
        }
      }

      // 위 줄 — 온 차례. 받은 것은 빈 자리로 남는다
      for (const r of scene.arrived) {
        const x = g.slotX(r.id);
        if (servedSet.has(r.id)) {
          token(svg, x, TOP_Y, g, r.cyl, { fill: 'none', stroke: c.ghostOutline, ink: c.ghostOutline, dashed: true });
          continue;
        }
        const tok = token(svg, x, TOP_Y, g, r.cyl, { fill: c.itemDefault, stroke: c.text, ink: c.text });
        const ahead = arrivalTag.get(r.id);
        if (ahead !== undefined) {
          const tag = words(
            tok,
            x,
            TAG_Y,
            ahead ? t('label.ahead', 'ahead') : t('label.behind', 'behind'),
            { size: xs, fill: ahead ? c.text : c.textMuted, anchor: 'middle', weight: ahead ? '600' : '400' },
          );
          // 아래로 지나는 선 위에서도 읽히게 바탕색 테두리를 두른다
          tag.setAttribute('stroke', c.bg);
          tag.setAttribute('stroke-width', '4');
          tag.setAttribute('paint-order', 'stroke');
          handles.arrivals.push(tok);
        }
      }

      // 아래 줄 — 받은 차례
      scene.served.forEach((id, i) => {
        const r = byId.get(id);
        if (r === undefined) throw new Error(`elevatorSweepStage: 받은 요청 ${id} 가 온 요청에 없다`);
        const x = g.slotX(i);
        const now = step.kind === 'serve' && step.id === id;
        const tok = token(svg, x, BOTTOM_Y, g, r.cyl, {
          fill: now ? c.itemActive : c.itemSorted,
          stroke: now ? c.itemActive : c.itemSorted,
          ink: now ? c.stateInk : c.textInverse,
        });
        const bx = x - g.tokenW / 2 + 2;
        const by = BOTTOM_Y - TOKEN_H / 2 - 2;
        el(tok, 'circle', { cx: bx, cy: by, r: BADGE_R, fill: c.accent, stroke: c.bg, 'stroke-width': 1.5 });
        words(tok, bx, by + 0.5, String(i + 1), { size: xs, fill: c.stateInk, anchor: 'middle', weight: '700' });
        if (now) handles.movingToken = tok;
      });

      // 팔
      const arm = el(svg, 'g', {});
      el(arm, 'line', { x1: armX, y1: AXIS_Y - 14, x2: armX, y2: AXIS_Y + 6, stroke: c.text, 'stroke-width': 2.5 });
      el(arm, 'path', {
        d: `M ${round(armX)} ${AXIS_Y + 6} l -7 12 l 14 0 z`,
        fill: c.accent,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      words(arm, armX, AXIS_Y + 34, t('label.arm', 'Arm {cyl}', { cyl: scene.arm }), {
        size: sm,
        fill: c.text,
        anchor: 'middle',
        weight: '600',
      });
      const arrow = el(arm, 'g', {});
      const turning = step.kind === 'turn';
      const tail = armX + scene.dir * 8;
      const tip = armX + scene.dir * 34;
      const ay = AXIS_Y - 22;
      el(arrow, 'line', {
        x1: tail,
        y1: ay,
        x2: tip,
        y2: ay,
        stroke: turning ? c.itemActive : c.text,
        'stroke-width': 2,
      });
      el(arrow, 'path', {
        d: `M ${round(tip + scene.dir * 4)} ${ay} l ${-scene.dir * 8} -5 l 0 10 z`,
        fill: turning ? c.itemActive : c.text,
      });
      handles.arm = arm;
      handles.arrow = arrow;
      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - began) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animate(next: ElevatorSweepScene, h: Handles, mine: number): Promise<void> {
      const g = geometry(next);
      const step = next.step;
      if (step.kind === 'serve' && h.movingToken !== null && h.arm !== null) {
        // 받은 조각: 위 줄의 제 칸 → 축 위 제 실린더 → 아래 줄 새 칸. 팔은 앞 절반에 그 실린더로 간다
        const tok = h.movingToken;
        const arm = h.arm;
        const slot = g.slotX(step.order - 1);
        const from = { x: g.slotX(step.id), y: TOP_Y };
        const meet = { x: g.cylX(step.cyl), y: AXIS_Y };
        const to = { x: slot, y: BOTTOM_Y };
        const armShift = g.cylX(step.from) - g.cylX(step.cyl);
        const place = (p: number): void => {
          const half = p < 0.5 ? p * 2 : (p - 0.5) * 2;
          const a = p < 0.5 ? from : meet;
          const b = p < 0.5 ? meet : to;
          const x = a.x + (b.x - a.x) * half;
          const y = a.y + (b.y - a.y) * half;
          tok.setAttribute('transform', `translate(${round(x - to.x)} ${round(y - to.y)})`);
          const armP = Math.min(1, p * 2);
          arm.setAttribute('transform', `translate(${round(armShift * (1 - armP))} 0)`);
        };
        place(0);
        await tween(SERVE_MS, mine, place);
        return;
      }
      if (step.kind === 'arrive' && h.arrivals.length > 0) {
        const groups = h.arrivals;
        const drop = TOP_Y + TOKEN_H;
        const place = (p: number): void => {
          for (const grp of groups) {
            grp.setAttribute('transform', `translate(0 ${round(-drop * (1 - p))})`);
            grp.setAttribute('opacity', String(round(p)));
          }
        };
        place(0);
        await tween(ARRIVE_MS, mine, place);
        return;
      }
      if (step.kind === 'turn' && h.arrow !== null && h.band !== null) {
        // 화살이 제 자리에서 뒤집히고, 앞쪽 띠가 팔을 축으로 반대편으로 넘어간다
        const arrow = h.arrow;
        const band = h.band;
        const armX = g.cylX(next.arm);
        const axisL = g.cylX(0);
        const axisR = g.cylX(next.cylinders - 1);
        const place = (p: number): void => {
          const s = -1 + 2 * p;
          arrow.setAttribute('transform', `translate(${round(armX)} 0) scale(${round(s)} 1) translate(${round(-armX)} 0)`);
          const wasW = next.dir === -1 ? axisR - armX : armX - axisL;
          const nowW = next.dir === -1 ? armX - axisL : axisR - armX;
          if (p < 0.5) {
            const w = wasW * (1 - p * 2);
            band.setAttribute('x', String(round(next.dir === -1 ? armX : armX - w)));
            band.setAttribute('width', String(round(w)));
          } else {
            const w = nowW * ((p - 0.5) * 2);
            band.setAttribute('x', String(round(next.dir === -1 ? armX - w : armX)));
            band.setAttribute('width', String(round(w)));
          }
        };
        place(0);
        await tween(TURN_MS, mine, place);
      }
    }

    return {
      async render(next: ElevatorSweepScene, _prev: ElevatorSweepScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || next.step.kind === 'start') return;
        await animate(next, handles, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
