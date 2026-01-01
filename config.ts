// 隐藏款解锁阈值（拉杆次数）
export const HIDDEN_ITEM_UNLOCK_THRESHOLD = 420;

// 隐藏款解锁阈值（普通款已解锁数量）
export const HIDDEN_ITEM_UNLOCK_COUNT_THRESHOLD = 23;

// 保底机制：达到此次数时，必定集齐所有普通款
export const GUARANTEED_ALL_UNLOCK_THRESHOLD = 500;

// 相册解锁阈值（已解锁的图鉴数量）
export const GALLERY_UNLOCK_THRESHOLD = 12;

// 背后的故事解锁阈值（已解锁的图鉴数量）
export const STORY_UNLOCK_THRESHOLD = 20;

// 动态成功概率表（索引为已解锁数量，值为下一次抽中的概率）
// 0-4 (第1-5个): 60%, 40%, 35%, 25%, 35%
// 5-9 (第6-10个): 30%, 25%, 25%, 20%, 15%
// 10-14 (第11-15个): 30%, 15%, 25%, 10%, 15%
// 15-19 (第16-20个): 40%, 20%, 10%, 25%, 40%
// 20-24 (第21-25个): 10%, 10%, 40%, 15%, 35%
export const WIN_PROBABILITIES = [
  0.40, 0.40, 0.35, 0.25, 0.15, // 1-5
  0.30, 0.25, 0.25, 0.20, 0.15, // 6-10
  0.30, 0.15, 0.25, 0.10, 0.15, // 11-15
  0.40, 0.20, 0.10, 0.25, 0.40, // 16-20
  0.10, 0.15, 0.40, 0.15, 0.35  // 21-25
];

// export const WIN_PROBABILITIES = [
// 1,1,1,1,1,
// 1,1,1,1,1,
// 1,1,1,1,1,
// 1,1,1,1,1,
// 1,1,1,0.6,0.5 
//   ];

// 集齐所有普通款后的固定概率
export const PROBABILITY_AFTER_ALL_UNLOCKED = 0.9;
