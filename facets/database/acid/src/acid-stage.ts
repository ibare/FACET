/**
 * acid 무대 — 메모리(로그 버퍼 · 버퍼 풀)와 디스크(로그 파일 · 데이터 파일) 두 띠, 그 위 OK 줄.
 *
 * 로그 기록은 LSN 칸에 붙고, 내림에 로그 버퍼에서 로그 파일로 **내려앉는다**. OK 표지는 트랜잭션마다 하나로
 * 판을 넘어 살아남아, 새 판에서 그 트랜잭션이 OK 를 받는 틱으로 **미끄러져 옮겨 간다** (모아 내림이면 커밋 칸에서
 * 기다리다 다음 내림 칸으로). 끊김에 메모리 띠가 비고, 다시 켜기를 마치면 잃은 OK 표지가 빈 메모리 띠로 **떨어져 나간다**.
 * 끊는 자리 선은 판을 넘어 틱 축을 따라 옮겨 간다.
 *
 * 무대는 셈하지 않는다 — OK 틱 · 잃은 OK · 다시 할지 · 데이터 파일 값은 모두 projector 가 넘긴 값이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type AcidRound = {
  crashAfter: number;
  ticks: number;
  rows: string[];
  start: number[];
  txNames: string[];
};

export type AcidAppend = {
  tick: number;
  lsn: number;
  tx: number;
  kind: 'write' | 'commit';
  row: number;
  before: number;
  after: number;
  pool: number[];
};

/** projector 가 부르는 무대의 구조적 표면. */
export type AcidStage = {
  reset(round: AcidRound, dur: number): void;
  append(rec: AcidAppend, dur: number): void;
  flush(upTo: number, dur: number): void;
  markWait(tx: number, tick: number, dur: number): void;
  markOk(tx: number, tick: number, dur: number): void;
  crash(tick: number, unanswered: number[], dur: number): void;
  restart(tx: number, redo: boolean, lsns: number[], data: number[], dur: number): void;
  verdict(lost: number[], dur: number): void;
  setCaption(line1: string, line2: string): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 912;
const H = 400;
const LEFT = 112;
const CW = 66;
const MAX_TICKS = 12;
const CELL_W = CW - 4;
const CELL_H = 42;
const AXIS_Y = 22;
const OK_Y = 36;
const OK_H = 24;
const MEM_TOP = 80;
const MEM_H = 124;
const DISK_TOP = 214;
const DISK_H = 124;
const MEM_LANE_Y = 94;
const DISK_LANE_Y = 228;
const POOL_Y = 160;
const DATA_Y = 294;
const BOX_W = 76;
const BOX_H = 32;
const BOX_GAP = 10;
const LOST_DROP = 62;
const CAPTION_Y = 364;

type CellState = 'memory' | 'disk' | 'gone' | 'redo' | 'skip';
type Cell = { g: SVGGElement; rect: SVGRectElement; strike: SVGLineElement; row: number; state: CellState };
type MarkState = 'ghost' | 'waiting' | 'ok' | 'unanswered' | 'lost';
type Mark = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; x: number; state: MarkState };
type Box = { g: SVGGElement; rect: SVGRectElement; name: SVGTextElement; value: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function colX(tick: number): number {
  return LEFT + (tick - 1) * CW;
}

function place(g: SVGGElement, x: number, y: number, dur: number, extra = ''): void {
  g.style.transition = dur > 0 ? `transform ${dur}ms ease, opacity ${dur}ms ease` : 'none';
  g.style.transform = `translate(${x}px, ${y}px)${extra}`;
}

export const acidStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const xs = fontSizes.xs;
    const txColors = (count: number) => categorical(Math.max(count, 1), 'vivid');

    const root = el('g');
    svg.appendChild(root);

    // ── 띠와 곁 이름 ────────────────────────────────────────────────
    const band = (y: number, h: number) =>
      el('rect', { x: 4, y, width: W - 8, height: h, rx: 8, fill: c.bgSubtle, stroke: c.border });
    root.appendChild(band(MEM_TOP, MEM_H));
    root.appendChild(band(DISK_TOP, DISK_H));
    const gutter = (y: number, text: string, strong: boolean) => {
      const node = el('text', {
        x: 14,
        y,
        'font-family': fonts.body,
        'font-size': strong ? fontSizes.sm : xs,
        'font-weight': strong ? 700 : 400,
        fill: strong ? c.text : c.textMuted,
      });
      node.textContent = text;
      root.appendChild(node);
    };
    gutter(AXIS_Y + 4, t('label.tick', 'Tick'), false);
    gutter(OK_Y + 16, t('label.ok', 'OK'), true);
    gutter(MEM_TOP + 18, t('label.memory', 'Memory'), true);
    gutter(MEM_LANE_Y + 26, t('label.logBuffer', 'Log buffer'), false);
    gutter(POOL_Y + 20, t('label.bufferPool', 'Buffer pool'), false);
    gutter(DISK_TOP + 18, t('label.disk', 'Disk'), true);
    gutter(DISK_LANE_Y + 26, t('label.logFile', 'Log file'), false);
    gutter(DATA_Y + 20, t('label.dataFile', 'Data file'), false);

    // ── 틱 축 ───────────────────────────────────────────────────────
    const tickLabels: SVGTextElement[] = [];
    for (let i = 1; i <= MAX_TICKS; i += 1) {
      const node = el('text', {
        x: colX(i) + CW / 2,
        y: AXIS_Y + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': xs,
        fill: c.textMuted,
      });
      node.textContent = String(i);
      root.appendChild(node);
      tickLabels.push(node);
    }
    const lightTick = (tick: number) => {
      tickLabels.forEach((node, i) => {
        const on = i + 1 === tick;
        node.setAttribute('fill', on ? c.text : c.textMuted);
        node.setAttribute('font-weight', on ? '700' : '400');
      });
    };

    // ── 층: 칸 · 값 상자 · 끊는 선 · OK 표지 · 나는 값 ───────────────
    const cellLayer = el('g');
    const boxLayer = el('g');
    const crashLayer = el('g');
    const markLayer = el('g');
    const flyLayer = el('g');
    root.append(cellLayer, boxLayer, crashLayer, markLayer, flyLayer);

    const crashG = el('g');
    const crashLine = el('line', { x1: 0, y1: MEM_TOP - 4, x2: 0, y2: MEM_TOP + MEM_H + 4, 'stroke-width': 2 });
    const crashText = el('text', { x: 4, y: MEM_TOP + 11, 'font-family': fonts.body, 'font-size': xs });
    crashText.textContent = t('label.crash', 'Crash');
    crashG.append(crashLine, crashText);
    crashLayer.appendChild(crashG);
    const paintCrash = (hit: boolean) => {
      crashLine.setAttribute('stroke', hit ? c.danger : c.textMuted);
      crashLine.setAttribute('stroke-dasharray', hit ? '' : '4 4');
      crashText.setAttribute('fill', hit ? c.danger : c.textMuted);
      crashText.setAttribute('font-weight', hit ? '700' : '400');
    };
    paintCrash(false);
    crashG.style.opacity = '0';

    const makeBox = (y: number, x: number): Box => {
      const g = el('g');
      g.style.transformBox = 'fill-box';
      g.style.transformOrigin = 'center';
      const rect = el('rect', { x, y, width: BOX_W, height: BOX_H, rx: 6, fill: c.bg, stroke: c.border });
      const name = el('text', { x: x + 10, y: y + 21, 'font-family': fonts.mono, 'font-size': xs, fill: c.textMuted });
      const value = el('text', {
        x: x + BOX_W - 10,
        y: y + 21,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: c.text,
      });
      g.append(rect, name, value);
      boxLayer.appendChild(g);
      return { g, rect, name, value };
    };
    const boxX = (i: number) => LEFT + i * (BOX_W + BOX_GAP);
    let poolBoxes: Box[] = [];
    let dataBoxes: Box[] = [];

    const cells = new Map<number, Cell>();
    const marks = new Map<number, Mark>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    let round: AcidRound | null = null;
    const need = (): AcidRound => {
      if (round === null) throw new Error('acid-stage: reset 전에 그리라는 호출을 받았다');
      return round;
    };
    const txName = (tx: number): string => {
      const name = need().txNames[tx];
      if (name === undefined) throw new Error(`acid-stage: 없는 트랜잭션 ${tx}`);
      return name;
    };
    const rowName = (row: number): string => {
      const name = need().rows[row];
      if (name === undefined) throw new Error(`acid-stage: 없는 줄 ${row}`);
      return name;
    };

    const paintMark = (m: Mark, tx: number) => {
      const color = txColors(need().txNames.length)[tx];
      const okWord = t('label.ok', 'OK');
      m.rect.removeAttribute('stroke-dasharray');
      m.g.style.opacity = '1';
      switch (m.state) {
        case 'ghost':
          m.rect.setAttribute('fill', 'none');
          m.rect.setAttribute('stroke', c.textMuted);
          m.rect.setAttribute('stroke-dasharray', '3 3');
          // 앞 판의 자리만 남긴다 — 글자는 이번 판에 OK 를 받을 때 붙는다
          m.label.textContent = '';
          m.g.style.opacity = '0.45';
          break;
        case 'waiting':
          m.rect.setAttribute('fill', c.bg);
          m.rect.setAttribute('stroke', color);
          m.rect.setAttribute('stroke-dasharray', '4 3');
          m.label.setAttribute('fill', c.text);
          m.label.textContent = txName(tx);
          break;
        case 'unanswered':
          m.rect.setAttribute('fill', 'none');
          m.rect.setAttribute('stroke', c.textMuted);
          m.rect.setAttribute('stroke-dasharray', '4 3');
          m.label.setAttribute('fill', c.textMuted);
          m.label.textContent = txName(tx);
          break;
        case 'ok':
          m.rect.setAttribute('fill', c.success);
          m.rect.setAttribute('stroke', color);
          m.label.setAttribute('fill', c.textInverse);
          m.label.textContent = `${txName(tx)} ${okWord}`;
          break;
        case 'lost':
          m.rect.setAttribute('fill', c.danger);
          m.rect.setAttribute('stroke', c.danger);
          m.label.setAttribute('fill', c.textInverse);
          m.label.textContent = `${txName(tx)} ${okWord}`;
          break;
      }
    };

    const moveMark = (tx: number, tick: number, state: MarkState, dur: number) => {
      const x = colX(tick) + 2;
      let m = marks.get(tx);
      if (m === undefined) {
        const g = el('g');
        const rect = el('rect', { x: 0, y: 0, width: CELL_W, height: OK_H, rx: 5, 'stroke-width': 1.5 });
        const label = el('text', {
          x: CELL_W / 2,
          y: OK_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': xs,
          'font-weight': 700,
        });
        g.append(rect, label);
        markLayer.appendChild(g);
        m = { g, rect, label, x, state };
        // 커밋 기록 칸에서 OK 줄로 올라온다
        place(g, x, MEM_LANE_Y, 0);
        g.style.opacity = '0';
        void g.getBoundingClientRect();
        marks.set(tx, m);
      }
      m.state = state;
      m.x = x;
      paintMark(m, tx);
      place(m.g, x, OK_Y, dur);
    };

    // ── 표면 ────────────────────────────────────────────────────────
    const stage: AcidStage = {
      reset(r, dur) {
        if (r.ticks > MAX_TICKS) throw new Error(`acid-stage: 틱 ${r.ticks} 개는 자리 ${MAX_TICKS} 를 넘는다`);
        if (r.rows.length !== r.start.length) throw new Error('acid-stage: 줄과 처음 값의 길이가 다르다');
        round = { ...r, rows: [...r.rows], start: [...r.start], txNames: [...r.txNames] };
        for (const id of timers) clearTimeout(id);
        timers.clear();
        flyLayer.textContent = '';
        cellLayer.textContent = '';
        cells.clear();
        // 값 상자 — 줄 수가 같으면 그대로 두고 값만 처음으로
        if (poolBoxes.length !== r.rows.length) {
          boxLayer.textContent = '';
          poolBoxes = r.rows.map((_, i) => makeBox(POOL_Y, boxX(i)));
          dataBoxes = r.rows.map((_, i) => makeBox(DATA_Y, boxX(i)));
        }
        r.rows.forEach((name, i) => {
          for (const box of [poolBoxes[i], dataBoxes[i]]) {
            box.name.textContent = name;
            box.value.textContent = String(r.start[i]);
            box.rect.setAttribute('stroke', c.border);
            box.g.style.transition = `transform ${dur}ms ease, opacity ${dur}ms ease`;
            box.g.style.transform = 'scale(1)';
            box.g.style.opacity = '1';
          }
        });
        // 앞 판의 OK 표지는 제자리에 흐리게 남아 새 판에서 옮겨 갈 자리를 기다린다
        for (const [tx, m] of marks) {
          if (tx >= r.txNames.length) {
            m.g.remove();
            marks.delete(tx);
            continue;
          }
          m.state = 'ghost';
          paintMark(m, tx);
          place(m.g, m.x, OK_Y, dur);
        }
        // 끊는 자리 선이 틱 축을 따라 옮겨 간다
        const wasHidden = crashG.style.opacity === '0';
        paintCrash(false);
        crashG.style.transition = wasHidden ? 'none' : `transform ${dur}ms ease`;
        crashG.style.transform = `translate(${colX(r.crashAfter) + CW}px, 0px)`;
        crashG.style.opacity = '1';
        lightTick(0);
      },

      append(rec, dur) {
        need();
        const color = txColors(need().txNames.length)[rec.tx];
        const g = el('g');
        const rect = el('rect', { x: 0, y: 0, width: CELL_W, height: CELL_H, rx: 5, fill: c.bg, stroke: color, 'stroke-width': 1.5 });
        const stripe = el('rect', { x: 0, y: 0, width: 4, height: CELL_H, fill: color });
        const lines =
          rec.kind === 'write'
            ? [`<${txName(rec.tx)}, ${rowName(rec.row)},`, `${rec.before}, ${rec.after}>`]
            : [`<${txName(rec.tx)},`, 'commit>'];
        g.append(rect, stripe);
        lines.forEach((line, i) => {
          const node = el('text', {
            x: 7,
            y: 17 + i * 15,
            'font-family': fonts.mono,
            'font-size': xs,
            'font-weight': rec.kind === 'commit' ? 700 : 400,
            fill: c.text,
          });
          node.textContent = line;
          g.appendChild(node);
        });
        const strike = el('line', { x1: 3, y1: CELL_H / 2, x2: CELL_W - 3, y2: CELL_H / 2, stroke: c.danger, 'stroke-width': 2 });
        strike.style.opacity = '0';
        g.appendChild(strike);
        cellLayer.appendChild(g);
        const x = colX(rec.tick) + 2;
        // 로그 버퍼 칸에 위에서 붙는다
        place(g, x, MEM_LANE_Y - 20, 0);
        g.style.opacity = '0';
        void g.getBoundingClientRect();
        place(g, x, MEM_LANE_Y, dur);
        g.style.opacity = '1';
        cells.set(rec.lsn, { g, rect, strike, row: rec.kind === 'write' ? rec.row : -1, state: 'memory' });
        rec.pool.forEach((val, i) => {
          const box = poolBoxes[i];
          if (box === undefined) throw new Error(`acid-stage: 버퍼 풀에 줄 ${i} 가 없다`);
          box.value.textContent = String(val);
          box.rect.setAttribute('stroke', i === rec.row ? c.text : c.border);
        });
        lightTick(rec.tick);
      },

      flush(upTo, dur) {
        for (const [lsn, cell] of cells) {
          if (lsn > upTo || cell.state !== 'memory') continue;
          cell.state = 'disk';
          const x = colX(lsn) + 2;
          place(cell.g, x, DISK_LANE_Y, dur);
        }
      },

      markWait(tx, tick, dur) {
        moveMark(tx, tick, 'waiting', dur);
      },

      markOk(tx, tick, dur) {
        moveMark(tx, tick, 'ok', dur);
      },

      crash(_tick, unanswered, dur) {
        paintCrash(true);
        lightTick(0);
        // 메모리가 사라진다 — 로그 버퍼에 남은 칸과 버퍼 풀
        for (const [lsn, cell] of cells) {
          if (cell.state !== 'memory') continue;
          cell.state = 'gone';
          place(cell.g, colX(lsn) + 2, MEM_LANE_Y, dur, ' scale(0.1)');
          cell.g.style.opacity = '0';
        }
        for (const box of poolBoxes) {
          box.g.style.transition = `transform ${dur}ms ease, opacity ${dur}ms ease`;
          box.g.style.transform = 'scale(0.1)';
          box.g.style.opacity = '0';
        }
        // 이번 판에서 닿지 않은 앞 판 표지는 걷힌다
        for (const [tx, m] of marks) {
          if (m.state === 'ghost') {
            m.g.remove();
            marks.delete(tx);
          } else if (m.state === 'waiting') {
            if (!unanswered.includes(tx)) throw new Error(`acid-stage: 기다리던 ${txName(tx)} 가 답 못 받은 목록에 없다`);
            m.state = 'unanswered';
            paintMark(m, tx);
          }
        }
      },

      restart(_tx, redo, lsns, data, dur) {
        need();
        for (const lsn of lsns) {
          const cell = cells.get(lsn);
          if (cell === undefined || cell.state !== 'disk') throw new Error(`acid-stage: 로그 파일에 LSN ${lsn} 이 없다`);
          cell.state = redo ? 'redo' : 'skip';
          if (redo) {
            cell.rect.setAttribute('stroke-width', '3');
          } else {
            cell.strike.style.opacity = '1';
            cell.g.style.opacity = '0.5';
          }
        }
        if (data.length !== dataBoxes.length) throw new Error('acid-stage: 데이터 파일 값의 수가 줄 수와 다르다');
        data.forEach((val, i) => {
          const box = dataBoxes[i];
          const changed = box.value.textContent !== String(val);
          box.rect.setAttribute('stroke', changed ? c.text : c.border);
          if (!changed) return;
          // 다시 하기 — 로그 파일 칸에서 새 값이 데이터 파일로 내려온다
          const src = lsns.find((lsn) => cells.get(lsn)?.state === 'redo' && cells.get(lsn)?.row === i);
          if (src === undefined) throw new Error(`acid-stage: ${rowName(i)} 값을 바꾼 기록이 이 걸음에 없다`);
          const token = el('text', {
            x: 0,
            y: 0,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: c.text,
          });
          token.textContent = String(val);
          const g = el('g');
          g.appendChild(token);
          flyLayer.appendChild(g);
          place(g, colX(src) + CW / 2, DISK_LANE_Y + CELL_H / 2, 0);
          void g.getBoundingClientRect();
          place(g, boxX(i) + BOX_W - 24, DATA_Y + 21, dur);
          box.value.style.opacity = '0.3';
          later(dur, () => {
            g.remove();
            box.value.style.opacity = '1';
          });
          box.value.textContent = String(val);
        });
      },

      verdict(lost, dur) {
        for (const tx of lost) {
          const m = marks.get(tx);
          if (m === undefined || m.state !== 'ok') throw new Error(`acid-stage: 잃은 OK 로 받은 ${tx} 에 OK 표지가 없다`);
          m.state = 'lost';
          paintMark(m, tx);
          // 빈 메모리 띠로 떨어져 나간다
          place(m.g, m.x, OK_Y + LOST_DROP, dur, ' rotate(-10deg)');
        }
      },

      setCaption(line1, line2) {
        caption1.textContent = line1;
        caption2.textContent = line2;
      },
    };

    const caption1 = el('text', {
      x: 14,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'font-weight': 600,
      fill: c.text,
    });
    const caption2 = el('text', { x: 14, y: CAPTION_Y + 24, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted });
    root.append(caption1, caption2);

    return {
      ...stage,
      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
  },
};
