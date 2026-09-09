/**
 * many-trees-vote-stage — 나무 다섯이 물음 다섯에 답한 표를 놓고, 열마다
 * 표가 갈렸다가 다수 쪽으로 모이는 것을 보인다.
 *
 * 그림의 짜임 (좌표는 전부 여기서 캔버스로부터 역산한다 — 선언에는 구조만 있다)
 *
 *   왼쪽 띠   나무 글리프 + 이름. 나무마다 categorical 색 하나.
 *   가운데 판 행 = 나무, 열 = 물음. 칸마다 답 하나가 놓인다.
 *   아래 두 줄 다수결 / 정답.
 *   오른쪽 띠 맺음에서만 나타나는 맞힌 수.
 *
 * 운동은 둘이고 둘 다 위치가 바뀐다.
 *
 *   갈린다 — 열의 답들이 열 축에서 좌우로 **밀려난다**. 고른 답이 options 의
 *            몇 번째냐가 밀려나는 쪽을 정하므로, 밀려난 자리 자체가 표다.
 *            표가 4:1 이면 한쪽에 넷, 한쪽에 하나가 남아 크기로 읽힌다.
 *   모인다 — 다수 쪽 답마다 점 하나가 떨어져 나와 다수결 칸으로 **날아가**
 *            겹친다. 원본은 판에 남고 복제본만 움직인다.
 *
 * 진 표는 지우지 않는다. 열이 끝나면 정답과 어긋난 답에 빗금이 그어지고
 * 밀려난 자리에 그대로 남는다 — 끝까지 화면에 있다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로. 마운트 뒤로 바뀌지 않는다 (S-view) — 줄이 늘면 행 간격을 줄여 담는다. */
const CANVAS_H = 318;

const PAD_X = 12;
const CAPTION_Y = 20;
const HEADER_Y = 46;
const GRID_TOP = 58;
const ROW_MAX_H = 33;
const LABEL_W = 66;
const SCORE_W = 58;
const TOKEN_MAX_W = 36;
const TOKEN_H = 24;
const SLOT_GAP = 4;

const SPLIT_MS = 380;
const GATHER_MS = 440;
const SETTLE_MS = 140;

/** 판이 서려면 있어야 하는 것. 선언(initialData)과 이벤트가 같은 규칙으로 좁혀진다. */
export type VoteModel = {
  trees: string[];
  questions: string[];
  options: string[];
  truth: string[];
  answers: string[][];
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * initialData 를 판으로 좁힌다.
 *
 * mount 와 projector 가 **이 한 벌**을 함께 쓴다. 좁히는 규칙이 두 벌이 되면
 * 한쪽만 고쳐져 화면과 이벤트가 다른 판을 보게 된다 (C9 / S-piece).
 */
export function readVoteModel(raw: unknown): VoteModel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const trees = d.trees;
  const questions = d.questions;
  const options = d.options;
  const truth = d.truth;
  const answers = d.answers;
  if (!isStringArray(trees) || !isStringArray(questions)) return null;
  if (!isStringArray(options) || !isStringArray(truth)) return null;
  if (!Array.isArray(answers) || !answers.every(isStringArray)) return null;
  if (trees.length === 0 || questions.length === 0 || options.length < 2) return null;
  if (truth.length !== questions.length) return null;
  const rows = answers as string[][];
  if (rows.length !== trees.length) return null;
  if (rows.some((row) => row.length !== questions.length)) return null;
  return {
    trees: [...trees],
    questions: [...questions],
    options: [...options],
    truth: [...truth],
    answers: rows.map((row) => [...row]),
  };
}

/** projector 가 부르는 메서드 묶음. */
export type ManyTreesVoteStage = ViewInstance & {
  setModel(model: VoteModel): void;
  setCaption(text: string): void;
  splitVotes(question: number): Promise<void>;
  gatherVotes(
    question: number,
    majority: string,
    truth: string,
    winners: number[],
    losers: number[],
  ): Promise<void>;
  showScores(treeScores: number[], majorityScore: number, total: number): void;
};

type Geometry = {
  colW: number;
  rowH: number;
  tokenW: number;
  sepY: number;
  majY: number;
  truthY: number;
  colCx(q: number): number;
  rowCy(t: number): number;
  /** 답이 options 의 몇 번째냐로 정해지는, 열 축에서의 밀림. */
  offsetOf(optionIndex: number, optionCount: number): number;
};

function buildGeometry(model: VoteModel): Geometry {
  const gridX0 = PAD_X + LABEL_W;
  const gridX1 = PIECE_CANVAS_W - PAD_X - SCORE_W;
  const colW = (gridX1 - gridX0) / model.questions.length;

  const truthY = CANVAS_H - 24;
  const majY = truthY - 36;
  const sepY = majY - 24;
  const rowH = Math.min(ROW_MAX_H, Math.floor((sepY - 8 - GRID_TOP) / model.trees.length));

  // 상수는 상한만 쥐고, 실제 크기는 열 폭에서 역산한다 (S-piece).
  const tokenW = Math.min(TOKEN_MAX_W, Math.floor((colW - SLOT_GAP * 2) / model.options.length));

  return {
    colW,
    rowH,
    tokenW,
    sepY,
    majY,
    truthY,
    colCx: (q) => gridX0 + colW * (q + 0.5),
    rowCy: (t) => GRID_TOP + rowH * t + rowH / 2,
    offsetOf: (optionIndex, optionCount) =>
      (optionIndex - (optionCount - 1) / 2) * (tokenW + SLOT_GAP),
  };
}

type Cell = { group: SVGGElement; box: SVGRectElement; glyph: SVGTextElement };

export const manyTreesVoteStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // 캔버스는 러너가 이미 컨테이너에 붙여 놓았다. 컨테이너를 비우면 그 캔버스가
    // 떨어져 나가므로 안쪽만 비운다 (S-view).
    svg.textContent = '';

    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    let destroyed = false;

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

    /** 전이가 걸리려면 시작 값이 한 번 그려진 뒤에 끝 값을 줘야 한다. */
    function nextFrame(): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        if (typeof requestAnimationFrame !== 'function') {
          // 프레임 훅이 없는 환경(테스트용 DOM). 타이머로 같은 자리를 메운다.
          const id = setTimeout(() => {
            timers.delete(id);
            finish();
          }, 16);
          timers.add(id);
          return;
        }
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          finish();
        });
        frames.add(id);
      });
    }

    function el<K extends keyof SVGElementTagNameMap>(
      name: K,
      attrs: Record<string, string | number> = {},
      parent?: SVGElement,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      (parent ?? svg).appendChild(node);
      return node;
    }

    function label(
      value: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      parent?: SVGElement,
      weight = '500',
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': anchor,
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': size,
          'font-weight': weight,
          fill,
        },
        parent,
      );
      node.textContent = value;
      return node;
    }

    // ── 판의 상태 ──────────────────────────────────────────────────────────
    let model: VoteModel | null = null;
    let geo: Geometry | null = null;
    let cells: Cell[][] = [];
    let majorityHolders: SVGGElement[] = [];
    let truthHolders: SVGGElement[] = [];
    let treeColors: readonly string[] = [];

    const boardLayer = el('g');
    const flightLayer = el('g');
    const scoreLayer = el('g');
    const captionNode = label(
      '',
      PAD_X,
      CAPTION_Y,
      fontSizes.md,
      c.text,
      'start',
      undefined,
      '600',
    );

    /** 나무 하나 — 두 단 수관과 줄기. 색이 곧 그 나무의 표식이다. */
    function drawTree(cx: number, cy: number, fill: string): void {
      el(
        'path',
        {
          d:
            `M ${cx} ${cy - 10}` +
            ` L ${cx + 5} ${cy - 3} L ${cx + 2.5} ${cy - 3}` +
            ` L ${cx + 8} ${cy + 4} L ${cx - 8} ${cy + 4}` +
            ` L ${cx - 2.5} ${cy - 3} L ${cx - 5} ${cy - 3} Z`,
          fill,
          stroke: fill,
          'stroke-width': 1,
          'stroke-linejoin': 'round',
        },
        boardLayer,
      );
      el(
        'line',
        { x1: cx, y1: cy + 4, x2: cx, y2: cy + 9, stroke: fill, 'stroke-width': 2.4 },
        boardLayer,
      );
    }

    function drawBoard(): void {
      const m = model;
      const g = geo;
      if (!m || !g) return;

      boardLayer.textContent = '';
      flightLayer.textContent = '';
      scoreLayer.textContent = '';
      cells = [];
      majorityHolders = [];
      truthHolders = [];
      treeColors = categorical(m.trees.length, 'vivid');

      for (let q = 0; q < m.questions.length; q += 1) {
        label(m.questions[q], g.colCx(q), HEADER_Y, fontSizes.sm, c.textMuted, 'middle', boardLayer);
      }

      for (let t = 0; t < m.trees.length; t += 1) {
        const cy = g.rowCy(t);
        drawTree(PAD_X + 9, cy, treeColors[t] ?? c.text);
        label(m.trees[t], PAD_X + 23, cy, fontSizes.sm, c.text, 'start', boardLayer);

        const row: Cell[] = [];
        for (let q = 0; q < m.questions.length; q += 1) {
          const cx = g.colCx(q);
          const group = el('g', {}, boardLayer);
          const box = el(
            'rect',
            {
              x: cx - g.tokenW / 2,
              y: cy - TOKEN_H / 2,
              width: g.tokenW,
              height: TOKEN_H,
              rx: 5,
              fill: c.bg,
              stroke: c.border,
              'stroke-width': 1,
            },
            group,
          );
          const glyph = label(
            m.answers[t][q],
            cx,
            cy,
            fontSizes.sm,
            c.text,
            'middle',
            group,
            '600',
          );
          row.push({ group, box, glyph });
        }
        cells.push(row);
      }

      el(
        'line',
        {
          x1: PAD_X,
          y1: g.sepY,
          x2: PIECE_CANVAS_W - PAD_X,
          y2: g.sepY,
          stroke: c.border,
          'stroke-width': 1,
        },
        boardLayer,
      );

      label(
        tr('label.majority', 'Majority'),
        PAD_X,
        g.majY,
        fontSizes.sm,
        c.text,
        'start',
        boardLayer,
        '600',
      );
      label(
        tr('label.truth', 'Truth'),
        PAD_X,
        g.truthY,
        fontSizes.sm,
        c.textMuted,
        'start',
        boardLayer,
      );

      for (let q = 0; q < m.questions.length; q += 1) {
        const cx = g.colCx(q);
        const slot = el('g', {}, boardLayer);
        el(
          'rect',
          {
            x: cx - g.tokenW / 2,
            y: g.majY - TOKEN_H / 2,
            width: g.tokenW,
            height: TOKEN_H,
            rx: 5,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          },
          slot,
        );
        majorityHolders.push(slot);
        truthHolders.push(el('g', {}, boardLayer));
      }
    }

    /** 정답과 어긋난 답에 빗금을 긋는다. 지우지 않는 것이 이 조각의 요지다. */
    function strikeCell(cell: Cell, cx: number, cy: number, tokenW: number): void {
      cell.box.setAttribute('stroke', c.danger);
      cell.box.setAttribute('stroke-width', '1.6');
      cell.glyph.setAttribute('fill', c.danger);
      el(
        'line',
        {
          x1: cx - tokenW / 2 + 5,
          y1: cy + TOKEN_H / 2 - 5,
          x2: cx + tokenW / 2 - 5,
          y2: cy - TOKEN_H / 2 + 5,
          stroke: c.danger,
          'stroke-width': 1.6,
          'stroke-linecap': 'round',
        },
        cell.group,
      );
    }

    // ── 갈린다 ─────────────────────────────────────────────────────────────
    async function splitVotes(question: number): Promise<void> {
      const m = model;
      const g = geo;
      if (!m || !g || destroyed) return;
      for (let t = 0; t < cells.length; t += 1) {
        const cell = cells[t][question];
        if (cell === undefined) continue;
        const oi = m.options.indexOf(m.answers[t][question]);
        if (oi < 0) continue;
        cell.group.style.transition = `transform ${SPLIT_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
        cell.group.style.transform = `translate(${g.offsetOf(oi, m.options.length)}px, 0px)`;
      }
      await wait(SPLIT_MS + SETTLE_MS);
    }

    // ── 모인다 ─────────────────────────────────────────────────────────────
    async function gatherVotes(
      question: number,
      majority: string,
      truthValue: string,
      winners: number[],
      losers: number[],
    ): Promise<void> {
      const m = model;
      const g = geo;
      if (!m || !g || destroyed) return;
      const optionCount = m.options.length;
      const cx = g.colCx(question);

      // 다수 쪽 답마다 점 하나가 떨어져 나와 다수결 칸으로 날아간다.
      const flock: { dot: SVGCircleElement; dx: number; dy: number }[] = [];
      for (const t of winners) {
        const oi = m.options.indexOf(m.answers[t][question]);
        if (oi < 0) continue;
        const fromX = cx + g.offsetOf(oi, optionCount);
        const fromY = g.rowCy(t);
        const dot = el(
          'circle',
          { cx: fromX, cy: fromY, r: 5, fill: treeColors[t] ?? c.text, opacity: 0.9 },
          flightLayer,
        );
        dot.style.transition =
          `transform ${GATHER_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${GATHER_MS}ms linear`;
        flock.push({ dot, dx: cx - fromX, dy: g.majY - fromY });
      }
      await nextFrame();
      if (destroyed) return;
      for (const { dot, dx, dy } of flock) {
        dot.style.transform = `translate(${dx}px, ${dy}px)`;
        dot.style.opacity = '0.15';
      }
      await wait(GATHER_MS);
      if (destroyed) return;
      flightLayer.textContent = '';

      // 모인 답이 다수결 칸에 앉는다.
      const slot = majorityHolders[question];
      if (slot !== undefined) {
        el(
          'rect',
          {
            x: cx - g.tokenW / 2,
            y: g.majY - TOKEN_H / 2,
            width: g.tokenW,
            height: TOKEN_H,
            rx: 5,
            fill: c.accent,
            stroke: c.accent,
            'stroke-width': 1,
          },
          slot,
        );
        label(majority, cx, g.majY, fontSizes.sm, c.stateInk, 'middle', slot, '700');
      }

      // 정답이 드러나고, 다수결이 그것과 맞는지 표시가 붙는다.
      const agreed = majority === truthValue;
      const truthSlot = truthHolders[question];
      if (truthSlot !== undefined) {
        label(
          truthValue,
          cx,
          g.truthY,
          fontSizes.sm,
          agreed ? c.textMuted : c.danger,
          'middle',
          truthSlot,
          '600',
        );
        const mx = cx + g.tokenW / 2 + 5;
        el(
          'path',
          {
            d: agreed
              ? `M ${mx} ${g.majY} l 4 4 l 7 -9`
              : `M ${mx} ${g.majY - 4} l 8 8 M ${mx + 8} ${g.majY - 4} l -8 8`,
            fill: 'none',
            stroke: agreed ? c.text : c.danger,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          truthSlot,
        );
      }

      // 진 표는 남는다 — 밀려난 자리에 그대로 두고, 정답과 어긋난 것에만 빗금.
      // 다수결이 틀리는 경우도 있으므로 이긴 표까지 정답과 견준다.
      for (const t of [...winners, ...losers]) {
        const cell = cells[t]?.[question];
        if (cell === undefined) continue;
        const answer = m.answers[t][question];
        if (answer === truthValue) continue;
        strikeCell(cell, cx, g.rowCy(t), g.tokenW);
      }

      await wait(SETTLE_MS);
    }

    // ── 맺음 ───────────────────────────────────────────────────────────────
    function showScores(treeScores: number[], majorityScore: number, total: number): void {
      const m = model;
      const g = geo;
      if (!m || !g || destroyed) return;
      scoreLayer.textContent = '';
      const sx = PIECE_CANVAS_W - PAD_X - SCORE_W / 2;

      label(
        tr('label.score', 'Correct'),
        sx,
        HEADER_Y,
        fontSizes.xs,
        c.textMuted,
        'middle',
        scoreLayer,
      );
      for (let t = 0; t < treeScores.length && t < m.trees.length; t += 1) {
        label(
          `${treeScores[t]}/${total}`,
          sx,
          g.rowCy(t),
          fontSizes.sm,
          c.textMuted,
          'middle',
          scoreLayer,
        );
      }
      el(
        'rect',
        {
          x: sx - SCORE_W / 2 + 4,
          y: g.majY - 11,
          width: SCORE_W - 8,
          height: 22,
          rx: 5,
          fill: c.accent,
        },
        scoreLayer,
      );
      label(
        `${majorityScore}/${total}`,
        sx,
        g.majY,
        fontSizes.sm,
        c.stateInk,
        'middle',
        scoreLayer,
        '700',
      );
    }

    const instance: ManyTreesVoteStage = {
      setModel(next: VoteModel): void {
        if (destroyed) return;
        model = next;
        geo = buildGeometry(next);
        drawBoard();
      },
      setCaption(value: string): void {
        if (destroyed) return;
        captionNode.textContent = value;
      },
      splitVotes,
      gatherVotes,
      showScores,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        boardLayer.remove();
        flightLayer.remove();
        scoreLayer.remove();
        captionNode.remove();
      },
    };

    const initial = readVoteModel(params.initialData);
    if (initial !== null) instance.setModel(initial);

    return instance;
  },
};
