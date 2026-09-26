/**
 * Q-러닝 무대 — 위에 환경(복도의 칸 · 상), 아래에 행위자 다섯이 저마다 가진 것(Q 막대 · 출발 탐욕 화살표).
 *
 * 행위자는 환경의 표를 모른다 — 상은 위쪽 환경 띠에만 있고, 행위자 줄에는 제 Q 막대와 표지만 있다.
 * 운동:
 *   - 판마다 행위자 표지가 제 복도의 출발로 돌아왔다가 이번 판의 끝 칸으로 옮겨 간다
 *   - 칸마다 (왼 · 오른) 두 Q 막대가 자라, 큰 목표 쪽 값이 출발 쪽으로 번져 오는 것이 보인다
 *   - 출발 탐욕 화살표가 왼쪽에서 오른쪽으로 돈다
 * 무대는 셈하지 않는다 — 끝 칸 · Q · 탐욕 · 센 수는 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type CellRole = 'small' | 'big' | 'start' | 'path';

export type CorridorView = {
  cells: number;
  start: number;
  terminal: boolean[];
  rewards: number[];
  roles: CellRole[];
  agents: number;
  qMax: number;
};

export type RoundView = { epsilon: number; q: number[][]; positions: number[] };

export type EpisodeView = {
  episode: number;
  episodes: number;
  ends: number[];
  q: number[][];
  reached: boolean[];
  greedy: number[];
  bigNow: number;
  reachedCount: number;
  preferCount: number;
};

export type FinalView = { greedy: number[]; preferCount: number; leftCount: number; agents: number; episodes: number };

/** projector 가 부르는 무대의 표면 */
export type QLearningStage = ViewInstance & {
  setCorridor(c: CorridorView): void;
  beginRound(r: RoundView, ms: number): void;
  showEpisode(e: EpisodeView, ms: number): void;
  showFinal(f: FinalView, ms: number): void;
  clear(): void;
};

const NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 476;
const LABEL_X = 16;
const ARROW_X = 104;
const X0 = 132;
const X_END = W - 20;
const ENV_Y = 12;
const ENV_H = 50;
const LEGEND_Y = 88;
const ROW_Y0 = 102;
const ROW_H = 66;
const CELL_H = 38;
const TRACK_DY = 50;
const MARKER_R = 7;
const CAPTION_Y1 = 444;
const CAPTION_Y2 = 464;

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2);
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

/** 판 머리의 Q 표에서 가장 큰 값 — 받은 표에서 읽어 둘째 자리로 띄운다 (음수는 U+2212, −0.00 없음) */
function largestQ(q: number[][]): string {
  let best = -Infinity;
  for (const row of q) for (const v of row) if (v > best) best = v;
  if (!Number.isFinite(best)) throw new Error('q-learning: 판 머리의 Q 표가 비었다');
  const s = best.toFixed(2);
  if (s === '-0.00') return '0.00';
  return s.replace('-', '\u2212');
}

function fmtSigned(v: number): string {
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${-v}`;
  return '0';
}

export const qLearningStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const [leftColor, rightColor] = categorical(2, 'vivid');
    if (leftColor === undefined || rightColor === undefined) throw new Error('q-learning: 두 행동 색을 얻지 못했다');
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const frames = new Set<number>();
    let generation = 0;
    let destroyed = false;
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      generation += 1;
    });

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (parent: Element, x: number, y: number, s: string, opts: { size?: string; fill?: string; anchor?: string; weight?: string } = {}): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'start',
        'font-weight': opts.weight ?? 'normal',
      }, parent);
      node.textContent = s;
      return node;
    };

    /** 시간에 걸친 그리기 — 되짚는 중 · 길이 0 이면 곧바로 끝 모습 */
    const tween = (ms: number, draw: (k: number) => void): void => {
      if (destroyed) return;
      const gen = ++generation;
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number): void => {
        if (destroyed || gen !== generation) return;
        const k = Math.min(1, (now - t0) / ms);
        draw(ease(k));
        if (k < 1) {
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        }
      };
      tick(t0);
    };

    const root = el('g', {}, svg);

    // ── 만든 뒤 옮겨 다닐 것들
    type Row = {
      bars: SVGRectElement[]; // 칸마다 [왼, 오른] — 끝 칸은 없다 (색인 2·s + a)
      marker: SVGCircleElement;
      arrow: SVGPathElement;
      bigCell: SVGRectElement;
    };
    let corridor: CorridorView | null = null;
    let rows: Row[] = [];
    let caption1: SVGTextElement | null = null;
    let caption2: SVGTextElement | null = null;
    // 지금 그려진 값 — 다음 운동의 출발점
    let shownQ: number[][] = [];
    let shownX: number[] = [];
    let shownAngle: number[] = [];
    let shownArrowScale: number[] = [];
    let epsilonShown = '';

    const cellW = (): number => {
      if (!corridor) throw new Error('q-learning: 복도가 아직 없다');
      return (X_END - X0) / corridor.cells;
    };
    const cellCx = (i: number): number => X0 + cellW() * (i + 0.5);
    const rowY = (r: number): number => ROW_Y0 + r * ROW_H;
    const barGeom = (s: number, a: number): { x: number; w: number } => {
      const cw = cellW();
      const inner = cw - 24;
      const w = inner / 2 - 4;
      const x = X0 + cw * s + 12 + a * (inner / 2) + 2;
      return { x, w };
    };
    const barMaxH = CELL_H - 8;

    const build = (cv: CorridorView): void => {
      while (root.firstChild) root.removeChild(root.firstChild);
      corridor = cv;
      const cw = cellW();

      // 환경 띠 — 칸의 이름과 들어가는 이동의 상
      text(root, LABEL_X, ENV_Y + ENV_H / 2 + 4, t('label.environment', 'Environment'), { weight: 'bold' });
      for (let i = 0; i < cv.cells; i += 1) {
        const x = X0 + cw * i + 3;
        el('rect', {
          x,
          y: ENV_Y,
          width: cw - 6,
          height: ENV_H,
          rx: 4,
          fill: cv.terminal[i] ? c.bgSubtle : c.bg,
          stroke: c.border,
          'stroke-dasharray': cv.terminal[i] ? '4 3' : 'none',
        }, root);
        const role = cv.roles[i];
        let name = '';
        if (role === 'small') name = t('label.smallGoal', 'Small goal');
        else if (role === 'big') name = t('label.bigGoal', 'Big goal');
        else if (role === 'start') name = t('label.start', 'Start');
        else if (role !== 'path') throw new Error(`q-learning: 모르는 칸 역할 ${String(role)}`);
        text(root, x + (cw - 6) / 2, ENV_Y + 20, name, { anchor: 'middle', fill: role === 'path' ? c.textMuted : c.text });
        const r = cv.rewards[i];
        if (r === undefined) throw new Error(`q-learning: 칸 ${i} 의 상이 없다`);
        if (r !== 0) text(root, x + (cw - 6) / 2, ENV_Y + 40, t('label.reward', 'reward {r}', { r: fmtSigned(r) }), { anchor: 'middle', weight: 'bold', size: fontSizes.md });
      }

      // 범례 — 행위자가 가진 것
      text(root, LABEL_X, LEGEND_Y, t('label.agentsHold', 'What each agent holds'), { fill: c.textMuted, size: fontSizes.xs });
      text(root, ARROW_X, LEGEND_Y, t('label.greedy', 'Greedy'), { fill: c.textMuted, size: fontSizes.xs, anchor: 'middle' });
      el('rect', { x: X0 + 4, y: LEGEND_Y - 9, width: 10, height: 10, fill: leftColor }, root);
      text(root, X0 + 20, LEGEND_Y, t('label.qLeft', 'value of going left'), { fill: c.textMuted, size: fontSizes.xs });
      el('rect', { x: X0 + 164, y: LEGEND_Y - 9, width: 10, height: 10, fill: rightColor }, root);
      text(root, X0 + 180, LEGEND_Y, t('label.qRight', 'value of going right'), { fill: c.textMuted, size: fontSizes.xs });

      rows = [];
      for (let r = 0; r < cv.agents; r += 1) {
        const y = rowY(r);
        const g = el('g', {}, root);
        text(g, LABEL_X, y + CELL_H / 2 + smPx / 3, t('label.agent', 'Agent {n}', { n: r + 1 }));
        let bigCell: SVGRectElement | null = null;
        const bars: SVGRectElement[] = [];
        for (let i = 0; i < cv.cells; i += 1) {
          const rect = el('rect', {
            x: X0 + cw * i + 3,
            y,
            width: cw - 6,
            height: CELL_H,
            rx: 3,
            fill: cv.terminal[i] ? c.bgSubtle : c.bg,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': cv.terminal[i] ? '4 3' : 'none',
          }, g);
          if (cv.roles[i] === 'big') bigCell = rect;
          for (let a = 0; a < 2; a += 1) {
            if (cv.terminal[i]) continue;
            const { x, w } = barGeom(i, a);
            bars[2 * i + a] = el('rect', { x, y: y + CELL_H - 4, width: w, height: 0, fill: a === 0 ? leftColor : rightColor }, g);
          }
        }
        if (!bigCell) throw new Error('q-learning: 큰 목표 칸이 없다');
        el('line', { x1: X0 + 6, y1: y + TRACK_DY, x2: X_END - 6, y2: y + TRACK_DY, stroke: c.border, 'stroke-width': 1 }, g);
        const marker = el('circle', { cx: cellCx(cv.start), cy: y + TRACK_DY, r: MARKER_R, fill: c.primary, stroke: c.bg, 'stroke-width': 1.5 }, g);
        const arrow = el('path', {
          d: 'M -9 -3 L 3 -3 L 3 -8 L 11 0 L 3 8 L 3 3 L -9 3 Z',
          fill: c.textMuted,
          stroke: c.text,
          'stroke-width': 0,
          visibility: 'hidden',
          transform: `translate(${ARROW_X} ${y + CELL_H / 2}) rotate(0) scale(1)`,
        }, g);
        rows.push({ bars, marker, arrow, bigCell });
      }
      caption1 = text(root, LABEL_X, CAPTION_Y1, '', { weight: 'bold' });
      caption2 = text(root, LABEL_X, CAPTION_Y2, '', { fill: c.textMuted });
      shownQ = rows.map(() => new Array<number>(2 * cv.cells).fill(0));
      shownX = rows.map(() => cellCx(cv.start));
      shownAngle = rows.map(() => 0);
      shownArrowScale = rows.map(() => 1);
    };

    const needRows = (n: number): void => {
      if (!corridor) throw new Error('q-learning: 복도를 세우기 전에 판이 왔다');
      if (n !== rows.length) throw new Error(`q-learning: 행위자 ${n} 명 — 무대의 줄은 ${rows.length}`);
    };

    const drawBars = (r: number, from: number[], to: number[], k: number): void => {
      if (!corridor) return;
      const row = rows[r]!;
      const y = rowY(r);
      const now = shownQ[r]!;
      for (let j = 0; j < to.length; j += 1) {
        const bar = row.bars[j];
        const q = mix(from[j]!, to[j]!, k);
        now[j] = q;
        if (!bar) continue;
        const h = (Math.max(0, q) / corridor.qMax) * barMaxH;
        bar.setAttribute('height', String(h));
        bar.setAttribute('y', String(y + CELL_H - 4 - h));
      }
    };
    const placeArrow = (r: number, angle: number, scale: number): void => {
      const row = rows[r]!;
      shownAngle[r] = angle;
      shownArrowScale[r] = scale;
      row.arrow.setAttribute('transform', `translate(${ARROW_X} ${rowY(r) + CELL_H / 2}) rotate(${angle}) scale(${scale})`);
    };
    const placeMarker = (r: number, x: number): void => {
      shownX[r] = x;
      rows[r]!.marker.setAttribute('cx', String(x));
    };
    const setCaption = (a: string, b: string): void => {
      if (!caption1 || !caption2) throw new Error('q-learning: 캡션 자리가 없다');
      caption1.textContent = a;
      caption2.textContent = b;
    };

    const inst: QLearningStage = {
      setCorridor(cv) {
        if (
          corridor &&
          corridor.cells === cv.cells &&
          corridor.agents === cv.agents &&
          corridor.start === cv.start &&
          corridor.qMax === cv.qMax &&
          corridor.rewards.every((r, i) => r === cv.rewards[i]) &&
          corridor.roles.every((r, i) => r === cv.roles[i])
        ) {
          return; // 같은 복도 — 자리를 남겨 옮겨 가게 한다
        }
        if (cv.qMax <= 0) throw new Error('q-learning: 막대 축척 qMax 가 양수가 아니다');
        build(cv);
      },
      beginRound(rv, ms) {
        needRows(rv.q.length);
        needRows(rv.positions.length);
        if (!corridor) return;
        epsilonShown = String(rv.epsilon);
        // 앞 판의 결론을 걷는다 — 탐욕 화살표 · 큰 목표 테두리
        rows.forEach((row) => {
          row.arrow.setAttribute('visibility', 'hidden');
          row.arrow.setAttribute('fill', c.textMuted);
          row.arrow.setAttribute('stroke-width', '0');
          row.bigCell.setAttribute('stroke', c.border);
          row.bigCell.setAttribute('stroke-width', '1');
        });
        const fromQ = shownQ.map((q) => [...q]);
        const fromX = [...shownX];
        const toX = rv.positions.map((p) => cellCx(p));
        rows.forEach((_, r) => placeArrow(r, 0, 1));
        tween(ms, (k) => {
          rows.forEach((_, r) => {
            drawBars(r, fromQ[r]!, rv.q[r]!, k);
            placeMarker(r, mix(fromX[r]!, toX[r]!, k));
          });
        });
        setCaption(
          t('caption.roundTitle', 'ε {epsilon} · before episode 1', { epsilon: epsilonShown }),
          t('caption.roundBody', 'All {agents} agents stand at the start. Largest Q: {qMax}', { agents: rows.length, qMax: largestQ(rv.q) }),
        );
      },
      showEpisode(ev, ms) {
        needRows(ev.q.length);
        needRows(ev.ends.length);
        needRows(ev.greedy.length);
        needRows(ev.reached.length);
        if (ev.greedy.some((g) => g !== 0 && g !== 1)) throw new Error('q-learning: 탐욕 행동이 0 · 1 이 아니다');
        if (!corridor) return;
        const start = corridor.start;
        if (ev.q.some((q) => q.length !== 2 * corridor!.cells)) throw new Error('q-learning: Q 줄의 길이가 칸 수의 두 배가 아니다');
        const fromQ = shownQ.map((q) => [...q]);
        const fromX = [...shownX];
        const fromAngle = [...shownAngle];
        const startX = cellCx(start);
        const endX = ev.ends.map((e) => cellCx(e));
        const toAngle = ev.greedy.map((g) => (g === 1 ? 0 : 180));
        rows.forEach((row, r) => {
          row.arrow.setAttribute('visibility', 'visible');
          const reached = ev.reached[r];
          if (reached === undefined) throw new Error(`q-learning: 행위자 ${r + 1} 의 밟아 봄이 없다`);
          row.bigCell.setAttribute('stroke', reached ? c.accent : c.border);
          row.bigCell.setAttribute('stroke-width', reached ? '3' : '1');
        });
        tween(ms, (k) => {
          rows.forEach((_, r) => {
            drawBars(r, fromQ[r]!, ev.q[r]!, k);
            // 출발로 돌아왔다가 (앞 35%) 이번 판의 끝 칸으로 (나머지)
            const x = k < 0.35 ? mix(fromX[r]!, startX, k / 0.35) : mix(startX, endX[r]!, (k - 0.35) / 0.65);
            placeMarker(r, x);
            placeArrow(r, mix(fromAngle[r]!, toAngle[r]!, k), 1);
          });
        });
        setCaption(
          t('caption.episodeTitle', 'ε {epsilon} · episode {episode}/{episodes}', { epsilon: epsilonShown, episode: ev.episode, episodes: ev.episodes }),
          t('caption.episodeBody', 'Ended at the big goal: {bigNow}/{agents} · Ever reached it: {reached}/{agents} · Greedy at the start points right: {prefer}/{agents}', {
            bigNow: ev.bigNow,
            reached: ev.reachedCount,
            prefer: ev.preferCount,
            agents: rows.length,
          }),
        );
      },
      showFinal(fv, ms) {
        needRows(fv.greedy.length);
        needRows(fv.agents);
        if (fv.greedy.some((g) => g !== 0 && g !== 1)) throw new Error('q-learning: 탐욕 행동이 0 · 1 이 아니다');
        const fromScale = [...shownArrowScale];
        rows.forEach((row, r) => {
          const g = fv.greedy[r];
          row.arrow.setAttribute('visibility', 'visible');
          row.arrow.setAttribute('fill', g === 1 ? rightColor : leftColor);
          row.arrow.setAttribute('stroke-width', '1');
        });
        const toAngle = fv.greedy.map((g) => (g === 1 ? 0 : 180));
        tween(ms, (k) => {
          rows.forEach((_, r) => placeArrow(r, toAngle[r]!, mix(fromScale[r]!, 1.5, k)));
        });
        setCaption(
          t('caption.finalTitle', 'ε {epsilon} · after {episodes} episodes, read the greedy action at the start', { epsilon: epsilonShown, episodes: fv.episodes }),
          t('caption.finalBody', 'Right, toward the big goal: {prefer}/{agents} · Left, toward the small goal: {left}/{agents}', {
            prefer: fv.preferCount,
            left: fv.leftCount,
            agents: fv.agents,
          }),
        );
      },
      clear() {
        generation += 1;
        while (root.firstChild) root.removeChild(root.firstChild);
        corridor = null;
        rows = [];
        caption1 = null;
        caption2 = null;
      },
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        svg.removeChild(root);
      },
    };
    return inst;
  },
};
