import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateBedtimeWhisper = async (winningItemLabel: string): Promise<string> => {
  if (!process.env.API_KEY) {
    return "星光洒落在枕边，晚安，好梦。"; // Fallback if no key
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a very short, poetic, and soothing sentence (maximum 20 words) in Chinese to coax someone to sleep. 
      The theme should be related to: "${winningItemLabel}". 
      The tone should be sweet, warm, and comforting, like a mother whispering to a child or a lover whispering goodnight.
      Do not add quotation marks.`,
      config: {
        temperature: 0.7,
      }
    });

    return response.text ? response.text.trim() : "晚安。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "夜深了，星星都睡了，你也快睡吧。";
  }
};