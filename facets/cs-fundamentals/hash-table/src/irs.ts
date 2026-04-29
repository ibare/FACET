/**
 * HashTable 학습용 IR — 1차 구현은 코드 패널 미포함 (기획 §6 § 7 본체 미언급).
 *
 * 표준 6파일 일관성을 위해 빈 배열로 자리만 보존한다. 향후 코드 패널이 추가되면
 * hashtable-imperative IR 을 정의하고 algorithm.ts 의 phase 어휘 (auto-demo /
 * idle / insert / search / remove / rehash) 와 동기화한다.
 */

import type { IR } from '@facet/core';

export const hashTableIRs: IR[] = [];
