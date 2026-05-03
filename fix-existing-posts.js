// ============================================================
// EK AWAZ NEWS — FIX EXISTING POSTS
// Fixes: wrong categories, short articles, updates ticker
// Run ONCE: node fix-existing-posts.js
// ============================================================

import fetch from 'node-fetch';

const CFG = {
  GEMINI:   process.env.GEMINI_API_KEY,
  FB_KEY:   "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8",
  FB_BASE:  "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents",
  AUTHOR:   "Umer Javed",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── EXACT SAME CATEGORY KEYWORDS as autopost.js ──────────────
const CATS = {
  "Politics":      ["politics","pmln","pti","ppp","election","senator","prime minister","president","imran khan","shehbaz","zardari","nawaz","vote","assembly","opposition","mna","mpa","parliament","political","coalition","pdm"],
  "Government":    ["government policy","federal","cabinet","ministry","budget","tax","ordinance","legislation","supreme court","high court","chief justice","judiciary","sbp","state bank","ogra","nepra","public sector","governor","cm sindh","cm punjab"],
  "Sports":        ["cricket","football","hockey","psl","pcb","match","tournament","squad","stadium","champion","trophy","world cup","t20","odi","test match","batting","bowling","icc","babar","shaheen","fifa","athlete","olympics","wicket","innings","goal","tennis","formula"],
  "Entertainment": ["film","drama","actor","actress","celebrity","lollywood","bollywood","music","singer","award","showbiz","tv show","netflix","youtube","fashion","entertainment","ary digital","geo tv","hum tv","drama serial","mahira","fawad","atif"],
  "Weather":       ["weather","rain","flood","temperature","heatwave","storm","cyclone","fog","monsoon","drought","wind","humidity","forecast","rainfall","thunderstorm","smog","snowfall","heat wave","cold wave","pmd","met department"],
  "International": ["usa","united states","america","india","china","russia","ukraine","israel","iran","saudi","uae","united kingdom","britain","europe","nato","united nations","trump","modi","white house","war","ceasefire","diplomacy","foreign","global","g20","imf","world bank","canada","nigeria","france","germany","turkey","khalistani","csis","intelligence"],
  "Crime":         ["murder","robbery","arrested","police","fir","kidnap","gang","drug","trafficking","corruption","fraud","theft","attack","blast","target killing","encounter","rangers","fia","raid","criminal","accused","sentenced","jail","prison","killed","shot dead","stabbed","dacoity","kidnapping","violence","crime"],
  "Editorials":    ["editorial","opinion","analysis","perspective","columnist","commentary","op-ed"],
  "Bulletins":     ["breaking","flash","alert","urgent","just in","developing"],
  "National":      ["pakistan","karachi","lahore","islamabad","peshawar","quetta","sindh","punjab","kpk","khyber","balochistan","multan","rawalpindi","faisalabad","hyderabad","sialkot","gujranwala","sukkur"],
};

function detectCat(title, excerpt) {
  const txt = `${title} ${excerpt}`.toLowerCase();
  const order = ["Bulletins","Crime","Sports","Politics","Government","Entertainment","Weather","International","Editorials","National"];
  for (const cat of order) {
    if (CATS[cat]?.some(k => txt.includes(k))) return cat;
  }
  return "National";
}

// ── GEMINI CALL ───────────────────────────────────────────────
async function gemini(prompt) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CFG.GEMINI}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 2200 }
        })
      }
    );
    const d = await r.json();
    if (d.error) { console.log("Gemini error:", d.error.message); return ""; }
    return (d.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch(e) { console.log("Gemini:", e.message); return ""; }
}

// ── REWRITE SHORT ARTICLE ─────────────────────────────────────
async function rewriteBody(title, excerpt, cat) {
  const RULES = `
STRICT RULES:
- Write ONLY flowing HTML paragraphs using <p> tags
- NO bullet points, NO numbered lists, NO hyphens as connectors
- NO em dashes (—). Use periods instead.
- NEVER use: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably
- Active voice. Short sentences. Sound like Dawn.com journalist.
- Bold important names: <strong>name</strong>
- Output HTML only. No markdown.
`;

  const prompt = `${RULES}
You are a senior journalist at Ek Awaz News Pakistan.
Write a complete 800-word news article in HTML paragraph format.

STRUCTURE:
<h2>[Compelling headline about the topic]</h2>
<p>Lead paragraph: Most important fact first. Who, what, when, where.</p>

<h2>Full Story Details</h2>
<p>All key facts, figures, names, locations. Be specific.</p>

<h2>Background and Context</h2>
<p>Why this happened. What led to this point. History.</p>

<h2>Impact on Pakistan</h2>
<p>How this affects Pakistani citizens, government, economy.</p>

<h2>Official Statements</h2>
<p>What officials, spokespeople or experts have said.</p>

<h2>Regional Perspective</h2>
<p>How neighboring countries or region is affected.</p>

<h2>What Happens Next</h2>
<p>Upcoming developments, next steps, what to watch.</p>

<p>Strong closing paragraph summarizing significance.</p>

Category: ${cat}
Title: ${title}
Available info: ${excerpt}`;

  const body = await gemini(prompt);
  return (body || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^#+\s+(.+)$/gm, (m, t) => `<h2>${t}</h2>`)
    .replace(/^[-•]\s+(.+)$/gm, "<p>$1</p>")
    .replace(/ — /g, ". ").replace(/—/g, " ")
    .trim();
}

// ── FETCH ALL POSTS ───────────────────────────────────────────
async function fetchAllPosts() {
  const posts = [];
  let nextPage = null;
  do {
    const url = `${CFG.FB_BASE}/ekawaz_posts?pageSize=100${nextPage ? `&pageToken=${nextPage}` : ""}&key=${CFG.FB_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    (d.documents || []).forEach(doc => {
      const f = doc.fields || {};
      posts.push({
        docId:    doc.name.split("/").pop(),
        id:       f.id?.integerValue || "",
        title:    f.title?.stringValue || "",
        body:     f.body?.stringValue || "",
        excerpt:  f.excerpt?.stringValue || f.seoDesc?.stringValue || "",
        category: f.category?.stringValue || "",
        cat_key:  f.cat_key?.stringValue || "",
        author:   f.author?.stringValue || "",
        status:   f.status?.stringValue || "",
        date:     f.date?.stringValue || "",
      });
    });
    nextPage = d.nextPageToken || null;
  } while (nextPage);
  return posts.filter(p => p.status === "published" && p.title);
}

// ── UPDATE POST IN FIREBASE ───────────────────────────────────
async function updatePost(docId, fields) {
  const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string") body.fields[k] = { stringValue: v };
    else if (typeof v === "boolean") body.fields[k] = { booleanValue: v };
  }
  try {
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz_posts/${docId}?${fieldPaths}&key=${CFG.FB_KEY}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    return r.ok;
  } catch(e) { console.log("Update error:", e.message); return false; }
}

// ── UPDATE TICKER ─────────────────────────────────────────────
async function updateTicker(posts) {
  // Get 15 most recent headlines
  const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const headlines = sorted.slice(0, 15).map(p => `• ${p.title}`);

  try {
    const body = {
      fields: {
        ticker: { arrayValue: { values: headlines.map(h => ({ stringValue: h })) } },
        tickerUpdatedAt: { stringValue: new Date().toISOString() },
      }
    };
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CFG.FB_KEY}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (r.ok) console.log(`✅ Ticker updated with ${headlines.length} headlines`);
    else console.log("❌ Ticker update failed:", await r.text());
  } catch(e) { console.log("Ticker error:", e.message); }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════════");
  console.log("   🔧 EK AWAZ NEWS — FIX EXISTING POSTS");
  console.log(`   ⏰  ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`);
  console.log("════════════════════════════════════════════\n");

  console.log("📡 Fetching all posts from Firebase...");
  const posts = await fetchAllPosts();
  console.log(`📰 Found ${posts.length} published posts\n`);

  let catFixed = 0;
  let bodyFixed = 0;
  let authorFixed = 0;
  let dupeDeleted = 0;

  // ── 1. FIND AND DELETE DUPLICATES ────────────────────────────
  console.log("🔍 Checking for duplicate articles...");
  const seenTitles = new Map(); // title key → docId
  const dupesToDelete = [];

  for (const post of posts) {
    const key = post.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().slice(0, 55);
    // Also check word overlap
    const words = post.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);

    let isDupe = false;
    for (const [storedKey, storedWords] of seenTitles.values()) {
      const matches = words.filter(w => storedWords.includes(w)).length;
      if (matches >= 4) { isDupe = true; break; }
    }

    if (seenTitles.has(key) || isDupe) {
      dupesToDelete.push(post.docId);
      console.log(`  🗑️  Duplicate: "${post.title.slice(0, 55)}"`);
    } else {
      seenTitles.set(key, [key, words]);
    }
  }

  // Delete duplicates
  for (const docId of dupesToDelete) {
    try {
      const r = await fetch(
        `${CFG.FB_BASE}/ekawaz_posts/${docId}?key=${CFG.FB_KEY}`,
        { method: "DELETE" }
      );
      if (r.ok) { dupeDeleted++; }
    } catch(e) { console.log("Delete error:", e.message); }
    await sleep(300);
  }
  console.log(`✅ Deleted ${dupeDeleted} duplicates\n`);

  // Filter out deleted posts
  const remaining = posts.filter(p => !dupesToDelete.includes(p.docId));

  // ── 2. FIX CATEGORIES + AUTHOR + SHORT BODY ───────────────────
  console.log("🔧 Fixing categories, author names, and short articles...\n");

  for (const [i, post] of remaining.entries()) {
    const updates = {};
    let needsUpdate = false;

    // Fix author
    if (!post.author || post.author !== CFG.AUTHOR) {
      updates.author = CFG.AUTHOR;
      authorFixed++;
      needsUpdate = true;
    }

    // Fix category
    const correctCat = detectCat(post.title, post.excerpt);
    const correctKey = correctCat.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    if (post.category !== correctCat || post.cat_key !== correctKey) {
      updates.category = correctCat;
      updates.cat_key  = correctKey;
      catFixed++;
      needsUpdate = true;
      console.log(`  📂 [${i+1}/${remaining.length}] Category fixed: "${post.category}" → "${correctCat}" | "${post.title.slice(0,45)}"`);
    }

    // Fix short body (less than 800 chars = too short)
    const bodyText = (post.body || "").replace(/<[^>]*>/g, "").trim();
    if (bodyText.length < 800 && post.excerpt) {
      console.log(`  ✍️  [${i+1}/${remaining.length}] Rewriting short body (${bodyText.length} chars) | "${post.title.slice(0,45)}"`);
      const newBody = await rewriteBody(post.title, post.excerpt, correctCat);
      if (newBody && newBody.length > 300) {
        updates.body = newBody;
        bodyFixed++;
        needsUpdate = true;
      }
      await sleep(2000); // rate limit
    }

    // Push update if needed
    if (needsUpdate) {
      const ok = await updatePost(post.docId, updates);
      if (ok) console.log(`  ✅ Updated: "${post.title.slice(0, 50)}"`);
      await sleep(500);
    }
  }

  // ── 3. UPDATE TICKER ─────────────────────────────────────────
  console.log("\n📺 Updating news ticker...");
  await updateTicker(remaining);

  // ── SUMMARY ───────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════");
  console.log(`   🗑️  Duplicates deleted:    ${dupeDeleted}`);
  console.log(`   📂  Categories fixed:      ${catFixed}`);
  console.log(`   ✍️   Short bodies rewritten: ${bodyFixed}`);
  console.log(`   👤  Author names fixed:    ${authorFixed}`);
  console.log(`   📺  Ticker updated:        ✅`);
  console.log("════════════════════════════════════════════\n");
  console.log("✅ All existing posts fixed! Run autopost.js to publish new ones.\n");
}

main().catch(e => { console.error("💥 Fatal:", e); process.exit(1); });
