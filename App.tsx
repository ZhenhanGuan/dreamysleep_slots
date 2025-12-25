import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, SlotItem, SpinResult } from './types';
import { SLOT_ITEMS, GENERIC_LOSE_MESSAGES, RETRY_BUTTON_TEXTS, MILESTONE_MESSAGES } from './constants';
import { HIDDEN_ITEM_UNLOCK_THRESHOLD, HIDDEN_ITEM_UNLOCK_COUNT_THRESHOLD, WIN_PROBABILITIES, PROBABILITY_AFTER_ALL_UNLOCKED, GUARANTEED_ALL_UNLOCK_THRESHOLD, GALLERY_UNLOCK_THRESHOLD, STORY_UNLOCK_THRESHOLD } from './config';
import { SlotReel } from './components/SlotReel';
import { generateBedtimeWhisper } from './services/geminiService';
import { Sparkles, Moon, Volume2, VolumeX, BookOpen, Star, Lock, CheckCircle, RotateCcw } from 'lucide-react';
import { 
  playClick, 
  playLeverPull, 
  playReelSpin,
  stopReelSpin,
  playWin, 
  playJackpot,
  playCertificateMusic,
  playStoryMusic,
  playGalleryMusic,
  playLetterMusic,
  stopBackgroundMusic,
  playLose, 
  playMalfunction,
  playUnlock,
  setSoundMuted 
} from './utils/soundEffects';
import { 
  saveUnlockedItems, 
  loadUnlockedItems, 
  savePullCount, 
  loadPullCount,
  clearAllData
} from './utils/storage';

// 动态加载相册图片
const galleryModules = import.meta.glob('./imgs/*.{png,jpg,jpeg,svg}', { eager: true });
const galleryImageList = Object.values(galleryModules).map((mod: any) => mod.default);

// 相册文字描述配置 (按文件名排序对应的顺序)
const GALLERY_DESCRIPTIONS = [
    "第一次去迪士尼，烟花很美，但不如你。",
    "在海边吹风，头发乱了也很可爱。",
    "一起吃的火锅，你被辣到的样子。",
    "那个下雨天，我们躲在屋檐下。",
    "你的背影，总是让我感到安心。",
    "随手拍的街景，因为有你在画里。",
    "纪念日快乐，未来的每一天都要有你。",
    "偷拍你认真工作的样子。",
    "简单的晚餐，却是最幸福的味道。",
    "去年的冬天，雪花落在你的睫毛上。",
    "一起看展，你比艺术品更迷人。",
    "那只偶遇的小猫，和你一样温顺。",
    "无论去哪，只要是和你一起就好。",
    "平淡的日子里，也有闪光的瞬间。",
    "谢谢你，出现在我的生命里。"
];

const NUM_BULBS = 8;

// --- Logic Helpers ---
const getRandomItem = (unlockedItems?: Set<string>, isHiddenUnlocked?: boolean) => {
    // Exclude hidden items from random pool
    let pool = SLOT_ITEMS.filter(i => !i.isHidden);

    // RESTRICTION: Before Hidden Item is unlocked, ONLY show unlocked items (if any exist)
    if (unlockedItems && unlockedItems.size > 0 && !isHiddenUnlocked) {
        const restrictedPool = pool.filter(i => unlockedItems.has(i.id));
        if (restrictedPool.length > 0) {
            pool = restrictedPool;
        }
    }

    return pool[Math.floor(Math.random() * pool.length)];
};

// Helper to generate a strip that ensures visual continuity
const generateStrip = (startItem: SlotItem | null, targetItem: SlotItem | null, length: number = 40, unlockedItems?: Set<string>, isHiddenUnlocked?: boolean): SlotItem[] => {
  const strip = Array.from({ length }, () => getRandomItem(unlockedItems, isHiddenUnlocked));
  
  // Ensure the strip starts with the currently visible item
  if (startItem) {
      strip[0] = startItem;
  }
  
  // Ensure the strip ends with the target item
  if (targetItem) {
    strip[length - 5] = targetItem;
  }
  return strip;
};

// 计算动态成功概率
const calculateWinProbability = (unlockedItems: Set<string>): number => {
  // 计算已解锁的普通款数量（排除隐藏款）
  // 注意："玩手机"现在参与抽奖，不再排除
  const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
  const unlockedStandardCount = standardItems.filter(item => unlockedItems.has(item.id)).length;
  
  // 使用 config.ts 中的概率表
  const probabilities = WIN_PROBABILITIES;

  // 如果已解锁数量超过概率表长度，使用配置的固定概率
  if (unlockedStandardCount >= probabilities.length) {
    return PROBABILITY_AFTER_ALL_UNLOCKED;
  }

  return probabilities[unlockedStandardCount];
};

// Standard game logic with dynamic probability
const determineResult = (unlockedItems: Set<string>, pullCount: number): SpinResult => {
  const rand = Math.random();
  const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
  
  // 计算动态成功概率
  const winProbability = calculateWinProbability(unlockedItems);
  
  // 统计已解锁的普通款数量
  const unlockedStandardCount = standardItems.filter(item => unlockedItems.has(item.id)).length;

  // 检查隐藏款是否已解锁
  const hiddenItem = SLOT_ITEMS.find(i => i.isHidden);
  const isHiddenUnlocked = hiddenItem && unlockedItems.has(hiddenItem.id);

  // 进度阻塞检查：如果达到阈值但未解锁隐藏款，则不能解锁剩余普通款
  const isProgressBlocked = !isHiddenUnlocked && unlockedStandardCount >= HIDDEN_ITEM_UNLOCK_COUNT_THRESHOLD;

  // 保底机制：如果拉杆次数达到阈值，开启"必中模式"
  // 只要还有未解锁的普通款，且没有被阻塞，每次拉杆必定解锁一个新的
  const isGuaranteedMode = !isProgressBlocked && pullCount >= GUARANTEED_ALL_UNLOCK_THRESHOLD && unlockedStandardCount < standardItems.length;

  if (isGuaranteedMode || rand < winProbability) {
    // Jackpot (Win) - Dynamic Probability
    let item: SlotItem;

    if (isProgressBlocked) {
        // 阻塞模式：强制只能抽到已解锁的普通款（制造"卡住"的假象，等待隐藏款）
        const unlockedPool = standardItems.filter(i => unlockedItems.has(i.id));
        // 理论上一定会有的，因为 threshold >= 1
        item = unlockedPool[Math.floor(Math.random() * unlockedPool.length)];
    } else if (isGuaranteedMode) {
        // 保底模式：必须从未解锁的物品中选一个
        const lockedItems = standardItems.filter(i => !unlockedItems.has(i.id));
        if (lockedItems.length > 0) {
            // 随机选择一个未解锁的
            item = lockedItems[Math.floor(Math.random() * lockedItems.length)];
        } else {
            // 理论上不会走到这里，因为 isGuaranteedMode 判断了 size
            item = standardItems[Math.floor(Math.random() * standardItems.length)];
        }
    } else {
        // 正常中奖："玩手机"现在参与抽奖
        // 如果被阻塞（这里虽然 isProgressBlocked 进不来上面的 else if，但为了安全逻辑）
        // 其实上面 if (isProgressBlocked) 已经处理了。
        // 所以这里是 !isProgressBlocked 的情况。
        item = standardItems[Math.floor(Math.random() * standardItems.length)];
    }
    
    return { items: [item, item, item], isWin: true, isJackpot: true };
  } else {
    // Lose - 剩余概率分为 Near Miss 和 Chaos
    const remainingProbability = 1 - winProbability;
    const nearMissProbability = remainingProbability * 0.5; // Near Miss 占剩余概率的50%
    
    // RESTRICTION for Lose visuals: Only use unlocked items if Hidden Item not unlocked
    let visualPool = standardItems;
    if (!isHiddenUnlocked && unlockedItems.size > 0) {
        const unlockedPool = standardItems.filter(i => unlockedItems.has(i.id));
        if (unlockedPool.length > 0) {
            visualPool = unlockedPool;
        }
    }

    if (rand < winProbability + nearMissProbability) {
      // Near Miss (Lose) - 两个相同，一个不同
      const itemA = visualPool[Math.floor(Math.random() * visualPool.length)];
      let itemB = visualPool[Math.floor(Math.random() * visualPool.length)];
      while (itemB.id === itemA.id) itemB = visualPool[Math.floor(Math.random() * visualPool.length)];
      return { items: [itemA, itemA, itemB], isWin: false, isJackpot: false };
    } else {
      // Chaos (Lose) - 三个都不同
      return { 
          items: [
              visualPool[Math.floor(Math.random() * visualPool.length)], 
              visualPool[Math.floor(Math.random() * visualPool.length)], 
              visualPool[Math.floor(Math.random() * visualPool.length)]
          ], 
          isWin: false, 
          isJackpot: false 
      };
    }
  }
};

// Explicitly generate a losing result (Different items/Misaligned visual)
const getLosingResult = (unlockedItems: Set<string>, isHiddenUnlocked: boolean): SpinResult => {
  const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
  
  // RESTRICTION: Only use unlocked items if Hidden Item not unlocked
  let visualPool = standardItems;
  if (!isHiddenUnlocked && unlockedItems.size > 0) {
      const unlockedPool = standardItems.filter(i => unlockedItems.has(i.id));
      if (unlockedPool.length > 0) {
          visualPool = unlockedPool;
      }
  }

  let items: [SlotItem, SlotItem, SlotItem] = [
      visualPool[Math.floor(Math.random() * visualPool.length)],
      visualPool[Math.floor(Math.random() * visualPool.length)],
      visualPool[Math.floor(Math.random() * visualPool.length)]
  ];

  // Ensure it's not accidentally a win (A-A-A)
  while (items[0].id === items[1].id && items[1].id === items[2].id) {
     items[2] = visualPool[Math.floor(Math.random() * visualPool.length)];
  }

  return { items, isWin: false, isJackpot: false };
};

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [strips, setStrips] = useState<SlotItem[][]>([[], [], []]);
  const [geminiMessage, setGeminiMessage] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false); // 通关证书弹窗
  const [showStory, setShowStory] = useState(false); // 制作者背后的故事弹窗
  const [showIntro, setShowIntro] = useState(true); // 游戏玩法介绍弹窗
  const [showMilestone, setShowMilestone] = useState(false); // 里程碑弹窗
  const [showGallery, setShowGallery] = useState(false); // 相册弹窗
  const [showLetter, setShowLetter] = useState(false); // 给妤婷的话弹窗
  const [milestoneMessage, setMilestoneMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState(RETRY_BUTTON_TEXTS[0]);
  
  // Password State
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  
  // Track which items have been won - 从 localStorage 加载初始数据
  const [unlockedItems, setUnlockedItems] = useState<Set<string>>(() => loadUnlockedItems());

  // Replaced simple lightsOn boolean with an array of states for complex patterns
  const [bulbStates, setBulbStates] = useState<boolean[]>(new Array(NUM_BULBS).fill(false));
  
  const [isMuted, setIsMuted] = useState(false);
  const [isLeverPulled, setIsLeverPulled] = useState(false);
  
  // Mechanics State - 从 localStorage 加载初始数据
  const [pullCount, setPullCount] = useState(() => loadPullCount());
  const [isShaking, setIsShaking] = useState(false);

  // 通关状态：集齐所有物品（普通款 + 隐藏款，共26个）
  // SLOT_ITEMS.length 包含了所有物品
  const isGameCompleted = unlockedItems.size >= SLOT_ITEMS.length;

  // 同步静音状态到音效管理器
  useEffect(() => {
    setSoundMuted(isMuted);
  }, [isMuted]);

  // 当解锁物品变化时，保存到 localStorage
  useEffect(() => {
    saveUnlockedItems(unlockedItems);
  }, [unlockedItems]);

  // 当拉杆次数变化时，保存到 localStorage
  useEffect(() => {
    savePullCount(pullCount);
  }, [pullCount]);

  const isProcessingRef = useRef(false);
  const hasShownCertificateRef = useRef(false); // 记录是否已经展示过证书

  // 统一的显示证书函数
  const handleShowCertificate = useCallback(() => {
    // 简单的防抖，防止短时间内重复触发（如双击或自动触发冲突）
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    // 1秒后释放锁
    setTimeout(() => { isProcessingRef.current = false; }, 1000);

    // 标记为已展示，防止 useEffect 再次触发
    hasShownCertificateRef.current = true;

    setShowCertificate(true);
    // 播放证书专属背景音乐（无额外的中奖音效）
    playCertificateMusic();
    
    if (window.confetti) {
        window.confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#fcd34d', '#f472b6', '#60a5fa']
        });
    }
  }, []);

  // 监听通关状态，触发证书弹窗
  useEffect(() => {
    // 只有当未展示过时，才启动自动展示定时器
    if (isGameCompleted && !hasShownCertificateRef.current) {
        // 延迟显示，让用户先看完最后一个解锁动画
        const timer = setTimeout(() => {
            // 再次检查，防止等待期间用户手动操作了
            if (!hasShownCertificateRef.current) {
                handleShowCertificate();
            }
        }, 2500);
        return () => clearTimeout(timer);
    }
  }, [isGameCompleted, handleShowCertificate]);

  // Initialize strips on mount
  useEffect(() => {
    const hiddenItem = SLOT_ITEMS.find(i => i.isHidden);
    const isHiddenUnlocked = hiddenItem && unlockedItems.has(hiddenItem.id);
    setStrips([
        generateStrip(null, null, 40, unlockedItems, !!isHiddenUnlocked), 
        generateStrip(null, null, 40, unlockedItems, !!isHiddenUnlocked), 
        generateStrip(null, null, 40, unlockedItems, !!isHiddenUnlocked)
    ]);
  }, []);

  // --- Light Pattern Logic ---
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    let tick = 0;

    const updateLights = () => {
        tick++;
        
        if (isShaking) {
            // Malfunction Pattern: Rapid Random Chaos
            setBulbStates(Array.from({ length: NUM_BULBS }, () => Math.random() > 0.5));
        } else if (status === GameStatus.SPINNING) {
            // Chasing Pattern: Running lights effect
            setBulbStates(prev => prev.map((_, i) => {
                const pos = tick % NUM_BULBS;
                // Light up 3 adjacent bulbs for a "snake" effect
                return i === pos || i === (pos + 1) % NUM_BULBS || i === (pos + 2) % NUM_BULBS;
            }));
        } else if (status === GameStatus.COMPLETED && result?.isWin) {
            // Win Pattern: Synchronized Bursts & Sparkles
            const phase = tick % 8;
            if (phase < 4) {
                 // Fast Blink All
                 setBulbStates(new Array(NUM_BULBS).fill(phase % 2 === 0));
            } else {
                 // Random Sparkle
                 setBulbStates(Array.from({ length: NUM_BULBS }, () => Math.random() > 0.3));
            }
        } else {
            // Idle / Default: Gentle Random Twinkle
            setBulbStates(prev => {
                const next = [...prev];
                // Occasionally flip a random bulb, biased towards being ON for warmth
                if (Math.random() > 0.3) {
                     const idx = Math.floor(Math.random() * NUM_BULBS);
                     next[idx] = Math.random() > 0.4; 
                }
                return next;
            });
        }
    };

    // Dynamic Speed Control
    let speed = 400; // Slow for idle
    if (isShaking) speed = 50; // Ultra fast for malfunction
    else if (status === GameStatus.SPINNING) speed = 80; // Fast for chasing
    else if (status === GameStatus.COMPLETED && result?.isWin) speed = 150; // Exciting for win

    intervalId = setInterval(updateLights, speed);
    return () => clearInterval(intervalId);
  }, [status, result, isShaking]);

  // Helper to get currently visible items
  const getCurrentItems = (): SlotItem[] => {
      return strips.map(strip => strip[0]);
  };

  // Helper: Silent Swap
  const stabilizeReels = useCallback((finalItems: SlotItem[]) => {
      setStrips([
          generateStrip(finalItems[0], null, 40),
          generateStrip(finalItems[1], null, 45),
          generateStrip(finalItems[2], null, 50)
      ]);
      setResult(null); 
      setStatus(GameStatus.IDLE);
  }, []);

  const handleLeverClick = useCallback(() => {
    if (status === GameStatus.SPINNING || isLeverPulled) return;

    const currentPull = pullCount + 1;
    setPullCount(currentPull);
    setIsLeverPulled(true);

    // Check Milestones
    if (MILESTONE_MESSAGES[currentPull]) {
        setMilestoneMessage(MILESTONE_MESSAGES[currentPull]);
        setShowMilestone(true);
    }

    // 播放拉动摇杆音效
    playLeverPull();

    // 特殊条件触发隐藏款（拉杆次数达标 且 普通款集齐数量达标 且 尚未解锁隐藏款）
    const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
    const unlockedStandardCount = standardItems.filter(item => unlockedItems.has(item.id)).length;
    const hiddenItem = SLOT_ITEMS.find(i => i.isHidden);
    const isHiddenUnlocked = hiddenItem && unlockedItems.has(hiddenItem.id);

    // 只要满足条件且未解锁，就触发（这里设为必中，防止错过）
    // 注意：如果之前是 === THRESHOLD，现在改为 >=，确保只要条件满足且没解锁，下一发就是它
    const isSpecialPull = !isHiddenUnlocked && 
                          currentPull >= HIDDEN_ITEM_UNLOCK_THRESHOLD && 
                          unlockedStandardCount >= HIDDEN_ITEM_UNLOCK_COUNT_THRESHOLD;
    const isFailure = !isSpecialPull && Math.random() < 0.05;

    setTimeout(() => {
        handleSpin(isSpecialPull, isFailure);
    }, 400);

  }, [status, isLeverPulled, pullCount, strips]);

  const handleSpin = useCallback(async (isSpecialPull: boolean, isFailure: boolean) => {
    setStatus(GameStatus.SPINNING);
    setShowModal(false);
    setGeminiMessage('');
    
    // 停止背景音乐（开始新游戏时）
    stopBackgroundMusic();
    
    // Check hidden item status for visual restriction
    const hiddenItem = SLOT_ITEMS.find(i => i.isHidden);
    const isHiddenUnlocked = hiddenItem && unlockedItems.has(hiddenItem.id);
    
    const currentItems = getCurrentItems();
    let newResult: SpinResult;

    if (isFailure) {
        newResult = getLosingResult(unlockedItems, !!isHiddenUnlocked);
    } else if (isSpecialPull) {
        if (hiddenItem) {
            newResult = { items: [hiddenItem, hiddenItem, hiddenItem], isWin: true, isJackpot: true };
        } else {
            newResult = determineResult(unlockedItems, pullCount);
        }
    } else {
        newResult = determineResult(unlockedItems, pullCount);
    }
    
    setResult(newResult);

    setStrips([
      generateStrip(currentItems[0], newResult.items[0], 30, unlockedItems, !!isHiddenUnlocked),
      generateStrip(currentItems[1], newResult.items[1], 60, unlockedItems, !!isHiddenUnlocked),
      generateStrip(currentItems[2], newResult.items[2], 80, unlockedItems, !!isHiddenUnlocked)
    ]);

    // 播放转盘转动音效（在摇杆拉动后播放 run_gamble.wav）
    // 延迟一点时间，让摇杆音效先播放
    setTimeout(() => {
      playReelSpin();
    }, 900);

    setTimeout(() => {
      // 停止转盘音效（如果需要）
      stopReelSpin();
      finishSpin(newResult, isFailure);
    }, 4500);
  }, [strips]);

  const finishSpin = async (finalResult: SpinResult, isFailure: boolean) => {
    if (isFailure) {
        // 播放故障音效
        playMalfunction();
        setIsShaking(true);
        setTimeout(() => setIsLeverPulled(false), 200);

        setTimeout(() => {
            setIsShaking(false);
            stabilizeReels(finalResult.items);
        }, 500);

    } else {
        setStatus(GameStatus.COMPLETED);
        setIsLeverPulled(false);
        setModalButtonText(RETRY_BUTTON_TEXTS[Math.floor(Math.random() * RETRY_BUTTON_TEXTS.length)]);
        setShowModal(true);

        if (finalResult.isJackpot) {
            // 播放中奖音效
            if (finalResult.items[0].isHidden) {
                playJackpot(); // 隐藏款使用更华丽的音效
            } else {
                playWin(); // 普通中奖
            }

            // Add won item to unlocked set
            const wonItem = finalResult.items[0];
            const wasNewUnlock = !unlockedItems.has(wonItem.id);
            setUnlockedItems(prev => {
                const next = new Set(prev);
                next.add(wonItem.id);
                return next;
            });

            // 如果是新解锁的，播放解锁音效
            if (wasNewUnlock) {
                setTimeout(() => playUnlock(), 500);
            }

            if (window.confetti) {
                window.confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#fcd34d', '#f472b6', '#60a5fa']
                });
            }
            const aiText = await generateBedtimeWhisper(wonItem.label);
            setGeminiMessage(aiText);
        } else {
            // 播放失败音效
            playLose();
        }
    }
  };

  const handleItemClick = useCallback(async (item: SlotItem) => {
    if (!unlockedItems.has(item.id)) return;

    // 播放点击音效
    playClick();

    // 如果是隐藏款，播放背景音乐
    if (item.isHidden) {
      playJackpot(); // 这会播放 first_love.mp3 背景音乐
    }

    // Create a synthetic win result to display in the modal
    const mockResult: SpinResult = {
        items: [item, item, item],
        isWin: true,
        isJackpot: true
    };

    setResult(mockResult);
    setShowModal(true);
    setModalButtonText("期待张妤婷解锁全部内容！");
    setGeminiMessage(''); // Clear previous message to show loading state
    
    // Generate a fresh whisper for this memory
    try {
        const aiText = await generateBedtimeWhisper(item.label);
        setGeminiMessage(aiText);
    } catch (e) {
        setGeminiMessage("梦境信号连接中...");
    }
  }, [unlockedItems]);

  const closeModal = () => {
    setShowModal(false);
    // 停止背景音乐（关闭弹窗时）
    stopBackgroundMusic();
    if (result) {
        stabilizeReels(result.items);
    } else {
        setStatus(GameStatus.IDLE);
    }
    setGeminiMessage('');
  };

  // 一键重置功能
  const handleReset = useCallback(() => {
    // 确认对话框
    const confirmed = window.confirm('确定要重置所有游戏进度吗？\n这将清空所有解锁的梦境图鉴和拉杆次数。\n此操作不可恢复！');
    
    if (!confirmed) {
      return;
    }

    // 停止背景音乐
    stopBackgroundMusic();

    // 清空所有存储的数据
    clearAllData();

    // 重置所有状态
    setUnlockedItems(new Set());
    setPullCount(0);
    setStatus(GameStatus.IDLE);
    setResult(null);
    setShowModal(false);
    setGeminiMessage('');
    setIsLeverPulled(false);
    setIsShaking(false);
    
    // 重置转盘
    setStrips([
      generateStrip(null, null),
      generateStrip(null, null),
      generateStrip(null, null)
    ]);

    // 播放点击音效
    playClick();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-2 sm:p-4 overflow-x-hidden relative bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      
      {/* Background Stars */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* 通关后的华丽粒子特效 */}
      {isGameCompleted && (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
           {/* 漂浮的金色星星和光点 */}
           {Array.from({ length: 40 }).map((_, i) => (
              <div 
                key={i}
                className="particle text-yellow-200/60"
                style={{
                  left: `${Math.random() * 100}%`,
                  fontSize: `${Math.random() * 20 + 10}px`,
                  animationDuration: `${Math.random() * 10 + 10}s`, // 10-20s duration
                  animationDelay: `${Math.random() * 10}s`,
                  textShadow: '0 0 10px rgba(255,255,255,0.5)'
                }}
              >
                {Math.random() > 0.7 ? '✨' : (Math.random() > 0.5 ? '⭐' : '•')}
              </div>
           ))}
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-4xl flex flex-col items-center gap-6 sm:gap-12 z-10 py-4 sm:py-10">

        {/* SECTION 1: MACHINE */}
        <div className="flex flex-col items-center relative">
            
            <div className="mb-3 sm:mb-6 text-center">
                <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 drop-shadow-[0_0_15px_rgba(236,72,153,0.4)] flex items-center justify-center gap-2 sm:gap-4">
                <Moon className="w-6 h-6 sm:w-10 sm:h-10 md:w-12 md:h-12 text-yellow-300 fill-current animate-pulse-slow" />
                张妤婷专属哄睡神器
                </h1>
                <p className="text-indigo-200 mt-2 sm:mt-3 text-xs sm:text-sm md:text-lg font-light tracking-wide">
                    拉动摇杆，爆发你的回床型依恋人格
                </p>
            </div>

            <div className="relative">
                {/* The Machine Body */}
                <div className={`relative bg-slate-800 p-3 sm:p-6 md:p-10 rounded-2xl sm:rounded-[40px] border-4 sm:border-8 border-slate-700 shadow-2xl z-10 transition-transform ${isShaking ? 'animate-shake' : ''}`}>
                    
                    {/* Top Lights */}
                    <div className="flex justify-center gap-2 sm:gap-3 md:gap-5 mb-3 sm:mb-6 md:mb-8">
                        {Array.from({ length: NUM_BULBS }).map((_, i) => (
                        <div 
                            key={`top-${i}`} 
                            className={`w-2 h-2 sm:w-3 sm:h-3 md:w-5 md:h-5 rounded-full transition-all duration-300 shadow-lg ${
                            bulbStates[i] ? 'bg-yellow-300 bulb-glow scale-110' : 'bg-slate-800 shadow-inner'
                            }`}
                        />
                        ))}
                    </div>

                    {/* Reels Container */}
                    <div className="flex gap-1 sm:gap-2 md:gap-4 p-2 sm:p-4 bg-black rounded-xl sm:rounded-2xl shadow-[inset_0_0_20px_rgba(0,0,0,1)] border-2 sm:border-4 border-slate-600 relative overflow-hidden">
                        {/* Payline */}
                        <div className="absolute top-1/2 left-0 right-0 h-1 bg-red-500/60 z-20 shadow-[0_0_15px_rgba(239,68,68,1)] pointer-events-none transform -translate-y-1/2"></div>
                        
                        <SlotReel 
                            key="reel-1"
                            isSpinning={status === GameStatus.SPINNING} 
                            strip={strips[0]} 
                            targetItem={result?.items[0] || null} 
                            spinDuration={3000} 
                        />
                        <SlotReel 
                            key="reel-2"
                            isSpinning={status === GameStatus.SPINNING} 
                            strip={strips[1]} 
                            targetItem={result?.items[1] || null} 
                            spinDuration={3500} 
                        />
                        <SlotReel 
                            key="reel-3"
                            isSpinning={status === GameStatus.SPINNING} 
                            strip={strips[2]} 
                            targetItem={result?.items[2] || null} 
                            spinDuration={4000} 
                        />
                    </div>

                    {/* Bottom Lights - Mirroring index for converging effect */}
                    <div className="flex justify-center gap-2 sm:gap-3 md:gap-5 mt-3 sm:mt-6 md:mt-8">
                        {Array.from({ length: NUM_BULBS }).map((_, i) => (
                        <div 
                            key={`bottom-${i}`} 
                            className={`w-2 h-2 sm:w-3 sm:h-3 md:w-5 md:h-5 rounded-full transition-all duration-300 shadow-lg ${
                            bulbStates[NUM_BULBS - 1 - i] ? 'bg-purple-400 bulb-glow scale-110' : 'bg-slate-800 shadow-inner'
                            }`}
                        />
                        ))}
                    </div>

                    {/* Audio Toggle (Small button on machine) */}
                    <div className="absolute bottom-2 right-3 sm:bottom-4 sm:right-6">
                         <button 
                            onClick={() => {
                                const newMuted = !isMuted;
                                setIsMuted(newMuted);
                                setSoundMuted(newMuted);
                                // 播放点击音效（如果取消静音）
                                if (newMuted === false) {
                                    playClick();
                                }
                            }}
                            className="p-1.5 sm:p-2 rounded-full bg-slate-900/50 text-slate-500 hover:text-white transition-colors"
                        >
                            {isMuted ? <VolumeX size={14} className="sm:w-4 sm:h-4" /> : <Volume2 size={14} className="sm:w-4 sm:h-4" />}
                        </button>
                    </div>
                </div>

                {/* THE LEVER */}
                <div className="absolute top-12 sm:top-24 -right-12 sm:-right-20 md:-right-24 z-0 w-20 h-48 sm:w-32 sm:h-64 pointer-events-none">
                     
                     {/* Pivot Point Base (Attached to Machine) */}
                     <div className="absolute top-[2.5rem] sm:top-[4rem] left-0 w-6 h-10 sm:w-8 sm:h-16 md:w-12 bg-gradient-to-r from-slate-800 to-slate-600 border-y border-r border-slate-900 shadow-lg rounded-r-lg"></div>
                     
                     {/* Pivot Circle */}
                     <div className="absolute top-[3rem] sm:top-[5rem] left-4 sm:left-6 md:left-8 w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-slate-400 rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] border-2 border-slate-600 z-10 flex items-center justify-center">
                         <div className="w-2 h-2 sm:w-3 sm:h-3 bg-slate-700 rounded-full"></div>
                     </div>

                     {/* The Arm Wrapper (Rotates around Pivot) */}
                     <div 
                        className={`absolute top-[3.5rem] sm:top-[6rem] left-[1.5rem] sm:left-[2.2rem] md:left-[2.7rem] w-0 h-0 transition-transform duration-700 cubic-bezier(0.5, 0, 0.5, 1) pointer-events-auto origin-center`}
                        style={{
                           // 0deg is Vertical UP. 160deg is down.
                           transform: isLeverPulled ? 'rotate(160deg)' : 'rotate(0deg)'
                        }}
                     >
                          {/* The Stick (Extending UP from pivot initially) */}
                          <div className="absolute bottom-0 left-[-4px] sm:left-[-6px] md:left-[-8px] w-2 h-24 sm:w-3 sm:h-40 md:w-4 md:h-48 bg-gradient-to-r from-slate-300 via-white to-slate-300 rounded-full shadow-lg border border-slate-400 -translate-y-2"></div>
                          
                          {/* The Knob (At top of stick) */}
                          <div 
                              onClick={handleLeverClick}
                              className={`absolute bottom-[6rem] sm:bottom-[10rem] md:bottom-[12rem] left-[-16px] sm:left-[-24px] md:left-[-32px] w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-800 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.4),0_8px_15px_rgba(0,0,0,0.5)] cursor-pointer hover:brightness-110 z-20 ${status === GameStatus.SPINNING ? 'grayscale cursor-not-allowed' : 'animate-bounce-subtle'}`}
                          >
                             <div className="absolute top-1.5 right-2 sm:top-2 sm:right-3 w-2 h-2 sm:w-3 sm:h-3 bg-white/40 rounded-full blur-[1px]"></div>
                          </div>
                     </div>
                </div>

            </div>
        </div>

        {/* Stats Section */}
        <div className="w-full max-w-3xl -my-4 sm:-my-8 z-0 flex flex-col items-center gap-2 sm:gap-3">
            <div className="flex flex-wrap justify-center gap-3 sm:gap-6">
                {/* 累计拉动 */}
                <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-full px-4 sm:px-6 py-2 shadow-lg flex items-center gap-2">
                    <span className="text-slate-400 text-xs sm:text-sm font-medium">累计拉动:</span>
                    <span className="text-yellow-400 text-sm sm:text-base font-bold font-mono">{pullCount}</span>
                    <span className="text-slate-400 text-xs sm:text-sm font-medium">次</span>
                </div>

                {/* 已收集 */}
                <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-full px-4 sm:px-6 py-2 shadow-lg flex items-center gap-2">
                    <span className="text-slate-400 text-xs sm:text-sm font-medium">已收集:</span>
                    <span className="text-pink-400 text-sm sm:text-base font-bold font-mono">{unlockedItems.size}</span>
                    <span className="text-slate-400 text-xs sm:text-sm font-medium">/ {SLOT_ITEMS.length}</span>
                </div>
            </div>

            {/* 查看证书按钮 (通关后显示) */}
            {isGameCompleted && (
                <button
                    onClick={handleShowCertificate}
                    className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 hover:border-yellow-500/50 rounded-full text-yellow-200 text-xs sm:text-sm transition-all duration-300 animate-fade-in group"
                >
                    <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 group-hover:animate-spin-slow" />
                    <span>查看首席守梦人证书</span>
                </button>
            )}
        </div>

        {/* Middle Section: Tips & Special Buttons */}
        <div className="w-full max-w-3xl flex flex-col gap-4 px-4 my-4 animate-fade-in items-center">
            
            {/* Top: Tips Window */}
            <div className="w-full bg-slate-800/40 backdrop-blur-sm border border-slate-700/30 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col items-center text-center">
                <h3 className="text-indigo-300 font-bold mb-2 flex items-center gap-2 text-sm sm:text-base">
                    <span>💡</span> 来自哄睡人的福利
                </h3>
                <div className="text-slate-400 text-xs sm:text-sm leading-relaxed space-y-1">
                    <p>加油，张妤婷！每一个梦境碎片都藏着一段温柔的故事。</p>
                    <p>当收集进度达到 <span className="text-yellow-400 font-bold">12</span>、<span className="text-indigo-400 font-bold">20</span>、<span className="text-purple-400 font-bold">26</span> 时，</p>
                    <p>下方的神秘按钮将会逐一为你点亮。</p>
                </div>
            </div>

            {/* Bottom: Special Buttons Group */}
            <div className="w-full flex flex-col sm:flex-row gap-3 justify-center items-center">
                
                {/* 1. 妤婷的活人幸福时刻 (Unlocked at 12) */}
                <button
                    onClick={() => {
                        if (unlockedItems.size >= GALLERY_UNLOCK_THRESHOLD) {
                            setShowGallery(true);
                            playGalleryMusic();
                        }
                    }}
                    disabled={unlockedItems.size < GALLERY_UNLOCK_THRESHOLD}
                    className={`w-full sm:w-auto sm:min-w-[240px] py-3 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 border-2 
                    ${unlockedItems.size >= GALLERY_UNLOCK_THRESHOLD 
                        ? 'bg-gradient-to-r from-pink-500 via-rose-500 to-yellow-500 text-white shadow-lg hover:scale-105 active:scale-95 border-white/20' 
                        : 'bg-slate-800/50 text-slate-600 border-slate-700/50 cursor-not-allowed grayscale opacity-70'}`}
                >
                    <span>{unlockedItems.size >= GALLERY_UNLOCK_THRESHOLD ? '📸' : '🔒'}</span>
                    <span>妤婷的活人幸福时刻</span>
                    {unlockedItems.size >= GALLERY_UNLOCK_THRESHOLD && <span>✨</span>}
                </button>

                {/* 2. 背后的故事 (Unlocked at 20) */}
                <button
                    onClick={() => {
                        if (unlockedItems.size >= STORY_UNLOCK_THRESHOLD) {
                            setShowStory(true);
                            playStoryMusic();
                        }
                    }}
                    disabled={unlockedItems.size < STORY_UNLOCK_THRESHOLD}
                    className={`w-full sm:w-auto sm:min-w-[240px] py-3 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 border-2 
                    ${unlockedItems.size >= STORY_UNLOCK_THRESHOLD 
                        ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-lg hover:scale-105 active:scale-95 border-white/20' 
                        : 'bg-slate-800/50 text-slate-600 border-slate-700/50 cursor-not-allowed grayscale opacity-70'}`}
                >
                    <span>{unlockedItems.size >= STORY_UNLOCK_THRESHOLD ? '📖' : '🔒'}</span>
                    <span>制作背后的故事</span>
                    {unlockedItems.size >= STORY_UNLOCK_THRESHOLD && <span>✨</span>}
                </button>

                {/* 3. 给妤婷的话 (Unlocked at 26) */}
                <button
                    onClick={() => {
                        if (isGameCompleted) {
                            setShowLetter(true);
                            playLetterMusic();
                        }
                    }}
                    disabled={!isGameCompleted}
                    className={`w-full sm:w-auto sm:min-w-[240px] py-3 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 border-2 
                    ${isGameCompleted 
                        ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg hover:scale-105 active:scale-95 border-white/20' 
                        : 'bg-slate-800/50 text-slate-600 border-slate-700/50 cursor-not-allowed grayscale opacity-70'}`}
                >
                    <span>{isGameCompleted ? '✉️' : '🔒'}</span>
                    <span>写给妤婷的信</span>
                    {isGameCompleted && <span>✨</span>}
                </button>
            </div>
        </div>

        {/* SECTION 2: LEGEND / MENU (Matrix Grid Below) */}
        <div className="w-full max-w-3xl shrink-0">
            <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl flex flex-col">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4 pb-2 sm:pb-4 border-b border-slate-700 justify-center">
                    <BookOpen className="text-pink-300 w-4 h-4 sm:w-6 sm:h-6" />
                    <h2 className="text-sm sm:text-xl font-bold text-slate-100">梦境图鉴（含有隐藏款）</h2>
                </div>
                
                <div className="flex-1">
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 gap-2 sm:gap-4">
                        {SLOT_ITEMS.map((item) => {
                            // Calculate count for lock logic
                            const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
                            const unlockedStandardCount = standardItems.filter(item => unlockedItems.has(item.id)).length;

                            // Check if this is the hidden item and if it is currently locked
                            const isHiddenItem = item.isHidden;
                            const isLocked = isHiddenItem && (pullCount < HIDDEN_ITEM_UNLOCK_THRESHOLD || unlockedStandardCount < HIDDEN_ITEM_UNLOCK_COUNT_THRESHOLD); //隐藏显示
                            const isUnlocked = unlockedItems.has(item.id);

                            if (isLocked) {
                                return (
                                    <div key={item.id} className="group flex flex-col items-center justify-center p-1.5 sm:p-3 rounded-lg sm:rounded-xl bg-slate-900/80 border border-slate-700/80 aspect-square opacity-60 relative overflow-hidden">
                                        <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                                            <Lock size={20} className="sm:w-8 sm:h-8" />
                                        </div>
                                        <div className="text-2xl sm:text-3xl md:text-4xl mb-1 sm:mb-2 blur-sm grayscale opacity-20">
                                            {item.emoji}
                                        </div>
                                        <h3 className="font-bold text-slate-500 text-[8px] sm:text-[10px] md:text-xs text-center leading-tight">???</h3>
                                    </div>
                                );
                            }

                            return (
                                <div 
                                    key={item.id} 
                                    onClick={() => isUnlocked ? handleItemClick(item) : null}
                                    className={`group flex flex-col items-center justify-center p-1.5 sm:p-3 rounded-lg sm:rounded-xl border transition-all duration-300 aspect-square relative 
                                    ${isUnlocked 
                                        ? 'bg-yellow-400/10 border-yellow-400/60 shadow-[0_0_15px_rgba(250,204,21,0.2)] cursor-pointer hover:bg-yellow-400/20' 
                                        : isHiddenItem 
                                            ? 'bg-indigo-900/40 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                                            : 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-700/50 hover:border-pink-500/30'
                                    }`}
                                >
                                    {isUnlocked && (
                                        <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1">
                                            <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 fill-yellow-400/20" />
                                        </div>
                                    )}
                                    <div className={`text-2xl sm:text-3xl md:text-4xl mb-1 sm:mb-2 transform transition-transform ${isUnlocked ? 'scale-110 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'group-hover:scale-110'} ${isHiddenItem && !isUnlocked ? 'animate-pulse' : ''}`}>
                                        {item.emoji}
                                    </div>
                                    <h3 className={`font-bold ${isUnlocked ? 'text-yellow-200' : item.color} text-[8px] sm:text-[10px] md:text-xs text-center leading-tight ${isUnlocked ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                                        {item.label}
                                    </h3>
                                    {isUnlocked && (
                                        <div className="absolute bottom-0.5 sm:bottom-1 left-0 right-0 text-center">
                                            <span className="text-[7px] sm:text-[9px] text-yellow-400 font-bold bg-black/40 px-1 py-0.5 sm:px-2 rounded-full">已解锁</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                <div className="pt-2 sm:pt-4 mt-1 sm:mt-2 border-t border-slate-700 text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500">
                        {pullCount >= HIDDEN_ITEM_UNLOCK_THRESHOLD //隐藏显示 
                            ? "✨ 梦境深处的秘密已解锁 ✨" 
                            : "集齐三个相同图标，解锁甜蜜梦话"}
                    </p>
                </div>
            </div>
        </div>

        {/* Footer Signature */}
        <div className="w-full max-w-3xl mt-4 sm:mt-8 text-center space-y-3 sm:space-y-4">
          <p className="text-xs sm:text-sm text-slate-500/60 italic">
            管振翰制作
          </p>
          
          {/* 底部按钮组 */}
          <div className="pt-2 sm:pt-4 flex flex-wrap justify-center gap-3 sm:gap-4">
            {/* 一键重置按钮 */}
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-lg transition-all duration-200 active:scale-95"
              title="重置所有游戏进度"
            >
              <RotateCcw size={14} className="sm:w-4 sm:h-4" />
              <span>一键重置</span>
            </button>
          </div>
        </div>

      </div>

      {/* Result Modal */}
      {showModal && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 border border-slate-600 w-full max-w-2xl rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl transform transition-all animate-pop-in relative overflow-hidden">
            
            <div className={`absolute top-0 left-0 w-full h-1 sm:h-2 bg-gradient-to-r ${result.items[0].isHidden ? 'from-fuchsia-500 via-indigo-500 to-cyan-500 animate-gradient-x' : 'from-pink-500 via-purple-500 to-indigo-500'}`}></div>

            <div className="text-center">
              <div className="inline-block p-2 sm:p-4 rounded-full bg-slate-900/50 mb-2 sm:mb-4 border border-slate-700 shadow-inner">
                {result.isJackpot ? (
                   <Sparkles className="w-8 h-8 sm:w-12 sm:h-12 text-yellow-400 animate-pulse" />
                ) : (
                   <Moon className="w-8 h-8 sm:w-12 sm:h-12 text-slate-400" />
                )}
              </div>
              
              <h2 className={`text-xl sm:text-3xl font-bold mb-2 sm:mb-4 ${result.isJackpot ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-400' : 'text-slate-200'}`}>
                {result.isJackpot ? (result.items[0].isHidden ? '🌌 隐藏款解锁！ 🌌' : '✨ 命运的安排 ✨') : '💤 你他妈这都抽不中？'}
              </h2>
              
              <div className="bg-slate-900/60 rounded-lg sm:rounded-xl p-3 sm:p-6 mb-3 sm:mb-6 border border-slate-700/50">
                 {result.isJackpot ? (
                    <>
                      <div className="flex justify-center mb-2 sm:mb-3 text-4xl sm:text-6xl md:text-7xl filter drop-shadow-xl animate-bounce-subtle">{result.items[0].emoji}</div>
                      <p className={`text-sm sm:text-xl font-medium mb-2 sm:mb-4 tracking-wide whitespace-pre-line ${result.items[0].isHidden ? 'text-fuchsia-300' : 'text-pink-200'}`}>
                        {result.items[0].message}
                      </p>
                      
                      {geminiMessage ? (
                        <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-slate-700/50 animate-fade-in">
                           <div className="flex gap-1 sm:gap-2 justify-center mb-1 sm:mb-2">
                               <Star size={10} className="sm:w-3 sm:h-3 text-yellow-500/50" />
                               <Star size={10} className="sm:w-3 sm:h-3 text-yellow-500/50" />
                           </div>
                           <p className="text-xs sm:text-md text-indigo-300 italic font-serif leading-relaxed">
                             "{geminiMessage}"
                           </p>
                           <p className="text-[10px] sm:text-xs text-slate-500 mt-2 sm:mt-3 text-right">- AI 梦境编织者</p>
                        </div>
                      ) : (
                        <div className="flex justify-center py-2 sm:py-4 gap-1.5 sm:gap-2">
                           <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-pink-400/50 rounded-full animate-bounce"></span>
                           <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-pink-400/50 rounded-full animate-bounce delay-100"></span>
                           <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-pink-400/50 rounded-full animate-bounce delay-200"></span>
                        </div>
                      )}
                    </>
                 ) : (
                    <div className="space-y-2 sm:space-y-4">
                        <div className="flex justify-center gap-2 sm:gap-4 opacity-50 grayscale">
                            {result.items.map((i, idx) => <span key={idx} className="text-3xl sm:text-4xl">{i.emoji}</span>)}
                        </div>
                        <p className="text-sm sm:text-lg text-slate-300 font-light">
                        {GENERIC_LOSE_MESSAGES[Math.floor(Math.random() * GENERIC_LOSE_MESSAGES.length)]}
                        </p>
                    </div>
                 )}
              </div>

              <button 
                onClick={closeModal}
                className="w-full py-2.5 sm:py-4 rounded-lg sm:rounded-xl bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white font-bold tracking-widest text-sm sm:text-base transition-all border border-slate-500 shadow-lg active:scale-95"
              >
                {modalButtonText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Modal (通关证书) */}
      {showCertificate && (
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => {
                setShowCertificate(false);
                stopBackgroundMusic();
            }}
        >
          <div 
            className="bg-gradient-to-b from-slate-900 to-indigo-950 border-2 border-yellow-500/50 w-full max-w-lg rounded-2xl p-8 shadow-[0_0_50px_rgba(234,179,8,0.3)] transform transition-all animate-pop-in relative text-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Decorative Corners */}
            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-yellow-500/30 rounded-tl-xl"></div>
            <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-yellow-500/30 rounded-tr-xl"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-yellow-500/30 rounded-bl-xl"></div>
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-yellow-500/30 rounded-br-xl"></div>

            <div className="mb-6">
                <Sparkles className="w-16 h-16 text-yellow-400 mx-auto animate-pulse" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-200 mb-2 font-serif tracking-widest uppercase">
                回床型依恋第一人
            </h2>
            <p className="text-yellow-500/60 text-xs tracking-[0.3em] mb-8 font-serif uppercase">
                Dream Keeper Certified
            </p>

            <div className="space-y-4 text-indigo-100/90 font-light leading-relaxed mb-8">
                <p>恭喜你，张妤婷。</p>
                <p>你已捕获了梦境中所有的 {unlockedItems.size} 个碎片。</p>
                <div className="w-8 h-px bg-yellow-500/30 mx-auto my-4"></div>
                <p className="italic text-lg text-yellow-100">
                    “从今往后，<br/>
                    星河为你亮灯，晚风为你送信。<br/>
                    愿你在每一个夜晚，<br/>
                    都被这个世界温柔以待。”
                </p>
            </div>

            <div className="pt-4 border-t border-white/10">
                <p className="text-xs text-slate-500 mb-4 font-mono">
                    颁发日期: {new Date().toLocaleDateString()}
                </p>
                <button 
                    onClick={() => {
                        setShowCertificate(false);
                        stopBackgroundMusic();
                    }}
                    className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                >
                    收藏这份美好
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Story Modal (制作者背后的故事) */}
      {showStory && (
        <div 
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => {
                setShowStory(false);
                stopBackgroundMusic();
            }}
        >
          <div 
            className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl relative flex flex-col max-h-[80vh] animate-pop-in"
            onClick={e => e.stopPropagation()}
          >
            
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-t-2xl shrink-0">
                <h3 className="text-lg sm:text-xl font-bold text-slate-200 flex items-center gap-2">
                    <BookOpen size={20} className="text-indigo-400" />
                    制作者背后的故事
                </h3>
                <button 
                    onClick={() => {
                        setShowStory(false);
                        stopBackgroundMusic(); // 关闭音乐
                    }}
                    className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                    <span className="text-2xl leading-none">&times;</span>
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar text-slate-300 leading-relaxed space-y-4 font-light text-sm sm:text-base">
                <p>
                    嗨，这里是管振翰。
                </p>
                <p>
                    做这个小玩具的初衷，其实特别简单。就是想在一个睡不着的晚上，能有一个不用动脑子、只要轻轻一点，就能获得一点点微小快乐的东西。
                </p>

                {/* 图片占位符 1 */}
                <div className="my-6 space-y-2">
                    <div className="w-full h-48 sm:h-64 bg-slate-800/50 rounded-lg flex items-center justify-center border border-slate-700 border-dashed">
                        <span className="text-slate-600 text-sm">（此处可插入：灵感来源或手稿图）</span>
                    </div>
                    <p className="text-xs text-center text-slate-500 italic">
                        图1：最初的想法
                    </p>
                </div>

                <p>
                    现在的世界太快了，连睡觉都变成了一种任务。我们总是焦虑明天的工作、复盘今天的失误。但我希望，当你打开这个网页的时候，时间能稍微慢下来一点点。
                </p>
                <p>
                    看着这些可爱的图标转动，听着有点傻气的音效，如果你能哪怕有一瞬间，嘴角微微上扬，或者觉得“这什么鬼东西怪可爱的”，那我的目的就达到了。
                </p>

                {/* 图片占位符 2 */}
                <div className="my-6 space-y-2">
                    <div className="w-full h-48 sm:h-64 bg-slate-800/50 rounded-lg flex items-center justify-center border border-slate-700 border-dashed">
                        <span className="text-slate-600 text-sm">（此处可插入：开发过程或音效调试图）</span>
                    </div>
                    <p className="text-xs text-center text-slate-500 italic">
                        图2：打磨每一个细节
                    </p>
                </div>

                <p>
                    里面的每一个图标、每一句文案，都是我一点点敲进去的。特别是那个“隐藏款”，是我藏在代码深处的一个小秘密，希望能带给你惊喜。
                </p>
                <p>
                    虽然这只是一个简陋的网页，没有绚丽的3D大作那么震撼，但它是我的一份心意。一份希望你能“好好睡觉、天天开心”的心意。
                </p>
                <p>
                    愿你的梦里，有星河，有极光，还有数不尽的温暖。
                </p>
                <p>
                    愿你的梦里，有星河，有极光，还有数不尽的温暖。
                </p>
                <p>
                    愿你的梦里，有星河，有极光，还有数不尽的温暖。
                </p>
                <p className="text-right italic mt-8 text-slate-500">
                    —— 2025.冬
                </p>
                
                {/* 底部留白 */}
                <div className="h-8"></div>
            </div>
          </div>
        </div>
      )}
      
      {/* Milestone Modal (里程碑鼓励) */}
      {showMilestone && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 border-2 border-indigo-500/50 w-full max-w-sm rounded-xl p-6 shadow-2xl transform transition-all animate-pop-in relative text-center">
            
            <div className="mb-4">
                <span className="inline-block p-3 rounded-full bg-indigo-900/50 text-indigo-300 text-2xl">
                    🎯
                </span>
            </div>

            <h3 className="text-xl font-bold text-indigo-200 mb-2">
                坚持就是胜利
            </h3>
            
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-6">
                已尝试 {pullCount} 次
            </p>

            <p className="text-lg text-white font-medium mb-8 leading-relaxed px-4">
                "{milestoneMessage}"
            </p>

            <button 
                onClick={() => setShowMilestone(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors active:scale-95 shadow-lg"
            >
                我他妈继续抽
            </button>
          </div>
        </div>
      )}

      {/* Intro Modal (游戏玩法说明) */}
      {showIntro && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 sm:p-8 shadow-2xl transform transition-all animate-pop-in relative">
              <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
                    欢迎来到回床型依恋哄睡神器
                  </h2>
                  <p className="text-slate-400 text-sm tracking-widest uppercase">
                      For ZhangYuting
                  </p>
              </div>

              <div className="space-y-4 text-slate-300 text-sm sm:text-base mb-8 font-light">
                  <div className="flex items-start gap-3">
                      <div className="bg-slate-800 p-2 rounded-lg shrink-0 text-xl">
                          🎰
                      </div>
                      <div>
                          <p className="font-bold text-slate-200">拉动摇杆</p>
                          <p className="text-slate-400 text-xs sm:text-sm">抽取梦境碎片，获取我的哄睡。</p>
                      </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                      <div className="bg-slate-800 p-2 rounded-lg shrink-0 text-xl">
                          ✨
                      </div>
                      <div>
                          <p className="font-bold text-slate-200">收集图鉴</p>
                          <p className="text-slate-400 text-xs sm:text-sm">集齐三个相同图标，即可解锁对应梦境。</p>
                      </div>
                  </div>

                  <div className="flex items-start gap-3">
                      <div className="bg-slate-800 p-2 rounded-lg shrink-0 text-xl">
                          🏆
                      </div>
                      <div>
                          <p className="font-bold text-slate-200">成为守梦人</p>
                          <p className="text-slate-400 text-xs sm:text-sm">点亮所有 26 个梦境（含隐藏款），即可秒睡。</p>
                      </div>
                  </div>
              </div>

              <div className="mb-6 px-4">
                  <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordError(false);
                      }}
                      placeholder="请输入启动密码..."
                      className={`w-full bg-slate-800 border ${passwordError ? 'border-red-500 animate-shake' : 'border-slate-600 focus:border-indigo-500'} rounded-lg py-3 px-4 text-center text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all`}
                  />
                  {passwordError && (
                      <p className="text-red-400 text-xs mt-2 animate-fade-in text-center">
                          密码错误，张妤婷不要提前偷看啦！
                      </p>
                  )}
              </div>

              <button 
                  onClick={() => {
                      if (password === '20020329') {
                          setShowIntro(false);
                      } else {
                          setPasswordError(true);
                      }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 group"
              >
                  <span>开始哄睡助眠</span>
                  <span className="group-hover:translate-x-1 transition-transform">🚀</span>
              </button>
          </div>
        </div>
      )}
      
      {/* Gallery Modal (妤婷的活人幸福时刻) */}
      {showGallery && (
        <div 
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => {
                setShowGallery(false);
                stopBackgroundMusic();
            }}
        >
          <div 
            className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[80vh] rounded-2xl p-6 shadow-2xl overflow-hidden flex flex-col relative animate-pop-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-6 shrink-0">
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-yellow-400 flex items-center gap-3">
                    <span>📸</span> 妤婷的活人幸福时刻
                </h2>
                <button 
                    onClick={() => {
                        setShowGallery(false);
                        stopBackgroundMusic();
                    }}
                    className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"
                >
                    <span className="text-2xl leading-none">&times;</span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    {/* 动态加载图集 */}
                    {galleryImageList.length > 0 ? (
                        galleryImageList.map((imgUrl, i) => (
                            <div key={i} className="flex flex-col gap-3 group">
                                {/* 图片区域 */}
                                <div className="aspect-[3/4] bg-slate-800/50 rounded-xl border-2 border-slate-700/50 overflow-hidden shadow-lg hover:border-pink-500/50 transition-all relative group-hover:scale-[1.02]">
                                    <img 
                                        src={imgUrl as string} 
                                        alt={`Photo ${i + 1}`} 
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    {/* 渐变遮罩 */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </div>
                                {/* 文字描述区域 */}
                                <div className="text-center bg-slate-800/30 p-2 rounded-lg border border-slate-700/30">
                                    <p className="text-slate-400 text-sm font-light min-h-[1.25rem]">
                                        {GALLERY_DESCRIPTIONS[i] || "未完待续..."}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        // Fallback: 如果没有图片，显示占位符
                        Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="flex flex-col gap-3 group">
                                <div className="aspect-[3/4] bg-slate-800/50 rounded-xl border-2 border-slate-700 border-dashed flex flex-col items-center justify-center hover:bg-slate-800 transition-all hover:border-pink-500/30 relative overflow-hidden shadow-lg">
                                    <div className="text-slate-600 group-hover:text-pink-300 transition-colors text-center p-4">
                                        <p className="text-4xl mb-4 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-transform">🖼️</p>
                                        <span className="font-mono text-xs tracking-widest uppercase">No Images Found</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                
                <div className="mt-8 text-center space-y-2">
                    <p className="text-slate-500 text-sm italic font-light">
                        "生活不是为了赶路，而是为了感受路。"
                    </p>
                    <div className="w-12 h-1 bg-gradient-to-r from-pink-500 to-yellow-500 mx-auto rounded-full opacity-50"></div>
                </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Letter Modal (给妤婷的话) */}
      {showLetter && (
        <div 
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => {
                setShowLetter(false);
                stopBackgroundMusic();
            }}
        >
          <div 
            className="bg-slate-900 border border-slate-700 w-full max-w-lg h-[70vh] rounded-2xl p-6 shadow-2xl flex flex-col relative animate-pop-in"
            onClick={e => e.stopPropagation()}
          >
             {/* Header */}
            <div className="flex justify-between items-center mb-6 shrink-0 border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-2">
                    <span>💌</span> 给妤婷的一封信
                </h2>
                <button 
                    onClick={() => {
                        setShowLetter(false);
                        stopBackgroundMusic();
                    }}
                    className="text-slate-500 hover:text-white transition-colors"
                >
                    <span className="text-2xl leading-none">&times;</span>
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar text-slate-300 leading-relaxed space-y-4 font-light text-sm sm:text-base px-2">
                <p>亲爱的妤婷：</p>
                <p>
                    当你看到这段话的时候，说明你已经在我设计的这台小小哄睡贩卖机前，投入了无数次的期待与耐心，我很感谢。
                </p>
                <p>
                    这是我第一次制作网页游戏，我很用心。张妤婷也是第一位玩到这款游戏的人，我很开心。我把我的处女作献给你，这是独属于你的游戏，希望你能喜欢。
                </p>
                <p>
                    或许你已在游戏里体验到了我们之间的黑话，这些都是我精细设计的，First Love、羽毛球、袖口木质香、养生茶、上热下寒、Severance、咪咪抢夺战、流片仿真debug、你最喜欢的辣椒炒肉、再睡会再睡会再睡会再睡会、青椒模拟器等等......
                    希望你能通过这款游戏回忆起独属我们之间的点滴。你说过的很多话，我都在心里。
                </p>
                <p>
                    平时的相处已是礼物。你说的没错，每次你给我的日常爆赞、分享有趣视频、分享你的抽象日常、以及你摄影眼的作品等等......都像是你赠予我的礼物。我很欢喜。
                    都说有趣的东西要分享给不敷衍的人，我深以为然。
                    你的每次分享我都会一一看完并认真回复，而我的每次积极主动你也会热烈回应，或许这便是独属于我们的默契。我很享受我们之间的互动，我为此感到幸福。每次互动都是一份礼物，我细数，我珍重。
                </p>      
                <p>
                    我知道你是很好的人，好到无论多少词都不足以形容你的美好。但为何如你这般美好，命运却要给你如此磨难，我始终困惑。善良、积极、乐观的人不应该遭受这么多痛苦。
                    你的明媚阳光、自信开朗照耀了身边的很多人，包括我。温暖又舒适。或许是有着相似的成长背景和人生体验，你说的很多故事和情绪我都能感同身受。所以，那位藏起来的心思敏感、缺乏安全感的小女孩更让我好奇。
                    有几时，注意到你的眉眼微微低垂，又在发呆想些什么心事呢？我想听听。
                    你内心深处的敏感与不安，我常常想要守护。守护你的笑容。
                </p>  
                <p>
                    也不知是从哪天起，我开始期待你的信息。好像收到了你信息，就能兴奋一整天。
                </p>             
                <div className="pt-8 text-right">
                    <p className="italic text-slate-500">—— 管振翰上</p>
                </div>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pop-in {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(0, 0) scale(1.05); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        @keyframes gradient-x {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-pop-in { animation: pop-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-pulse-slow { animation: pulse-slow 3s infinite; }
        .animate-bounce-slow { animation: bounce-slow 2s infinite; }
        .animate-bounce-subtle { animation: bounce-subtle 2s infinite; }
        .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        .animate-gradient-x { background-size: 200% 200%; animation: gradient-x 3s ease infinite; }
        
        /* 极光背景动画 */
        @keyframes aurora {
          0% { background-position: 50% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 50% 50%; }
        }
        .bg-aurora {
          background-size: 200% 200%;
          animation: aurora 15s ease infinite;
        }

        /* 漂浮粒子动画 */
        @keyframes float-particle {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }
        .particle {
          position: absolute;
          bottom: -20px;
          pointer-events: none;
          animation: float-particle linear forwards;
        }
      `}</style>
    </div>
  );
};

export default App;