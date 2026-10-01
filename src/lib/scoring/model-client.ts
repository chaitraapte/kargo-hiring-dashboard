import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

let client: GoogleGenerativeAI | null = null;

function getClient() {
  if (!client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not configured");
    client = new GoogleGenerativeAI(key);
  }
  return client;
}

/**
 * Single chokepoint for all AI calls. Swapping providers means editing only
 * this file.
 */
export async function generateText(
  systemPrompt: string,
  userContent: string,
  opts: { json?: boolean } = {}
): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: process.env.SCORING_MODEL || "gemini-3.8-flash",
    systemInstruction: systemPrompt,
    generationConfig: opts.json ? { responseMimeType: "application/json" } : undefined,
  });
  const result = await model.generateContent(userContent);
  return result.response.text();
}
