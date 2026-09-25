/**
 * replay-after-crash 무대 — 위는 저널(끊긴 자리에서 잘린 기록 줄), 아래는 제자리 블록.
 *
 * 동사는 "다시 밟힌다".
 *   - 훑기: 읽는 틀이 저널 기록을 하나씩 밟아 간다. 끝 표식에 닿으면 그 묶음은 다시 쓸 것이 되고,
 *     끊긴 자리까지 가도 끝 표식이 없으면 그 묶음의 기록이 아래로 떨어지다 제자리에 닿지 못하고 사라진다.
 *   - 다시 쓰기: 저널 기록의 사본이 제자리 블록으로 내려가 덮어쓴다 (원본 기록은 저널에 남는다).
 *   - 비우기: 저널 기록이 납작해지며 줄이 빈다.
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
import type {
  ReplayAfterCrashScene,
  SceneBlockState,
  SceneRecord,
} from './scene.js';

const H = 316;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const REC_GAP = 6;
const TX_GAP = 14;
const CUT_W = 30;
const REC_MAX_W = 92;
const MARK_RATIO = 0.75;

const JOURNAL_LABEL_Y = 16;
const JOURNAL_Y = 26;
const JOURNAL_H = 44;
const J_BRACKET_Y = 78;
const HOME_LABEL_Y = 160;
const HOME_Y = 170;
const HOME_H = 54;
const HOME_GAP = 12;
const HOME_MAX_W = 118;
const H_BRACKET_Y = 232;
const CAPTION_Y = 286;
const TALLY_Y = 306;

const HOP_MS = 150;
const DROP_MS = 520;
const COPY_MS = 720;
const CLEAR_MS = 640;

type Box = { x: number; y: number; w: number; h: number };
type Look = 'plain' | 'kept' | 'ghost';

/** 판정이 아직 안 보여야 하는 것 · 아직 안 써진 것 — 운동하는 동안만 쓴다 */
type Hold = { scanTx?: number; homeBefore?: { block: string; state: SceneBlockState } };

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 저널 기록의 자리 — 묶음 사이는 조금 더 띄우고, 표식은 블록보다 좁다. 끝에 끊긴 자리 */
function journalLayout(journal: SceneRecord[]): { recs: Box[]; cut: Box } {
  const n = journal.length;
  let marks = 0;
  let groups = 0;
  let lastTx: number | null = null;
  for (const r of journal) {
    if (r.kind !== 'block') marks += 1;
    if (r.tx !== lastTx) groups += 1;
    lastTx = r.tx;
  }
  const blocks = n - marks;
  const avail =
    PIECE_CANVAS_W - 2 * PAD - CUT_W - REC_GAP * Math.max(0, n) - TX_GAP * Math.max(0, groups - 1);
  const units = blocks + marks * MARK_RATIO;
  const bw = units > 0 ? Math.min(REC_MAX_W, avail / units) : REC_MAX_W;
  const recs: Box[] = [];
  let x = PAD;
  lastTx = null;
  for (const r of journal) {
    if (lastTx !== null && r.tx !== lastTx) x += TX_GAP;
    lastTx = r.tx;
    const w = r.kind === 'block' ? bw : bw * MARK_RATIO;
    recs.push({ x: r1(x), y: JOURNAL_Y, w: r1(w), h: JOURNAL_H });
    x += w + REC_GAP;
  }
  return { recs, cut: { x: r1(x), y: JOURNAL_Y, w: CUT_W, h: JOURNAL_H } };
}

function homeLayout(homes: ReplayAfterCrashScene['homes']): Box[] {
  const n = homes.length;
  let groups = 0;
  let lastTx: number | null = null;
  for (const h of homes) {
    if (h.tx !== lastTx) groups += 1;
    lastTx = h.tx;
  }
  const avail =
    PIECE_CANVAS_W - 2 * PAD - HOME_GAP * Math.max(0, n - 1) - TX_GAP * Math.max(0, groups - 1);
  const w = n > 0 ? Math.min(HOME_MAX_W, avail / n) : HOME_MAX_W;
  const used = n * w + HOME_GAP * Math.max(0, n - 1) + TX_GAP * Math.max(0, groups - 1);
  let x = PAD + (PIECE_CANVAS_W - 2 * PAD - used) / 2;
  const out: Box[] = [];
  lastTx = null;
  for (const h of homes) {
    if (lastTx !== null && h.tx !== lastTx) x += TX_GAP;
    lastTx = h.tx;
    out.push({ x: r1(x), y: HOME_Y, w: r1(w), h: HOME_H });
    x += w + HOME_GAP;
  }
  return out;
}

export const replayAfterCrashStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      body: string,
      o: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size,
          fill: o.fill,
          'text-anchor': o.anchor ?? 'start',
          'font-weight': o.weight ?? 400,
        },
        parent,
      );
      node.textContent = body;
      return node;
    }

    function recordLabel(r: SceneRecord): string {
      if (r.kind === 'begin') return tr('label.begin', 'Begin {tx}', { tx: r.tx });
      if (r.kind === 'end') return tr('label.end', 'End {tx}', { tx: r.tx });
      if (r.block === null) throw new Error('블록 기록에 이름이 없다');
      return r.block;
    }

    function stateWord(s: SceneBlockState): string {
      return s === 'new' ? tr('label.new', 'new') : tr('label.old', 'old');
    }

    /** 저널 기록 하나 — 블록 기록은 이름과 담긴 내용(new), 표식은 이름만 */
    function drawRecord(parent: Element, r: SceneRecord, b: Box, look: Look): SVGGElement {
      const g = el('g', {}, parent);
      const isBlock = r.kind === 'block';
      el(
        'rect',
        {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 4,
          fill: look === 'ghost' ? 'none' : isBlock ? c.bgSubtle : c.bg,
          stroke: look === 'kept' ? c.success : look === 'ghost' ? c.textMuted : c.border,
          'stroke-width': look === 'kept' ? 2 : 1,
          'stroke-dasharray': look === 'ghost' ? '4 3' : isBlock ? 'none' : '3 2',
        },
        g,
      );
      const ink = look === 'ghost' ? c.textMuted : isBlock ? c.text : c.textMuted;
      if (isBlock) {
        write(g, b.x + b.w / 2, b.y + b.h / 2 - 3, recordLabel(r), {
          size: fontSizes.sm,
          fill: ink,
          anchor: 'middle',
          mono: true,
        });
        write(g, b.x + b.w / 2, b.y + b.h / 2 + XS + 1, stateWord('new'), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'middle',
        });
      } else {
        write(g, b.x + b.w / 2, b.y + b.h / 2 + XS / 2 - 1, recordLabel(r), {
          size: fontSizes.xs,
          fill: ink,
          anchor: 'middle',
          weight: 600,
        });
      }
      if (look === 'ghost') g.setAttribute('opacity', '0.55');
      return g;
    }

    /** 끊긴 자리 — 저널 줄 끝을 가르는 톱니 */
    function drawCut(parent: Element, b: Box): void {
      const x0 = b.x + 4;
      const teeth = 6;
      const step = b.h / teeth;
      let d = `M ${r1(x0)} ${r1(b.y - 4)}`;
      for (let i = 0; i < teeth; i += 1) {
        const xx = i % 2 === 0 ? x0 + 8 : x0;
        d += ` L ${r1(xx)} ${r1(b.y + step * (i + 1))}`;
      }
      d += ` L ${r1(x0)} ${r1(b.y + b.h + 4)}`;
      el('path', { d, fill: 'none', stroke: c.danger, 'stroke-width': 2, 'stroke-linejoin': 'round' }, parent);
      write(parent, b.x + b.w + 2, JOURNAL_LABEL_Y, tr('label.cut', 'power lost'), {
        size: fontSizes.xs,
        fill: c.danger,
        anchor: 'end',
      });
    }

    function drawHome(
      parent: Element,
      name: string,
      state: SceneBlockState,
      rewritten: boolean,
      b: Box,
    ): void {
      const isNew = state === 'new';
      el(
        'rect',
        {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 5,
          fill: isNew ? c.primary : c.bgSubtle,
          stroke: rewritten ? c.success : c.border,
          'stroke-width': rewritten ? 2 : 1,
        },
        parent,
      );
      const ink = isNew ? c.textInverse : c.text;
      write(parent, b.x + b.w / 2, b.y + 17, name, {
        size: fontSizes.sm,
        fill: ink,
        anchor: 'middle',
        mono: true,
      });
      write(parent, b.x + b.w / 2, b.y + 17 + SM + 2, stateWord(state), {
        size: fontSizes.xs,
        fill: isNew ? c.textInverse : c.textMuted,
        anchor: 'middle',
        weight: 600,
      });
      if (rewritten) {
        write(parent, b.x + b.w / 2, b.y + b.h + XS + 2, tr('label.rewritten', 'rewritten'), {
          size: fontSizes.xs,
          fill: c.success,
          anchor: 'middle',
        });
      }
    }

    /** 묶음 괄호 — 선 한 줄과 양 끝 눈금, 아래에 이름 */
    function drawBracket(
      parent: Element,
      x0: number,
      x1: number,
      y: number,
      stroke: string,
      left: string,
      right: string | null,
      rightFill: string,
    ): void {
      el(
        'path',
        {
          d: `M ${r1(x0)} ${r1(y - 5)} L ${r1(x0)} ${r1(y)} L ${r1(x1)} ${r1(y)} L ${r1(x1)} ${r1(y - 5)}`,
          fill: 'none',
          stroke,
          'stroke-width': 1.5,
        },
        parent,
      );
      write(parent, x0, y + XS + 3, left, { size: fontSizes.xs, fill: stroke });
      if (right !== null) {
        write(parent, x1, y + XS + 3, right, {
          size: fontSizes.xs,
          fill: rightFill,
          anchor: 'end',
          weight: 600,
        });
      }
    }

    function recordLook(scene: ReplayAfterCrashScene, tx: number, hold: Hold): Look {
      if (hold.scanTx === tx) return 'plain';
      const v = scene.verdicts.find((d) => d.tx === tx);
      if (!v) return 'plain';
      return v.keep ? 'kept' : 'ghost';
    }

    function caption(scene: ReplayAfterCrashScene): string {
      const s = scene.step;
      if (s === null) {
        return tr('caption.crashed', 'Power is back. Journal records left: {n}', {
          n: scene.journal.length,
        });
      }
      if (s.kind === 'scan') {
        return s.keep
          ? tr('caption.keep', 'Transaction {tx}: end mark found — replay it', { tx: s.tx })
          : tr('caption.drop', 'Transaction {tx}: no end mark — discard it', { tx: s.tx });
      }
      if (s.kind === 'replay') {
        const vars = { block: s.block, before: stateWord(s.before), after: stateWord(s.after) };
        return s.before === 'new'
          ? tr('caption.replaySame', 'Rewrite {block}: {before} → {after} — written again anyway', vars)
          : tr('caption.replay', 'Rewrite {block}: {before} → {after}', vars);
      }
      return tr('caption.clear', 'Journal emptied');
    }

    type Drawn = { recs: Box[]; cut: Box; homes: Box[]; overlay: SVGGElement };

    function drawStatic(scene: ReplayAfterCrashScene, hold: Hold = {}): Drawn {
      svg.textContent = '';
      const { recs, cut } = journalLayout(scene.journal);
      const homes = homeLayout(scene.homes);

      write(svg, PAD, JOURNAL_LABEL_Y, tr('label.journal', 'Journal'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        weight: 600,
      });
      write(svg, PAD, HOME_LABEL_Y, tr('label.home', 'Home locations'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        weight: 600,
      });

      const jLayer = el('g', {}, svg);
      if (scene.journal.length > 0) {
        if (scene.cleared) {
          const x1 = cut.x;
          el(
            'rect',
            {
              x: PAD,
              y: JOURNAL_Y,
              width: r1(x1 - PAD - REC_GAP),
              height: JOURNAL_H,
              rx: 4,
              fill: 'none',
              stroke: c.border,
              'stroke-dasharray': '4 4',
            },
            jLayer,
          );
          write(jLayer, (PAD + x1) / 2, JOURNAL_Y + JOURNAL_H / 2 + XS / 2 - 1, tr('label.empty', 'empty'), {
            size: fontSizes.xs,
            fill: c.textMuted,
            anchor: 'middle',
          });
        } else {
          scene.journal.forEach((r, i) => {
            drawRecord(jLayer, r, recs[i], recordLook(scene, r.tx, hold));
          });
          // 묶음 괄호와 판정
          const txs: number[] = [];
          for (const r of scene.journal) if (!txs.includes(r.tx)) txs.push(r.tx);
          for (const tx of txs) {
            const idx = scene.journal.map((r, i) => (r.tx === tx ? i : -1)).filter((i) => i >= 0);
            const a = recs[idx[0]];
            const b = recs[idx[idx.length - 1]];
            const v = hold.scanTx === tx ? undefined : scene.verdicts.find((d) => d.tx === tx);
            const stroke = v ? (v.keep ? c.success : c.danger) : c.textMuted;
            const right = v
              ? v.keep
                ? tr('label.keep', 'replay')
                : tr('label.drop', 'discard')
              : null;
            drawBracket(
              jLayer,
              a.x,
              b.x + b.w,
              J_BRACKET_Y,
              stroke,
              tr('label.tx', 'Transaction {tx}', { tx }),
              right,
              stroke,
            );
          }
          drawCut(jLayer, cut);
        }
      }

      const hLayer = el('g', {}, svg);
      scene.homes.forEach((h, i) => {
        const held = hold.homeBefore && hold.homeBefore.block === h.block ? hold.homeBefore : null;
        const state = held ? held.state : h.state;
        const count = scene.rewritten.filter((b) => b === h.block).length;
        drawHome(hLayer, h.block, state, held ? count > 1 : count > 0, homes[i]);
      });
      // 제자리 묶음 괄호 — 판정이 나면 그 색
      const htx: number[] = [];
      for (const h of scene.homes) if (!htx.includes(h.tx)) htx.push(h.tx);
      for (const tx of htx) {
        const idx = scene.homes.map((h, i) => (h.tx === tx ? i : -1)).filter((i) => i >= 0);
        const a = homes[idx[0]];
        const b = homes[idx[idx.length - 1]];
        const v = hold.scanTx === tx ? undefined : scene.verdicts.find((d) => d.tx === tx);
        const stroke = v ? (v.keep ? c.success : c.danger) : c.textMuted;
        drawBracket(
          hLayer,
          a.x,
          b.x + b.w,
          H_BRACKET_Y + XS + 2,
          stroke,
          tr('label.tx', 'Transaction {tx}', { tx }),
          null,
          stroke,
        );
      }

      if (scene.homes.length > 0) {
        write(svg, PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene), {
          size: fontSizes.md,
          fill: c.text,
          anchor: 'middle',
          weight: 600,
        });
        let dropped = 0;
        for (const v of scene.verdicts) if (!v.keep) dropped += v.blocks.length;
        write(
          svg,
          PIECE_CANVAS_W / 2,
          TALLY_Y,
          tr('tally', 'Rewritten blocks: {r} · Discarded blocks: {d}', {
            r: scene.rewritten.length,
            d: dropped,
          }),
          { size: fontSizes.sm, fill: c.textMuted, anchor: 'middle' },
        );
      }

      const overlay = el('g', {}, svg);
      return { recs, cut, homes, overlay };
    }

    /** 한 시계 — 16ms 간격으로 p 를 0→1 로 흘린다. 세대가 바뀌거나 거두면 false */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const total = Math.max(1, Math.round(ms / 16));
        let i = 0;
        const done = (ok: boolean): void => {
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => done(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done(false);
            return;
          }
          i += 1;
          frame(Math.min(1, i / total));
          if (i >= total) {
            done(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      });
    }

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    async function animateScan(
      mine: number,
      next: ReplayAfterCrashScene,
      s: { tx: number; keep: boolean; from: number; to: number },
    ): Promise<void> {
      const d = drawStatic(next, { scanTx: s.tx });
      const stops: Box[] = [];
      for (let i = s.from; i <= s.to; i += 1) stops.push(d.recs[i]);
      if (!s.keep) stops.push(d.cut);
      const cursor = el(
        'rect',
        { fill: 'none', stroke: c.accent, 'stroke-width': 3, rx: 5 },
        d.overlay,
      );
      const place = (p: number): void => {
        const f = p * (stops.length - 1);
        const k = Math.min(stops.length - 2, Math.floor(f));
        const a = stops[Math.max(0, k)];
        const b = stops[Math.max(0, k) + 1] ?? a;
        const u = stops.length > 1 ? f - Math.max(0, k) : 0;
        cursor.setAttribute('x', String(r1(a.x + (b.x - a.x) * u - 3)));
        cursor.setAttribute('y', String(JOURNAL_Y - 3));
        cursor.setAttribute('width', String(r1(a.w + (b.w - a.w) * u + 6)));
        cursor.setAttribute('height', String(JOURNAL_H + 6));
      };
      if (!(await tween(mine, HOP_MS * Math.max(1, stops.length - 1), place))) return;
      if (!alive(mine)) return;
      if (s.keep) return;
      // 끝 표식이 없다 — 이 묶음의 기록이 떨어지다 제자리에 닿지 못하고 사라진다
      const e = drawStatic(next);
      const fallers: { g: SVGGElement; b: Box }[] = [];
      for (let i = s.from; i <= s.to; i += 1) {
        const r = next.journal[i];
        const g = drawRecord(e.overlay, r, e.recs[i], 'plain');
        fallers.push({ g, b: e.recs[i] });
      }
      const fall = HOME_Y - JOURNAL_Y - JOURNAL_H - 18;
      await tween(mine, DROP_MS, (p) => {
        const q = ease(p);
        for (const f of fallers) {
          const sy = 1 - q;
          const cx = f.b.x + f.b.w / 2;
          const cy = f.b.y + f.b.h / 2;
          f.g.setAttribute(
            'transform',
            `translate(${r1(cx)} ${r1(cy + fall * q)}) scale(${r1(Math.max(0.02, sy) * 100) / 100}) translate(${r1(-cx)} ${r1(-cy)})`,
          );
        }
      });
    }

    async function animateReplay(
      mine: number,
      next: ReplayAfterCrashScene,
      s: { block: string; rec: number; before: SceneBlockState; after: SceneBlockState },
    ): Promise<void> {
      const d = drawStatic(next, { homeBefore: { block: s.block, state: s.before } });
      const hi = next.homes.findIndex((h) => h.block === s.block);
      const rec = next.journal[s.rec];
      if (hi < 0 || !rec) throw new Error(`다시 쓸 자리가 없다: ${s.block}`);
      const from = d.recs[s.rec];
      const to = d.homes[hi];
      const g = el('g', {}, d.overlay);
      const copy = drawRecord(g, rec, from, 'kept');
      await tween(mine, COPY_MS, (p) => {
        const q = ease(p);
        const sx = (from.w + (to.w - from.w) * q) / from.w;
        const sy = (from.h + (to.h - from.h) * q) / from.h;
        const x = from.x + (to.x - from.x) * q;
        const y = from.y + (to.y - from.y) * q;
        copy.setAttribute(
          'transform',
          `translate(${r1(x)} ${r1(y)}) scale(${r1(sx * 100) / 100} ${r1(sy * 100) / 100}) translate(${r1(-from.x)} ${r1(-from.y)})`,
        );
      });
    }

    async function animateClear(mine: number, next: ReplayAfterCrashScene): Promise<void> {
      const d = drawStatic(next);
      const items = next.journal.map((r, i) => ({
        g: drawRecord(d.overlay, r, d.recs[i], recordLook(next, r.tx, {})),
        b: d.recs[i],
        i,
      }));
      const n = Math.max(1, items.length);
      await tween(mine, CLEAR_MS, (p) => {
        for (const it of items) {
          const start = (it.i / n) * 0.5;
          const u = Math.min(1, Math.max(0, (p - start) / 0.5));
          const sy = Math.max(0.02, 1 - ease(u));
          const cy = it.b.y + it.b.h / 2;
          it.g.setAttribute(
            'transform',
            `translate(0 ${r1(cy)}) scale(1 ${r1(sy * 100) / 100}) translate(0 ${r1(-cy)})`,
          );
        }
      });
    }

    async function render(
      next: ReplayAfterCrashScene,
      _prev: ReplayAfterCrashScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      const s = next.step;
      if (!opts.animate || s === null) return;
      if (s.kind === 'scan') await animateScan(mine, next, s);
      else if (s.kind === 'replay') await animateReplay(mine, next, s);
      else await animateClear(mine, next);
      if (alive(mine)) drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
