/**
 * reduce-to-known 의 그림 — 문제가 자리를 옮기는 장면.
 *
 * 왼쪽 판에 시험 시간표가 선다: 과목 카드 다섯과, 겹치는 두 과목을 묶는 괄호 여섯.
 * 오른쪽에는 **빈 자리 다섯**이 고리로 놓여 기다린다.
 *
 * 걸음마다 과목 카드가 제 줄을 떠나 빈 자리로 날아가며 좁아진다 — 카드가 곧
 * 마디가 된다. 그때 두 끝이 다 건너간 괄호는 곧게 펴져 두 마디를 잇는 선이 된다.
 * 떠난 자리에는 점선 자국이 남아 왼쪽 판이 비어 가는 것이 보인다. 마지막에 그
 * 빈 판으로 답이 돌아와 교시별 줄로 앉는다.
 *
 * 세로는 이 파일이 갖는다 (S-piece). 가로는 러너가 `PIECE_CANVAS_W` 로 준다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 290;

const PAD = 14;
const ZONE_GAP = 46;

/** 왼쪽 판 — 시험 시간표. */
const PANEL_X = PAD;
const PANEL_W = Math.round((W - PAD * 2 - ZONE_GAP) * 0.45);
const PANEL_Y = 40;
const PANEL_H = 196;

/** 과목 카드가 서는 줄. 괄호는 카드 왼쪽의 좁은 골에 겹쳐 그린다. */
const CARD_X = PANEL_X + 62;
const CARD_W = PANEL_W - 72;
const CARD_H = 26;
const ROW_GAP = 8;
const ROW_TOP = PANEL_Y + 12;
const LANE_X = CARD_X - 12;
const LANE_GAP = 8;

/** 오른쪽 고리 — 그래프. 마디는 좁아진 카드다. */
const RING_X = PANEL_X + PANEL_W + ZONE_GAP;
const CX = RING_X + (W - PAD - RING_X) / 2;
const CY = 146;
const RING_R = 88;
const NODE_W = 92;

/** 답이 돌아와 앉는 줄. */
const PLAN_TOP = PANEL_Y + 32;
const PLAN_H = 30;
const PLAN_GAP = 12;
const SWATCH_X = PANEL_X + 14;
const SWATCH_W = 66;

const CAPTION_Y = 268;

type Pt = { x: number; y: number };

function draw<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

function pointsOf(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function between(from: readonly Pt[], to: readonly Pt[], p: number): Pt[] {
  return from.map((f, i) => ({
    x: f.x + (to[i].x - f.x) * p,
    y: f.y + (to[i].y - f.y) * p,
  }));
}

function rowCenterY(index: number): number {
  return ROW_TOP + index * (CARD_H + ROW_GAP) + CARD_H / 2;
}

function seatOf(index: number, count: number): Pt {
  const angle = (-Math.PI / 2) + (index * 2 * Math.PI) / Math.max(1, count);
  return { x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle) };
}

export type ReduceToKnownScene = {
  subjects: string[];
  overlaps: Array<[string, string]>;
};

/**
 * 선언을 그림이 쓸 모양으로 좁힌다.
 *
 * `mount` 가 `params.initialData` 를 받는 유일한 자리라 좁히개도 여기 있다
 * (S-piece). projector 는 걸음마다 오는 payload 만 좁힌다.
 */
export function readScene(data: Record<string, unknown> | undefined): ReduceToKnownScene {
  const subjects: string[] = [];
  const rawSubjects = data?.['subjects'];
  if (Array.isArray(rawSubjects)) {
    for (const s of rawSubjects) if (typeof s === 'string') subjects.push(s);
  }

  const overlaps: Array<[string, string]> = [];
  const rawOverlaps = data?.['overlaps'];
  if (Array.isArray(rawOverlaps)) {
    for (const pair of rawOverlaps) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [a, b] = pair as unknown[];
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      if (!subjects.includes(a) || !subjects.includes(b) || a === b) continue;
      overlaps.push([a, b]);
    }
  }

  return { subjects, overlaps };
}

type Card = {
  id: string;
  group: SVGGElement;
  box: SVGRectElement;
  text: SVGTextElement;
  home: Pt;
  seat: Pt;
  width: number;
  at: Pt;
};

type Bracket = {
  line: SVGPolylineElement;
  a: string;
  b: string;
  gutter: Pt[];
  straight: Pt[];
  opened: boolean;
};

export const reduceToKnownStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const scene = readScene(params.initialData);
    const svg = params.canvas;
    svg.textContent = '';

    // ── 걸어 둔 것을 모아 둔다. destroy 가 일괄로 거두고 기다리던 것을 깨운다 (S-piece).
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let raf = 0;
        const step = (): void => {
          frames.delete(raf);
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          apply(p);
          if (p < 1) {
            raf = requestAnimationFrame(step);
            frames.add(raf);
            return;
          }
          finish();
        };
        raf = requestAnimationFrame(step);
        frames.add(raf);
      });
    }

    async function after(ms: number, run: () => Promise<void>): Promise<void> {
      if (ms > 0) await wait(ms);
      if (destroyed) return;
      await run();
    }

    // ── 층. 선은 마디 아래, 자국은 그보다 아래.
    const frame = draw('g', {});
    const ghosts = draw('g', {});
    const links = draw('g', {});
    const cardLayer = draw('g', {});
    const plan = draw('g', {});
    for (const layer of [frame, ghosts, links, cardLayer, plan]) svg.appendChild(layer);

    const caption = draw('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    svg.appendChild(caption);

    /**
     * 과목 이름은 문안이다 (C10). 호출부에 리터럴로 둬야 추출기와 대조 검사가
     * 본다 — 키를 셈해 부르면 그 문안이 검사에서 사라진다.
     */
    function nameOf(id: string): string {
      switch (id) {
        case 'language':
          return t('label.language', 'Language');
        case 'math':
          return t('label.math', 'Math');
        case 'english':
          return t('label.english', 'English');
        case 'science':
          return t('label.science', 'Science');
        case 'history':
          return t('label.history', 'History');
        default:
          return id;
      }
    }

    function buildFrame(): void {
      frame.appendChild(
        draw('rect', {
          x: PANEL_X,
          y: PANEL_Y,
          width: PANEL_W,
          height: PANEL_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );

      const left = draw('text', {
        x: PANEL_X + 2,
        y: PANEL_Y - 12,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      left.textContent = t('label.problem', 'Exam scheduling');
      frame.appendChild(left);

      const right = draw('text', {
        x: RING_X,
        y: PANEL_Y - 12,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      right.textContent = t('label.target', 'Graph coloring');
      frame.appendChild(right);

      // 빈 자리 다섯 — 옮겨 앉을 곳이 처음부터 보인다.
      scene.subjects.forEach((_, i) => {
        const seat = seatOf(i, scene.subjects.length);
        frame.appendChild(
          draw('rect', {
            x: seat.x - NODE_W / 2,
            y: seat.y - CARD_H / 2,
            width: NODE_W,
            height: CARD_H,
            rx: 6,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-dasharray': '4 4',
          }),
        );
      });
    }

    // ── 걸음이 만드는 것들.
    const cards = new Map<string, Card>();
    const brackets: Bracket[] = [];
    const ghostMarks: SVGRectElement[] = [];
    const periodOf = new Map<string, number>();
    let palette: readonly string[] = [];

    function moveCard(card: Card, at: Pt, width: number): void {
      card.at = at;
      card.width = width;
      card.group.setAttribute('transform', `translate(${at.x.toFixed(1)},${at.y.toFixed(1)})`);
      card.box.setAttribute('x', (-width / 2).toFixed(1));
      card.box.setAttribute('width', width.toFixed(1));
    }

    function buildCards(): void {
      scene.subjects.forEach((id, i) => {
        const home = { x: CARD_X + CARD_W / 2, y: rowCenterY(i) };
        const group = draw('g', {});
        const box = draw('rect', {
          x: -CARD_W / 2,
          y: -CARD_H / 2,
          width: CARD_W,
          height: CARD_H,
          rx: 6,
          fill: c.itemDefault,
          stroke: c.border,
        });
        const text = draw('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        text.textContent = nameOf(id);
        group.appendChild(box);
        group.appendChild(text);
        cardLayer.appendChild(group);

        const card: Card = {
          id,
          group,
          box,
          text,
          home,
          seat: seatOf(i, scene.subjects.length),
          width: CARD_W,
          at: home,
        };
        cards.set(id, card);
        moveCard(card, { x: -CARD_W, y: home.y }, CARD_W);
      });
    }

    function buildBrackets(): void {
      scene.overlaps.forEach(([a, b], k) => {
        const ia = scene.subjects.indexOf(a);
        const ib = scene.subjects.indexOf(b);
        const ya = rowCenterY(ia);
        const yb = rowCenterY(ib);
        const laneX = LANE_X - k * LANE_GAP;
        const gutter: Pt[] = [
          { x: CARD_X, y: ya },
          { x: laneX, y: ya },
          { x: laneX, y: yb },
          { x: CARD_X, y: yb },
        ];
        const seatA = cards.get(a)?.seat ?? { x: CX, y: CY };
        const seatB = cards.get(b)?.seat ?? { x: CX, y: CY };
        const straight: Pt[] = [
          seatA,
          { x: seatA.x + (seatB.x - seatA.x) / 3, y: seatA.y + (seatB.y - seatA.y) / 3 },
          { x: seatA.x + ((seatB.x - seatA.x) * 2) / 3, y: seatA.y + ((seatB.y - seatA.y) * 2) / 3 },
          seatB,
        ];
        const mid = (ya + yb) / 2;
        const collapsed = gutter.map((p) => ({ x: p.x, y: mid }));
        const line = draw('polyline', {
          points: pointsOf(collapsed),
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.5,
        });
        links.appendChild(line);
        brackets.push({ line, a, b, gutter, straight, opened: false });
      });
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    async function showBoard(): Promise<void> {
      setCaption(t('caption.board', 'Exam scheduling: five subjects, six overlapping pairs.'));
      buildCards();
      buildBrackets();

      // 카드가 판 왼쪽 밖에서 차례로 미끄러져 들어와 선다.
      await Promise.all(
        [...cards.values()].map((card, i) =>
          after(i * 70, () =>
            tween(380, (p) => {
              const e = ease(p);
              moveCard(card, { x: -CARD_W + (card.home.x + CARD_W) * e, y: card.home.y }, CARD_W);
            }),
          ),
        ),
      );

      // 괄호가 가운데에서 위아래로 벌어져 두 줄을 문다.
      await Promise.all(
        brackets.map((bracket, i) =>
          after(i * 40, () =>
            tween(240, (p) => {
              const mid = (bracket.gutter[0].y + bracket.gutter[3].y) / 2;
              const collapsed = bracket.gutter.map((pt) => ({ x: pt.x, y: mid }));
              bracket.line.setAttribute(
                'points',
                pointsOf(between(collapsed, bracket.gutter, ease(p))),
              );
            }),
          ),
        ),
      );
    }

    function leaveGhost(card: Card): SVGRectElement {
      const mark = draw('rect', {
        x: card.home.x - CARD_W / 2,
        y: card.home.y - CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
        rx: 6,
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-dasharray': '4 4',
      });
      ghosts.appendChild(mark);
      ghostMarks.push(mark);
      return mark;
    }

    async function seat(subject: string, linkedTo: string[]): Promise<void> {
      const card = cards.get(subject);
      if (!card) return;

      setCaption(
        linkedTo.length === 0
          ? t('caption.seat', 'A subject takes a node seat: {subject}.', {
              subject: nameOf(subject),
            })
          : t(
              'caption.seatLinked',
              'A subject takes a node seat: {subject}. Overlaps turned into edges: {count}.',
              { subject: nameOf(subject), count: linkedTo.length },
            ),
      );

      leaveGhost(card);
      card.box.setAttribute('stroke', c.accent);
      card.box.setAttribute('stroke-width', '2');

      // 두 끝이 다 건너간 괄호만 곧게 펴진다.
      const opening = brackets.filter(
        (b) =>
          !b.opened &&
          ((b.a === subject && linkedTo.includes(b.b)) ||
            (b.b === subject && linkedTo.includes(b.a))),
      );
      for (const bracket of opening) {
        bracket.opened = true;
        bracket.line.setAttribute('stroke', c.accent);
      }

      const from = card.at;
      await tween(540, (p) => {
        const e = ease(p);
        moveCard(
          card,
          { x: from.x + (card.seat.x - from.x) * e, y: from.y + (card.seat.y - from.y) * e },
          CARD_W + (NODE_W - CARD_W) * e,
        );
        for (const bracket of opening) {
          bracket.line.setAttribute(
            'points',
            pointsOf(between(bracket.gutter, bracket.straight, e)),
          );
        }
      });

      card.box.setAttribute('stroke', c.border);
      card.box.setAttribute('stroke-width', '1');
      for (const bracket of opening) bracket.line.setAttribute('stroke', c.textMuted);
    }

    async function paint(subjects: string[], periods: number[], total: number): Promise<void> {
      setCaption(
        t('caption.color', 'Now it is a problem we know — linked nodes take different colors.'),
      );
      palette = categorical(Math.max(1, total), 'vivid');
      periodOf.clear();
      subjects.forEach((id, i) => periodOf.set(id, periods[i]));

      await Promise.all(
        subjects.map((id, i) =>
          after(i * 90, async () => {
            const card = cards.get(id);
            if (!card) return;
            const slot = periods[i];
            card.box.setAttribute('fill', palette[(slot - 1) % palette.length]);
            card.box.setAttribute('stroke', 'none');
            card.text.setAttribute('fill', c.stateInk);
            await tween(260, (p) => {
              const s = 1 + Math.sin(p * Math.PI) * 0.12;
              card.group.setAttribute(
                'transform',
                `translate(${card.at.x.toFixed(1)},${card.at.y.toFixed(1)}) scale(${s.toFixed(3)})`,
              );
            });
          }),
        ),
      );
    }

    function pop(ids: string[]): Promise<void> {
      return tween(240, (p) => {
        const s = 1 + Math.sin(p * Math.PI) * 0.14;
        for (const id of ids) {
          const card = cards.get(id);
          if (!card) continue;
          card.group.setAttribute(
            'transform',
            `translate(${card.at.x.toFixed(1)},${card.at.y.toFixed(1)}) scale(${s.toFixed(3)})`,
          );
        }
      });
    }

    async function readBack(total: number): Promise<void> {
      setCaption(t('caption.schedule', 'One color is one slot. Slots needed: {total}.', { total }));

      const slots: string[][] = [];
      for (let slot = 1; slot <= total; slot += 1) {
        slots.push(scene.subjects.filter((id) => periodOf.get(id) === slot));
      }

      const rows = slots.map((members, i) => {
        const top = PLAN_TOP + i * (PLAN_H + PLAN_GAP);
        const group = draw('g', { transform: `translate(${-PANEL_W - PANEL_X},0)` });
        group.appendChild(
          draw('rect', {
            x: SWATCH_X,
            y: top + 3,
            width: SWATCH_W,
            height: PLAN_H - 6,
            rx: 5,
            fill: palette[i % Math.max(1, palette.length)] ?? c.itemDefault,
          }),
        );
        const slotLabel = draw('text', {
          x: SWATCH_X + SWATCH_W / 2,
          y: top + PLAN_H / 2 + 4,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: c.stateInk,
        });
        slotLabel.textContent = t('label.period', 'Slot {n}', { n: i + 1 });
        group.appendChild(slotLabel);

        const names = draw('text', {
          x: SWATCH_X + SWATCH_W + 12,
          y: top + PLAN_H / 2 + 4,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        names.textContent = members.map((id) => nameOf(id)).join(' · ');
        group.appendChild(names);

        plan.appendChild(group);
        return { group, members };
      });

      const fading = [...ghostMarks];
      await Promise.all([
        tween(220, (p) => {
          for (const mark of fading) mark.setAttribute('opacity', (1 - p).toFixed(2));
        }),
        ...rows.map((row, i) =>
          after(i * 120, async () => {
            await tween(420, (p) => {
              const e = ease(p);
              const dx = (-PANEL_W - PANEL_X) * (1 - e);
              row.group.setAttribute('transform', `translate(${dx.toFixed(1)},0)`);
            });
            await pop(row.members);
          }),
        ),
      ]);

      for (const mark of fading) mark.remove();
      ghostMarks.length = 0;
    }

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function rewind(): void {
      clearLayer(ghosts);
      clearLayer(links);
      clearLayer(cardLayer);
      clearLayer(plan);
      cards.clear();
      brackets.length = 0;
      ghostMarks.length = 0;
      periodOf.clear();
      palette = [];
      setCaption('');
    }

    buildFrame();

    return {
      showBoard,
      seat,
      paint,
      readBack,
      rewind,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        clearLayer(frame);
        caption.remove();
      },
    };
  },
};
