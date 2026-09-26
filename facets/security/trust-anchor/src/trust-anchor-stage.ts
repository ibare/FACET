/**
 * trust-anchor 무대.
 *
 * 위에 신뢰 저장소(연결 전부터 있던 항목), 아래에 이름이 같은 뿌리 인증서 둘이 나란히 선다.
 *  - 제 서명 걸음: 인증서의 서명 값이 카드에서 내려와 "제 열쇠로 푼 값" 자리에 앉는다.
 *    두 카드는 같은 높이에 같은 표를 달고 남는다 — 가르지 못한다.
 *  - 저장소 걸음: 저장소 항목의 열쇠가 카드로 내려와 견줌 자리에 앉고, 카드가 갈라진다 —
 *    같으면 저장소 쪽으로 올라가 줄에 매이고, 다르면 아래로 가라앉는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { RootId } from './algorithm.js';
import type { RootKey, TrustAnchorScene } from './scene.js';

const H = 424;
const SVG = 'http://www.w3.org/2000/svg';

const MOVE_MS = 380;
const JUDGE_MS = 400;

type Point = { x: number; y: number };

type CardHandle = {
  group: SVGGElement;
  dy: number;
  sig: Point;
  recoveredLine: SVGTextElement | null;
  verifyParts: SVGElement[];
  compare: Point;
  verdictParts: SVGElement[];
  tether: SVGLineElement | null;
};

type Handles = {
  cards: Map<RootId, CardHandle>;
  storeEntry: Map<string, Point>;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const trustAnchorStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    // 크기는 캔버스에서 역산한다
    const PAD = Math.round(W * 0.04);
    const GAP = Math.round(W * 0.065);
    const CARD_W = (W - 2 * PAD - GAP) / 2;
    const STORE_W = Math.min(340, W - 2 * PAD);
    const STORE_X = (W - STORE_W) / 2;
    const STORE_Y = 12;
    const STORE_ROW = 22;
    const CARD_Y = 120;
    const CARD_H = 96;
    const INSET = 14;
    const RISE = -10;
    const SINK = 28;
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
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      content: string,
      style: { size: string; mono?: boolean; fill: string; anchor?: string; weight?: number },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': style.mono ? fonts.mono : fonts.body,
          'font-size': style.size,
          fill: style.fill,
          'text-anchor': style.anchor ?? 'start',
          'font-weight': style.weight ?? 400,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    /** 글자 폭 어림 — 뱃지 테두리의 길이에만 쓴다 */
    function approxWidth(content: string, px: number): number {
      let w = 0;
      for (const ch of content) w += ch.charCodeAt(0) > 0x2e80 ? px : px * 0.6;
      return w;
    }

    function badge(
      parent: Element,
      x: number,
      yTop: number,
      label: string,
      look: { fill: string; stroke: string; ink: string; dash?: string },
    ): SVGElement[] {
      const w = approxWidth(label, XS) + 20;
      const box = el(
        'rect',
        {
          x,
          y: yTop,
          width: w,
          height: 20,
          rx: 10,
          fill: look.fill,
          stroke: look.stroke,
          'stroke-width': 1.5,
          ...(look.dash ? { 'stroke-dasharray': look.dash } : {}),
        },
        parent,
      );
      const word = write(parent, x + w / 2, yTop + 14, label, {
        size: fontSizes.xs,
        fill: look.ink,
        anchor: 'middle',
        weight: 600,
      });
      return [box, word];
    }

    function roleLabel(id: RootId): string {
      switch (id) {
        case 'genuine':
          return t('label.genuine', 'Genuine root');
        case 'fake':
          return t('label.fake', 'Fake root');
      }
    }

    function columnX(index: number): number {
      if (index > 1) throw new Error(`trust-anchor-stage: 칸은 둘이다 (index ${index})`);
      return PAD + index * (CARD_W + GAP);
    }

    function keyOf(scene: TrustAnchorScene, id: RootId): RootKey {
      const base = scene.base;
      if (!base) throw new Error('trust-anchor-stage: 바탕이 없다');
      const key = base.keys.find((k) => k.id === id);
      if (!key) throw new Error(`trust-anchor-stage: 열쇠가 없는 뿌리 ${id}`);
      return key;
    }

    function drawStatic(scene: TrustAnchorScene): Handles {
      svg.textContent = '';
      const handles: Handles = { cards: new Map(), storeEntry: new Map() };
      const base = scene.base;
      if (!base) return handles;

      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);

      // ── 신뢰 저장소 ──
      const storeH = 30 + base.store.length * STORE_ROW;
      el(
        'rect',
        {
          x: STORE_X,
          y: STORE_Y,
          width: STORE_W,
          height: storeH,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.text,
          'stroke-width': 1.5,
        },
        svg,
      );
      write(svg, STORE_X + INSET, STORE_Y + 19, t('label.store', 'Trust store'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        weight: 600,
      });
      base.store.forEach((entry, i) => {
        const y = STORE_Y + 42 + i * STORE_ROW;
        write(
          svg,
          W / 2,
          y,
          t('store.entry', '{name} · n {n} · e {e}', { name: entry.subject, n: entry.n, e: entry.e }),
          { size: fontSizes.sm, mono: true, fill: colors.text, anchor: 'middle', weight: 600 },
        );
        handles.storeEntry.set(`${entry.n}|${entry.e}`, { x: W / 2, y });
      });
      const storeBottom = STORE_Y + storeH;

      // ── 건너온 뿌리 ──
      const current = scene.step.kind === 'start' ? null : scene.step.root;
      scene.cards.forEach((card, index) => {
        const x = columnX(index);
        const key = keyOf(scene, card.id);
        const check = scene.checks.find((c) => c.root === card.id) ?? null;
        const verdict = scene.verdicts.find((v) => v.root === card.id) ?? null;
        const dy = verdict === null ? 0 : verdict.trusted ? RISE : SINK;
        const rejected = verdict !== null && !verdict.trusted;
        const ink = rejected ? colors.textMuted : colors.text;

        // 믿은 뿌리는 저장소에 줄로 매인다
        let tether: SVGLineElement | null = null;
        if (verdict?.trusted) {
          tether = el(
            'line',
            {
              x1: x + CARD_W / 2,
              y1: storeBottom,
              x2: x + CARD_W / 2,
              y2: CARD_Y + dy,
              stroke: colors.accent,
              'stroke-width': 3,
            },
            svg,
          );
        }

        const group = el('g', { transform: `translate(0 ${dy})` }, svg);
        write(group, x, CARD_Y - 8, roleLabel(card.id), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          weight: 600,
        });
        const stroke = verdict
          ? verdict.trusted
            ? colors.accent
            : colors.danger
          : current === card.id
            ? colors.itemActive
            : colors.border;
        el(
          'rect',
          {
            x,
            y: CARD_Y,
            width: CARD_W,
            height: CARD_H,
            rx: 6,
            fill: colors.bg,
            stroke,
            'stroke-width': verdict || current === card.id ? 2.5 : 1.5,
            ...(rejected ? { 'stroke-dasharray': '6 4' } : {}),
          },
          group,
        );
        const lx = x + INSET;
        write(group, lx, CARD_Y + 22, t('field.subject', 'Subject: {v}', { v: card.subject }), {
          size: fontSizes.sm,
          mono: true,
          fill: ink,
        });
        write(group, lx, CARD_Y + 42, t('field.issuer', 'Issuer: {v}', { v: card.issuer }), {
          size: fontSizes.sm,
          mono: true,
          fill: ink,
        });
        write(group, lx, CARD_Y + 64, t('field.key', 'Key: n {n} · e {e}', { n: key.n, e: key.e }), {
          size: fontSizes.sm,
          mono: true,
          fill: ink,
          weight: 600,
        });
        write(group, lx, CARD_Y + 86, t('field.sig', 'Self-signature: {v}', { v: key.sig }), {
          size: fontSizes.sm,
          mono: true,
          fill: ink,
        });

        // 제 서명을 제 열쇠로 푼 자리
        const verifyParts: SVGElement[] = [];
        let recoveredLine: SVGTextElement | null = null;
        const vy = CARD_Y + CARD_H + 24;
        if (check) {
          verifyParts.push(
            write(group, lx, vy, t('verify.digest', 'Digest of name and key: {v}', { v: check.digest }), {
              size: fontSizes.sm,
              fill: ink,
            }),
            write(group, lx, vy + 20, t('verify.unseal', 'Unsealed with its own key:'), {
              size: fontSizes.sm,
              fill: ink,
            }),
          );
          recoveredLine = write(
            group,
            lx,
            vy + 38,
            t('verify.formula', '{s}^{e} mod {n} = {v}', {
              s: key.sig,
              e: key.e,
              n: key.n,
              v: check.recovered,
            }),
            { size: fontSizes.sm, mono: true, fill: ink, weight: 600 },
          );
          verifyParts.push(
            ...badge(
              group,
              x + CARD_W - INSET - (approxWidth(t('verify.holds', 'Holds'), XS) + 20),
              vy + 24,
              check.holds ? t('verify.holds', 'Holds') : t('verify.fails', 'Fails'),
              check.holds
                ? { fill: colors.bg, stroke: colors.text, ink: colors.text }
                : { fill: colors.bg, stroke: colors.danger, ink: colors.danger },
            ),
          );
        }

        // 저장소와 견준 자리
        const verdictParts: SVGElement[] = [];
        const cy = vy + 68;
        const compare: Point = { x: lx, y: cy };
        if (verdict) {
          verdictParts.push(
            write(
              group,
              lx,
              cy,
              t('verdict.compare', 'Store ({sn}, {se}) {op} this ({n}, {e})', {
                sn: verdict.storeN,
                se: verdict.storeE,
                op: verdict.trusted ? '=' : '≠',
                n: key.n,
                e: key.e,
              }),
              { size: fontSizes.sm, fill: verdict.trusted ? colors.text : colors.danger, weight: 600 },
            ),
            ...badge(
              group,
              lx,
              cy + 10,
              verdict.trusted ? t('verdict.trusted', 'Trusted') : t('verdict.rejected', 'Not trusted'),
              verdict.trusted
                ? { fill: colors.accent, stroke: colors.accent, ink: colors.stateInk }
                : { fill: colors.bg, stroke: colors.danger, ink: colors.danger, dash: '4 3' },
            ),
          );
        }

        handles.cards.set(card.id, {
          group,
          dy,
          sig: { x: lx + approxWidth(t('field.sig', 'Self-signature: {v}', { v: '' }), SM), y: CARD_Y + 86 },
          recoveredLine,
          verifyParts,
          compare,
          verdictParts,
          tether,
        });
      });

      // ── 계기 — 제 서명이 맞은 뿌리 · 믿은 뿌리 ──
      const held = scene.checks.filter((c) => c.holds).length;
      const trusted = scene.verdicts.filter((v) => v.trusted).length;
      const counterY = H - 32;
      write(svg, W / 2 - 14, counterY, t('count.held', 'Self-signatures that held: {h}', { h: held }), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'end',
        weight: 600,
      });
      write(svg, W / 2, counterY, '·', { size: fontSizes.sm, fill: colors.textMuted, anchor: 'middle' });
      write(svg, W / 2 + 14, counterY, t('count.trusted', 'Trusted roots: {k}', { k: trusted }), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'start',
        weight: 600,
      });

      // ── 캡션 — 지금 일어나는 일 ──
      write(svg, W / 2, H - 10, caption(scene), { size: fontSizes.sm, fill: colors.text, anchor: 'middle' });
      return handles;
    }

    function caption(scene: TrustAnchorScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start': {
          const first = scene.cards[0];
          if (!first) throw new Error('trust-anchor-stage: 건너온 뿌리가 없다');
          return t('caption.start', 'Arrived roots: {r}, all named {name}. The store was filled before this connection.', {
            r: scene.cards.length,
            name: first.subject,
          });
        }
        case 'selfSig': {
          const check = scene.checks.find((c) => c.root === step.root);
          if (!check) throw new Error(`trust-anchor-stage: 제 서명을 푼 결과가 없는 뿌리 ${step.root}`);
          const key = keyOf(scene, step.root);
          const vars = {
            role: roleLabel(step.root),
            s: key.sig,
            e: key.e,
            n: key.n,
            v: check.recovered,
            d: check.digest,
          };
          return check.holds
            ? t('caption.selfSigHolds', '{role}, own key: {s}^{e} mod {n} = {v} = digest {d}.', vars)
            : t('caption.selfSigFails', '{role}, own key: {s}^{e} mod {n} = {v} ≠ digest {d}.', vars);
        }
        case 'storeCheck': {
          const verdict = scene.verdicts.find((v) => v.root === step.root);
          if (!verdict) throw new Error(`trust-anchor-stage: 판정이 없는 뿌리 ${step.root}`);
          return verdict.trusted
            ? t('caption.trusted', '{role}: found by name in the store; the keys match.', {
                role: roleLabel(step.root),
              })
            : t('caption.rejected', '{role}: found by name in the store; the keys differ.', {
                role: roleLabel(step.root),
              });
        }
      }
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            wake();
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

    function cardHandle(handles: Handles, id: RootId): CardHandle {
      const h = handles.cards.get(id);
      if (!h) throw new Error(`trust-anchor-stage: 카드 손잡이가 없다 ${id}`);
      return h;
    }

    /** 서명 값이 카드에서 내려와 "제 열쇠로 푼 값" 자리에 앉는다 */
    async function moveSignature(mine: number, scene: TrustAnchorScene, handles: Handles, id: RootId): Promise<void> {
      const card = cardHandle(handles, id);
      const line = card.recoveredLine;
      if (!line) throw new Error(`trust-anchor-stage: 푼 값 자리가 없다 ${id}`);
      const key = keyOf(scene, id);
      for (const part of card.verifyParts) part.setAttribute('opacity', '0');
      line.setAttribute('opacity', '0');
      const from: Point = { x: card.sig.x, y: card.sig.y + card.dy };
      const to: Point = { x: Number(line.getAttribute('x')), y: Number(line.getAttribute('y')) + card.dy };
      const chip = write(svg, from.x, from.y, String(key.sig), {
        size: fontSizes.sm,
        mono: true,
        fill: colors.itemActive,
        weight: 700,
      });
      await tween(mine, MOVE_MS, (p) => {
        chip.setAttribute('x', String(round(from.x + (to.x - from.x) * p)));
        chip.setAttribute('y', String(round(from.y + (to.y - from.y) * p)));
      });
    }

    /** 저장소 열쇠가 카드로 내려와 견줌 자리에 앉고, 카드가 제 자리로 갈라진다 */
    async function judge(mine: number, scene: TrustAnchorScene, handles: Handles, id: RootId): Promise<void> {
      const card = cardHandle(handles, id);
      const verdict = scene.verdicts.find((v) => v.root === id);
      if (!verdict) throw new Error(`trust-anchor-stage: 판정이 없는 뿌리 ${id}`);
      const from = handles.storeEntry.get(`${verdict.storeN}|${verdict.storeE}`);
      if (!from) throw new Error(`trust-anchor-stage: 저장소 항목 자리가 없다 (${verdict.storeN}, ${verdict.storeE})`);
      for (const part of card.verdictParts) part.setAttribute('opacity', '0');
      if (card.tether) card.tether.setAttribute('opacity', '0');
      card.group.setAttribute('transform', 'translate(0 0)');
      const chipText = `(${verdict.storeN}, ${verdict.storeE})`;
      const chip = write(svg, from.x, from.y, chipText, {
        size: fontSizes.sm,
        mono: true,
        fill: colors.itemActive,
        weight: 700,
        anchor: 'middle',
      });
      const to: Point = { x: card.compare.x + approxWidth(chipText, SM) / 2, y: card.compare.y };
      const SPLIT = 0.55;
      await tween(mine, JUDGE_MS, (p) => {
        if (p < SPLIT) {
          const q = p / SPLIT;
          chip.setAttribute('x', String(round(from.x + (to.x - from.x) * q)));
          chip.setAttribute('y', String(round(from.y + (to.y - from.y) * q)));
          return;
        }
        chip.setAttribute('opacity', '0');
        for (const part of card.verdictParts) part.removeAttribute('opacity');
        const q = (p - SPLIT) / (1 - SPLIT);
        card.group.setAttribute('transform', `translate(0 ${round(card.dy * q)})`);
      });
    }

    return {
      async render(next: TrustAnchorScene, prev: TrustAnchorScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || prev === null || destroyed) return;
        const step = next.step;
        if (step.kind === 'selfSig') await moveSignature(mine, next, handles, step.root);
        else if (step.kind === 'storeCheck') await judge(mine, next, handles, step.root);
        else return;
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
