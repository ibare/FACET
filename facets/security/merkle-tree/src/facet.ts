/**
 * MerkleTree facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "무엇이 바뀌었는지, 전부 다시 읽지 않고 어떻게 찾는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 데이터는 실측 SHA-256 이다. 잎은 sha256(label), 중간은 sha256(왼쪽 + 오른쪽),
 * 꼭대기도 같은 방식이다. fileB 를 고치면 leafB · 왼쪽 중간 · 꼭대기 셋만
 * 갈리고 leafA · leafC · leafD · 오른쪽 중간은 그대로다.
 *
 * 해시 사슬 조각과 짝을 이룬다. 사슬은 한 칸을 고치면 뒤가 전부 무너지고,
 * 트리는 한 줄만 갈린다 — 그 대비가 두 조각을 가른다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const merkleTreeFacet: FacetJson = {
  id: 'facet:merkleTree',
  title: { en: 'Merkle Tree', ko: '머클 트리' },
  description: {
    en: 'Fold hashes in pairs and one leaf changing moves only its own path to the top',
    ko: '해시를 둘씩 접어 두면 잎 하나가 바뀔 때 꼭대기까지 한 줄만 움직인다',
  },
  algorithm: 'module:merkleTree',
  projector: 'module:merkleTreeProjector',
  initialData: {
    type: 'merkle-tree',
    algorithmLabel: 'SHA-256',
    // 전부 실측 SHA-256. leaf = sha256(label), 위 노드 = sha256(왼쪽 + 오른쪽).
    before: {
      leaves: [
        { label: 'fileA', hash: '8eafa3caceb46f0369d79cb4e623c9516f9bdd273580e69d43bc28399fe387e9' },
        { label: 'fileB', hash: '97fa7db13fb2400d3c093cdedf7e4291c184d011ebf37fd4fe8d18cebb0e32c1' },
        { label: 'fileC', hash: '8c11d1d551df06a2014f875ce77a9251c58bcae14103f52a9e4c9379a09c54ab' },
        { label: 'fileD', hash: '2d3431963a74d3430d7f61aa05e2ed707d85ec5422a37416a4e172fa2983974e' }
      ],
      left: '4c08e337a5dc060ae186445f2315b2b3b2afbd9274587f4f4cdb0a68512fefdd',
      right: '838bb53eb94b7b0bb5390c727a9881738081e6a73f762b8bf4783b8550efa68e',
      root: 'dec0e51a0fbcb3f7d7e434295b7b2d0c58a4b9a75186609ec1c9e3daac7c825c',
    },
    after: {
      leaves: [
        { label: 'fileA', hash: '8eafa3caceb46f0369d79cb4e623c9516f9bdd273580e69d43bc28399fe387e9' },
        { label: 'fileB*', hash: 'a4a8512a5d03d44ff9e8505c1fa7a05ad0052b4c9e18d83d6552572353bd8976' },
        { label: 'fileC', hash: '8c11d1d551df06a2014f875ce77a9251c58bcae14103f52a9e4c9379a09c54ab' },
        { label: 'fileD', hash: '2d3431963a74d3430d7f61aa05e2ed707d85ec5422a37416a4e172fa2983974e' }
      ],
      left: 'e65574ca7e7b3905f31a99749320a2ff39018c8c13a554eab1a59ebfcd8b9a58',
      right: '838bb53eb94b7b0bb5390c727a9881738081e6a73f762b8bf4783b8550efa68e',
      root: '9e95ed8cc53f94ab94ddc0b61572409dd4ab95416e66a9129e4397dac7dd92dd',
    },
    changedLeaf: 1,
    // 두 층이 이어 오르는 combine-up 이 가장 긴 걸음이라 그것에 맞춘다.
    stepMs: 1300,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.leaves': {
      en: 'Each file gets its own hash.',
      ko: '파일마다 자기 해시를 갖는다.',
    },
    'caption.folded': {
      en: 'Folded in pairs, all of it comes down to one value.',
      ko: '둘씩 접어 올리면 전부가 값 하나로 모인다.',
    },
    'caption.changed': {
      en: 'One file changes.',
      ko: '파일 하나가 바뀐다.',
    },
    'caption.pathOnly': {
      en: 'Only the path up to the top changes — the other branch is untouched.',
      ko: '꼭대기까지 한 줄만 갈린다 — 다른 가지는 손대지 않은 그대로다.',
    },
  },
  blocks: {
    stage: { type: 'merkle-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
