// api/cron.js — AI-Powered Assam News Bot
const TelegramBot = require("node-telegram-bot-api");
const Parser = require("rss-parser");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const RSS_FEEDS = [
  {
    name: "📍 Biswanath",
    url: "https://news.google.com/rss/search?q=Biswanath+Assam&hl=en-IN&gl=IN&ceid=IN:en",
  },
  {
    name: "📍 Naduar",
    url: "https://news.google.com/rss/search?q=Naduar+Assam&hl=en-IN&gl=IN&ceid=IN:en",
  },
  {
    name: "🌏 Assam",
    url: "https://news.google.com/rss/search?q=Assam&hl=en-IN&gl=IN&ceid=IN:en",
  },
  {
    name: "🗞 Northeast Now",
    url: "https://nenow.in/feed",
  },
  {
    name: "🗞 Sentinel Assam",
    url: "https://www.sentinelassam.com/feed/",
  },
];

// In-memory cache (Vercel serverless ke liye)
const sentCache = new Set();

// ============================================
// AI SUMMARIZATION — OpenRouter
// ============================================
async function summarizeWithAI(title, description) {
  try {
    const prompt = `Niche ek news article ka title aur description diya gaya hai.
Isse exactly 4-5 bullet points mein Hindi mein summarize karo.
Seedha bullet points likho, koi introduction mat likho.
Har bullet point "•" se shuru ho.
Short aur clear rakho — ek bullet mein 1 hi baat.

Title: ${title}
Description: ${description || "N/A"}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://assam-news-bot.vercel.app",
        "X-Title": "Assam News Bot",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();
    return summary || null;
  } catch (err) {
    console.error("AI error:", err.message);
    return null;
  }
}

// ============================================
// MESSAGE FORMAT
// ============================================
function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMessage(item, sourceName, aiSummary) {
  const title = escapeHtml(item.title || "");
  const link = item.link || "";
  const pubDate = item.pubDate
    ? new Date(item.pubDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : "";

  let message = `${sourceName} | ⏰ ${pubDate}\n\n`;
  message += `<b>${title}</b>\n\n`;

  if (aiSummary) {
    message += `${escapeHtml(aiSummary)}\n\n`;
  }

  message += `🔗 <a href="${link}">Poora padho</a>`;
  return message;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================
// MAIN HANDLER
// ============================================
export default async function handler(req, res) {
  const bot = new TelegramBot(BOT_TOKEN);
  const parser = new Parser({
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)" },
    timeout: 10000,
  });

  let totalSent = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      const items = result.items.slice(0, 3); // har feed se top 3

      for (const item of items) {
        // Unique ID banao
        const rawId = item.guid || item.link || item.title || "";
        const id = Buffer.from(rawId).toString("base64").substring(0, 40);

        if (sentCache.has(id)) continue;

        // AI se summarize karo
        const description =
          item.contentSnippet || item.content || item.description || "";
        const aiSummary = await summarizeWithAI(item.title, description);

        // Message format karo
        const message = formatMessage(item, feed.name, aiSummary);

        // Telegram pe bhejo
        try {
          await bot.sendMessage(CHAT_ID, message, {
            parse_mode: "HTML",
            disable_web_page_preview: false,
          });
          sentCache.add(id);
          totalSent++;

          // Rate limit avoid karo
          await sleep(1500);
        } catch (err) {
          console.error("Telegram send error:", err.message);
        }
      }
    } catch (err) {
      console.error(`Feed error [${feed.name}]:`, err.message);
    }
  }

  console.log(`✅ Total sent: ${totalSent}`);
  return res.status(200).json({ success: true, sent: totalSent });
}
