/**
 * durable-after-commit 의 그림.
 *
 * 위아래가 곧 주장이다 — 위 띠는 메모리(점선: 전원이 나가면 사라진다), 아래 띠는 디스크(실선: 남는다).
 * 맨 위에 트랜잭션이 선다. 기록은 트랜잭션에서 로그 버퍼로 떨어지고, 커밋 때 로그 버퍼에서 로그 파일로
 * **내려앉는다**. 그다음에야 OK 가 내려앉은 커밋 기록에서 트랜잭션으로 올라간다.
 * 충돌 때 메모리 띠의 것은 떨어지며 사라지고, 다시 켜면 로그 파일의 새 값이 데이터 파일 칸으로 옮겨 선다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LogRecord } from './algorithm.js';
import type { DurableScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 14;
const TAG_TOP = 10;
const TAG_H = 26;
const TAG_W = 46;
const BADGE_W = 38;
const TAG_GAP_MAX = 150;
const BANDS_TOP = 50;
const BAND_GAP = 12;
const BAND_LABEL = 20;
const BOX_TITLE = 18;
const ROW_H_MAX = 26;
const CAPTION_ROOM = 46;
const MOVE_MS = 520;

type Pt = { x: number; y: number };
type Handle = { g: SVGGElement; x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function translate(x: number, y: number): string {
  return `translate(${r2(x)},${r2(y)})`;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 내려앉기 — 떨어질수록 빨라지다 멈춘다. */
function easeIn(p: number): number {
  return p * p * p;
}

function opName(txn: string, where: string): string {
  const m = /^T(\d+)$/.exec(txn);
  if (!m) throw new Error(`durable-after-commit ${where}: 연산 표기를 쓸 수 없는 트랜잭션 이름 ${txn}`);
  return m[1] as string;
}

function recordText(r: LogRecord): string {
  return r.kind === 'commit' ? `<${r.txn}, commit>` : `<${r.txn}, ${r.key}, ${r.before}, ${r.after}>`;
}

function listText(xs: (string | number)[]): string {
  return xs.length === 0 ? '—' : xs.join(', ');
}

type Layout = {
  bandX: number;
  bandW: number;
  memY: number;
  diskY: number;
  bandH: number;
  leftX: number;
  leftW: number;
  rightX: number;
  rightW: number;
  boxDy: number;
  boxH: number;
  rowH: number;
  capY: number;
  tagX: (i: number) => number;
};

function layout(scene: DurableScene): Layout {
  const W = PIECE_CANVAS_W;
  const bandX = MARGIN;
  const bandW = W - 2 * MARGIN;
  const capY = H - CAPTION_ROOM;
  const bandH = (capY - 6 - BANDS_TOP - BAND_GAP) / 2;
  const memY = BANDS_TOP;
  const diskY = BANDS_TOP + bandH + BAND_GAP;
  const innerX = bandX + 10;
  const innerW = bandW - 20;
  const leftW = Math.round(innerW * 0.34);
  const gap = 16;
  const rightX = innerX + leftW + gap;
  const rightW = innerW - leftW - gap;
  const boxDy = BAND_LABEL;
  const boxH = bandH - BAND_LABEL - 8;
  const rowsNeeded = Math.max(scene.rows.length, scene.slots, 1);
  const rowH = Math.min(ROW_H_MAX, (boxH - BOX_TITLE - 6) / rowsNeeded);
  const n = scene.txns.length;
  const tagGap = Math.min(TAG_GAP_MAX, (W - 2 * MARGIN) / Math.max(n, 1));
  const tagX = (i: number): number => W / 2 + (i - (n - 1) / 2) * tagGap - (TAG_W + BADGE_W + 6) / 2;
  return { bandX, bandW, memY, diskY, bandH, leftX: innerX, leftW, rightX, rightW, boxDy, boxH, rowH, capY, tagX };
}

/** 줄 칸(버퍼 풀 · 데이터 파일)의 값 자리 가운데 */
function cellCenter(L: Layout, bandY: number, i: number): Pt {
  const y0 = bandY + L.boxDy + BOX_TITLE + i * L.rowH;
  const cx = L.leftX + 34 + (L.leftW - 44) / 2;
  return { x: cx, y: y0 + (L.rowH - 4) / 2 };
}

/** 기록 칸(로그 버퍼 · 로그 파일)의 왼쪽 위 */
function slotAt(L: Layout, bandY: number, k: number): Pt {
  return { x: L.rightX + 8, y: bandY + L.boxDy + BOX_TITLE + k * L.rowH };
}

function tagCenter(L: Layout, scene: DurableScene, txn: string): Pt {
  const i = scene.txns.indexOf(txn);
  if (i < 0) throw new Error(`durable-after-commit: 모르는 트랜잭션 ${txn}`);
  return { x: L.tagX(i) + TAG_W / 2, y: TAG_TOP + TAG_H / 2 };
}

function badgeAt(L: Layout, scene: DurableScene, txn: string): Pt {
  const i = scene.txns.indexOf(txn);
  if (i < 0) throw new Error(`durable-after-commit: 모르는 트랜잭션 ${txn}`);
  return { x: L.tagX(i) + TAG_W + 6, y: TAG_TOP };
}

export const durableAfterCommitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const xsPx = parseFloat(fontSizes.xs);
    const mdPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles = new Map<string, Handle>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function txnColor(scene: DurableScene, txn: string): string {
      const i = scene.txns.indexOf(txn);
      const palette = categorical(scene.txns.length, params.theme === 'dark' ? 'deep' : 'pastel');
      const c = palette[i];
      if (c === undefined) throw new Error(`durable-after-commit: 모르는 트랜잭션 ${txn}`);
      return c;
    }

    function drawChip(
      root: Element,
      scene: DurableScene,
      L: Layout,
      at: Pt,
      r: LogRecord,
      lit: boolean,
    ): SVGGElement {
      const g = el('g', { transform: translate(at.x, at.y) }, root);
      const w = L.rightW - 16;
      const h = L.rowH - 4;
      const c = txnColor(scene, r.txn);
      el(
        'rect',
        {
          x: 0,
          y: 0,
          width: w,
          height: h,
          rx: 4,
          fill: colors.bg,
          stroke: lit ? colors.itemActive : colors.border,
          'stroke-width': lit ? 2.5 : 1.2,
        },
        g,
      );
      el('rect', { x: 0, y: 0, width: 7, height: h, rx: 3, fill: c }, g);
      label(g, 12, h / 2, t('label.lsn', 'LSN {n}', { n: r.lsn }), { size: fontSizes.xs, fill: colors.textMuted });
      label(g, 12 + xsPx * 4.2, h / 2, recordText(r), {
        size: fontSizes.sm,
        fill: colors.text,
        mono: true,
        weight: r.kind === 'commit' ? 'bold' : 'normal',
      });
      return g;
    }

    function drawBand(root: Element, L: Layout, y: number, volatile: boolean, lost: boolean): void {
      el(
        'rect',
        {
          x: L.bandX,
          y,
          width: L.bandW,
          height: L.bandH,
          rx: 8,
          fill: volatile ? colors.bgSubtle : colors.bg,
          stroke: lost ? colors.danger : volatile ? colors.textMuted : colors.text,
          'stroke-width': lost ? 2 : 1.5,
          'stroke-dasharray': volatile ? '6 5' : 'none',
        },
        root,
      );
      const name = volatile
        ? lost
          ? t('label.memoryLost', 'Memory — power lost')
          : t('label.memory', 'Memory')
        : t('label.disk', 'Disk');
      label(root, L.bandX + 12, y + BAND_LABEL / 2 + 1, name, {
        size: fontSizes.sm,
        fill: lost ? colors.danger : colors.textMuted,
        weight: 'bold',
      });
    }

    function drawBox(root: Element, x: number, y: number, w: number, h: number, title: string): void {
      el('rect', { x, y, width: w, height: h, rx: 5, fill: colors.bg, stroke: colors.border, 'stroke-width': 1 }, root);
      label(root, x + 8, y + BOX_TITLE / 2 + 1, title, { size: fontSizes.xs, fill: colors.textMuted });
    }

    function drawRows(
      root: Element,
      scene: DurableScene,
      L: Layout,
      bandY: number,
      values: (number | null)[],
      lit: string[],
      prefix: string,
      out: Map<string, Handle>,
    ): void {
      scene.rows.forEach((key, i) => {
        const y0 = bandY + L.boxDy + BOX_TITLE + i * L.rowH;
        const h = L.rowH - 4;
        label(root, L.leftX + 14, y0 + h / 2, key, { size: fontSizes.sm, fill: colors.text, mono: true });
        const v = values[i];
        const on = lit.includes(key);
        el(
          'rect',
          {
            x: L.leftX + 34,
            y: y0,
            width: L.leftW - 44,
            height: h,
            rx: 4,
            fill: v === null || v === undefined ? 'none' : colors.bgSubtle,
            stroke: on ? colors.itemActive : colors.border,
            'stroke-width': on ? 2.5 : 1,
            'stroke-dasharray': v === null || v === undefined ? '3 3' : 'none',
          },
          root,
        );
        if (v === null || v === undefined) return;
        const c = cellCenter(L, bandY, i);
        const g = el('g', { transform: translate(c.x, c.y) }, root);
        label(g, 0, 0, String(v), { size: fontSizes.md, fill: colors.text, anchor: 'middle', mono: true, weight: 'bold' });
        out.set(`${prefix}:${key}`, { g, x: c.x, y: c.y });
      });
    }

    function drawRecords(
      root: Element,
      scene: DurableScene,
      L: Layout,
      bandY: number,
      recs: LogRecord[],
      lit: number[],
      prefix: string,
      out: Map<string, Handle>,
    ): void {
      if (recs.length === 0) {
        label(root, L.rightX + L.rightW / 2, bandY + L.boxDy + (L.boxH + BOX_TITLE) / 2, t('label.empty', 'empty'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
        });
        return;
      }
      recs.forEach((r, k) => {
        const at = slotAt(L, bandY, k);
        const g = drawChip(root, scene, L, at, r, lit.includes(r.lsn));
        out.set(`${prefix}:${r.lsn}`, { g, x: at.x, y: at.y });
      });
    }

    function captionLines(scene: DurableScene): string[] {
      const s = scene.step;
      if (s.kind === 'start') {
        return [t('caption.start', 'Nothing has run yet. The data file on disk holds the starting values.')];
      }
      if (s.kind === 'write') {
        const op = `W${opName(s.txn, 'write')}(${s.key}=${s.after})`;
        return [
          t('caption.write', '{op}: record LSN {lsn} goes to the log buffer, the new value to the buffer pool.', {
            op,
            lsn: s.lsn,
          }),
        ];
      }
      if (s.kind === 'commit') {
        const op = `C${opName(s.txn, 'commit')}`;
        return [t('caption.commit', '{op}: commit record LSN {lsn} goes to the log buffer.', { op, lsn: s.lsn })];
      }
      if (s.kind === 'flush') {
        return [
          t('caption.flush', 'The whole log buffer lands in the log file on disk. LSN: {lsns}', {
            lsns: listText(s.lsns),
          }),
        ];
      }
      if (s.kind === 'ok') {
        return [t('caption.ok', 'Only now does OK go back. To: {txn}', { txn: s.txn })];
      }
      if (s.kind === 'crash') {
        return [
          t('caption.crash', 'Crash. Memory is wiped: buffer pool and log buffer.'),
          t('caption.crashLsn', 'Lost LSN: {lost}. Kept on disk, LSN: {kept}', {
            lost: listText(s.lostRecords.map((r) => r.lsn)),
            kept: listText(s.keptLsns),
          }),
        ];
      }
      return [
        t('caption.redo', 'Restart: redo from the log file into the data file. LSN: {lsns}', {
          lsns: listText(s.applied.map((a) => a.lsn)),
        }),
        t('caption.result', 'Got OK: {ok}. Never got OK: {notOk}', {
          ok: listText(s.okTxns),
          notOk: listText(s.notOkTxns),
        }),
      ];
    }

    function drawStatic(scene: DurableScene): void {
      svg.textContent = '';
      const out = new Map<string, Handle>();
      handles = out;
      if (scene.rows.length === 0) throw new Error('durable-after-commit: 줄이 없는 장면');
      const L = layout(scene);
      const s = scene.step;
      const root = el('g', {}, svg);

      // 트랜잭션과 OK
      scene.txns.forEach((txn, i) => {
        const x = L.tagX(i);
        const c = txnColor(scene, txn);
        el('rect', { x, y: TAG_TOP, width: TAG_W, height: TAG_H, rx: 13, fill: c, stroke: colors.border, 'stroke-width': 1 }, root);
        label(root, x + TAG_W / 2, TAG_TOP + TAG_H / 2, txn, {
          size: fontSizes.sm,
          fill: colors.text,
          anchor: 'middle',
          mono: true,
          weight: 'bold',
        });
        const b = badgeAt(L, scene, txn);
        if (scene.okTxns.includes(txn)) {
          const g = el('g', { transform: translate(b.x, b.y) }, root);
          el('rect', { x: 0, y: 0, width: BADGE_W, height: TAG_H, rx: 13, fill: colors.success }, g);
          label(g, BADGE_W / 2, TAG_H / 2, t('label.ok', 'OK'), {
            size: fontSizes.sm,
            fill: colors.textInverse,
            anchor: 'middle',
            weight: 'bold',
          });
          out.set(`ok:${txn}`, { g, x: b.x, y: b.y });
        } else {
          el('rect', {
            x: b.x,
            y: b.y,
            width: BADGE_W,
            height: TAG_H,
            rx: 13,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '3 3',
          }, root);
        }
      });

      // 두 띠
      drawBand(root, L, L.memY, true, s.kind === 'crash');
      drawBand(root, L, L.diskY, false, false);
      const boxY = (bandY: number): number => bandY + L.boxDy;
      drawBox(root, L.leftX, boxY(L.memY), L.leftW, L.boxH, t('label.bufferPool', 'Buffer pool'));
      drawBox(root, L.rightX, boxY(L.memY), L.rightW, L.boxH, t('label.logBuffer', 'Log buffer'));
      drawBox(root, L.leftX, boxY(L.diskY), L.leftW, L.boxH, t('label.dataFile', 'Data file'));
      drawBox(root, L.rightX, boxY(L.diskY), L.rightW, L.boxH, t('label.logFile', 'Log file'));

      const poolLit = s.kind === 'write' ? [s.key] : [];
      const dataLit = s.kind === 'redo' ? s.applied.map((a) => a.key) : [];
      const fileLit = s.kind === 'flush' ? s.lsns : s.kind === 'redo' ? s.applied.map((a) => a.lsn) : [];
      const bufLit = s.kind === 'write' || s.kind === 'commit' ? [s.lsn] : [];
      drawRows(root, scene, L, L.memY, scene.pool, poolLit, 'pool', out);
      drawRows(root, scene, L, L.diskY, scene.dataFile, dataLit, 'data', out);
      drawRecords(root, scene, L, L.memY, scene.logBuf, bufLit, 'buf', out);
      drawRecords(root, scene, L, L.diskY, scene.logFile, fileLit, 'file', out);

      // 캡션
      const lines = captionLines(scene);
      lines.forEach((line, i) => {
        label(root, PIECE_CANVAS_W / 2, L.capY + 12 + i * (mdPx + 6), line, {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
        });
      });
    }

    /** 한 시계 — 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function clock(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    type Flight = { h: Handle; from: Pt };

    /** 끝 자리에 이미 선 요소를 아직 못 온 만큼 뒤로 물려 두고 흘린다. */
    function fly(mine: number, flights: Flight[], ease: (p: number) => number, lift: number): Promise<void> {
      const place = (p: number): void => {
        const e = ease(p);
        const arc = lift * Math.sin(Math.PI * p);
        for (const f of flights) {
          const x = f.h.x + (f.from.x - f.h.x) * (1 - e);
          const y = f.h.y + (f.from.y - f.h.y) * (1 - e) - arc;
          f.h.g.setAttribute('transform', translate(x, y));
        }
      };
      place(0);
      return clock(mine, MOVE_MS, place);
    }

    function need(key: string): Handle {
      const h = handles.get(key);
      if (!h) throw new Error(`durable-after-commit: 그린 자리가 없다 ${key}`);
      return h;
    }

    async function animate(scene: DurableScene, mine: number): Promise<void> {
      const s = scene.step;
      const L = layout(scene);
      if (s.kind === 'write') {
        const from = tagCenter(L, scene, s.txn);
        const chip = need(`buf:${s.lsn}`);
        const val = need(`pool:${s.key}`);
        await fly(mine, [
          { h: chip, from: { x: from.x - 20, y: from.y } },
          { h: val, from },
        ], easeInOut, 0);
        return;
      }
      if (s.kind === 'commit') {
        const from = tagCenter(L, scene, s.txn);
        await fly(mine, [{ h: need(`buf:${s.lsn}`), from: { x: from.x - 20, y: from.y } }], easeInOut, 0);
        return;
      }
      if (s.kind === 'flush') {
        const flights = s.lsns.map((lsn, k) => ({ h: need(`file:${lsn}`), from: slotAt(L, L.memY, k) }));
        await fly(mine, flights, easeIn, 0);
        return;
      }
      if (s.kind === 'ok') {
        const k = scene.logFile.findIndex((r) => r.kind === 'commit' && r.txn === s.txn);
        if (k < 0) throw new Error(`durable-after-commit ok: 로그 파일에 커밋 기록이 없다 ${s.txn}`);
        const at = slotAt(L, L.diskY, k);
        await fly(mine, [{ h: need(`ok:${s.txn}`), from: { x: at.x + L.rightW / 2 - 30, y: at.y } }], easeInOut, 0);
        return;
      }
      if (s.kind === 'crash') {
        const layer = el('g', {}, svg);
        const ghosts: { g: SVGGElement; x: number; y: number }[] = [];
        s.lostRecords.forEach((r, k) => {
          const at = slotAt(L, L.memY, k);
          ghosts.push({ g: drawChip(layer, scene, L, at, r, false), x: at.x, y: at.y });
        });
        for (const lp of s.lostPool) {
          const i = scene.rows.indexOf(lp.key);
          if (i < 0) throw new Error(`durable-after-commit crash: 없는 줄 ${lp.key}`);
          const c = cellCenter(L, L.memY, i);
          const g = el('g', { transform: translate(c.x, c.y) }, layer);
          label(g, 0, 0, String(lp.value), {
            size: fontSizes.md,
            fill: colors.danger,
            anchor: 'middle',
            mono: true,
            weight: 'bold',
          });
          ghosts.push({ g, x: c.x, y: c.y });
        }
        const drop = L.rowH * 1.2;
        await clock(mine, MOVE_MS, (p) => {
          const e = easeIn(p);
          for (const gh of ghosts) {
            gh.g.setAttribute('transform', translate(gh.x, gh.y + drop * e));
            gh.g.setAttribute('opacity', String(r2(1 - e)));
          }
        });
        return;
      }
      if (s.kind === 'redo') {
        const flights = s.applied.map((a) => {
          const k = scene.logFile.findIndex((r) => r.lsn === a.lsn);
          if (k < 0) throw new Error(`durable-after-commit redo: 로그 파일에 없는 LSN ${a.lsn}`);
          const at = slotAt(L, L.diskY, k);
          return { h: need(`data:${a.key}`), from: { x: at.x + 40, y: at.y + (L.rowH - 4) / 2 } };
        });
        await fly(mine, flights, easeInOut, L.rowH * 1.5);
      }
    }

    return {
      async render(next: DurableScene, _prev: DurableScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate) return;
        await animate(next, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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

