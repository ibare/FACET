/**
 * coin-flip-height stage — 동전이 층을 쌓는 그림.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는
 * 값이라 이 파일이 상수로 갖는다 (S-piece).
 *
 * ── 그림의 뼈대 (동사 "쌓인다" 에서 나왔다)
 *   · 값이 가로로 늘어서고, 값마다 그 위에 동전 자국이 남는다.
 *   · 앞면 하나가 블록 하나를 **아래에서 위로 밀어 올린다**. 층 0 은 밑변
 *     아래에서 올라오고, 위층은 바로 아래 칸에서 솟아 나온다.
 *   · 마지막에 층을 왼쪽으로 **모아** 길이를 견준다. 짧은 층이 끝나는 자리에
 *     점선을 내려 그으면, 그것이 아래 층을 정확히 반으로 가르는지 보인다.
 *
 * 색은 전부 design-tokens 경유다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로 — 캡션 한 줄 + 동전 줄 + 층 넷이 설 자리. */
const STAGE_H = 216;
const CAPTION_Y = 20;
/** 동전 자국이 남는 줄. */
const COIN_CY = 50;
/** 층 0 블록의 아랫변. */
const BASE_Y = 196;
/** 기둥이 서는 자리를 표시하는 밑금. */
const AXIS_Y = 199;
/** 기둥이 자랄 수 있는 세로 — 동전 줄 아래부터 밑변까지. */
const TOWER_H = 128;

const SIDE_MIN = 26;
const COL_MAX_W = 46;
const BLOCK_H = 26;
const LEVEL_GAP = 6;
/** 칸 폭에서 블록이 비워 두는 좌우 틈. */
const BLOCK_INSET = 8;

const COIN_R = 6;
const COIN_GAP = 13;

/**
 * 층 0 블록이 밑에서 밀려 올라오는 거리.
 * 시작 자리의 아랫변이 캔버스 밑변에 딱 맞아, 잘리지 않고 솟아오른다.
 */
const RISE_FROM_BELOW = 20;

const BASE_MS = 260;
const RISE_MS = 150;
const PACK_MS = 560;
const GUIDE_MS = 420;
const GUIDE_STAGGER_MS = 160;

type Scene = { valueCount: number; maxLevels: number };

/**
 * `initialData` 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이기 때문이다 (S-piece).
 */
function readScene(initialData: ViewMountParams['initialData']): Scene {
  const d = (initialData ?? {}) as Record<string, unknown>;
  const values = Array.isArray(d.values)
    ? (d.values as unknown[]).filter((v): v is number => typeof v === 'number')
    : [];
  const maxLevels = typeof d.maxLevels === 'number' ? d.maxLevels : 4;
  return { valueCount: values.length, maxLevels };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const ease = (p: number): number => 1 - (1 - p) ** 3;
const round = (n: number): number => Math.round(n * 100) / 100;
const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

type Coin = { node: SVGGElement; disc: SVGCircleElement; x: number; head: boolean };
type Block = { node: SVGGElement; col: number; level: number };

export const coinFlipHeightStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const scene = readScene(params.initialData);
    const colCount = Math.max(1, scene.valueCount);

    // 그 폭을 채운다 — 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const colW = Math.min(
      COL_MAX_W,
      Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / colCount),
    );
    const blockW = Math.max(12, colW - BLOCK_INSET);
    const originX = Math.round((PIECE_CANVAS_W - colCount * colW) / 2);

    // 층의 상한만큼 자리를 미리 잡아 둔다. 세로는 마운트한 뒤 바뀌지 않으므로
    // 넘칠 때는 높이가 아니라 층 간격을 줄인다 (S-view).
    const slots = Math.max(1, Math.min(6, scene.maxLevels));
    const pitch = Math.min(BLOCK_H + LEVEL_GAP, Math.floor(TOWER_H / slots));

    const colX = (col: number): number =>
      Math.round(originX + col * colW + (colW - blockW) / 2);
    const levelTop = (level: number): number => BASE_Y - level * pitch - BLOCK_H;
    /** 층 L 의 칸이 slot 개 놓였을 때 그 줄이 끝나는 x. */
    const rowEndX = (count: number): number => originX + count * colW;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function animate(duration: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 층위. 밑금 → 블록 → 점선 → 셈 → 동전 → 캡션.
    const gAxis = el('g', {});
    const gBlocks = el('g', {});
    const gGuides = el('g', {});
    const gCounts = el('g', {});
    const gCoins = el('g', {});
    const gLevels = el('g', {});
    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.append(gAxis, gLevels, gBlocks, gGuides, gCounts, gCoins, caption);

    // 기둥이 설 자리를 미리 그어 둔다 — 올라올 곳이 보여야 올라오는 것이 보인다.
    for (let i = 0; i < colCount; i += 1) {
      gAxis.appendChild(
        el('line', {
          x1: colX(i),
          y1: AXIS_Y,
          x2: colX(i) + blockW,
          y2: AXIS_Y,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
    }

    const blocks: Block[] = [];
    const levelLabels = new Map<number, SVGTextElement>();
    let lastCounts: number[] = [];

    function setXY(node: SVGGElement, x: number, y: number): void {
      node.setAttribute('transform', `translate(${round(x)} ${round(y)})`);
    }

    /** 층이 처음 생길 때 왼쪽 여백에 그 층의 번호를 놓는다. */
    function ensureLevelLabel(level: number): void {
      if (levelLabels.has(level)) return;
      const label = el('text', {
        x: originX - 10,
        y: levelTop(level) + BLOCK_H / 2 + 4,
        'text-anchor': 'end',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      label.textContent = String(level);
      gLevels.appendChild(label);
      levelLabels.set(level, label);
    }

    function buildBlock(value: number, level: number): SVGGElement {
      const g = el('g', {});
      // 위층 블록은 동전의 앞면이 올려 준 것이다 — 동전의 앞면과 같은 색을 쓴다.
      const promoted = level > 0;
      g.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: blockW,
          height: BLOCK_H,
          rx: 4,
          fill: promoted ? c.accent : c.itemDefault,
          stroke: promoted ? c.accent : c.border,
          'stroke-width': 1.5,
        }),
      );
      const label = el('text', {
        x: blockW / 2,
        y: BLOCK_H / 2 + 4,
        'text-anchor': 'middle',
        fill: promoted ? c.stateInk : c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      label.textContent = String(value);
      g.appendChild(label);
      return g;
    }

    function buildCoins(col: number, faces: string[]): Coin[] {
      const n = faces.length;
      const center = originX + col * colW + colW / 2;
      const first = center - ((n - 1) * COIN_GAP) / 2;
      const out: Coin[] = [];
      for (let i = 0; i < n; i += 1) {
        const x = first + i * COIN_GAP;
        const node = el('g', { transform: `translate(${round(x)} ${COIN_CY})`, opacity: 0 });
        const disc = el('circle', {
          cx: 0,
          cy: 0,
          r: COIN_R,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        node.appendChild(disc);
        gCoins.appendChild(node);
        out.push({ node, disc, x, head: faces[i] === 'H' });
      }
      return out;
    }

    /** 동전이 돈다 — 납작해졌다 펴지는 것이 뒤집히는 몸짓이다. */
    function spinCoins(coins: Coin[], p: number): void {
      const n = coins.length;
      for (let i = 0; i < n; i += 1) {
        const coin = coins[i];
        const from = n <= 1 ? 0 : (i / n) * 0.55;
        const q = clamp01((p - from) / 0.45);
        coin.node.setAttribute('opacity', q > 0 ? '1' : '0');
        const flat = q >= 1 ? 1 : Math.max(0.08, Math.abs(Math.cos(q * Math.PI * 3)));
        coin.node.setAttribute(
          'transform',
          `translate(${round(coin.x)} ${COIN_CY}) scale(${round(flat)} 1)`,
        );
        const head = q >= 1 ? coin.head : Math.floor(q * 3) % 2 === 0;
        coin.disc.setAttribute('fill', head ? c.accent : c.bg);
      }
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 projector 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 값 하나가 들어와 동전을 던지고, 나온 앞면 수만큼 블록이 밀려 올라간다. */
      async stackTower(row: {
        index: number;
        value: number;
        flips: string[];
        height: number;
      }): Promise<void> {
        if (destroyed) return;
        const col = row.index;
        if (col < 0 || col >= colCount) return;
        const height = Math.max(1, Math.min(slots, row.height));

        const coins = buildCoins(col, row.flips);

        const rising: Array<{ node: SVGGElement; fromY: number; toY: number }> = [];
        for (let level = 0; level < height; level += 1) {
          const node = buildBlock(row.value, level);
          const toY = levelTop(level);
          // 층 0 은 밑변 아래에서, 위층은 바로 아래 칸에서 솟는다.
          const fromY = level === 0 ? toY + RISE_FROM_BELOW : levelTop(level - 1);
          setXY(node, colX(col), fromY);
          gBlocks.appendChild(node);
          blocks.push({ node, col, level });
          rising.push({ node, fromY, toY });
          ensureLevelLabel(level);
        }

        const total = BASE_MS + RISE_MS * (height - 1);
        await animate(total, (p) => {
          const ms = p * total;
          spinCoins(coins, clamp01(ms / BASE_MS));
          for (let level = 0; level < height; level += 1) {
            const from = level === 0 ? 0 : BASE_MS + RISE_MS * (level - 1);
            const span = level === 0 ? BASE_MS : RISE_MS;
            const q = ease(clamp01((ms - from) / span));
            const b = rising[level];
            setXY(b.node, colX(col), b.fromY + (b.toY - b.fromY) * q);
          }
        });
      },

      /** 층마다 왼쪽으로 모은다 — 길이를 견주려면 시작이 같아야 한다. */
      async packLevels(counts: number[]): Promise<void> {
        if (destroyed) return;
        lastCounts = counts;

        const byLevel = new Map<number, Block[]>();
        for (const b of blocks) {
          const list = byLevel.get(b.level) ?? [];
          list.push(b);
          byLevel.set(b.level, list);
        }

        const moves: Array<{ node: SVGGElement; fromX: number; toX: number; y: number }> = [];
        for (const [level, list] of byLevel) {
          list.sort((a, b) => a.col - b.col);
          list.forEach((b, slot) => {
            moves.push({
              node: b.node,
              fromX: colX(b.col),
              toX: colX(slot),
              y: levelTop(level),
            });
          });
        }

        // 잰 값은 재는 자리에 남긴다 — 줄이 끝나는 바로 그 자리에 놓는다 (S-piece).
        const tallies = counts.map((n, level) => {
          const label = el('text', {
            x: rowEndX(n) + 8,
            y: levelTop(level) + BLOCK_H / 2 + 4,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            opacity: 0,
          });
          label.textContent = String(n);
          gCounts.appendChild(label);
          return { label, x: rowEndX(n) + 8 };
        });

        await animate(PACK_MS, (p) => {
          const q = ease(p);
          for (const m of moves) {
            m.node.setAttribute(
              'transform',
              `translate(${round(m.fromX + (m.toX - m.fromX) * q)} ${round(m.y)})`,
            );
          }
          const tail = clamp01((p - 0.72) / 0.28);
          for (const t of tallies) {
            t.label.setAttribute('opacity', String(round(tail)));
            t.label.setAttribute('x', String(round(t.x + 10 * (1 - tail))));
          }
        });
      },

      /**
       * 짧은 층이 끝나는 자리에서 아래로 점선을 긋는다. 그것이 아래 층을 반으로
       * 가르면 층마다 절반이 남았다는 뜻이다 — 셈이 아니라 자리가 말한다.
       */
      async markHalves(): Promise<void> {
        if (destroyed || lastCounts.length < 2) return;

        const guides: Array<{ line: SVGLineElement; y1: number; y2: number }> = [];
        for (let level = 0; level + 1 < lastCounts.length; level += 1) {
          const x = rowEndX(lastCounts[level + 1]);
          const y1 = levelTop(level + 1);
          const y2 = BASE_Y - level * pitch;
          const line = el('line', {
            x1: x,
            y1,
            x2: x,
            y2: y1,
            stroke: c.auxCursor,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          });
          gGuides.appendChild(line);
          guides.push({ line, y1, y2 });
        }

        const total = GUIDE_MS + GUIDE_STAGGER_MS * Math.max(0, guides.length - 1);
        await animate(total, (p) => {
          const ms = p * total;
          guides.forEach((g, i) => {
            const q = ease(clamp01((ms - i * GUIDE_STAGGER_MS) / GUIDE_MS));
            g.line.setAttribute('y2', String(round(g.y1 + (g.y2 - g.y1) * q)));
          });
        });
      },

      /** 되감는다. 다음 걸음이 곧바로 첫 기둥을 세운다. */
      rewind(): void {
        gBlocks.textContent = '';
        gCoins.textContent = '';
        gCounts.textContent = '';
        gGuides.textContent = '';
        gLevels.textContent = '';
        blocks.length = 0;
        levelLabels.clear();
        lastCounts = [];
      },
    };
  },
};
