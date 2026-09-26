/**
 * replay-on-new-base stage — 옛 커밋 자리에서 떨어져 나온 사본이 onto 끝 위로 날아가 앉고,
 * 앉는 순간 부모 화살이 이어지며 해시가 새로 적힌다. 옛 커밋은 제자리에 흐리게 남는다.
 *
 * 윗줄: onto 쪽 커밋과 다시 만든 커밋. 아랫줄: branch 에만 있던 옛 커밋.
 * 가로 자리는 뿌리에서의 거리(첫 부모를 따라 센 칸 수).
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
import type { Commit } from './algorithm.js';
import type { ReplayOnNewBaseScene } from './scene.js';

const H = 300;
const W = PIECE_CANVAS_W;
const PAD_X = 16;
const CARD_H = 58;
const CARD_W_MAX = 104;
const TOP_Y = 92;
const BOTTOM_Y = 200;
const TAG_H = 20;
const TAG_GAP = 7;
const CAPTION_Y = 26;
const CAPTION2_Y = 48;

const REPLAY_MS = 900;
const MOVE_MS = 700;
const PLAN_MS = 450;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 변경 식별자 → 사람이 읽는 이름. 키는 리터럴 표로 둔다. */
const CHANGE_LABEL: Record<string, (t: Translate) => string> = {
  init: (t) => t('label.init', 'First commit'),
  'add-login': (t) => t('label.add-login', 'Add login'),
  'add-db': (t) => t('label.add-db', 'Add database'),
  'add-cache': (t) => t('label.add-cache', 'Add cache'),
  'add-button': (t) => t('label.add-button', 'Add button'),
  'fix-color': (t) => t('label.fix-color', 'Fix color'),
};

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

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

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권 · 가나)는 한 칸, 나머지는 반 칸 남짓. */
function roughWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? px : px * 0.56;
  return w;
}

/** 폭을 넘는 글자는 줄여 담는다. */
function fitText(node: SVGTextElement, s: string, px: number, maxW: number): void {
  node.textContent = s;
  if (roughWidth(s, px) > maxW) {
    node.setAttribute('textLength', String(r2(maxW)));
    node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
}

type Layout = {
  cardW: number;
  pos: Map<string, { x: number; y: number; top: boolean }>;
};

function layoutOf(scene: ReplayOnNewBaseScene): Layout {
  const byId = new Map(scene.commits.map((c) => [c.id, c] as const));
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const c = byId.get(id);
    if (!c) throw new Error(`replay-on-new-base stage: 없는 커밋 ${id}`);
    const first = c.parents[0];
    const d = first === undefined ? 0 : depthOf(first) + 1;
    depth.set(id, d);
    return d;
  };
  const ontoSide = new Set(scene.ontoSide);
  const ontoTip = scene.ontoSide[0];
  if (ontoTip === undefined) throw new Error('replay-on-new-base stage: onto 쪽 커밋이 없다');
  // 칸 수는 걸음 내내 같게 — 다시 놓일 커밋이 모두 onto 끝 뒤에 붙은 모양까지 센다
  const branchOnly = scene.commits.filter((c) => c.origin === null && !ontoSide.has(c.id)).length;
  let cols = depthOf(ontoTip) + branchOnly + 1;
  for (const c of scene.commits) cols = Math.max(cols, depthOf(c.id) + 1);
  const colW = (W - 2 * PAD_X) / cols;
  const cardW = Math.min(CARD_W_MAX, colW - 18);
  const pos = new Map<string, { x: number; y: number; top: boolean }>();
  for (const c of scene.commits) {
    const top = ontoSide.has(c.id) || c.origin !== null;
    const x = PAD_X + colW * depthOf(c.id) + (colW - cardW) / 2;
    pos.set(c.id, { x, y: top ? TOP_Y : BOTTOM_Y, top });
  }
  return { cardW, pos };
}

type Handles = {
  cards: Map<string, { g: SVGGElement; hash: SVGTextElement }>;
  arrows: Map<string, { line: SVGLineElement; head: SVGPolygonElement; x1: number; y1: number; x2: number; y2: number }>;
  tags: Map<string, SVGGElement>;
  badges: SVGGElement[];
  layout: Layout;
};

export const replayOnNewBaseStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const pxSm = parseFloat(fontSizes.sm);
    const pxXs = parseFloat(fontSizes.xs);
    const pxMd = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function changeName(key: string): string {
      const f = CHANGE_LABEL[key];
      if (!f) throw new Error(`replay-on-new-base stage: 변경 ${key} 의 이름(label.${key}) 이 없다`);
      return f(t);
    }

    function commitOf(scene: ReplayOnNewBaseScene, id: string): Commit {
      const found = scene.commits.find((x) => x.id === id);
      if (!found) throw new Error(`replay-on-new-base stage: 없는 커밋 ${id}`);
      return found;
    }

    function captions(scene: ReplayOnNewBaseScene): [string, string | null] {
      const s = scene.step;
      switch (s.kind) {
        case 'start': {
          const onto = scene.names.find((n) => n.name === scene.onto);
          const branch = scene.names.find((n) => n.name === scene.branch);
          if (!onto || !branch) throw new Error('replay-on-new-base stage: onto · branch 이름이 없다');
          return [
            t('caption.start', 'Start · {onto} → {ontoTip} · {branch} → {branchTip}', {
              onto: onto.name,
              ontoTip: onto.commit,
              branch: branch.name,
              branchTip: branch.commit,
            }),
            null,
          ];
        }
        case 'plan':
          return [
            t('caption.plan', 'Only on {branch}, oldest first: {list}', {
              branch: scene.branch,
              list: scene.todo.join(' '),
            }),
            null,
          ];
        case 'replay': {
          const made = commitOf(scene, s.to);
          const old = commitOf(scene, s.from);
          const parentId = made.parents[0];
          if (parentId === undefined) throw new Error(`replay-on-new-base stage: ${s.to} 의 부모가 없다`);
          const parent = commitOf(scene, parentId);
          return [
            t('caption.replay', '{from} → {to} · Parent: {parent} ({parentHash}) · Hash: {oldHash} → {newHash}', {
              from: old.id,
              to: made.id,
              parent: parent.id,
              parentHash: parent.hash,
              oldHash: old.hash,
              newHash: made.hash,
            }),
            null,
          ];
        }
        case 'move': {
          const made = scene.commits.filter((x) => x.origin !== null);
          let same = 0;
          for (const m of made) {
            if (m.origin !== null && commitOf(scene, m.origin).hash === m.hash) same += 1;
          }
          return [
            t('caption.move', 'Label {name}: {from} → {to}', { name: s.name, from: s.from, to: s.to }),
            t('caption.tally', 'New commits: {made} · Same hash as before: {same} · Commits: {total}', {
              made: made.length,
              same,
              total: scene.commits.length,
            }),
          ];
        }
      }
    }

    function drawStatic(scene: ReplayOnNewBaseScene): Handles {
      svg.textContent = '';
      const layout = layoutOf(scene);
      const { cardW, pos } = layout;
      const s = scene.step;
      const replayed = new Set(scene.commits.flatMap((x) => (x.origin === null ? [] : [x.origin])));
      const handles: Handles = { cards: new Map(), arrows: new Map(), tags: new Map(), badges: [], layout };

      // 캡션
      const [cap1, cap2] = captions(scene);
      const t1 = el('text', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, svg);
      fitText(t1, cap1, pxMd, W - 2 * PAD_X);
      if (cap2 !== null) {
        const t2 = el('text', { x: W / 2, y: CAPTION2_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
        fitText(t2, cap2, pxSm, W - 2 * PAD_X);
      }

      // 부모 화살 — 자식에서 부모로
      const arrowLayer = el('g', {}, svg);
      for (const commit of scene.commits) {
        const from = pos.get(commit.id);
        if (!from) throw new Error(`replay-on-new-base stage: 커밋 ${commit.id} 자리가 없다`);
        for (const p of commit.parents) {
          const to = pos.get(p);
          if (!to) throw new Error(`replay-on-new-base stage: ${commit.id} 의 부모 ${p} 자리가 없다`);
          const x1 = from.x;
          const y1 = from.y + CARD_H / 2;
          // 줄이 다르면 부모 카드의 아랫변(또는 윗변)으로 — 사이 카드의 글자를 긋지 않게
          const sameRow = from.top === to.top;
          const x2 = sameRow ? to.x + cardW : to.x + cardW * 0.75;
          const y2 = sameRow ? to.y + CARD_H / 2 : to.top ? to.y + CARD_H : to.y;
          const color = c.textMuted;
          const line = el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 1.5 }, arrowLayer);
          const head = el('polygon', { points: headPoints(x1, y1, x2, y2), fill: color }, arrowLayer);
          handles.arrows.set(commit.id, { line, head, x1, y1, x2, y2 });
        }
      }

      // 커밋 카드
      for (const commit of scene.commits) {
        const p = pos.get(commit.id);
        if (!p) throw new Error(`replay-on-new-base stage: 커밋 ${commit.id} 자리가 없다`);
        const isOld = commit.origin === null && replayed.has(commit.id);
        const isNew = commit.origin !== null;
        const isCurrent = s.kind === 'replay' && s.to === commit.id;
        const isQueued = scene.todo.includes(commit.id) && !replayed.has(commit.id);
        const g = el('g', {}, svg);
        const fill = isCurrent ? c.accent : c.bg;
        const ink = isCurrent ? c.stateInk : isOld ? c.textMuted : c.text;
        const stroke = isCurrent ? c.accent : isNew ? c.primary : isQueued ? c.itemActive : isOld ? c.textMuted : c.border;
        const rect: Record<string, string | number> = {
          x: p.x,
          y: p.y,
          width: cardW,
          height: CARD_H,
          rx: 6,
          fill,
          stroke,
          'stroke-width': isNew || isQueued ? 2 : 1,
        };
        if (isOld || isQueued) rect['stroke-dasharray'] = '4 3';
        el('rect', rect, g);
        const cx = p.x + cardW / 2;
        const letter = el('text', { x: cx, y: p.y + 17, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: ink }, g);
        letter.textContent = commit.id;
        const name = el('text', { x: cx, y: p.y + 33, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: ink }, g);
        fitText(name, changeName(commit.key), pxXs, cardW - 8);
        const hash = el('text', { x: cx, y: p.y + 50, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: isCurrent ? c.stateInk : c.text }, g);
        hash.textContent = commit.hash;
        handles.cards.set(commit.id, { g, hash });

        if (isQueued) {
          const order = scene.todo.indexOf(commit.id) + 1;
          const bg = el('g', {}, svg);
          const bx = p.x + cardW;
          el('circle', { cx: bx, cy: p.y, r: 9, fill: c.itemActive }, bg);
          const bt = el('text', { x: bx, y: p.y + 4, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 700, fill: c.stateInk }, bg);
          bt.textContent = String(order);
          handles.badges.push(bg);
        }
      }

      // 이름표 — 윗줄은 카드 위, 아랫줄은 카드 아래
      const stackCount = new Map<string, number>();
      for (const n of scene.names) {
        const p = pos.get(n.commit);
        if (!p) throw new Error(`replay-on-new-base stage: 이름 ${n.name} 의 커밋 ${n.commit} 자리가 없다`);
        const k = stackCount.get(n.commit) ?? 0;
        stackCount.set(n.commit, k + 1);
        const { x, y } = tagPlace(p, k, layout.cardW, n.name);
        const moving = s.kind === 'move' && s.name === n.name;
        const g = el('g', {}, svg);
        const w = tagWidth(n.name);
        el('rect', { x, y, width: w, height: TAG_H, rx: 4, fill: moving ? c.accent : c.text }, g);
        const tx = el('text', { x: x + w / 2, y: y + 14, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: moving ? c.stateInk : c.textInverse }, g);
        tx.textContent = n.name;
        const stem = p.top ? { y1: y + TAG_H, y2: p.y } : { y1: p.y + CARD_H, y2: y };
        el('line', { x1: x + w / 2, y1: stem.y1, x2: x + w / 2, y2: stem.y2, stroke: moving ? c.accent : c.text, 'stroke-width': 1.5 }, g);
        handles.tags.set(n.name, g);
      }
      return handles;
    }

    function tagWidth(name: string): number {
      return roughWidth(name, pxXs) + 14;
    }

    function tagPlace(p: { x: number; y: number; top: boolean }, k: number, cardW: number, name: string): { x: number; y: number } {
      const x = p.x + (cardW - tagWidth(name)) / 2;
      const y = p.top ? p.y - TAG_GAP - TAG_H - k * (TAG_H + 3) : p.y + CARD_H + TAG_GAP + k * (TAG_H + 3);
      return { x, y };
    }

    function headPoints(x1: number, y1: number, x2: number, y2: number): string {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const size = 7;
      const bx = x2 - ux * size;
      const by = y2 - uy * size;
      const px = -uy * (size * 0.55);
      const py = ux * (size * 0.55);
      const pt = (a: number, b: number): string => `${r2(a)},${r2(b)}`;
      return `${pt(x2, y2)} ${pt(bx + px, by + py)} ${pt(bx - px, by - py)}`;
    }

    function tween(ms: number, alive: () => boolean, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          if (!alive()) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          apply(p);
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

    async function animate(scene: ReplayOnNewBaseScene, h: Handles, alive: () => boolean): Promise<void> {
      const s = scene.step;
      if (s.kind === 'replay') {
        // 사본이 옛 자리에서 떨어져 나와 새 바닥 끝으로 날아가 앉는다
        const card = h.cards.get(s.to);
        const arrow = h.arrows.get(s.to);
        const origin = commitOf(scene, s.from);
        const fromPos = h.layout.pos.get(s.from);
        const toPos = h.layout.pos.get(s.to);
        if (!card || !arrow || !fromPos || !toPos) throw new Error('replay-on-new-base stage: 다시 만든 커밋의 손잡이가 없다');
        const made = commitOf(scene, s.to);
        const dx = fromPos.x - toPos.x;
        const dy = fromPos.y - toPos.y;
        const FLY = 0.62;
        const LINK = 0.85;
        await tween(REPLAY_MS, alive, (p) => {
          const q = ease(Math.min(1, p / FLY));
          card.g.setAttribute('transform', `translate(${r2(dx * (1 - q))},${r2(dy * (1 - q))})`);
          // 앉기 전에는 옛 해시를 싣고 온다 — 부모가 이어져야 새 해시가 셈해진다
          card.hash.textContent = p < LINK ? origin.hash : made.hash;
          if (p < FLY) {
            arrow.line.setAttribute('visibility', 'hidden');
            arrow.head.setAttribute('visibility', 'hidden');
          } else {
            const k = Math.min(1, (p - FLY) / (LINK - FLY));
            const ex = arrow.x1 + (arrow.x2 - arrow.x1) * k;
            const ey = arrow.y1 + (arrow.y2 - arrow.y1) * k;
            arrow.line.removeAttribute('visibility');
            arrow.line.setAttribute('x2', String(r2(ex)));
            arrow.line.setAttribute('y2', String(r2(ey)));
            if (k < 1) arrow.head.setAttribute('visibility', 'hidden');
            else arrow.head.removeAttribute('visibility');
          }
        });
        return;
      }
      if (s.kind === 'move') {
        // 이름표가 옛 끝에서 떼어져 새 끝으로 옮겨 붙는다
        const tag = h.tags.get(s.name);
        const fromPos = h.layout.pos.get(s.from);
        const toPos = h.layout.pos.get(s.to);
        if (!tag || !fromPos || !toPos) throw new Error('replay-on-new-base stage: 옮길 이름표의 손잡이가 없다');
        const a = tagPlace(fromPos, 0, h.layout.cardW, s.name);
        const b = tagPlace(toPos, 0, h.layout.cardW, s.name);
        await tween(MOVE_MS, alive, (p) => {
          const q = ease(p);
          tag.setAttribute('transform', `translate(${r2((a.x - b.x) * (1 - q))},${r2((a.y - b.y) * (1 - q))})`);
        });
        return;
      }
      if (s.kind === 'plan') {
        // 순번 딱지가 카드 위로 내려앉는다
        await tween(PLAN_MS, alive, (p) => {
          const q = ease(p);
          h.badges.forEach((b, i) => {
            const lag = Math.max(0, Math.min(1, q * 1.6 - i * 0.6));
            b.setAttribute('transform', `translate(0,${r2(-14 * (1 - lag))})`);
            if (lag <= 0) b.setAttribute('visibility', 'hidden');
            else b.removeAttribute('visibility');
          });
        });
      }
    }

    return {
      async render(next: ReplayOnNewBaseScene, _prev: ReplayOnNewBaseScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate || next.step.kind === 'start') return;
        const alive = (): boolean => mine === gen && !destroyed;
        await animate(next, h, alive);
        if (alive()) drawStatic(next);
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
