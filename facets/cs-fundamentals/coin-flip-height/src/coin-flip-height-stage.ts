/**
 * coin-flip-height stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
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
 * ── 화면에 뜨는 수는 모두 `towers` 에서 나온다
 *
 * 기둥의 높이도, 층 옆의 셈도, 캡션의 `{heads}` · `{height}` 도 전부 장면이 쥔
 * 던진 자취에서 **센다.** payload 의 `height` · `heads` · `counts` 는 장면이 이미
 * 버렸으므로 여기 올 길이 없다 (`scene.ts` 의 "수는 한 출처에서만").
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * "층을 모았나" 는 블록의 `transform` 이 왼쪽으로 옮겨진 것이 전부였다. 이제
 * `scene.phase` 가 말하므로 **정적 그리기가 곧바로 모은 자리에 세운다** — 되짚어
 * 그 걸음에 가도 층이 모여 있다. 층별 셈(`lastCounts`) 과 층 번호 딱지의 유무도
 * 마찬가지로 장면에서 파생된다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 블록은 이미 끝 자리에 서 있다. 걸음은 **아직 못 온
 * 만큼을 뒤로 물려 두었다가** 놓아 준다. 운동이 끝나면 장면을 통째로 다시
 * 세운다 — 보간이 남긴 `transform` 끝자리와 `opacity` 가 노드째 사라지므로
 * 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
 *
 * 색은 전부 design-tokens 경유다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  heightOf,
  levelCountsOf,
  MAX_LEVEL_CAP,
  type CoinFlipHeightScene,
  type CoinFlipHeightStep,
  type CoinToss,
} from './scene.js';

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

/** 층별 셈 딱지가 줄 끝에서 물러나 있는 거리. */
const TALLY_GAP = 8;
const TALLY_SLIDE = 10;

/**
 * 칸의 개수만 초기 선언에서 읽는다 — 칸 폭을 캔버스에서 역산하려면 마운트 시점에
 * 몇 칸이 설지 알아야 하기 때문이다. **값 자체는 읽지 않는다.** 값은 걸음이
 * 실어 오고 장면이 쥔다.
 *
 * 층의 상한은 여기서 읽지 않는다 — 그것은 장면의 `maxLevels` 하나가 쥐고, 층의
 * 세로 간격도 그 수에서 나온다. 두 자리에서 읽으면 층 옆의 셈과 실제로 그려진
 * 블록이 갈릴 자리가 생긴다.
 */
function readColumnCount(initialData: ViewMountParams['initialData']): number {
  const d = (initialData ?? {}) as Record<string, unknown>;
  const values = Array.isArray(d.values)
    ? (d.values as unknown[]).filter((v): v is number => typeof v === 'number')
    : [];
  return Math.max(1, values.length);
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

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type DrawnCoin = { node: SVGGElement; disc: SVGCircleElement; x: number; head: boolean };
type DrawnBlock = {
  node: SVGGElement;
  col: number;
  level: number;
  /** 모으기 전의 x — 제 칸 자리. */
  restX: number;
  /** 모은 뒤의 x — 그 층에서 몇 번째냐가 정한다. */
  packX: number;
  y: number;
};
type DrawnTally = { label: SVGTextElement; x: number };
type DrawnGuide = { line: SVGLineElement; y1: number; y2: number };
type Drawn = {
  blocks: DrawnBlock[];
  /** 기둥마다의 동전 줄. 인덱스가 곧 칸 번호다. */
  coins: DrawnCoin[][];
  tallies: DrawnTally[];
  guides: DrawnGuide[];
  pitch: number;
};

export const coinFlipHeightStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CoinFlipHeightScene> {
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colCount = readColumnCount(params.initialData);

    // 그 폭을 채운다 — 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const colW = Math.min(
      COL_MAX_W,
      Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / colCount),
    );
    const blockW = Math.max(12, colW - BLOCK_INSET);
    const originX = Math.round((PIECE_CANVAS_W - colCount * colW) / 2);

    const colX = (col: number): number =>
      Math.round(originX + col * colW + (colW - blockW) / 2);
    /** 층 L 의 칸이 count 개 놓였을 때 그 줄이 끝나는 x. */
    const rowEndX = (count: number): number => originX + count * colW;

    /**
     * 층의 세로 간격. **장면의 `maxLevels` 가 정한다.**
     *
     * 세로는 마운트한 뒤 바뀌지 않으므로 넘칠 때는 높이가 아니라 층 간격을
     * 줄인다 (S-view).
     */
    const pitchFor = (maxLevels: number): number => {
      const slots = Math.max(1, Math.min(MAX_LEVEL_CAP, maxLevels));
      return Math.min(BLOCK_H + LEVEL_GAP, Math.floor(TOWER_H / slots));
    };
    const levelTop = (level: number, pitch: number): number =>
      BASE_Y - level * pitch - BLOCK_H;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은
     * 프레임이 **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function animate(
      duration: number,
      mine: number,
      draw: (p: number) => void,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을
          // 덮는 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
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

    // ── 층위. 밑금 → 층 번호 → 블록 → 점선 → 셈 → 동전 → 캡션.
    const gAxis = el('g', {});
    const gLevels = el('g', {});
    const gBlocks = el('g', {});
    const gGuides = el('g', {});
    const gCounts = el('g', {});
    const gCoins = el('g', {});
    /**
     * 캡션은 재건 밖에 있다 — 한 번 만들고 계속 쓴다. 그래서 정적 경로가 **매
     * 걸음 명시로** 써 준다 (빈 문자열까지). 빠뜨리면 되짚은 화면에 앞 걸음의
     * 문장이 남는다 (S-scene).
     */
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
    // 장면과 무관한 바탕이라 마운트 때 한 번 긋고 다시 손대지 않는다.
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

    function setXY(node: SVGGElement, x: number, y: number): void {
      node.setAttribute('transform', `translate(${round(x)} ${round(y)})`);
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

    /**
     * 던진 자국을 남긴다. **끝난 자리에 세운다** — 정적 그리기가 정본이므로
     * 여기서 숨기지 않는다. 방금 던진 기둥만 걸음 함수가 뒤로 물린다.
     */
    function buildCoins(col: number, faces: readonly CoinToss[]): DrawnCoin[] {
      const n = faces.length;
      const center = originX + col * colW + colW / 2;
      const first = center - ((n - 1) * COIN_GAP) / 2;
      const out: DrawnCoin[] = [];
      for (let i = 0; i < n; i += 1) {
        const x = first + i * COIN_GAP;
        const head = faces[i] === 'H';
        const node = el('g', { transform: `translate(${round(x)} ${COIN_CY})` });
        const disc = el('circle', {
          cx: 0,
          cy: 0,
          r: COIN_R,
          fill: head ? c.accent : c.bg,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        node.appendChild(disc);
        gCoins.appendChild(node);
        out.push({ node, disc, x, head });
      }
      return out;
    }

    /** 동전이 돈다 — 납작해졌다 펴지는 것이 뒤집히는 몸짓이다. */
    function spinCoins(coins: DrawnCoin[], p: number): void {
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

    /**
     * 캡션이 말할 것.
     *
     * 캡션을 장면에 필드로 두지 않는다 — `towers` 와 `phase` 가 이미 무엇을 말할지
     * 정하므로, 따로 두면 캡션의 수가 층 옆의 셈과 갈릴 또 하나의 출처가 생긴다.
     * `{heads}` 는 층으로 이어진 앞면 수라 `높이 − 1` 이다.
     */
    function captionFor(scene: CoinFlipHeightScene): string {
      if (scene.towers.length === 0) return '';
      if (scene.phase === 'halved') {
        return t('caption.done', 'Nobody balanced the shape. The coin did.');
      }
      if (scene.phase === 'packed') {
        return t('caption.pack', 'Line the levels up. Each level keeps about half.');
      }
      const last = scene.towers[scene.towers.length - 1];
      const height = heightOf(last.flips, scene.maxLevels);
      return t('caption.stack', 'Heads: {heads}. Tails stops it. Height: {height}.', {
        heads: height - 1,
        height,
      });
    }

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gLevels, gBlocks, gGuides, gCounts, gCoins]) g.textContent = '';
      caption.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: CoinFlipHeightScene): Drawn {
      rewind();

      const pitch = pitchFor(scene.maxLevels);
      const counts = levelCountsOf(scene);
      const packed = scene.phase !== 'stacking';

      // 층 번호는 놓인 층만큼 선다. 몇 층이 놓였나는 층별 셈의 길이가 말한다.
      for (let level = 0; level < counts.length; level += 1) {
        const label = el('text', {
          x: originX - 10,
          y: levelTop(level, pitch) + BLOCK_H / 2 + 4,
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = String(level);
        gLevels.appendChild(label);
      }

      // 모은 자리는 "그 층에서 몇 번째냐" 가 정한다. 칸 번호 순으로 세면 된다.
      const filled: number[] = counts.map(() => 0);
      const blocks: DrawnBlock[] = [];
      const coins: DrawnCoin[][] = [];

      for (let col = 0; col < scene.towers.length; col += 1) {
        const tower = scene.towers[col];
        const height = heightOf(tower.flips, scene.maxLevels);
        for (let level = 0; level < height; level += 1) {
          const slot = filled[level];
          filled[level] += 1;
          const restX = colX(col);
          const packX = colX(slot);
          const y = levelTop(level, pitch);
          const node = buildBlock(tower.value, level);
          setXY(node, packed ? packX : restX, y);
          gBlocks.appendChild(node);
          blocks.push({ node, col, level, restX, packX, y });
        }
        coins.push(buildCoins(col, tower.flips));
      }

      // 잰 값은 재는 자리에 남긴다 — 줄이 끝나는 바로 그 자리에 놓는다 (S-piece).
      const tallies: DrawnTally[] = [];
      if (packed) {
        for (let level = 0; level < counts.length; level += 1) {
          const x = rowEndX(counts[level]) + TALLY_GAP;
          const label = el('text', {
            x,
            y: levelTop(level, pitch) + BLOCK_H / 2 + 4,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          label.textContent = String(counts[level]);
          gCounts.appendChild(label);
          tallies.push({ label, x });
        }
      }

      /*
       * 짧은 층이 끝나는 자리에서 아래로 점선을 긋는다. 그것이 아래 층을 반으로
       * 가르면 층마다 절반이 남았다는 뜻이다 — 셈이 아니라 자리가 말한다.
       *
       * **머무는 표식이라 정적 그리기에도 넣는다.** 빠뜨리면 되짚어 마지막 걸음에
       * 갔을 때 조각의 결론이 사라진다 (S-scene).
       */
      const guides: DrawnGuide[] = [];
      if (scene.phase === 'halved' && counts.length >= 2) {
        for (let level = 0; level + 1 < counts.length; level += 1) {
          const x = rowEndX(counts[level + 1]);
          const y1 = levelTop(level + 1, pitch);
          const y2 = BASE_Y - level * pitch;
          const line = el('line', {
            x1: x,
            y1,
            x2: x,
            y2,
            stroke: c.auxCursor,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          });
          gGuides.appendChild(line);
          guides.push({ line, y1, y2 });
        }
      }

      caption.textContent = captionFor(scene);
      return { blocks, coins, tallies, guides, pitch };
    }

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면과 그 자리의 셈에서 나오고
    // `prev` 를 들추지 않는다 (S-scene).

    /** 값 하나가 들어와 동전을 던지고, 나온 앞면 수만큼 블록이 밀려 올라간다. */
    function flowStack(
      scene: CoinFlipHeightScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const col = scene.towers.length - 1;
      if (col < 0) return Promise.resolve();
      const coins = drawn.coins[col] ?? [];
      const rising = drawn.blocks.filter((b) => b.col === col);
      if (rising.length === 0) return Promise.resolve();

      const height = rising.length;
      const total = BASE_MS + RISE_MS * (height - 1);
      return animate(total, mine, (p) => {
        const ms = p * total;
        spinCoins(coins, clamp01(ms / BASE_MS));
        for (const b of rising) {
          // 층 0 은 밑변 아래에서, 위층은 바로 아래 칸에서 솟는다.
          const fromY =
            b.level === 0 ? b.y + RISE_FROM_BELOW : levelTop(b.level - 1, drawn.pitch);
          const from = b.level === 0 ? 0 : BASE_MS + RISE_MS * (b.level - 1);
          const span = b.level === 0 ? BASE_MS : RISE_MS;
          const q = ease(clamp01((ms - from) / span));
          setXY(b.node, b.restX, fromY + (b.y - fromY) * q);
        }
      });
    }

    /** 층마다 왼쪽으로 모은다 — 길이를 견주려면 시작이 같아야 한다. */
    function flowPack(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.blocks.length === 0) return Promise.resolve();
      return animate(PACK_MS, mine, (p) => {
        const q = ease(p);
        for (const b of drawn.blocks) {
          setXY(b.node, b.restX + (b.packX - b.restX) * q, b.y);
        }
        const tail = clamp01((p - 0.72) / 0.28);
        for (const tally of drawn.tallies) {
          tally.label.setAttribute('opacity', String(round(tail)));
          tally.label.setAttribute('x', String(round(tally.x + TALLY_SLIDE * (1 - tail))));
        }
      });
    }

    /** 점선이 위에서 아래로 내려 그어진다. */
    function flowHalve(drawn: Drawn, mine: number): Promise<void> {
      const guides = drawn.guides;
      if (guides.length === 0) return Promise.resolve();
      const total = GUIDE_MS + GUIDE_STAGGER_MS * (guides.length - 1);
      return animate(total, mine, (p) => {
        const ms = p * total;
        guides.forEach((g, i) => {
          const q = ease(clamp01((ms - i * GUIDE_STAGGER_MS) / GUIDE_MS));
          g.line.setAttribute('y2', String(round(g.y1 + (g.y2 - g.y1) * q)));
        });
      });
    }

    function flowFor(
      step: CoinFlipHeightStep,
      scene: CoinFlipHeightScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      if (step === 'stack') return flowStack(scene, drawn, mine);
      if (step === 'pack') return flowPack(drawn, mine);
      return flowHalve(drawn, mine);
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: CoinFlipHeightScene,
      _prev: CoinFlipHeightScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 transform 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을
      // 손으로 관리하지 않는다 (S-scene).
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
