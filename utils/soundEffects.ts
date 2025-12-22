// 音效工具函数
// 使用 Web Audio API 生成音效

// 导入音频文件（Vite 会处理路径）
import successSoundUrl from './success.wav';
import rockerSoundUrl from './rocker.wav';
import runGambleSoundUrl from './run_gamble.wav';
import firstLoveSoundUrl from './first_love.mp3';

class SoundManager {
  private audioContext: AudioContext | null = null;
  private isMuted: boolean = false;
  private successAudio: HTMLAudioElement | null = null;
  private rockerAudio: HTMLAudioElement | null = null;
  private runGambleAudio: HTMLAudioElement | null = null;
  private currentGambleAudio: HTMLAudioElement | null = null; // 当前播放的转盘音效
  private firstLoveAudio: HTMLAudioElement | null = null; // 隐藏款背景音乐
  private currentBackgroundMusic: HTMLAudioElement | null = null; // 当前播放的背景音乐

  constructor() {
    // 延迟初始化 AudioContext（需要用户交互后才能创建）
    if (typeof window !== 'undefined') {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
      
      // 预加载所有音效文件
      this.loadAllSounds();
    }
  }

  // 加载所有音效文件
  private loadAllSounds() {
    // 加载成功音效
    try {
      this.successAudio = new Audio(successSoundUrl);
      this.successAudio.preload = 'auto';
      this.successAudio.volume = 0.7;
    } catch (e) {
      console.warn('Failed to load success sound:', e);
    }

    // 加载摇杆音效
    try {
      this.rockerAudio = new Audio(rockerSoundUrl);
      this.rockerAudio.preload = 'auto';
      this.rockerAudio.volume = 0.8;
    } catch (e) {
      console.warn('Failed to load rocker sound:', e);
    }

    // 加载转盘转动音效
    try {
      this.runGambleAudio = new Audio(runGambleSoundUrl);
      this.runGambleAudio.preload = 'auto';
      this.runGambleAudio.volume = 0.6;
      this.runGambleAudio.loop = false; // 不循环，播放一次
    } catch (e) {
      console.warn('Failed to load run_gamble sound:', e);
    }

    // 加载隐藏款背景音乐
    try {
      this.firstLoveAudio = new Audio(firstLoveSoundUrl);
      this.firstLoveAudio.preload = 'auto';
      this.firstLoveAudio.volume = 0.5; // 背景音乐音量稍低
      this.firstLoveAudio.loop = true; // 循环播放
    } catch (e) {
      console.warn('Failed to load first_love sound:', e);
    }
  }

  // 播放音频文件
  private playAudioFile(audio: HTMLAudioElement | null) {
    if (this.isMuted || !audio) return;
    
    try {
      // 克隆音频元素以支持同时播放多个实例
      const audioClone = audio.cloneNode() as HTMLAudioElement;
      audioClone.volume = audio.volume;
      audioClone.play().catch(e => {
        console.warn('Failed to play audio:', e);
      });
    } catch (e) {
      console.warn('Error playing audio:', e);
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  // 初始化 AudioContext（需要在用户交互后调用）
  private initAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // 播放音调
  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
    if (this.isMuted || !this.audioContext) return;

    const ctx = this.initAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  // 播放点击音效
  playClick() {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    oscillator.type = 'sine';
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  }

  // 播放拉动摇杆音效（使用 rocker.wav）
  playLeverPull() {
    if (this.isMuted) return;
    
    // 播放摇杆音效文件
    this.playAudioFile(this.rockerAudio);
    
    // 如果音频文件加载失败，回退到生成的音效
    if (!this.rockerAudio) {
      const ctx = this.initAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 第一段：初始"咔哒"声（模拟摇杆开始拉动）
      const click1 = ctx.createOscillator();
      const clickGain1 = ctx.createGain();
      click1.connect(clickGain1);
      clickGain1.connect(ctx.destination);
      click1.frequency.setValueAtTime(600, now);
      click1.frequency.exponentialRampToValueAtTime(300, now + 0.05);
      clickGain1.gain.setValueAtTime(0.2, now);
      clickGain1.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      click1.type = 'square';
      click1.start(now);
      click1.stop(now + 0.05);

      // 第二段：机械拉动声（主音效）
      const mainStart = now + 0.05;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(180, mainStart);
      oscillator.frequency.linearRampToValueAtTime(220, mainStart + 0.15);
      oscillator.frequency.linearRampToValueAtTime(160, mainStart + 0.35);

      filter.type = 'lowpass';
      filter.frequency.value = 400;

      gainNode.gain.setValueAtTime(0.12, mainStart);
      gainNode.gain.linearRampToValueAtTime(0.15, mainStart + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.08, mainStart + 0.35);

      oscillator.type = 'sawtooth';
      oscillator.start(mainStart);
      oscillator.stop(mainStart + 0.35);
    }
  }

  // 播放转盘转动音效（使用 run_gamble.wav）
  playReelSpin() {
    if (this.isMuted) return;
    
    // 如果已经有转盘音效在播放，不重复播放
    if (this.currentGambleAudio && !this.currentGambleAudio.paused) {
      return;
    }
    
    // 播放转盘转动音效文件
    if (this.runGambleAudio) {
      try {
        // 克隆音频元素以支持同时播放多个实例
        const audioClone = this.runGambleAudio.cloneNode() as HTMLAudioElement;
        audioClone.volume = this.runGambleAudio.volume;
        this.currentGambleAudio = audioClone;
        
        // 播放完成后清除引用
        audioClone.addEventListener('ended', () => {
          this.currentGambleAudio = null;
        });
        
        audioClone.play().catch(e => {
          console.warn('Failed to play run_gamble audio:', e);
          this.currentGambleAudio = null;
        });
      } catch (e) {
        console.warn('Error playing run_gamble audio:', e);
      }
    }
    
    // 如果音频文件加载失败，回退到生成的音效
    if (!this.runGambleAudio) {
      const ctx = this.initAudioContext();
      if (!ctx) return;

      // 连续的滚动声
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(300, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(250, ctx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1);

      oscillator.type = 'square';
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    }
  }

  // 停止转盘转动音效
  stopReelSpin() {
    if (this.currentGambleAudio) {
      try {
        this.currentGambleAudio.pause();
        this.currentGambleAudio.currentTime = 0;
        this.currentGambleAudio = null;
      } catch (e) {
        console.warn('Error stopping run_gamble audio:', e);
      }
    }
  }

  // 播放中奖音效（使用 success.wav）
  playWin() {
    if (this.isMuted) return;
    
    // 播放成功音效文件
    this.playAudioFile(this.successAudio);
    
    // 如果音频文件加载失败，回退到生成的音效
    if (!this.successAudio) {
      const ctx = this.initAudioContext();
      if (!ctx) return;

      // 胜利音效：上升的音调
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, index) => {
        setTimeout(() => {
          this.playTone(freq, 0.3, 'sine', 0.2);
        }, index * 100);
      });
    }
  }

  // 播放大奖音效（隐藏款使用 first_love.mp3 背景音乐）
  playJackpot() {
    if (this.isMuted) return;
    
    // 先播放成功音效文件（短音效）
    this.playAudioFile(this.successAudio);
    
    // 播放隐藏款背景音乐（循环播放）
    if (this.firstLoveAudio) {
      try {
        // 停止之前可能正在播放的背景音乐
        this.stopBackgroundMusic();
        
        // 克隆音频元素以支持重新播放
        const audioClone = this.firstLoveAudio.cloneNode() as HTMLAudioElement;
        audioClone.volume = this.firstLoveAudio.volume;
        audioClone.loop = true;
        this.currentBackgroundMusic = audioClone;
        
        audioClone.play().catch(e => {
          console.warn('Failed to play first_love audio:', e);
          this.currentBackgroundMusic = null;
        });
      } catch (e) {
        console.warn('Error playing first_love audio:', e);
      }
    }
    
    // 如果音频文件加载失败，回退到生成的音效
    if (!this.successAudio && !this.firstLoveAudio) {
      const ctx = this.initAudioContext();
      if (!ctx) return;

      // 更华丽的胜利音效
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, index) => {
        setTimeout(() => {
          this.playTone(freq, 0.4, 'sine', 0.25);
        }, index * 80);
      });
    }
  }

  // 停止背景音乐
  stopBackgroundMusic() {
    if (this.currentBackgroundMusic) {
      try {
        this.currentBackgroundMusic.pause();
        this.currentBackgroundMusic.currentTime = 0;
        this.currentBackgroundMusic = null;
      } catch (e) {
        console.warn('Error stopping background music:', e);
      }
    }
  }

  // 播放失败音效
  playLose() {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    // 下降的音调
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(400, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.type = 'sawtooth';
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  }

  // 播放故障音效
  playMalfunction() {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    // 不规则的噪音
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = 100 + Math.random() * 200;
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

        oscillator.type = 'square';
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.05);
      }, i * 50);
    }
  }

  // 播放解锁音效
  playUnlock() {
    if (this.isMuted) return;
    const ctx = this.initAudioContext();
    if (!ctx) return;

    // 清脆的解锁声
    const notes = [659.25, 783.99]; // E5, G5
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, 0.2, 'sine', 0.2);
      }, index * 100);
    });
  }
}

// 创建单例
export const soundManager = new SoundManager();

// 导出便捷函数
export const playClick = () => soundManager.playClick();
export const playLeverPull = () => soundManager.playLeverPull();
export const playReelSpin = () => soundManager.playReelSpin();
export const stopReelSpin = () => soundManager.stopReelSpin();
export const playWin = () => soundManager.playWin();
export const playJackpot = () => soundManager.playJackpot();
export const stopBackgroundMusic = () => soundManager.stopBackgroundMusic();
export const playLose = () => soundManager.playLose();
export const playMalfunction = () => soundManager.playMalfunction();
export const playUnlock = () => soundManager.playUnlock();
export const setSoundMuted = (muted: boolean) => soundManager.setMuted(muted);

