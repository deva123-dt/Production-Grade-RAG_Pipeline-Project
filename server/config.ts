import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  PORT: 3000,
  HOST: "0.0.0.0",
};

export function validateConfig() {
  if (!CONFIG.GEMINI_API_KEY) {
    console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in the environment. Please configure it in your Secrets panel.");
  }
}
