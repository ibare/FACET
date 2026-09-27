/**
 * number-theory stage — m 칸 시계. 말이 0 에서 앞으로(수가 커지는 쪽, 시계 방향) a 칸씩 둘레를 따라 뛰고,
 * 닿은 칸에 자국을 남기며 앞 자국에서 새 자국으로 줄을 긋는다. 0 으로 돌아오는 뜀이 별을 닫는다.
 *
 * 움직임:
 *   · 뜀 — 말이 둘레를 따라 a 칸만큼 돈다 (a ≥ m 이면 한 바퀴를 넘는다). 줄은 앞 칸에서 새 칸으로 자란다.
 *   · 판 머리 — 앞 판의 줄이 0 쪽으로 접혀 걷히고, m 이 바뀌었으면 칸이 새 각도로 미끄러져 옮겨 가며
 *     칸 수가 는다(새 칸은 0 의 자리에서 풀려 나온다) · 준다(남는 칸은 0 의 자리로 말려 들어간다).
 *   · 끝 — 밟은 칸의 수 글자가 굵어지고 밟지 않은 칸의 점이 옅어진다.
 *
 * 0 칸은 늘 맨 위다. 칸 i 의 각도는 i ÷ m 바퀴 — 바탕에서 정해지는 좌표 변환뿐이고, 다음 자리 ·
 * 밟은 칸 · gcd 는 전부 projector 가 넘긴 payload 값이다. 운동 길이는 projector 가 재생 속도를 읽어 넘긴다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

/** projector 가 부르는 표면. */
export type NumberTheoryStage = {
  reset(): void;
  beginRound(m: number, ms: number): void;
  start(pos: number, ms: number): void;
  jump(from: number, to: number, a: number, ms: number): void;
  back(from: number, a: number, ms: number): void;
  finish(visited: number[], ms: number): void;
  setCaption(line1: string, line2: string): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 470;
const CX = W / 2;
const CY = 208;
const R = 150;
const LABEL_R = R + 26;
const DOT_R = 4;
const MARK_R = 13;
const MARKER_R = 8;
const CAP1_Y = 420;
const CAP2_Y = 448;

/** 바퀴 비율 frac 의 둘레 위 점 (0 이 맨 위, 시계 방향). */
const at = (frac: number, r: number): [number, number] => {
  const th = -Math.PI / 2 + 2 * Math.PI * frac;
  return [CX + r * Math.cos(th), CY + r * Math.sin(th)];
};

type Cell = { dot: SVGCircleElement; label: SVGTextElement; frac: number };
type Chord = { line: SVGLineElement; x1: number; y1: number; x2: number; y2: number };
type Job = { id: number; finish: () => void };

export const numberTheoryStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;

    let destroyed = false;
    const jobs = new Map<string, Job>();

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };

    // 층 — 뒤에서 앞으로: 테두리 · 줄 · 칸 · 자국 · 말 · 캡션
    const rim = el('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, svg);
    const chordLayer = el('g', {}, svg);
    const cellLayer = el('g', {}, svg);
    const markLayer = el('g', {}, svg);
    const marker = el('circle', { cx: CX, cy: CY - R, r: MARKER_R, fill: c.accent, stroke: c.bg, 'stroke-width': 2, opacity: 0 }, svg);
    const capAttrs = {
      x: CX,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: c.text,
    };
    const cap1 = el('text', { ...capAttrs, y: CAP1_Y }, svg);
    const cap2 = el('text', { ...capAttrs, y: CAP2_Y, fill: c.textMuted }, svg);
    const center = el('text', { ...capAttrs, y: CY, fill: c.textMuted, 'font-size': fontSizes.lg }, svg);
    void rim;

    let m = 0;
    let cells: Cell[] = [];
    const marks = new Map<number, SVGCircleElement>();
    let chords: Chord[] = [];
    /** 말의 자리 — 바퀴 비율 (0..1). */
    let markerFrac = 0;

    /** 진행률 0..1 을 그린다. 같은 key 의 앞 운동은 끝 상태로 마친다. */
    const tween = (key: string, ms: number, draw: (p: number) => void, done?: () => void): void => {
      const prev = jobs.get(key);
      if (prev) {
        cancelAnimationFrame(prev.id);
        jobs.delete(key);
        prev.finish();
      }
      const finish = (): void => {
        draw(1);
        done?.();
      };
      if (destroyed || ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        finish();
        return;
      }
      const t0 = performance.now();
      const job: Job = { id: 0, finish };
      const frame = (now: number): void => {
        const raw = Math.min(1, (now - t0) / ms);
        const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        if (raw < 1) {
          draw(p);
          job.id = requestAnimationFrame(frame);
        } else {
          jobs.delete(key);
          finish();
        }
      };
      job.id = requestAnimationFrame(frame);
      jobs.set(key, job);
    };
    /** 돌던 운동을 모두 끝 상태로 마친다 (걷히던 요소도 이때 지워진다). */
    const flush = (): void => {
      for (const [key, job] of [...jobs]) {
        cancelAnimationFrame(job.id);
        jobs.delete(key);
        job.finish();
      }
    };
    params.onScrubStart?.(flush);

    const placeCell = (cell: Cell, frac: number): void => {
      const [x, y] = at(frac, R);
      const [lx, ly] = at(frac, LABEL_R);
      cell.dot.setAttribute('cx', String(x));
      cell.dot.setAttribute('cy', String(y));
      cell.label.setAttribute('x', String(lx));
      cell.label.setAttribute('y', String(ly));
    };
    const makeCell = (i: number, frac: number): Cell => {
      const dot = el('circle', { r: DOT_R, fill: c.textMuted }, cellLayer);
      const label = el('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      }, cellLayer);
      label.textContent = String(i);
      const cell: Cell = { dot, label, frac };
      placeCell(cell, frac);
      return cell;
    };
    const plainCells = (): void => {
      for (const cell of cells) {
        cell.dot.setAttribute('fill', c.textMuted);
        cell.dot.setAttribute('opacity', '1');
        cell.label.setAttribute('fill', c.textMuted);
        cell.label.setAttribute('font-weight', '400');
      }
    };
    const placeMarker = (frac: number): void => {
      const [x, y] = at(frac, R);
      marker.setAttribute('cx', String(x));
      marker.setAttribute('cy', String(y));
    };
    const checkCell = (i: number, what: string): void => {
      if (!Number.isInteger(i) || i < 0 || i >= m) throw new Error(`number-theory stage: ${what} ${i} 가 0..${m - 1} 밖이다`);
    };
    const addMark = (i: number, ms: number): void => {
      checkCell(i, '자국 칸');
      if (marks.has(i)) throw new Error(`number-theory stage: ${i} 칸에 자국이 이미 있다`);
      const [x, y] = at(i / m, R);
      const ring = el('circle', { cx: x, cy: y, r: 0, fill: 'none', stroke: c.primary, 'stroke-width': 2.5 }, markLayer);
      marks.set(i, ring);
      tween(`mark-${i}`, ms, (p) => ring.setAttribute('r', String(MARK_R * p)));
    };
    /** 말이 from 칸에서 앞으로 a 칸 뛰고 줄이 자란다. */
    const leap = (from: number, to: number, a: number, ms: number, done: () => void): void => {
      checkCell(from, '뜀 출발 칸');
      checkCell(to, '뜀 도착 칸');
      if (!Number.isInteger(a) || a < 1) throw new Error(`number-theory stage: 뜀 ${a} 가 1 이상 정수가 아니다`);
      const f0 = from / m;
      const f1 = (from + a) / m;
      const [x1, y1] = at(f0, R);
      const [x2, y2] = at(to / m, R);
      const line = el('line', { x1, y1, x2: x1, y2: y1, stroke: c.primary, 'stroke-width': 2, 'stroke-linecap': 'round' }, chordLayer);
      const chord: Chord = { line, x1, y1, x2, y2 };
      chords.push(chord);
      tween('leap', ms, (p) => {
        placeMarker(f0 + (f1 - f0) * p);
        line.setAttribute('x2', String(x1 + (x2 - x1) * p));
        line.setAttribute('y2', String(y1 + (y2 - y1) * p));
      }, () => {
        markerFrac = to / m;
        placeMarker(markerFrac);
        done();
      });
    };

    const stage: NumberTheoryStage = {
      reset() {
        for (const job of jobs.values()) cancelAnimationFrame(job.id);
        jobs.clear();
        while (chordLayer.firstChild) chordLayer.removeChild(chordLayer.firstChild);
        while (cellLayer.firstChild) cellLayer.removeChild(cellLayer.firstChild);
        while (markLayer.firstChild) markLayer.removeChild(markLayer.firstChild);
        m = 0;
        cells = [];
        chords = [];
        marks.clear();
        markerFrac = 0;
        marker.setAttribute('opacity', '0');
        placeMarker(0);
        cap1.textContent = '';
        cap2.textContent = '';
        center.textContent = '';
      },
      beginRound(nextM, ms) {
        if (!Number.isInteger(nextM) || nextM < 1) throw new Error(`number-theory stage: m ${nextM} 가 1 이상 정수가 아니다`);
        flush();
        // 앞 판의 결론 — 자국 · 끝 강조를 걷는다
        for (const ring of marks.values()) ring.remove();
        marks.clear();
        plainCells();
        // 앞 판의 줄은 0 쪽으로 접혀 걷힌다
        const folding = chords;
        chords = [];
        const [zx, zy] = at(0, R);
        tween('fold', ms, (p) => {
          for (const ch of folding) {
            ch.line.setAttribute('x1', String(ch.x1 + (zx - ch.x1) * p));
            ch.line.setAttribute('y1', String(ch.y1 + (zy - ch.y1) * p));
            ch.line.setAttribute('x2', String(ch.x2 + (zx - ch.x2) * p));
            ch.line.setAttribute('y2', String(ch.y2 + (zy - ch.y2) * p));
          }
        }, () => {
          for (const ch of folding) ch.line.remove();
        });
        // 말은 0 으로 (앞 판은 늘 0 에서 끝나지만 되짚기 뒤를 위해)
        const mf0 = markerFrac;
        tween('marker', ms, (p) => placeMarker(mf0 * (1 - p)), () => {
          markerFrac = 0;
          placeMarker(0);
        });
        marker.setAttribute('opacity', '1');
        center.textContent = t('stage.center', 'mod {m}', { m: nextM });
        // 칸 — 처음이면 그대로 세우고, m 이 바뀌었으면 새 각도로 옮겨 간다
        if (m === 0) {
          cells = [];
          for (let i = 0; i < nextM; i += 1) cells.push(makeCell(i, i / nextM));
          m = nextM;
          return;
        }
        if (nextM === m) return;
        const oldM = m;
        const moving = cells;
        for (let i = oldM; i < nextM; i += 1) moving.push(makeCell(i, 1));
        const from = moving.map((cell) => cell.frac);
        const target = moving.map((_, i) => (i < nextM ? i / nextM : 1));
        m = nextM;
        cells = moving.slice(0, nextM);
        tween('cells', ms, (p) => {
          moving.forEach((cell, i) => {
            cell.frac = from[i]! + (target[i]! - from[i]!) * p;
            placeCell(cell, cell.frac);
          });
        }, () => {
          for (const cell of moving.slice(nextM)) {
            cell.dot.remove();
            cell.label.remove();
          }
        });
      },
      start(pos, ms) {
        checkCell(pos, '출발 칸');
        markerFrac = pos / m;
        placeMarker(markerFrac);
        marker.setAttribute('opacity', '1');
        addMark(pos, ms);
      },
      jump(from, to, a, ms) {
        leap(from, to, a, ms, () => addMark(to, ms * 0.4));
      },
      back(from, a, ms) {
        if (!marks.has(0)) throw new Error('number-theory stage: 0 칸 자국 없이 돌아오는 뜀이 왔다');
        leap(from, 0, a, ms, () => undefined);
      },
      finish(visited, ms) {
        const set = new Set<number>();
        for (const i of visited) {
          checkCell(i, '밟은 칸');
          if (!marks.has(i)) throw new Error(`number-theory stage: 밟은 칸 ${i} 에 자국이 없다`);
          set.add(i);
        }
        if (set.size !== marks.size) throw new Error(`number-theory stage: 밟은 칸 ${set.size} 와 자국 ${marks.size} 가 다르다`);
        cells.forEach((cell, i) => {
          if (set.has(i)) {
            cell.label.setAttribute('fill', c.text);
            cell.label.setAttribute('font-weight', '700');
            cell.dot.setAttribute('fill', c.primary);
          } else {
            cell.dot.setAttribute('opacity', '0.35');
          }
        });
        // 자국이 한 번 부풀었다 가라앉는다
        tween('finish', ms, (p) => {
          const r = MARK_R * (1 + 0.35 * Math.sin(Math.PI * p));
          for (const ring of marks.values()) ring.setAttribute('r', String(r));
        });
      },
      setCaption(line1, line2) {
        cap1.textContent = line1;
        cap2.textContent = line2;
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        flush();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
