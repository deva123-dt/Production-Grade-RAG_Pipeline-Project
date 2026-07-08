import dotenv from "dotenv";
dotenv.config();
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
console.log("GEMINI_API_KEY present:", !!apiKey);

const ai = new GoogleGenAI({ apiKey });

const texts = [
  "Parental leave can be taken an...",
  "This Corporate Employee Handbo...",
  "Remote employees are expected ...",
];

async function run() {
  const promises = texts.map(async (text) => {
    try {
      const response = await ai.models.embedContent({
        model: "text-embedding-004", // Let's check both models!
        contents: text,
      });
      console.log(`Success text-embedding-004 for "${text}":`, !!response);
    } catch (err: any) {
      console.error(`Failed text-embedding-004 for "${text}":`, err.message || err);
    }

    try {
      const response = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: text,
      });
      console.log(`Success gemini-embedding-2-preview for "${text}":`, !!response);
    } catch (err: any) {
      console.error(`Failed gemini-embedding-2-preview for "${text}":`, err.message || err);
    }
  });

  await Promise.all(promises);
}

run();
