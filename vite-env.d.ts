/// <reference types="vite/client" />

// 声明音频文件模块类型
declare module '*.wav' {
  const src: string;
  export default src;
}

declare module '*.wav?url' {
  const src: string;
  export default src;
}

declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.mp3?url' {
  const src: string;
  export default src;
}

