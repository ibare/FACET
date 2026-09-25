/**
 * send-and-forget 무대 — 데이터그램이 보내는 쪽 줄을 떠나 길 위를 흘러 앱에 닿는다.
 *
 * 흘려보낸다: 보낸 자리는 비고(사본을 쥐지 않는다), 길 위의 것은 제 지연만큼의 빠르기로
 * 나아가며 서로 앞지르고, 사라진 것은 길 밖으로 떨어져 끝까지 빈자리로 남는다.
 * 앱의 줄은 닿은 차례대로 쌓인다.
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
import type { SendAndForgetScene } from './scene.js';

const H = 310;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 16;
/** 한 틱의 운동 — 한 시계로 모두 흐른다 */
const MOVE_MS = 700;
/** 사라지는 것이 길에서 떨어지는 자리 (길 길이에 대한 비율) — 그림의 자리일 뿐 셈이 아니다 */
const LOST_AT = 0.45;
/** 사라지는 것이 앞으로 나아가는 몫 — 나머지는 떨어지는 시간 */
const LOST_RUN = 0.6;

type Pt = { x: number; y: number };
type Place =
  | { where: 'queue'; slot: number }
  | { where: 'road'; p: number; lane: number }
  | { where: 'app'; slot: number }
  | { where: 'lost'; lane: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 크기 · 자리 — 캔버스에서 역산한다 */
function geometry(count: number) {
  const W = PIECE_CANVAS_W;
  const boxW = Math.min(136, W * 0.22);
  const top = 34;
  const bottom = H - 76;
  const listTop = top + 48;
  const rows = Math.max(count, 1);
  const rowH = Math.min(28, (bottom - 8 - listTop) / rows);
  const chipH = Math.max(12, rowH - 6);
  const chipW = Math.min(76, boxW - 24);
  const senderX = PAD;
  const appX = W - PAD - boxW;
  const roadX0 = senderX + boxW + 14;
  const roadX1 = appX - 14;
  const midY = (top + bottom) / 2 - 8;
  const laneGap = chipH + 12;
  const bandTop = midY - laneGap / 2 - chipH / 2 - 8;
  const bandBottom = midY + laneGap / 2 + chipH / 2 + 8;
  return {
    W, boxW, top, bottom, listTop, rowH, chipH, chipW, senderX, appX, roadX0, roadX1, midY, laneGap, bandTop, bandBottom,
  };
}
type Geo = ReturnType<typeof geometry>;

/** 칩의 왼쪽 위 모서리 */
function point(g: Geo, place: Place): Pt {
  switch (place.where) {
    case 'queue':
      return { x: g.senderX + (g.boxW - g.chipW) / 2, y: g.listTop + place.slot * g.rowH };
    case 'app':
      return { x: g.appX + (g.boxW - g.chipW) / 2, y: g.listTop + place.slot * g.rowH };
    case 'road': {
      const run = g.roadX1 - g.roadX0 - 12 - g.chipW;
      const cy = g.midY + (place.lane === 0 ? -g.laneGap / 2 : g.laneGap / 2);
      return { x: g.roadX0 + 6 + place.p * run, y: cy - g.chipH / 2 };
    }
    case 'lost': {
      const run = g.roadX1 - g.roadX0 - 12 - g.chipW;
      return { x: g.roadX0 + 6 + LOST_AT * run, y: g.bandBottom + 8 };
    }
  }
}

/** 장면의 한 틱에서 데이터그램 i 가 서 있는 자리. received 는 그 틱까지 앱이 받은 차례 */
function placeOf(scene: SendAndForgetScene, i: number, tick: number, received: number[]): Place {
  const d = scene.datagrams[i]!;
  const lane = i % 2;
  if (d.sendTick === null || tick < d.sendTick) return { where: 'queue', slot: i };
  const k = received.indexOf(i);
  if (k >= 0) return { where: 'app', slot: k };
  if (d.arriveTick === null) return { where: 'lost', lane };
  const span = d.arriveTick - d.sendTick;
  const p = (tick - d.sendTick) / span;
  if (p >= 1) throw new Error(`send-and-forget 무대: ${d.name} 는 틱 ${tick} 에 닿았어야 하는데 앱의 줄에 없다`);
  return { where: 'road', p, lane };
}

export const sendAndForgetStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    type ChipStyle = 'queued' | 'flying' | 'arrived' | 'ghost' | 'hole';

    function chip(g: Geo, name: string, style: ChipStyle, at: Pt): SVGGElement {
      const grp = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` });
      const dashed = style === 'ghost' || style === 'hole';
      const fill =
        style === 'queued' ? colors.itemDefault
        : style === 'flying' ? colors.itemActive
        : style === 'arrived' ? colors.itemSorted
        : 'none';
      const stroke =
        style === 'ghost' ? colors.danger
        : style === 'hole' ? colors.textMuted
        : style === 'queued' ? colors.border
        : fill;
      const rect = el('rect', {
        x: 0, y: 0, width: round(g.chipW), height: round(g.chipH), rx: 4,
        fill, stroke, 'stroke-width': dashed ? 1.2 : 1,
      });
      if (dashed) rect.setAttribute('stroke-dasharray', '4 3');
      grp.appendChild(rect);
      if (style !== 'hole') {
        const ink =
          style === 'flying' ? colors.stateInk
          : style === 'arrived' ? colors.textInverse
          : style === 'ghost' ? colors.danger
          : colors.text;
        const label = el('text', {
          x: round(g.chipW / 2), y: round(g.chipH / 2 + smPx * 0.36),
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: ink,
        });
        label.textContent = name;
        grp.appendChild(label);
      }
      return grp;
    }

    function text(x: number, y: number, s: string, opts: { size?: string; fill?: string; family?: string; anchor?: string; weight?: string } = {}): SVGTextElement {
      const node = el('text', {
        x: round(x), y: round(y),
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function captionLines(scene: SendAndForgetScene): string[] {
      const step = scene.step;
      if (step.kind === 'start') {
        return [t('caption.start', 'Waiting at the sender: {n}', { n: scene.datagrams.length })];
      }
      const lines: string[] = [];
      if (step.arrived.length > 0) {
        const names = step.arrived.map((a) => scene.datagrams[a.index]!.name).join(' · ');
        const aheadIdx = [...new Set(step.arrived.flatMap((a) => a.after))];
        if (aheadIdx.length > 0) {
          const ahead = aheadIdx.map((j) => scene.datagrams[j]!.name).join(' · ');
          lines.push(t('caption.arriveAfter', 'The app takes: {names} (behind {ahead})', { names, ahead }));
        } else {
          lines.push(t('caption.arrive', 'The app takes: {names}', { names }));
        }
      }
      if (step.sent !== null) {
        const name = scene.datagrams[step.sent]!.name;
        lines.push(
          step.lost
            ? t('caption.lost', 'Sent: {name} (lost on the way)', { name })
            : t('caption.send', 'Sent: {name} (no copy kept)', { name }),
        );
      }
      if (step.last) {
        const again = scene.sent.length - new Set(scene.sent).size;
        lines.push(
          t('caption.total', 'Sent: {sent} · Reached the app: {got} · Sent again: {again}', {
            sent: scene.sent.length,
            got: scene.received.length,
            again,
          }),
        );
      }
      return lines;
    }

    /** 장면 전체를 세운다. 칩 손잡이를 돌려준다 */
    function drawStatic(scene: SendAndForgetScene): Map<number, SVGGElement> {
      svg.textContent = '';
      const chips = new Map<number, SVGGElement>();
      const count = scene.datagrams.length;
      if (count === 0) return chips;
      const g = geometry(count);

      svg.appendChild(el('rect', { x: 0, y: 0, width: g.W, height: H, fill: colors.bg }));
      svg.appendChild(text(PAD, 20, t('label.tick', 'Tick: {tick}', { tick: scene.tick }), { size: fontSizes.md, weight: '600' }));

      // 두 끝
      for (const side of ['sender', 'app'] as const) {
        const x = side === 'sender' ? g.senderX : g.appX;
        svg.appendChild(el('rect', {
          x: round(x), y: g.top, width: round(g.boxW), height: round(g.bottom - g.top), rx: 6,
          fill: colors.bgSubtle, stroke: colors.border,
        }));
        const title = side === 'sender' ? t('label.sender', 'Sender') : t('label.app', 'Receiving app');
        svg.appendChild(text(x + g.boxW / 2, g.top + 18, title, { anchor: 'middle', weight: '600' }));
        const addr = side === 'sender' ? scene.sender : scene.receiver;
        svg.appendChild(text(x + g.boxW / 2, g.top + 35, addr, {
          anchor: 'middle', family: fonts.mono, size: fontSizes.xs, fill: colors.textMuted,
        }));
      }

      // 길 — 한 방향으로만 흐른다
      svg.appendChild(el('rect', {
        x: round(g.roadX0), y: round(g.bandTop), width: round(g.roadX1 - g.roadX0), height: round(g.bandBottom - g.bandTop),
        rx: 4, fill: colors.bgSubtle,
      }));
      const tipX = g.roadX1;
      svg.appendChild(el('path', {
        d: `M${round(tipX - 10)},${round(g.midY - 7)} L${round(tipX - 2)},${round(g.midY)} L${round(tipX - 10)},${round(g.midY + 7)}`,
        fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5,
      }));

      const received = scene.received;
      scene.datagrams.forEach((d, i) => {
        const place = placeOf(scene, i, scene.tick, received);
        if (place.where !== 'queue') {
          // 보낸 자리는 빈다 — 사본을 쥐지 않는다
          svg.appendChild(chip(g, d.name, 'hole', point(g, { where: 'queue', slot: i })));
        }
        const style: ChipStyle =
          place.where === 'queue' ? 'queued'
          : place.where === 'road' ? 'flying'
          : place.where === 'app' ? 'arrived'
          : 'ghost';
        const at = point(g, place);
        const node = chip(g, d.name, style, at);
        svg.appendChild(node);
        chips.set(i, node);
        if (place.where === 'lost') {
          svg.appendChild(text(at.x + g.chipW / 2, at.y + g.chipH + 14, t('label.lost', 'lost'), {
            anchor: 'middle', size: fontSizes.xs, fill: colors.danger,
          }));
        }
      });

      const lines = captionLines(scene);
      const lineH = 20;
      lines.forEach((line, k) => {
        svg.appendChild(text(PAD, H - 14 - (lines.length - 1 - k) * lineH, line, { size: fontSizes.md }));
      });
      return chips;
    }

    function tween(mine: number, ms: number, draw: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let start: number | null = null;
        const frame = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (start === null) start = now;
          const u = Math.min(1, (now - start) / ms);
          draw(u);
          if (u < 1) {
            id = requestAnimationFrame(frame);
            frames.add(id);
          } else {
            finish();
          }
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    async function flow(next: SendAndForgetScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'tick') return;
      const g = geometry(next.datagrams.length);
      const arrivedNow = new Set(step.arrived.map((a) => a.index));
      const before = next.received.filter((i) => !arrivedNow.has(i));
      const statics = drawStatic(next);

      type Mover = { node: SVGGElement; from: Pt; to: Pt; drop: Pt | null };
      const movers: Mover[] = [];
      const layer = el('g', {});
      svg.appendChild(layer);
      next.datagrams.forEach((d, i) => {
        const fromPlace = placeOf(next, i, step.tick - 1, before);
        const toPlace = placeOf(next, i, step.tick, next.received);
        if (fromPlace.where === toPlace.where && fromPlace.where !== 'road') return;
        const from = point(g, fromPlace);
        const lostNow = toPlace.where === 'lost';
        if (fromPlace.where === 'lost') return;
        // 떨어지는 것은 제 길의 그 자리까지 나아간 뒤 길 밖으로
        const to = lostNow ? point(g, { where: 'road', p: LOST_AT, lane: toPlace.lane }) : point(g, toPlace);
        const node = chip(g, d.name, 'flying', from);
        layer.appendChild(node);
        statics.get(i)?.setAttribute('visibility', 'hidden');
        movers.push({ node, from, to, drop: lostNow ? point(g, toPlace) : null });
      });
      if (movers.length === 0) return;

      await tween(mine, MOVE_MS, (u) => {
        for (const m of movers) {
          let x: number;
          let y: number;
          if (m.drop) {
            if (u < LOST_RUN) {
              const e = ease(u / LOST_RUN);
              x = m.from.x + (m.to.x - m.from.x) * e;
              y = m.from.y + (m.to.y - m.from.y) * e;
            } else {
              const e = (u - LOST_RUN) / (1 - LOST_RUN);
              x = m.to.x + (m.drop.x - m.to.x) * e;
              y = m.to.y + (m.drop.y - m.to.y) * e * e;
              m.node.setAttribute('opacity', String(round(1 - e * 0.7)));
            }
          } else {
            const e = ease(u);
            x = m.from.x + (m.to.x - m.from.x) * e;
            y = m.from.y + (m.to.y - m.from.y) * e;
          }
          m.node.setAttribute('transform', `translate(${round(x)},${round(y)})`);
        }
      });
    }

    return {
      async render(next: SendAndForgetScene, prev: SendAndForgetScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const flows =
          opts.animate && prev !== null && next.step.kind === 'tick' && prev.tick === next.tick - 1;
        if (!flows) {
          drawStatic(next);
          return;
        }
        await flow(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
