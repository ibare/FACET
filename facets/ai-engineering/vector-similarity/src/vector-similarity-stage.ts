/**
 * vector-similarity-stage — 평면 위의 방향·거리와, 그 옆에 선 순위 기둥.
 *
 * ── 형태를 정한 것
 *
 * 소재가 **평면 위의 방향과 거리**다. 그래서 왼쪽은 좌표평면이고, 재는 도구는
 * 잣대마다 아예 다른 그림이 된다 — 코사인은 두 방향 사이의 **호**, 유클리드는
 * 두 점을 잇는 **자**, 내적은 질의 방향 위로 내린 **그림자**다. 셋이 같은
 * 그림을 색만 바꿔 쓰면 "무엇으로 재느냐" 가 화면에서 사라진다.
 *
 * 오른쪽은 순위 기둥이다. 잣대를 바꾸면 다섯 칸이 **서로 지나치며 자리를
 * 맞바꾼다.** 값만 갈아 끼우는 재그리기로는 "뒤집힌다" 는 동사가 일어나지
 * 않으므로, 옮겨 가는 것은 `transform` 으로 실제로 옮긴다.
 *
 * ── 축척은 가로세로가 같다
 *
 * 거리와 각이 둘 다 뜻을 지는 화면이라 배율이 갈리면 그림이 거짓을 말한다 —
 * 세로로 눌린 평면에서는 직각이 직각으로 안 보이고 원이 타원이 된다. 그래서
 * 평면은 정사각이고, 한 칸의 px 는 가로세로가 같은 수(`UNIT`)다.
 *
 * **그 제약이 평면의 폭을 정하고, 남는 폭은 순위 기둥이 받는다.** 남는 폭을
 * 여백으로 버리지 않으려고 기둥을 오른쪽에 세운 것이지, 기둥 자리를 먼저 정해
 * 놓고 평면을 줄인 것이 아니다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다
 *
 * 후보 수가 선언으로 정해지고 평면의 범위도 고정이라 높이가 내용을 따라 자랄
 * 일이 없다. `viewBox` 는 러너가 한 번 세우고 이 파일은 건드리지 않는다 (S-view).
 */

import {
  getColors,
  categorical,
  fonts,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

/**
 * 재는 법과 점 — **algorithm 에서 가져오지 않는다.**
 *
 * View 는 알고리즘 계층의 존재를 몰라야 하고, 둘의 접점은 이벤트 어휘와 식별자
 * 문법뿐이다 (원칙 1). 타입만 가져오면 런타임에는 지워지지만 그래도 stage 가
 * algorithm 을 읽어야 알 수 있는 모양이 되고, 저장소의 stage 273 중 266 이
 * 그렇게 하지 않는다. **부품이 아니라 어휘를 맞춘다** (S-piece PREFER).
 */
export type MeasureKind = 'cosine' | 'euclidean' | 'dot';
export type VectorPoint = { id: string; x: number; y: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스. 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece · S-view). */
const W = 700;
const H = 380;

/** 평면이 담는 눈금 범위. 데이터가 1~10 안에 드는 정수 좌표라 열 칸이면 족하다. */
const DOMAIN = 10;
const PLANE_TOP = 34;
const PLANE_LEFT = 30;
/** 원점의 세로 자리. 아래로는 캡션 한 줄만 남긴다. */
const PLANE_BASE = H - 52;
/** 정사각이므로 변의 길이는 세로가 정한다. 가로도 같은 수를 쓴다. */
const PLANE_SIDE = PLANE_BASE - PLANE_TOP;
const UNIT = PLANE_SIDE / DOMAIN;

/** 순위 기둥. 평면이 쓰고 남긴 폭을 그대로 받는다. */
const RANK_LEFT = PLANE_LEFT + PLANE_SIDE + 60;
const RANK_RIGHT = W - 26;
const RANK_W = RANK_RIGHT - RANK_LEFT;
const RANK_TOP = 96;
const ROW_H = 46;
const ROW_GAP = 6;

/** 코사인의 호를 그리는 반지름 (눈금 단위). */
const ARC_R = 2.2;

const DUR_MEASURE = 320;
const DUR_RANK = 460;
const FRAME_MS = 16;

/** 그림에 새기는 표식. 번역하면 화면과 어긋난다 (C10). */
const AXIS_MARK = ['2', '4', '6', '8', '10'] as const;

type Scene = { query: VectorPoint; candidates: VectorPoint[] };

type MeasuredMark = { id: string; x: number; y: number; value: number; measure: MeasureKind };

type RankingMark = { order: string[] };

export type VectorSimilarityStage = ViewInstance & {
  setMeasure(measure: MeasureKind): void;
  showMeasured(mark: MeasuredMark): Promise<void>;
  applyRanking(mark: RankingMark): Promise<void>;
  setCaption(text: string): void;
  resetMarks(): void;
};

function isPoint(v: unknown): v is VectorPoint {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이기 때문이다 (S-piece). projector 는 걸음마다 오는 payload 만 좁힌다.
 */
function readScene(raw: unknown): Scene {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('vector-similarity-stage: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (!isPoint(d.query)) throw new Error('vector-similarity-stage: query 좌표가 없다');
  if (!Array.isArray(d.candidates) || !d.candidates.every(isPoint)) {
    throw new Error('vector-similarity-stage: candidates 가 좌표 목록이 아니다');
  }
  return { query: d.query, candidates: d.candidates };
}

const px = (x: number): number => PLANE_LEFT + x * UNIT;
const py = (y: number): number => PLANE_BASE - y * UNIT;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = content;
  return node;
}

/** 잣대별 표기 — 내적만 정수다. 수식 표기이므로 표식이다 (C10). */
function format(measure: MeasureKind, value: number): string {
  return measure === 'dot' ? String(Math.round(value)) : value.toFixed(4);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export const vectorSimilarityStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너는 손대지 않는다. 러너가 캔버스를 **먼저** 붙이고 mount 를 부르므로
    // `container.textContent = ''` 한 줄이면 그 캔버스가 떨어져 나가고, 예외도
    // 안 난 채 그림만 사라진다 (S-view). 그릴 자리는 `params.canvas` 안쪽이다.
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);
    const tone = categorical(scene.candidates.length, 'vivid');

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

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

    /** 시각을 보고 나아가는 트윈. 1 에 닿으면 끝나므로 무한 루프가 아니다. */
    async function tween(duration: number, step: (p: number) => void): Promise<void> {
      const started = Date.now();
      for (;;) {
        if (destroyed) return;
        const raw = Math.min(1, (Date.now() - started) / duration);
        step(easeInOut(raw));
        if (raw >= 1) return;
        await wait(FRAME_MS);
      }
    }

    const root = el('g', {});
    canvas.appendChild(root);

    // ── 평면 ────────────────────────────────────────────────────────────
    const plane = el('g', {});
    root.appendChild(plane);

    for (let i = 1; i <= DOMAIN; i += 1) {
      plane.appendChild(
        el('line', {
          x1: px(i), y1: py(0), x2: px(i), y2: py(DOMAIN),
          stroke: colors.border, 'stroke-width': 1,
        }),
      );
      plane.appendChild(
        el('line', {
          x1: px(0), y1: py(i), x2: px(DOMAIN), y2: py(i),
          stroke: colors.border, 'stroke-width': 1,
        }),
      );
    }
    plane.appendChild(
      el('line', { x1: px(0), y1: py(0), x2: px(DOMAIN), y2: py(0), stroke: colors.textMuted, 'stroke-width': 1.5 }),
    );
    plane.appendChild(
      el('line', { x1: px(0), y1: py(0), x2: px(0), y2: py(DOMAIN), stroke: colors.textMuted, 'stroke-width': 1.5 }),
    );
    for (const mark of AXIS_MARK) {
      const n = Number(mark);
      plane.appendChild(
        text(mark, {
          x: px(n), y: py(0) + 15, 'font-size': 9, fill: colors.textMuted, 'text-anchor': 'middle',
        }),
      );
    }

    // 재는 도구가 그려지는 층. 점보다 아래에 두어 점을 가리지 않는다.
    const toolLayer = el('g', {});
    plane.appendChild(toolLayer);

    // 질의 — 화면의 기준이라 강조색이 아니라 본문 잉크로 그린다.
    const qx = px(scene.query.x);
    const qy = py(scene.query.y);
    plane.appendChild(
      el('line', {
        x1: px(0), y1: py(0), x2: qx, y2: qy, stroke: colors.text, 'stroke-width': 2.4,
        'stroke-linecap': 'round',
      }),
    );
    plane.appendChild(el('circle', { cx: qx, cy: qy, r: 4.5, fill: colors.text }));
    plane.appendChild(
      text(t('label.query', 'query'), {
        x: qx + 9, y: qy - 8, 'font-size': 11, 'font-weight': 600, fill: colors.text,
      }),
    );
    plane.appendChild(
      text(`(${scene.query.x}, ${scene.query.y})`, {
        x: qx + 9, y: qy + 5, 'font-size': 9, fill: colors.textMuted, 'font-family': fonts.mono,
      }),
    );

    const swatch = new Map<string, string>();
    scene.candidates.forEach((v, i) => {
      const color = tone[i] ?? colors.text;
      swatch.set(v.id, color);
      plane.appendChild(
        el('line', {
          x1: px(0), y1: py(0), x2: px(v.x), y2: py(v.y), stroke: color, 'stroke-width': 1.2,
          'stroke-dasharray': '3 3', opacity: 0.75,
        }),
      );
      plane.appendChild(el('circle', { cx: px(v.x), cy: py(v.y), r: 4, fill: color }));
      plane.appendChild(
        text(v.id, {
          x: px(v.x) + 8, y: py(v.y) - 6, 'font-size': 11, 'font-weight': 600, fill: color,
        }),
      );
    });

    // ── 순위 기둥 ───────────────────────────────────────────────────────
    const column = el('g', {});
    root.appendChild(column);
    column.appendChild(
      text(t('label.rank', 'rank'), {
        x: RANK_LEFT, y: RANK_TOP - 16, 'font-size': 11, 'font-weight': 600, fill: colors.textMuted,
      }),
    );

    const seatY = (seat: number): number => RANK_TOP + seat * (ROW_H + ROW_GAP);

    type Row = { group: SVGGElement; value: SVGTextElement; seat: number };
    const rows = new Map<string, Row>();

    scene.candidates.forEach((v, i) => {
      const color = swatch.get(v.id) ?? colors.text;
      const group = el('g', { transform: `translate(${RANK_LEFT}, ${seatY(i)})` });
      group.appendChild(
        el('rect', {
          x: 0, y: 0, width: RANK_W, height: ROW_H, rx: 6,
          fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1,
        }),
      );
      group.appendChild(el('rect', { x: 0, y: 0, width: 5, height: ROW_H, rx: 2, fill: color }));
      group.appendChild(
        text(v.id, { x: 18, y: ROW_H / 2 + 5, 'font-size': 15, 'font-weight': 600, fill: color }),
      );
      group.appendChild(
        text(`(${v.x}, ${v.y})`, {
          x: 40, y: ROW_H / 2 + 5, 'font-size': 10, fill: colors.textMuted, 'font-family': fonts.mono,
        }),
      );
      const value = text('', {
        x: RANK_W - 12, y: ROW_H / 2 + 5, 'font-size': 13, 'text-anchor': 'end',
        fill: colors.text, 'font-family': fonts.mono,
      });
      group.appendChild(value);
      column.appendChild(group);
      rows.set(v.id, { group, value, seat: i });
    });

    const caption = text('', {
      x: PLANE_LEFT, y: H - 16, 'font-size': 12, fill: colors.textMuted,
    });
    root.appendChild(caption);

    // ── 재는 도구 ───────────────────────────────────────────────────────

    let measure: MeasureKind = 'cosine';

    function clearTools(): void {
      toolLayer.textContent = '';
    }

    /** 코사인 — 질의 방향에서 후보 방향으로 호가 벌어진다. */
    async function drawArc(v: VectorPoint): Promise<void> {
      const a0 = Math.atan2(scene.query.y, scene.query.x);
      const a1 = Math.atan2(v.y, v.x);
      const r = ARC_R * UNIT;
      const arc = el('path', {
        d: '', fill: 'none', stroke: colors.accent, 'stroke-width': 2.6, 'stroke-linecap': 'round',
      });
      toolLayer.appendChild(arc);
      const head = el('circle', { cx: px(0), cy: py(0), r: 3.6, fill: colors.accent });
      toolLayer.appendChild(head);
      await tween(DUR_MEASURE, (p) => {
        const a = a0 + (a1 - a0) * p;
        const sweep = a1 > a0 ? 1 : 0;
        const x0 = px(0) + Math.cos(a0) * r;
        const y0 = py(0) - Math.sin(a0) * r;
        const x1 = px(0) + Math.cos(a) * r;
        const y1 = py(0) - Math.sin(a) * r;
        arc.setAttribute('d', `M ${x0} ${y0} A ${r} ${r} 0 0 ${1 - sweep} ${x1} ${y1}`);
        head.setAttribute('cx', String(x1));
        head.setAttribute('cy', String(y1));
      });
    }

    /** 유클리드 — 질의 점에서 후보 점으로 자가 뻗는다. */
    async function drawRuler(v: VectorPoint): Promise<void> {
      const bar = el('line', {
        x1: qx, y1: qy, x2: qx, y2: qy, stroke: colors.accent, 'stroke-width': 2.6,
        'stroke-linecap': 'round',
      });
      toolLayer.appendChild(bar);
      const head = el('circle', { cx: qx, cy: qy, r: 3.6, fill: colors.accent });
      toolLayer.appendChild(head);
      await tween(DUR_MEASURE, (p) => {
        const x = qx + (px(v.x) - qx) * p;
        const y = qy + (py(v.y) - qy) * p;
        bar.setAttribute('x2', String(x));
        bar.setAttribute('y2', String(y));
        head.setAttribute('cx', String(x));
        head.setAttribute('cy', String(y));
      });
    }

    /** 내적 — 후보가 질의 방향 위에 드리우는 그림자가 자란다. */
    async function drawShadow(v: VectorPoint): Promise<void> {
      const qlen = Math.sqrt(scene.query.x ** 2 + scene.query.y ** 2) || 1;
      const ux = scene.query.x / qlen;
      const uy = scene.query.y / qlen;
      const along = (v.x * ux + v.y * uy) / qlen;
      const footX = px(ux * along * qlen);
      const footY = py(uy * along * qlen);
      const drop = el('line', {
        x1: px(v.x), y1: py(v.y), x2: px(v.x), y2: py(v.y), stroke: colors.accent,
        'stroke-width': 1.2, 'stroke-dasharray': '2 3',
      });
      const beam = el('line', {
        x1: px(0), y1: py(0), x2: px(0), y2: py(0), stroke: colors.accent, 'stroke-width': 4,
        'stroke-linecap': 'round', opacity: 0.85,
      });
      toolLayer.appendChild(beam);
      toolLayer.appendChild(drop);
      const head = el('circle', { cx: px(0), cy: py(0), r: 3.6, fill: colors.accent });
      toolLayer.appendChild(head);
      await tween(DUR_MEASURE, (p) => {
        const x = px(0) + (footX - px(0)) * p;
        const y = py(0) + (footY - py(0)) * p;
        beam.setAttribute('x2', String(x));
        beam.setAttribute('y2', String(y));
        drop.setAttribute('x2', String(x));
        drop.setAttribute('y2', String(y));
        head.setAttribute('cx', String(x));
        head.setAttribute('cy', String(y));
      });
    }

    const instance: VectorSimilarityStage = {
      setMeasure(next: MeasureKind): void {
        measure = next;
        clearTools();
        for (const [, row] of rows) row.value.textContent = '';
      },

      async showMeasured(mark: MeasuredMark): Promise<void> {
        if (destroyed) return;
        const point = { id: mark.id, x: mark.x, y: mark.y };
        if (measure === 'euclidean') await drawRuler(point);
        else if (measure === 'dot') await drawShadow(point);
        else await drawArc(point);
        const row = rows.get(mark.id);
        if (row) row.value.textContent = format(mark.measure, mark.value);
      },

      /** 다섯이 서로 지나치며 자리를 맞바꾼다. 이 화면의 동사가 여기 있다. */
      async applyRanking(mark: RankingMark): Promise<void> {
        if (destroyed) return;
        const moves: Array<{ row: Row; from: number; to: number }> = [];
        mark.order.forEach((id, seat) => {
          const row = rows.get(id);
          if (!row || row.seat === seat) return;
          moves.push({ row, from: seatY(row.seat), to: seatY(seat) });
          row.seat = seat;
        });
        if (moves.length === 0) return;
        await tween(DUR_RANK, (p) => {
          for (const m of moves) {
            const y = m.from + (m.to - m.from) * p;
            m.row.group.setAttribute('transform', `translate(${RANK_LEFT}, ${y})`);
          }
        });
      },

      setCaption(value: string): void {
        caption.textContent = value;
      },

      /** 되감기. 잣대의 흔적을 걷고 다섯을 선언된 차례로 되돌린다. */
      resetMarks(): void {
        measure = 'cosine';
        clearTools();
        scene.candidates.forEach((v, i) => {
          const row = rows.get(v.id);
          if (!row) return;
          row.seat = i;
          row.value.textContent = '';
          row.group.setAttribute('transform', `translate(${RANK_LEFT}, ${seatY(i)})`);
        });
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };

    return instance;
  },
};
