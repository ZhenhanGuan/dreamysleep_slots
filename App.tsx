import React, { useState, useEffect, useCallback } from 'react';
import { GameStatus, SlotItem, SpinResult } from './types';
import { SLOT_ITEMS, GENERIC_LOSE_MESSAGES, RETRY_BUTTON_TEXTS } from './constants';
import { SlotReel } from './components/SlotReel';
import { generateBedtimeWhisper } from './services/geminiService';
import { Sparkles, Moon, Volume2, VolumeX, BookOpen, Star, Lock, CheckCircle } from 'lucide-react';
import { 
  playClick, 
  playLeverPull, 
  playReelSpin,
  stopReelSpin,
  playWin, 
  playJackpot,
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
  loadPullCount 
} from './utils/storage';

const NUM_BULBS = 8;

// --- Logic Helpers ---
const getRandomItem = () => {
    // Exclude hidden items from random pool
    const pool = SLOT_ITEMS.filter(i => !i.isHidden);
    return pool[Math.floor(Math.random() * pool.length)];
};

// Helper to generate a strip that ensures visual continuity
const generateStrip = (startItem: SlotItem | null, targetItem: SlotItem | null, length: number = 40): SlotItem[] => {
  const strip = Array.from({ length }, () => getRandomItem());
  
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

// Standard game logic
const determineResult = (): SpinResult => {
  const rand = Math.random();
  const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
  
  if (rand < 0.60) {
    // Jackpot (Win) - 60% Chance
    const item = standardItems.filter(i => i.id !== 'phone')[Math.floor(Math.random() * (standardItems.length - 1))];
    return { items: [item, item, item], isWin: true, isJackpot: true };
  } else if (rand < 0.80) {
    // Near Miss (Lose) - 20% Chance
    const itemA = standardItems[Math.floor(Math.random() * standardItems.length)];
    let itemB = standardItems[Math.floor(Math.random() * standardItems.length)];
    while (itemB.id === itemA.id) itemB = standardItems[Math.floor(Math.random() * standardItems.length)];
    return { items: [itemA, itemA, itemB], isWin: false, isJackpot: false };
  } else {
    // Chaos (Lose) - 20% Chance
    return { 
        items: [
            standardItems[Math.floor(Math.random() * standardItems.length)], 
            standardItems[Math.floor(Math.random() * standardItems.length)], 
            standardItems[Math.floor(Math.random() * standardItems.length)]
        ], 
        isWin: false, 
        isJackpot: false 
    };
  }
};

// Explicitly generate a losing result (Different items/Misaligned visual)
const getLosingResult = (): SpinResult => {
  const standardItems = SLOT_ITEMS.filter(i => !i.isHidden);
  let items: [SlotItem, SlotItem, SlotItem] = [
      standardItems[Math.floor(Math.random() * standardItems.length)],
      standardItems[Math.floor(Math.random() * standardItems.length)],
      standardItems[Math.floor(Math.random() * standardItems.length)]
  ];

  // Ensure it's not accidentally a win (A-A-A)
  while (items[0].id === items[1].id && items[1].id === items[2].id) {
     items[2] = standardItems[Math.floor(Math.random() * standardItems.length)];
  }

  return { items, isWin: false, isJackpot: false };
};

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [strips, setStrips] = useState<SlotItem[][]>([[], [], []]);
  const [geminiMessage, setGeminiMessage] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [modalButtonText, setModalButtonText] = useState(RETRY_BUTTON_TEXTS[0]);
  
  // Track which items have been won - 从 localStorage 加载初始数据
  const [unlockedItems, setUnlockedItems] = useState<Set<string>>(() => loadUnlockedItems());

  // Replaced simple lightsOn boolean with an array of states for complex patterns
  const [bulbStates, setBulbStates] = useState<boolean[]>(new Array(NUM_BULBS).fill(false));
  
  const [isMuted, setIsMuted] = useState(false);
  const [isLeverPulled, setIsLeverPulled] = useState(false);
  
  // Mechanics State - 从 localStorage 加载初始数据
  const [pullCount, setPullCount] = useState(() => loadPullCount());
  const [isShaking, setIsShaking] = useState(false);

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

  // Initialize strips on mount
  useEffect(() => {
    setStrips([generateStrip(null, null), generateStrip(null, null), generateStrip(null, null)]);
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

    // 播放拉动摇杆音效
    playLeverPull();

    // 特殊拉杆次数，触发隐藏款
    const isSpecialPull = currentPull === 50;
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
    
    const currentItems = getCurrentItems();
    let newResult: SpinResult;

    if (isFailure) {
        newResult = getLosingResult();
    } else if (isSpecialPull) {
        const hiddenItem = SLOT_ITEMS.find(i => i.isHidden);
        if (hiddenItem) {
            newResult = { items: [hiddenItem, hiddenItem, hiddenItem], isWin: true, isJackpot: true };
        } else {
            newResult = determineResult();
        }
    } else {
        newResult = determineResult();
    }
    
    setResult(newResult);

    setStrips([
      generateStrip(currentItems[0], newResult.items[0], 30),
      generateStrip(currentItems[1], newResult.items[1], 60),
      generateStrip(currentItems[2], newResult.items[2], 80)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex flex-col items-center justify-start p-2 sm:p-4 overflow-x-hidden relative">
      
      {/* Background Stars */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }}></div>

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
                    拉动摇杆，爆发你的回床型依恋人格 {pullCount > 0 && pullCount < 3 && <span className="opacity-30 text-xs ml-2">({pullCount})</span>}
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
                            // Check if this is the hidden item and if it is currently locked
                            const isHiddenItem = item.isHidden;
                            const isLocked = isHiddenItem && pullCount < 50;
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
                        {pullCount >= 50 
                            ? "✨ 梦境深处的秘密已解锁 ✨" 
                            : "集齐三个相同图标，解锁甜蜜梦话"}
                    </p>
                </div>
            </div>
        </div>

        {/* Footer Signature */}
        <div className="w-full max-w-3xl mt-4 sm:mt-8 text-center">
          <p className="text-xs sm:text-sm text-slate-500/60 italic">
            管振翰制作
          </p>
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
      `}</style>
    </div>
  );
};

export default App;