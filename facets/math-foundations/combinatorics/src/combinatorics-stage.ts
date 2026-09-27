/**
 * combinatorics stage — 왼쪽에 크기별 점 열, 오른쪽에 파스칼 삼각형(읽는 자리), 아래에 캡션과 모은 무리의 글자.
 *
 * 점 하나가 부분집합 하나다. 열 = 크기(0..6), 열 안에서 아래로 목록 차례.
 * 움직임:
 *   - 판 머리 — 앞 판의 점이 모두 ∅ 자리(크기 0 열 맨 위)로 접혀 들어가 하나가 된다
 *   - 갈라지기 — 옛 점은 제자리에 남고(뺀 쪽), 사본이 원본 자리에서 떠나 **한 열 옆(크기 +1)** 의 빈 줄로 미끄러진다(넣은 쪽).
 *     미끄러짐이 끝나면 열 밑의 수가 "뺀 쪽 + 넣은 쪽" 에서 합으로 바뀌고, 그 수가 삼각형 j 번째 줄 칸으로 날아가 적힌다
 *   - 모으기 — 크기 k 열의 점이 삼각형 n 번째 줄 k 번째 칸 둘레로 모여든다
 *
 * 무대는 셈하지 않는다 — 열 · 줄 · 수 · 모일 점 번호는 모두 payload 에서 온다. 무대가 하는 셈은 (열, 줄) → 좌표,
 * (줄, 칸) → 삼각형 좌표, 둘레 자리의 각도뿐이다. 운동 길이는 projector 가 걸음마다 재생 속도를 읽어 넘긴다.
 * 자리는 사다리 끝(열 7 · 가장 긴 열 20 점 · 삼각형 일곱 줄)에 맞춰 마운트 때 잡는다 — 세로를 바꾸지 않는다.
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
export type CombinatoricsStage = {
  reset(): void;
  beginRound(columns: number, colCap: number, ms: number): void;
  start(sizes: number[], rows: number[], counts: number[], ms: number): void;
  split(j: number, before: number, sizes: number[], rows: number[], keep: number[], move: number[], counts: number[], ms: number): void;
  pick(n: number, k: number, within: boolean, picked: number[], members: string[], ms: number): void;
  setCaption(main: string, sub: string): void;
  finishAll(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const COLS = 7; // 사다리 끝 n 6 의 크기 0..6
const CAP = 20; // n 6 의 가장 긴 열 C(6, 3)
const TRI_ROWS = 7; // 삼각형 0..6 번째 줄
const COL_X0 = 44;
const COL_PITCH = 44;
const HEAD_Y = 40;
const DOT_Y0 = 60;
const DOT_PITCH = 11;
const DOT_R = 4;
const RING_DOT_R = 2.2;
const KEEP_Y = DOT_Y0 + (CAP - 1) * DOT_PITCH + 22;
const TOTAL_Y = KEEP_Y + 18;
const TRI_CX = 532;
const TRI_Y0 = 60;
const TRI_PITCH_Y = 38;
const TRI_PITCH_X = 52;
const CELL_W = 40;
const CELL_H = 22;
const RING_RX = 27; // 둘레는 칸 밖, 옆 칸(52 떨어짐 · 반폭 20) 안쪽
const RING_RY = 17;
const CAPTION_Y = TOTAL_Y + 38;
const SUB_Y = CAPTION_Y + 24;
const MEMBER_Y0 = SUB_Y + 28;
const MEMBER_PITCH = 20;
const MEMBER_LINES = 3;
const H = MEMBER_Y0 + (MEMBER_LINES - 1) * MEMBER_PITCH + 18;

const colX = (col: number): number => COL_X0 + col * COL_PITCH;
const rowY = (row: number): number => DOT_Y0 + row * DOT_PITCH;
const cellX = (r: number, i: number): number => TRI_CX + (i - r / 2) * TRI_PITCH_X;
const cellY = (r: number): number => TRI_Y0 + r * TRI_PITCH_Y;

type Dot = { el: SVGCircleElement; x: number; y: number; r: number };
type Job = { id: number; finish: () => void };

export const combinatoricsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const monoPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    const jobs = new Map<string, Job>();

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { anchor?: string; mono?: boolean; size?: string; fill?: string; weight?: number } = {},
    ): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'dominant-baseline': 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 400,
        fill: opts.fill ?? c.text,
      }, parent);
      node.textContent = s;
      return node;
    };

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
      jobs.set(key, job);
      job.id = requestAnimationFrame(frame);
    };
    /** 돌던 운동을 모두 끝 상태로 마친다 — 끝나며 이어 건 운동까지. */
    const finishAll = (): void => {
      for (let guard = 0; jobs.size > 0; guard += 1) {
        if (guard > 1000) throw new Error('combinatorics stage: 운동이 끝나지 않는다');
        const [key, job] = jobs.entries().next().value as [string, Job];
        cancelAnimationFrame(job.id);
        jobs.delete(key);
        job.finish();
      }
    };
    /** 돌던 운동을 끝내지 않고 끊는다 — 무대를 비울 때. */
    const cancelAll = (): void => {
      for (const job of jobs.values()) cancelAnimationFrame(job.id);
      jobs.clear();
    };
    params.onScrubStart?.(() => finishAll());

    // ── 바탕: 제목 · 열 번호 · 삼각형 칸 자리
    text(svg, colX(0) + ((COLS - 1) * COL_PITCH) / 2, 16, t('label.columns', 'Subsets by size'), { fill: c.textMuted });
    text(svg, TRI_CX, 16, t('label.triangle', "Pascal's triangle"), { fill: c.textMuted });
    text(svg, colX(0) - 26, HEAD_Y, 'k', { mono: true, fill: c.textMuted, size: fontSizes.xs });
    const band = el('rect', {
      x: colX(0) - COL_PITCH / 2 + 3,
      y: HEAD_Y - 12,
      width: COL_PITCH - 6,
      height: TOTAL_Y - HEAD_Y + 24,
      rx: 6,
      fill: 'none',
      stroke: c.accent,
      'stroke-width': 2,
      opacity: 0,
    }, svg);
    const heads: SVGTextElement[] = [];
    const keeps: SVGTextElement[] = [];
    const totals: SVGTextElement[] = [];
    for (let i = 0; i < COLS; i += 1) {
      heads.push(text(svg, colX(i), HEAD_Y, String(i), { mono: true, fill: c.textMuted }));
      keeps.push(text(svg, colX(i), KEEP_Y, '', { mono: true, size: fontSizes.xs, fill: c.textMuted }));
      totals.push(text(svg, colX(i), TOTAL_Y, '', { mono: true, weight: 700 }));
    }
    const cells: { box: SVGRectElement; num: SVGTextElement }[][] = [];
    for (let r = 0; r < TRI_ROWS; r += 1) {
      const row: { box: SVGRectElement; num: SVGTextElement }[] = [];
      for (let i = 0; i <= r; i += 1) {
        const box = el('rect', {
          x: cellX(r, i) - CELL_W / 2,
          y: cellY(r) - CELL_H / 2,
          width: CELL_W,
          height: CELL_H,
          rx: 5,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1,
        }, svg);
        row.push({ box, num: text(svg, cellX(r, i), cellY(r), '', { mono: true }) });
      }
      cells.push(row);
    }
    const dotLayer = el('g', {}, svg);
    const chipLayer = el('g', {}, svg);
    const caption = text(svg, W / 2, CAPTION_Y, '', { size: fontSizes.md });
    const sub = text(svg, W / 2, SUB_Y, '', { mono: true });
    const memberLines: SVGTextElement[] = [];
    for (let l = 0; l < MEMBER_LINES; l += 1) {
      memberLines.push(text(svg, W / 2, MEMBER_Y0 + l * MEMBER_PITCH, '', { mono: true, fill: c.textMuted }));
    }

    let dots: Dot[] = [];

    const cellAt = (r: number, i: number) => {
      const cell = cells[r]?.[i];
      if (!cell) throw new Error(`combinatorics stage: 삼각형 ${r} 번째 줄 ${i} 번째 칸이 없다`);
      return cell;
    };
    const checkCol = (col: number, row: number): void => {
      if (!Number.isInteger(col) || col < 0 || col >= COLS) throw new Error(`combinatorics stage: 열 ${col} 이 자리 밖이다`);
      if (!Number.isInteger(row) || row < 0 || row >= CAP) throw new Error(`combinatorics stage: 줄 ${row} 이 자리 밖이다`);
    };
    const place = (d: Dot): void => {
      d.el.setAttribute('cx', d.x.toFixed(2));
      d.el.setAttribute('cy', d.y.toFixed(2));
      d.el.setAttribute('r', d.r.toFixed(2));
    };
    const makeDot = (x: number, y: number, fill: string): Dot => {
      const d: Dot = { el: el('circle', { fill }, dotLayer), x, y, r: DOT_R };
      place(d);
      return d;
    };
    /** 점들을 목표 자리로 한 번에 옮긴다. */
    const moveDots = (
      key: string,
      moves: { d: Dot; x: number; y: number; r: number }[],
      ms: number,
      done?: () => void,
    ): void => {
      const from = moves.map((m) => ({ x: m.d.x, y: m.d.y, r: m.d.r }));
      tween(key, ms, (p) => {
        moves.forEach((m, i) => {
          const f = from[i]!;
          m.d.x = f.x + (m.x - f.x) * p;
          m.d.y = f.y + (m.y - f.y) * p;
          m.d.r = f.r + (m.r - f.r) * p;
          place(m.d);
        });
      }, done);
    };
    /** 수 조각이 날아가 삼각형 칸에 적힌다. */
    const writeRow = (r: number, counts: number[], ms: number): void => {
      if (counts.length !== r + 1) throw new Error(`combinatorics stage: ${r} 번째 줄에 수 ${counts.length} 개`);
      counts.forEach((v, i) => {
        const cell = cellAt(r, i);
        const x0 = colX(i);
        const x1 = cellX(r, i);
        const y1 = cellY(r);
        const chip = text(chipLayer, x0, TOTAL_Y, String(v), { mono: true, weight: 700, fill: c.itemActive });
        tween(`chip-${i}`, ms, (p) => {
          chip.setAttribute('x', (x0 + (x1 - x0) * p).toFixed(2));
          chip.setAttribute('y', (TOTAL_Y + (y1 - TOTAL_Y) * p).toFixed(2));
        }, () => {
          chip.remove();
          cell.num.textContent = String(v);
        });
      });
    };
    /** 이 판의 결론(수 · 표시 · 캡션 · 글자)을 걷는다. 자리(칸 · 열 번호)는 남긴다. */
    const clearMarks = (): void => {
      band.setAttribute('opacity', '0');
      for (const h of heads) {
        h.setAttribute('fill', c.textMuted);
        h.setAttribute('font-weight', '400');
      }
      for (const s of keeps) s.textContent = '';
      for (const s of totals) s.textContent = '';
      for (const row of cells) {
        for (const cell of row) {
          cell.num.textContent = '';
          cell.box.setAttribute('stroke', c.border);
          cell.box.setAttribute('stroke-width', '1');
        }
      }
      while (chipLayer.firstChild) chipLayer.removeChild(chipLayer.firstChild);
      caption.textContent = '';
      sub.textContent = '';
      for (const m of memberLines) m.textContent = '';
    };

    const stage: CombinatoricsStage = {
      reset() {
        cancelAll();
        clearMarks();
        while (dotLayer.firstChild) dotLayer.removeChild(dotLayer.firstChild);
        dots = [];
      },
      finishAll,
      beginRound(columns, colCap, ms) {
        if (columns > COLS) throw new Error(`combinatorics stage: 열 ${columns} 개는 자리 ${COLS} 를 넘는다`);
        if (colCap > CAP) throw new Error(`combinatorics stage: 열 길이 ${colCap} 은 자리 ${CAP} 를 넘는다`);
        finishAll();
        clearMarks();
        const x = colX(0);
        const y = rowY(0);
        if (dots.length === 0) {
          dots.push(makeDot(x, y, c.primary));
          return;
        }
        for (const d of dots) d.el.setAttribute('fill', c.primary);
        moveDots('dots', dots.map((d) => ({ d, x, y, r: DOT_R })), ms, () => {
          for (const d of dots.slice(1)) d.el.remove();
          dots = dots.slice(0, 1);
        });
      },
      start(sizes, rows, counts, ms) {
        finishAll();
        if (dots.length !== 1 || sizes.length !== 1 || rows.length !== 1) {
          throw new Error(`combinatorics stage: 처음은 점 하나여야 한다 (무대 ${dots.length} · payload ${sizes.length})`);
        }
        checkCol(sizes[0]!, rows[0]!);
        const d = dots[0]!;
        d.x = colX(sizes[0]!);
        d.y = rowY(rows[0]!);
        d.r = DOT_R;
        d.el.setAttribute('fill', c.primary);
        place(d);
        counts.forEach((v, i) => {
          const s = totals[i];
          if (!s) throw new Error(`combinatorics stage: 열 ${i} 이 없다`);
          s.textContent = String(v);
        });
        writeRow(0, counts, ms);
      },
      split(j, before, sizes, rows, keep, move, counts, ms) {
        finishAll();
        if (dots.length !== before) throw new Error(`combinatorics stage: 무대의 점 ${dots.length} 개, payload 는 ${before}`);
        if (sizes.length !== rows.length || sizes.length !== before * 2) {
          throw new Error(`combinatorics stage: 갈라진 목록 ${sizes.length} 이 ${before} 의 두 배가 아니다`);
        }
        if (keep.length !== j + 1 || move.length !== j + 1 || counts.length !== j + 1) {
          throw new Error(`combinatorics stage: 걸음 ${j} 의 크기별 수 길이가 ${j + 1} 이 아니다`);
        }
        for (const d of dots) d.el.setAttribute('fill', c.primary);
        const moves: { d: Dot; x: number; y: number; r: number }[] = [];
        for (let i = 0; i < sizes.length; i += 1) {
          checkCol(sizes[i]!, rows[i]!);
          const x = colX(sizes[i]!);
          const y = rowY(rows[i]!);
          if (i < before) {
            moves.push({ d: dots[i]!, x, y, r: DOT_R });
          } else {
            const src = dots[i - before]!;
            const copy = makeDot(src.x, src.y, c.itemActive);
            moves.push({ d: copy, x, y, r: DOT_R });
          }
        }
        dots = moves.map((m) => m.d);
        for (let i = 0; i <= j; i += 1) keeps[i]!.textContent = `${keep[i]}+${move[i]}`;
        moveDots('dots', moves, ms, () => {
          counts.forEach((v, i) => {
            totals[i]!.textContent = String(v);
          });
          writeRow(j, counts, ms * 0.7);
        });
      },
      pick(n, k, within, picked, members, ms) {
        finishAll();
        if (k < 0 || k >= COLS) throw new Error(`combinatorics stage: 크기 ${k} 열이 없다`);
        for (const d of dots) d.el.setAttribute('fill', c.primary);
        for (const s of keeps) s.textContent = '';
        band.setAttribute('x', String(colX(k) - COL_PITCH / 2 + 3));
        band.setAttribute('opacity', '1');
        heads[k]!.setAttribute('fill', c.text);
        heads[k]!.setAttribute('font-weight', '700');
        if (!within) {
          if (picked.length !== 0) throw new Error(`combinatorics stage: k > n 인데 모일 점이 ${picked.length} 개`);
          totals[k]!.textContent = '0';
        } else {
          const cell = cellAt(n, k);
          cell.box.setAttribute('stroke', c.accent);
          cell.box.setAttribute('stroke-width', '2');
          const cx = cellX(n, k);
          const cy = cellY(n);
          const moves = picked.map((idx, i) => {
            const d = dots[idx];
            if (!d) throw new Error(`combinatorics stage: 점 ${idx} 이 없다`);
            d.el.setAttribute('fill', c.accent);
            const a = -Math.PI / 2 + (2 * Math.PI * i) / picked.length;
            return { d, x: cx + RING_RX * Math.cos(a), y: cy + RING_RY * Math.sin(a), r: RING_DOT_R };
          });
          moveDots('dots', moves, ms);
        }
        // 모은 무리의 글자 — 목록 차례 그대로 줄을 채운다
        const limit = W - 40;
        const lines: string[] = [];
        let cur = '';
        for (const m of members) {
          const next = cur === '' ? m : `${cur}  ${m}`;
          if (next.length * monoPx * 0.6 > limit && cur !== '') {
            lines.push(cur);
            cur = m;
          } else {
            cur = next;
          }
        }
        if (cur !== '') lines.push(cur);
        if (lines.length > MEMBER_LINES) throw new Error(`combinatorics stage: 모은 무리 글자가 ${lines.length} 줄 — 자리 ${MEMBER_LINES} 줄`);
        memberLines.forEach((line, i) => {
          line.textContent = lines[i] ?? '';
        });
      },
      setCaption(main, s) {
        caption.textContent = main;
        sub.textContent = s;
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        cancelAll();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
