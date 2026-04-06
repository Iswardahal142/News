// api/cron.js — AI-Powered Assam News Bot
const TelegramBot = require("node-telegram-bot-api");
const Parser = require("rss-parser");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const RSS_FEEDS = [
  { name: "📍 Biswanath", url: "https://news.google.com/rss/search?q=Biswanath+Assam&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "📍 Naduar", url: "https://news.google.com/rss/search?q=Naduar+Assam&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "🌏 Assam", url: "https://news.google.com/rss/search?q=Assam&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "🗞 Northeast Now", url: "https://nenow.in/feed" },
  { name: "🗞 Sentinel Assam", url: "https://www.sentinelassam.com/feed/" },
];

// ── Breaking news keywords ──────────────────────────────────────────────────
const BREAKING_KEYWORDS = [
  "dead", "death", "killed", "dies", "blast", "explosion", "bomb",
  "accident", "crash", "fire", "flood", "earthquake", "attack",
  "murder", "riot", "arrested", "missing", "tragedy", "disaster",
  "injured", "critical", "emergency", "strike", "shutdown"
];

// ── Skip/filter keywords (teer, lottery, etc.) ─────────────────────────────
const SKIP_KEYWORDS = [
  "teer", "tir result", "shillong teer", "khanapara teer", "lottery", "lucky number"
];

// ── Category detection ──────────────────────────────────────────────────────
const CATEGORIES = [
  { tag: "🔴 Crime", keywords: ["murder", "killed", "arrested", "robbery", "theft", "rape", "assault", "crime", "police", "fir", "custody", "drug"] },
  { tag: "🏛 Politics", keywords: ["bjp", "congress", "minister", "election", "vote", "cm ", "chief minister", "mla", "mp ", "party", "government", "modi", "himanta"] },
  { tag: "🌦 Weather", keywords: ["flood", "rain", "storm", "cyclone", "earthquake", "landslide", "drought", "weather", "temperature"] },
  { tag: "⚽ Sports", keywords: ["football", "cricket", "match", "tournament", "player", "team", "goal", "win", "loss", "ipl", "league"] },
  { tag: "💼 Business", keywords: ["market", "economy", "startup", "investment", "trade", "company", "industry", "bank", "gdp", "price"] },
  { tag: "🎓 Education", keywords: ["school", "college", "university", "exam", "student", "teacher", "result", "admission"] },
  { tag: "🏥 Health", keywords: ["hospital", "disease", "covid", "dengue", "malaria", "health", "doctor", "medicine", "patient", "outbreak"] },
];

function detectBreaking(title) {
  const lower = title.toLowerCase();
  return BREAKING_KEYWORDS.some(kw => lower.includes(kw));
}

function detectCategory(title) {
  const lower = title.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) return cat.tag;
  }
  return "📰 General";
}

function shouldSkip(title) {
  const lower = title.toLowerCase();
  return SKIP_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Duplicate topic filter ─────────────────────────────────────────────────
// Top 3 meaningful words from title = topic fingerprint
function getTopicKey(title) {
  const stopWords = new Set(["the", "a", "an", "in", "on", "at", "of", "to", "is", "are", "was", "were", "and", "or", "for", "with", "from", "by"]);
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 3)
    .sort()
    .join("_");
  return `topic:${words}`;
}

async function isTopicSeen(topicKey) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${topicKey}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    return data.result !== null;
  } catch { return false; }
}

async function markTopicSeen(topicKey) {
  try {
    // 12 hours expiry — same topic can reappear next cycle
    await fetch(`${UPSTASH_URL}/set/${topicKey}/1/ex/43200`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}

// ── Article sent check ─────────────────────────────────────────────────────
async function isSent(id) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/sent:${id}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    return data.result !== null;
  } catch { return false; }
}

async function markSent(id) {
  try {
    await fetch(`${UPSTASH_URL}/set/sent:${id}/1/ex/604800`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {}
}


// ── Get all recipients from Redis ─────────────────────────────────────────
async function getRecipients() {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/news:users`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    const users = data.result ? JSON.parse(decodeURIComponent(data.result)) : [];
    const ids = users.map(u => u.chatId);
    // Always include owner
    if (OWNER_CHAT_ID && !ids.includes(OWNER_CHAT_ID)) ids.unshift(OWNER_CHAT_ID);
    return ids;
  } catch {
    return OWNER_CHAT_ID ? [OWNER_CHAT_ID] : [];
  }
}

// ── AI Summary ─────────────────────────────────────────────────────────────
async function summarizeWithAI(title, description) {
  try {
    const prompt = `News title: ${title}
Description: ${description || "N/A"}

Ei news-khini Assamese bhashat 4-5 ta bullet point-ot likhok.
Kevol bullet points likhiba, aaru kono text nalikhiba.
Pratita point-t ekota maat thakiba.
Bullet points-ৰ মাজত কোনো blank line নাৰাখিবা।
Format:
• point 1
• point 2
• point 3
• point 4`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://newsbyishwar.vercel.app",
        "X-Title": "Assam News Bot",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4-nano",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("AI error:", err.message);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escapeHtml(text = "") {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMessage(item, feedName, aiSummary, isBreaking, category) {
  const title = escapeHtml(item.title || "");
  const pubDate = item.pubDate
    ? new Date(item.pubDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
      })
    : "";

  const header = isBreaking
    ? `🚨 <b>BREAKING NEWS</b> 🚨\n${category} | ${feedName}\n🕐 ${pubDate}`
    : `${category} | ${feedName}\n🕐 ${pubDate}`;

  let msg = `${header}\n\n<b>${title}</b>\n\n`;

  if (aiSummary) {
    const lines = aiSummary.split("\n").filter(l => l.trim());
    const formatted = lines
      .map(line => line.replace(/^[•\-\*]\s*/, ""))
      .map(line => `▪️ ${escapeHtml(line)}`)
      .join("\n\n");
    msg += formatted;
  }

  return msg;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Main handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const bot = new TelegramBot(BOT_TOKEN);
  const parser = new Parser({
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 10000,
    customFields: {
      item: [['source', 'source', { keepArray: false }]]
    }
  });
  let totalSent = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      const items = result.items.slice(0, 5);

      for (const item of items) {
        const rawId = item.guid || item.link || item.title || "";
        const id = Buffer.from(rawId).toString("base64").substring(0, 40);

        // Skip if exact article already sent
        if (await isSent(id)) continue;

        // Skip teer / lottery / unwanted topics
        if (shouldSkip(item.title || "")) {
          console.log(`⏭ Teer/unwanted skipped: ${item.title}`);
          continue;
        }

        // Skip if same topic already covered from another source
        const topicKey = getTopicKey(item.title || "");
        if (await isTopicSeen(topicKey)) {
          console.log(`⏭ Duplicate topic skipped: ${item.title}`);
          continue;
        }

        const isBreaking = detectBreaking(item.title || "");
        const category = detectCategory(item.title || "");
        const description = item.contentSnippet || item.content || item.description || "";
        const aiSummary = await summarizeWithAI(item.title, description);
        const message = formatMessage(item, feed.name, aiSummary, isBreaking, category);
        const sourceName = item.source?.title || item['source.title'] || feed.name;

        try {
          const recipients = await getRecipients();
          for (const chatId of recipients) {
            try {
              await bot.sendMessage(chatId, message, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: `📰 ${sourceName}`, web_app: { url: item.link } }],
                    [{ text: "👌 Ok", callback_data: "delete_msg" }]
                  ]
                }
              });
              await sleep(500);
            } catch (e) { console.error(`Send error [${chatId}]:`, e.message); }
          }
          await markSent(id);
          await markTopicSeen(topicKey);
          totalSent++;
          await sleep(1000);
        } catch (err) { console.error("Telegram error:", err.message); }
      }
    } catch (err) { console.error(`Feed error [${feed.name}]:`, err.message); }
  }

  console.log(`✅ Total sent: ${totalSent}`);
  return res.status(200).json({ success: true, sent: totalSent });
};
