export interface SlotItem {
  id: string;
  emoji: string;
  label: string;
  color: string; // Tailwind text color class
  message: string; // The sweet comforting message
  isHidden?: boolean; // New property for the secret item
}

export enum GameStatus {
  IDLE = 'IDLE',
  SPINNING = 'SPINNING',
  COMPLETED = 'COMPLETED',
}

export interface SpinResult {
  items: [SlotItem, SlotItem, SlotItem];
  isWin: boolean;
  isJackpot: boolean;
}

// Declaration for the window confetti object
declare global {
  interface Window {
    confetti: any;
  }
}