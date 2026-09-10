/**
 * assign-then-move-stage — 붙는 몸짓과 옮기는 몸짓이 **번갈아** 도는 것을 그린다.
 *
 * 화면은 셋이다.
 *
 *   위     번갈이 저울. 지금이 '붙는다' 인지 '옮긴다' 인지를 손잡이가 좌우로
 *          미끄러지며 말한다. 걸음마다 반대쪽으로 건너가므로, 이 왕복 자체가
 *          알고리즘의 몸짓이다.
 *   왼쪽   들판. 점이 가장 가까운 중심을 향해 살(spoke)을 뻗어 붙잡고, 그 다음
 *          걸음에 중심이 살에 끌려 가운데로 옮겨 간다. 떠난 자리에는 유령 고리와
 *          자취가 남는다.
 *   오른쪽 장부. 회마다 중심 셋이 옮긴 거리를 막대로 적는다. 막대가 짧아지다
 *          아무것도 안 남으면 멎은 것이다 — 멎는 것이 곧 답을 찾았다는 신호다.
 *
 * 산점도는 무대이지 주인공이 아니다. 주인공은 살을 뻗고 끌려가는 왕복이다.
 *
 * 세로(H)는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 372;

const PAD = 18;
const GAUGE_TOP = 14;
const GAUGE_H = 30;
const BODY_TOP = 58;
const BODY_H = 264;
const CAPTION_Y = 348;

/** 들판과 장부 사이. */
const PANEL_GAP = 20;
/** 들판 테두리와 점 사이의 숨. */
const FIELD_INSET = 18;
/** 들판이 가로로 가져갈 수 있는 몫의 상한. 남는 폭은 장부가 쓴다 (S-piece). */
const FIELD_MAX_RATIO = 0.52;

const ROW_LABEL_W = 44;
const ROW_NUM_W = 44;
/** 장부가 미리 잡아 두는 줄 수. 더 오면 줄 높이를 줄여 담는다 (세로는 안 늘린다). */
const LEDGER_SLOTS = 4;

const POINT_R = 4.5;
const CENTER_R = 11;
const SPOKE_OPACITY = 0.4;
const KNOB_IDLE_OPACITY = 0.3;

const ATTACH_MS = 700;
const MOVE_MS = 640;
/** 앞머리에서 손잡이가 건너가고, 그 다음에 들판의 몸짓이 시작한다. */
const KNOB_PART = 0.28;
const ACT_START = 0.2;
/** 한 점이 붙는 데 쓰는 몫. 나머지는 점에서 점으로 번지는 시차가 가져간다. */
const ATTACH_SPAN = 0.5;
/** 살을 놓고 다시 잡는 순간 — 이 지점에서 색이 새 무리로 넘어간다. */
const GRIP_AT = 0.55;

/** 중심에 새기는 표식. 장부의 범례가 같은 글자를 쓴다 (C10 — 도형에 새긴 글자). */
const CENTER_MARKS = ['A', 'B', 'C', 'D', 'E', 'F'];

type Pt = { x: number; y: number };

type Scene = { points: Pt[]; seeds: Pt[] };

export type AssignStep = { round: number; assign: number[] };
export type MoveStep = { round: number; to: Pt[]; moved: number[] };

function readPoint(raw: unknown): Pt | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== 'number' || typeof r.y !== 'number') return null;
  return { x: r.x, y: r.y };
}

function readPoints(raw: unknown): Pt[] {
  if (!Array.isArray(raw)) return [];
  const out: Pt[] = [];
  for (const item of raw) {
    const p = readPoint(item);
    if (p) out.push(p);
  }
  return out;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이므로 (S-piece).
 */
function readScene(raw: unknown): Scene {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const points = readPoints(src.points);
  const seeds = readPoints(src.seeds);
  if (points.length === 0) {
    throw new Error('assign-then-move-stage: initialData.points 에 점이 없다');
  }
  if (seeds.length === 0) {
    throw new Error('assign-then-move-stage: initialData.seeds 에 중심이 없다');
  }
  return { points, seeds };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const assignThenMoveStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const scene = readScene(params.initialData);
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    const k = scene.seeds.length;
    const hue = categorical(Math.max(k, 3), 'vivid');
    const rx = parseFloat(radii.md);

    // ── 자리 셈. 들판은 세로에 매이므로 남는 가로는 장부가 가져간다.
    const all = [...scene.points, ...scene.seeds];
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const dx = Math.max(maxX - minX, 1e-6);
    const dy = Math.max(maxY - minY, 1e-6);
    const fieldMaxW = Math.round((W - PAD * 2) * FIELD_MAX_RATIO);
    const unit = Math.min((fieldMaxW - FIELD_INSET * 2) / dx, (BODY_H - FIELD_INSET * 2) / dy);
    const fieldW = Math.round(dx * unit + FIELD_INSET * 2);
    const ledgerX = PAD + fieldW + PANEL_GAP;
    const ledgerW = W - PAD - ledgerX;
    const barX = ledgerX + 12 + ROW_LABEL_W;
    const barMaxW = ledgerW - 12 - ROW_LABEL_W - ROW_NUM_W - 12;
    const rowsTop = BODY_TOP + 30;
    const rowsH = BODY_H - 40;

    const px = (x: number): number => PAD + FIELD_INSET + (x - minX) * unit;
    const py = (y: number): number => BODY_TOP + BODY_H - FIELD_INSET - (y - minY) * unit;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한꺼번에 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    function animate(duration: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = clamp01((Date.now() - started) / duration);
          step(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 껍데기
    svg.textContent = '';

    const gaugeHalf = (W - PAD * 2) / 2;
    svg.appendChild(
      el('rect', {
        x: PAD,
        y: GAUGE_TOP,
        width: W - PAD * 2,
        height: GAUGE_H,
        rx: GAUGE_H / 2,
        fill: c.bgSubtle,
        stroke: c.border,
      }),
    );
    const knob = el('rect', {
      x: PAD + 3,
      y: GAUGE_TOP + 3,
      width: gaugeHalf - 6,
      height: GAUGE_H - 6,
      rx: (GAUGE_H - 6) / 2,
      fill: c.accent,
      opacity: KNOB_IDLE_OPACITY,
    });
    svg.appendChild(knob);

    const gaugeLabels = [
      { node: el('text', {}), text: tr('label.attach', 'attach') },
      { node: el('text', {}), text: tr('label.move', 'move') },
    ];
    gaugeLabels.forEach((entry, i) => {
      const node = entry.node;
      node.setAttribute('x', String(PAD + gaugeHalf * (i + 0.5)));
      node.setAttribute('y', String(GAUGE_TOP + GAUGE_H / 2 + 4));
      node.setAttribute('text-anchor', 'middle');
      node.setAttribute('font-family', fonts.body);
      node.setAttribute('font-size', fontSizes.sm);
      node.setAttribute('fill', c.textMuted);
      node.textContent = entry.text;
      svg.appendChild(node);
    });

    function paintGauge(active: number): void {
      gaugeLabels.forEach((entry, i) => {
        entry.node.setAttribute('fill', i === active ? c.stateInk : c.textMuted);
      });
    }

    /** 손잡이가 실제로 어느 쪽에 있는지로 이름을 밝힌다 — 건너가는 도중에 뒤집힌다. */
    function paintByKnob(): void {
      const x = parseFloat(knob.getAttribute('x') ?? String(PAD + 3));
      paintGauge(x - PAD > gaugeHalf / 2 ? 1 : 0);
    }

    svg.appendChild(
      el('rect', {
        x: PAD,
        y: BODY_TOP,
        width: fieldW,
        height: BODY_H,
        rx,
        fill: c.bgSubtle,
        stroke: c.border,
      }),
    );
    svg.appendChild(
      el('rect', {
        x: ledgerX,
        y: BODY_TOP,
        width: ledgerW,
        height: BODY_H,
        rx,
        fill: c.bgSubtle,
        stroke: c.border,
      }),
    );

    const ledgerTitle = el('text', {
      x: ledgerX + 12,
      y: BODY_TOP + 19,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    ledgerTitle.textContent = tr('label.ledger', 'how far each center moved');
    svg.appendChild(ledgerTitle);

    for (let i = 0; i < k; i += 1) {
      const cx = ledgerX + ledgerW - 14 - (k - 1 - i) * 20;
      svg.appendChild(el('circle', { cx, cy: BODY_TOP + 15, r: 7, fill: hue[i] }));
      const mark = el('text', {
        x: cx,
        y: BODY_TOP + 19,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.stateInk,
      });
      mark.textContent = CENTER_MARKS[i] ?? String(i + 1);
      svg.appendChild(mark);
    }

    // ── 들판
    const ghostLayer = el('g', {});
    const spokeLayer = el('g', {});
    const pointLayer = el('g', {});
    const centerLayer = el('g', {});
    svg.appendChild(ghostLayer);
    svg.appendChild(spokeLayer);
    svg.appendChild(pointLayer);
    svg.appendChild(centerLayer);

    const spokes = scene.points.map((p) =>
      el('line', {
        x1: px(p.x),
        y1: py(p.y),
        x2: px(p.x),
        y2: py(p.y),
        stroke: c.border,
        'stroke-width': 1.3,
        'stroke-opacity': SPOKE_OPACITY,
      }),
    );
    spokes.forEach((s) => spokeLayer.appendChild(s));

    const dots = scene.points.map((p) =>
      el('circle', {
        cx: px(p.x),
        cy: py(p.y),
        r: POINT_R,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1.2,
      }),
    );
    dots.forEach((d) => pointLayer.appendChild(d));

    const centerRings = scene.seeds.map((s, i) => {
      const ring = el('circle', {
        cx: px(s.x),
        cy: py(s.y),
        r: CENTER_R,
        fill: c.bg,
        stroke: hue[i],
        'stroke-width': 2.5,
      });
      const mark = el('text', {
        x: px(s.x),
        y: py(s.y) + 4,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: hue[i],
      });
      mark.textContent = CENTER_MARKS[i] ?? String(i + 1);
      centerLayer.appendChild(ring);
      centerLayer.appendChild(mark);
      return { ring, mark };
    });

    function placeCenter(i: number, x: number, y: number): void {
      centerRings[i].ring.setAttribute('cx', String(x));
      centerRings[i].ring.setAttribute('cy', String(y));
      centerRings[i].mark.setAttribute('x', String(x));
      centerRings[i].mark.setAttribute('y', String(y + 4));
    }

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    svg.appendChild(caption);

    // ── 움직이는 상태
    /** 중심의 지금 자리 (픽셀). */
    let centers = scene.seeds.map((s) => ({ x: px(s.x), y: py(s.y) }));
    /** 점이 붙어 있는 중심의 번호. -1 이면 아직 아무 데도 안 붙었다. */
    let held = scene.points.map(() => -1);
    /** 살의 끝점 (픽셀). 붙기 전에는 제 점 위에 겹쳐 있어 보이지 않는다. */
    let tips = scene.points.map((p) => ({ x: px(p.x), y: py(p.y) }));

    type LedgerRow = { group: SVGGElement; bars: SVGRectElement[]; moved: number[] };
    const rows: LedgerRow[] = [];
    let longest = 0;
    let stamp: SVGTextElement | null = null;

    function layoutRows(): void {
      const slotH = rowsH / Math.max(LEDGER_SLOTS, rows.length);
      rows.forEach((row, i) => {
        row.group.setAttribute('transform', `translate(0, ${rowsTop + slotH * i})`);
      });
    }

    function barWidth(distance: number): number {
      if (longest <= 0) return 0;
      return Math.min(barMaxW, (distance / longest) * barMaxW);
    }

    function repaintBars(): void {
      for (const row of rows) {
        row.bars.forEach((bar, i) => {
          bar.setAttribute('width', String(barWidth(row.moved[i])));
        });
      }
    }

    function addRow(round: number, moved: number[]): LedgerRow {
      const group = el('g', {});
      const label = el('text', {
        x: ledgerX + 12,
        y: 12,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = tr('label.round', 'round {n}', { n: round });
      group.appendChild(label);

      const bars: SVGRectElement[] = [];
      moved.forEach((distance, i) => {
        const y = 17 + i * 11;
        group.appendChild(
          el('rect', {
            x: barX,
            y,
            width: barMaxW,
            height: 7,
            rx: 3.5,
            fill: c.border,
            opacity: 0.5,
          }),
        );
        const bar = el('rect', { x: barX, y, width: 0, height: 7, rx: 3.5, fill: hue[i] });
        group.appendChild(bar);
        bars.push(bar);
        const num = el('text', {
          x: barX + barMaxW + 8,
          y: y + 6.5,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        num.textContent = distance.toFixed(2);
        group.appendChild(num);
      });

      svg.appendChild(group);
      const row: LedgerRow = { group, bars, moved };
      rows.push(row);
      layoutRows();
      return row;
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    setCaption(tr('caption.start', 'Three centers sit where no cluster is.'));

    // ── 몸짓 하나: 붙는다
    async function attach(step: AssignStep): Promise<void> {
      ghostLayer.textContent = '';
      const from = tips.map((t) => ({ x: t.x, y: t.y }));
      const to = step.assign.map((which) => centers[which] ?? centers[0]);
      const knobFrom = parseFloat(knob.getAttribute('x') ?? String(PAD + 3));
      const knobTo = PAD + 3;
      const knobOpacityFrom = parseFloat(knob.getAttribute('opacity') ?? '1');
      const spread =
        scene.points.length > 1 ? (1 - ATTACH_SPAN) / (scene.points.length - 1) : 0;

      await animate(ATTACH_MS, (p) => {
        const knobP = ease(clamp01(p / KNOB_PART));
        knob.setAttribute('x', String(lerp(knobFrom, knobTo, knobP)));
        knob.setAttribute('opacity', String(lerp(knobOpacityFrom, 1, knobP)));
        paintByKnob();

        const acted = clamp01((p - ACT_START) / (1 - ACT_START));
        for (let i = 0; i < scene.points.length; i += 1) {
          const local = ease(clamp01((acted - i * spread) / ATTACH_SPAN));
          const tip = { x: lerp(from[i].x, to[i].x, local), y: lerp(from[i].y, to[i].y, local) };
          spokes[i].setAttribute('x2', String(tip.x));
          spokes[i].setAttribute('y2', String(tip.y));
          const gripped = local >= GRIP_AT;
          const tone = gripped ? hue[step.assign[i]] : c.border;
          spokes[i].setAttribute('stroke', tone);
          dots[i].setAttribute('fill', gripped ? hue[step.assign[i]] : c.itemDefault);
          dots[i].setAttribute('stroke', tone);
        }
      });

      tips = to.map((t) => ({ x: t.x, y: t.y }));
      held = [...step.assign];
    }

    // ── 몸짓 둘: 옮긴다
    async function move(step: MoveStep): Promise<void> {
      const from = centers.map((p) => ({ x: p.x, y: p.y }));
      const target = step.to.map((p) => ({ x: px(p.x), y: py(p.y) }));
      const knobFrom = parseFloat(knob.getAttribute('x') ?? String(PAD + 3));
      const knobTo = PAD + 3 + gaugeHalf;

      for (let i = 0; i < from.length; i += 1) {
        ghostLayer.appendChild(
          el('circle', {
            cx: from[i].x,
            cy: from[i].y,
            r: CENTER_R,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 3',
          }),
        );
      }
      const trails = from.map((p) =>
        el('line', {
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
          stroke: c.ghostOutline,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3',
        }),
      );
      trails.forEach((t) => ghostLayer.appendChild(t));

      longest = Math.max(longest, ...step.moved);
      repaintBars();
      const row = addRow(step.round, step.moved);

      await animate(MOVE_MS, (p) => {
        const knobP = ease(clamp01(p / KNOB_PART));
        knob.setAttribute('x', String(lerp(knobFrom, knobTo, knobP)));
        paintByKnob();

        const glide = ease(clamp01((p - ACT_START) / (1 - ACT_START)));
        for (let i = 0; i < from.length; i += 1) {
          const now = {
            x: lerp(from[i].x, target[i].x, glide),
            y: lerp(from[i].y, target[i].y, glide),
          };
          placeCenter(i, now.x, now.y);
          trails[i].setAttribute('x2', String(now.x));
          trails[i].setAttribute('y2', String(now.y));
          centers[i] = now;
          row.bars[i].setAttribute('width', String(barWidth(step.moved[i]) * glide));
        }
        for (let i = 0; i < spokes.length; i += 1) {
          const which = held[i];
          if (which < 0) continue;
          spokes[i].setAttribute('x2', String(centers[which].x));
          spokes[i].setAttribute('y2', String(centers[which].y));
        }
      });

      centers = target.map((t) => ({ x: t.x, y: t.y }));
      const prevTips = tips;
      tips = held.map((which, i) => (which < 0 ? prevTips[i] : { ...centers[which] }));
    }

    function finish(info: { settled: boolean }): void {
      if (!info.settled || stamp !== null) return;
      const slotH = rowsH / Math.max(LEDGER_SLOTS, rows.length);
      stamp = el('text', {
        x: ledgerX + 12,
        y: rowsTop + slotH * rows.length + 12,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      stamp.textContent = tr('label.settled', 'no movement');
      svg.appendChild(stamp);
    }

    function rewind(): void {
      ghostLayer.textContent = '';
      for (const row of rows) row.group.remove();
      rows.length = 0;
      longest = 0;
      if (stamp) {
        stamp.remove();
        stamp = null;
      }
      centers = scene.seeds.map((s) => ({ x: px(s.x), y: py(s.y) }));
      centers.forEach((p, i) => placeCenter(i, p.x, p.y));
      held = scene.points.map(() => -1);
      tips = scene.points.map((p) => ({ x: px(p.x), y: py(p.y) }));
      scene.points.forEach((p, i) => {
        spokes[i].setAttribute('x2', String(px(p.x)));
        spokes[i].setAttribute('y2', String(py(p.y)));
        spokes[i].setAttribute('stroke', c.border);
        dots[i].setAttribute('fill', c.itemDefault);
        dots[i].setAttribute('stroke', c.border);
      });
      knob.setAttribute('x', String(PAD + 3));
      knob.setAttribute('opacity', String(KNOB_IDLE_OPACITY));
      paintGauge(-1);
      setCaption(tr('caption.start', 'Three centers sit where no cluster is.'));
    }

    return {
      attach,
      move,
      finish,
      rewind,
      setCaption,
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
