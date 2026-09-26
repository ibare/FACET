/**
 * surviving-mutant 무대 — 원본 한 장과 한 줄씩 바뀐 사본들. 시험이 시험대에서 날아가 사본의 칸에 꽂힌다.
 * 떨어진 시험이 있으면 그 사본은 기울며 주저앉고(잡힘), 끝까지 버티면 선 채로 남는다(살아남음).
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
import { mutationPercent } from './algorithm.js';
import type { SurvivingMutantScene } from './scene.js';

const H = 390;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

/** 가로 틈 · 위아래 여백 */
const GAP = 16;
const TOP = 10;
/** 좌우 여백 — 잡힌 사본이 기울어도 캔버스 밖으로 나가지 않을 만큼 */
const SIDE = 12;
/** 두 줄(원본 줄 · 사본 줄) 사이 */
const ROW_GAP = 34;
/** 캡션 자리 */
const CAPTION_H = 40;
/** 칸 안쪽 여백 */
const PAD = 7;
const HEADER_H = 24;
const SLOT_H = 26;
/** 한 줄 높이의 상한 */
const LINE_H_MAX = 18;
/** 잡힌 사본이 주저앉는 깊이 · 기우는 각 */
const DROP = 16;
const TILT = -5;
/** 운동 길이 */
const FLY_MS = 450;
const FALL_MS = 350;
const FRAME_MS = 16;
/** 고정폭 글자 한 칸의 폭 (글자 크기에 곱한다) */
const MONO_EM = 0.6;

type Box = { x: number; y: number; w: number; h: number };

type Pose = {
  /** 이번 걸음의 칸을 아직 비워 둔다 (시험이 날아가는 중) */
  pending: boolean;
  /** 이번 걸음에 잡힌 사본이 주저앉은 정도 0..1 */
  fall: number;
  /** 날아가는 시험 표 */
  token: { x: number; y: number } | null;
};

const STILL: Pose = { pending: false, fall: 1, token: null };

type Layout = {
  cardW: number;
  cardH: number;
  lineH: number;
  codePx: number;
  cards: Box[];
  rack: Box;
  chips: Box[];
  captionY: number;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function layout(scene: SurvivingMutantScene): Layout {
  const cols = Math.max(1, scene.mutants.length);
  const cardW = (W - SIDE * 2 - GAP * (cols - 1)) / cols;
  const rowSpace = (H - TOP - ROW_GAP - DROP - CAPTION_H) / 2;
  const n = Math.max(1, scene.code.length);
  const lineH = Math.min(LINE_H_MAX, (rowSpace - HEADER_H - SLOT_H - PAD * 3) / n);
  const cardH = HEADER_H + n * lineH + SLOT_H + PAD * 3;
  const smPx = parseFloat(fontSizes.sm);
  const maxChars = Math.max(1, ...scene.code.map((l) => l.length), ...scene.mutants.map((m) => m.text.length));
  const gutter = smPx * 1.4;
  const codePx = Math.min(smPx, (cardW - PAD * 2 - gutter) / (maxChars * MONO_EM), lineH * 0.8);

  const cards: Box[] = [{ x: SIDE, y: TOP, w: cardW, h: cardH }];
  const rowB = TOP + cardH + ROW_GAP;
  scene.mutants.forEach((_, i) => cards.push({ x: SIDE + i * (cardW + GAP), y: rowB, w: cardW, h: cardH }));

  const rackX = SIDE + cardW + GAP * 2;
  const rack: Box = { x: rackX, y: TOP, w: W - SIDE - rackX, h: cardH };
  const chipTop = TOP + HEADER_H;
  const chipGap = 8;
  const chipH = Math.min(30, (cardH - HEADER_H - chipGap * scene.tests.length) / Math.max(1, scene.tests.length));
  const chips = scene.tests.map((_, i) => ({ x: rackX, y: chipTop + i * (chipH + chipGap), w: W - SIDE - rackX, h: chipH }));
  return { cardW, cardH, lineH, codePx, cards, rack, chips, captionY: H - CAPTION_H / 2 };
}

/** 한 사본 칸 안의 시험 칸 자리 */
function slotBox(card: Box, test: number, count: number): Box {
  const inner = card.w - PAD * 2;
  const w = (inner - PAD * (count - 1)) / count;
  return { x: card.x + PAD + test * (w + PAD), y: card.y + card.h - PAD - SLOT_H, w, h: SLOT_H };
}

/** 장면이 가리킨 자리를 꺼낸다 — 없으면 지어내지 않고 던진다 */
function at<T>(items: readonly T[], i: number, what: string): T {
  const v = items[i];
  if (v === undefined) throw new Error(`surviving-mutant: ${what}[${i}] 가 없다`);
  return v;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 글자 폭 짐작 — 라틴 글자는 반 칸, 그 밖은 한 칸 */
function textEm(s: string): number {
  let em = 0;
  for (const ch of s) em += ch.charCodeAt(0) < 0x2e80 ? 0.56 : 1;
  return em;
}

export const survivingMutantStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function mark(parent: Element, x: number, y: number, s: number, ok: boolean, ink: string): void {
      const d = ok
        ? `M${round(x - s)} ${round(y)} L${round(x - s * 0.3)} ${round(y + s * 0.7)} L${round(x + s)} ${round(y - s * 0.7)}`
        : `M${round(x - s * 0.7)} ${round(y - s * 0.7)} L${round(x + s * 0.7)} ${round(y + s * 0.7)} M${round(x + s * 0.7)} ${round(y - s * 0.7)} L${round(x - s * 0.7)} ${round(y + s * 0.7)}`;
      el('path', { d, fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);
    }

    function caption(scene: SurvivingMutantScene): string {
      const s = scene.step;
      if (s.kind === 'start') {
        return t('caption.start', 'Copies with one line changed: {n}. No test has run yet.', { n: scene.mutants.length });
      }
      if (s.kind === 'score') {
        return t('caption.score', 'Killed: {killed} · Survived: {survived} · Mutation score: {killed}/{total} = {pct}%', {
          killed: s.killed,
          survived: s.total - s.killed,
          total: s.total,
          pct: mutationPercent(s.killed, s.total),
        });
      }
      const test = at(scene.tests, s.test, 'tests').id;
      if (s.copy === 0) {
        return t('caption.original', 'Original · {test} → "{got}" (expected "{want}"): passes.', {
          test,
          got: s.got,
          want: s.want,
        });
      }
      const vars = { mutant: at(scene.mutants, s.copy - 1, 'mutants').id, test, got: s.got, want: s.want };
      if (s.verdict === 'killed') {
        return t('caption.killed', '{mutant} · {test} → "{got}" (expected "{want}"): fails. Caught — remaining tests skipped.', vars);
      }
      if (s.verdict === 'survived') {
        return t('caption.survived', '{mutant} · {test} → "{got}" (expected "{want}"): passes. Every test passed — it survives.', vars);
      }
      return t('caption.pass', '{mutant} · {test} → "{got}" (expected "{want}"): passes. Next test.', vars);
    }

    function drawCard(root: Element, scene: SurvivingMutantScene, L: Layout, copy: number, pose: Pose): void {
      const box = L.cards[copy] as Box;
      const step = scene.step;
      const current = step.kind === 'run' && step.copy === copy;
      const verdict = copy === 0 ? 'none' : at(scene.verdicts, copy - 1, 'verdicts');
      const showVerdict = !(current && pose.pending);
      const killed = verdict === 'killed' && showVerdict;
      const survived = verdict === 'survived' && showVerdict;
      const fall = killed ? (current ? ease(pose.fall) : 1) : 0;

      const g = el('g', {}, root);
      if (fall > 0) {
        const px = box.x + box.w / 2;
        const py = box.y + box.h;
        g.setAttribute('transform', `translate(0 ${round(DROP * fall)}) rotate(${round(TILT * fall)} ${round(px)} ${round(py)})`);
      }
      el('rect', {
        x: box.x + 0.5,
        y: box.y + 0.5,
        width: box.w - 1,
        height: box.h - 1,
        rx: 6,
        fill: killed ? c.bgSubtle : c.bg,
        stroke: survived ? c.primary : c.border,
        'stroke-width': survived ? 2.5 : 1,
        ...(killed ? { 'stroke-dasharray': '5 4' } : {}),
      }, g);

      // 머리 — 원본 / 변이 식별자와 바뀐 줄
      const headY = box.y + HEADER_H / 2 + 2;
      const mutant = copy === 0 ? null : scene.mutants[copy - 1];
      const title = mutant ? mutant.id : t('label.original', 'Original');
      el('text', {
        x: box.x + PAD,
        y: headY,
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: c.text,
      }, g, title);
      if (mutant) {
        el('text', {
          x: box.x + PAD + textEm(title) * parseFloat(fontSizes.sm) + 8,
          y: headY,
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        }, g, t('label.line', 'Line {n}', { n: mutant.line }));
      }
      if (killed || survived) {
        const word = killed ? t('label.killed', 'Killed') : t('label.survived', 'Survived');
        const px = parseFloat(fontSizes.xs);
        const bw = textEm(word) * px + 14;
        const bx = box.x + box.w - PAD - bw;
        el('rect', {
          x: bx,
          y: box.y + 5,
          width: bw,
          height: HEADER_H - 7,
          rx: 4,
          fill: killed ? c.danger : c.primary,
        }, g);
        el('text', {
          x: bx + bw / 2,
          y: box.y + 5 + (HEADER_H - 7) / 2 + 0.5,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: killed ? c.stateInk : c.textInverse,
        }, g, word);
      }

      // 코드 줄
      const lines = mutant ? scene.code.map((l, i) => (i + 1 === mutant.line ? mutant.text : l)) : scene.code;
      const codeTop = box.y + HEADER_H + PAD;
      const gutter = parseFloat(fontSizes.sm) * 1.4;
      lines.forEach((line, i) => {
        const y = codeTop + i * L.lineH;
        const changed = mutant !== null && mutant !== undefined && i + 1 === mutant.line;
        if (changed) {
          el('rect', { x: box.x + 3, y, width: box.w - 6, height: L.lineH, rx: 3, fill: c.accent }, g);
        }
        el('text', {
          x: box.x + PAD + gutter - 6,
          y: y + L.lineH / 2,
          'text-anchor': 'end',
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': round(L.codePx * 0.85),
          fill: changed ? c.stateInk : c.textMuted,
        }, g, String(i + 1));
        el('text', {
          x: box.x + PAD + gutter,
          y: y + L.lineH / 2,
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': round(L.codePx),
          'xml:space': 'preserve',
          fill: changed ? c.stateInk : killed ? c.textMuted : c.text,
        }, g, line);
      });

      // 시험 칸
      scene.tests.forEach((test, ti) => {
        const s = slotBox(box, ti, scene.tests.length);
        const hidden = current && pose.pending && step.kind === 'run' && step.test === ti;
        const res = hidden ? null : at(at(scene.slots, copy, 'slots'), ti, `slots[${copy}]`);
        const skipped = res === null && killed;
        const px = parseFloat(fontSizes.xs);
        const midY = s.y + s.h / 2;
        if (res === null) {
          el('rect', {
            x: s.x,
            y: s.y,
            width: s.w,
            height: s.h,
            rx: 4,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '3 3',
          }, g);
          el('text', {
            x: s.x + 6,
            y: midY,
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          }, g, test.id);
          if (skipped) {
            el('text', {
              x: s.x + 6 + test.id.length * px * MONO_EM + 5,
              y: midY,
              'dominant-baseline': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            }, g, t('label.skipped', 'skipped'));
          }
          return;
        }
        const ink = res.pass ? c.text : c.stateInk;
        el('rect', {
          x: s.x,
          y: s.y,
          width: s.w,
          height: s.h,
          rx: 4,
          fill: res.pass ? c.bgSubtle : c.danger,
          stroke: res.pass ? c.border : c.danger,
        }, g);
        el('text', {
          x: s.x + 6,
          y: midY,
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: ink,
        }, g, test.id);
        el('text', {
          x: s.x + 6 + test.id.length * px * MONO_EM + 5,
          y: midY,
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: ink,
        }, g, `"${res.got}"`);
        mark(g, s.x + s.w - 9, midY, 4, res.pass, ink);
      });
    }

    function drawRack(root: Element, scene: SurvivingMutantScene, L: Layout): void {
      el('text', {
        x: L.rack.x,
        y: L.rack.y + HEADER_H / 2 + 2,
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: c.text,
      }, root, t('label.tests', 'Tests'));
      const step = scene.step;
      const smPx = parseFloat(fontSizes.sm);
      scene.tests.forEach((test, i) => {
        const b = L.chips[i] as Box;
        const active = step.kind === 'run' && step.test === i;
        el('rect', {
          x: b.x + 0.5,
          y: b.y + 0.5,
          width: b.w - 1,
          height: b.h - 1,
          rx: 5,
          fill: c.bg,
          stroke: active ? c.primary : c.border,
          'stroke-width': active ? 2 : 1,
        }, root);
        el('text', {
          x: b.x + 10,
          y: b.y + b.h / 2,
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: c.text,
        }, root, test.id);
        el('text', {
          x: b.x + 10 + (test.id.length + 1) * smPx * MONO_EM + 4,
          y: b.y + b.h / 2,
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'xml:space': 'preserve',
          fill: c.text,
        }, root, test.text);
      });
    }

    function draw(scene: SurvivingMutantScene, pose: Pose): void {
      svg.textContent = '';
      const L = layout(scene);
      const root = el('g', {}, svg);
      drawRack(root, scene, L);
      // 주저앉은 사본이 뒤에 깔리도록 원본 · 사본 차례로
      for (let copy = 0; copy < L.cards.length; copy += 1) drawCard(root, scene, L, copy, pose);

      if (pose.token && scene.step.kind === 'run') {
        const id = at(scene.tests, scene.step.test, 'tests').id;
        const px = parseFloat(fontSizes.sm);
        const tw = textEm(id) * px + 16;
        const th = 22;
        el('rect', {
          x: pose.token.x - tw / 2,
          y: pose.token.y - th / 2,
          width: tw,
          height: th,
          rx: 5,
          fill: c.primary,
        }, root);
        el('text', {
          x: pose.token.x,
          y: pose.token.y + 0.5,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: c.textInverse,
        }, root, id);
      }

      const cap = caption(scene);
      const mdPx = parseFloat(fontSizes.md);
      const capPx = Math.min(mdPx, (W * 0.98) / Math.max(1, textEm(cap)));
      el('text', {
        x: W / 2,
        y: L.captionY,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': round(capPx),
        fill: c.text,
      }, root, cap);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** dur 동안 frame(0..1) 을 부른다. 세대가 바뀌면 거짓 */
    async function tween(dur: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const count = Math.max(1, Math.round(dur / FRAME_MS));
      for (let i = 1; i <= count; i += 1) {
        await wait(FRAME_MS);
        if (destroyed || mine !== gen) return false;
        frame(i / count);
      }
      return true;
    }

    async function render(
      next: SurvivingMutantScene,
      _prev: SurvivingMutantScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || step.kind !== 'run') {
        draw(next, STILL);
        return;
      }
      const L = layout(next);
      const chip = L.chips[step.test] as Box;
      const card = L.cards[step.copy] as Box;
      const slot = slotBox(card, step.test, next.tests.length);
      const from = { x: chip.x + 22, y: chip.y + chip.h / 2 };
      const to = { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 };
      draw(next, { pending: true, fall: 0, token: from });
      const flew = await tween(FLY_MS, mine, (p) => {
        const e = ease(p);
        draw(next, {
          pending: true,
          fall: 0,
          token: { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e },
        });
      });
      if (!flew) return;
      if (step.verdict === 'killed') {
        draw(next, { pending: false, fall: 0, token: null });
        const fell = await tween(FALL_MS, mine, (p) => draw(next, { pending: false, fall: p, token: null }));
        if (!fell) return;
      }
      if (destroyed || mine !== gen) return;
      draw(next, STILL);
    }

    return {
      render,
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
