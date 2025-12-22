// 本地存储工具函数
// 用于持久化保存用户的游戏进度
// 支持桌面端和移动端浏览器

const STORAGE_KEYS = {
  UNLOCKED_ITEMS: 'dreamysleep_unlocked_items',
  PULL_COUNT: 'dreamysleep_pull_count',
} as const;

// 检查 localStorage 是否可用（移动端隐私模式可能不可用）
const isLocalStorageAvailable = (): boolean => {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return false;
    }
    // 尝试写入和读取测试数据
    const testKey = '__localStorage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    // 隐私模式或无痕模式下可能抛出异常
    return false;
  }
};

// 保存解锁的物品
export const saveUnlockedItems = (items: Set<string>) => {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage is not available, data will not be saved');
    return;
  }

  try {
    const itemsArray = Array.from(items);
    const data = JSON.stringify(itemsArray);
    localStorage.setItem(STORAGE_KEYS.UNLOCKED_ITEMS, data);
  } catch (e) {
    // 处理存储空间不足的情况（移动端可能存储空间有限）
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014)) {
      console.warn('Storage quota exceeded, trying to clear old data');
      // 尝试清理旧数据
      try {
        localStorage.removeItem(STORAGE_KEYS.UNLOCKED_ITEMS);
        localStorage.setItem(STORAGE_KEYS.UNLOCKED_ITEMS, JSON.stringify(Array.from(items)));
      } catch (clearError) {
        console.error('Failed to save unlocked items after cleanup:', clearError);
      }
    } else {
      console.warn('Failed to save unlocked items:', e);
    }
  }
};

// 读取解锁的物品
export const loadUnlockedItems = (): Set<string> => {
  if (!isLocalStorageAvailable()) {
    return new Set();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.UNLOCKED_ITEMS);
    if (stored) {
      const itemsArray = JSON.parse(stored) as string[];
      // 验证数据格式
      if (Array.isArray(itemsArray)) {
        return new Set(itemsArray.filter(id => typeof id === 'string'));
      }
    }
  } catch (e) {
    console.warn('Failed to load unlocked items:', e);
    // 如果数据损坏，清除它
    try {
      localStorage.removeItem(STORAGE_KEYS.UNLOCKED_ITEMS);
    } catch (clearError) {
      // 忽略清除错误
    }
  }
  return new Set();
};

// 保存拉杆次数
export const savePullCount = (count: number) => {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage is not available, pull count will not be saved');
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.PULL_COUNT, count.toString());
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014)) {
      console.warn('Storage quota exceeded for pull count');
    } else {
      console.warn('Failed to save pull count:', e);
    }
  }
};

// 读取拉杆次数
export const loadPullCount = (): number => {
  if (!isLocalStorageAvailable()) {
    return 0;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PULL_COUNT);
    if (stored) {
      const count = parseInt(stored, 10);
      return isNaN(count) ? 0 : Math.max(0, count); // 确保非负数
    }
  } catch (e) {
    console.warn('Failed to load pull count:', e);
    // 如果数据损坏，清除它
    try {
      localStorage.removeItem(STORAGE_KEYS.PULL_COUNT);
    } catch (clearError) {
      // 忽略清除错误
    }
  }
  return 0;
};

// 清除所有保存的数据（可选，用于重置功能）
export const clearAllData = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.UNLOCKED_ITEMS);
    localStorage.removeItem(STORAGE_KEYS.PULL_COUNT);
  } catch (e) {
    console.warn('Failed to clear data:', e);
  }
};

