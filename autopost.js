// ============================================================
// EK AWAZ NEWS — AUTO PUBLISHER (GitHub Actions Ready)
// Every article → Author: Umer Javed
// Runs every 1 hour via GitHub Actions (FREE)
// ============================================================

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const CONFIG = {
  // ── API KEYS from GitHub Secrets (do NOT change these lines) ─
  GEMINI_API_KEY:   process.env.GEMINI_API_KEY,
  NEWSAPI_KEY:      process.env.NEWSAPI_KEY,
  GNEWS_KEY:        process.env.GNEWS_KEY,
  WEATHERAPI_KEY:   process.env.WEATHERAPI_KEY,
  CLOUDINARY_CLOUD: process.env.CLOUDINARY_CLOUD,
  CLOUDINARY_PRESET:process.env.CLOUDINARY_PRESET,

  // ── YOUR FIREBASE (already in your site — safe to keep here) ─
  FIREBASE_KEY:    "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8",
  FIREBASE_BASE:   "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents",

  // ── WATERMARK — paste your Cloudinary logo URL here ──────────
  // After uploading ek-awaz-logo.png to Cloudinary, paste the URL:
  WATERMARK_URL: process.env.WATERMARK_URL || "",

  // ── FIXED SETTINGS (do not change) ───────────────────────────
  AUTHOR:           "Umer Javed",
  AUTHOR_TITLE:     "Staff Reporter",
  ARTICLES_PER_RUN: 14,
  SITE_URL:         "https://ekawaznews.github.io",
};

// ─────────────────────────────────────────────────────────────
// CATEGORIES — auto detected from keywords
// ─────────────────────────────────────────────────────────────
const CATEGORY_MAP = {
  "Politics":      ["politics","minister","parliament","pmln","pti","ppp","election","senator","prime minister","president","imran","shehbaz","zardari","nawaz","vote","coalition","assembly","opposition","political"],
  "Government":    ["government policy","federal","provincial","cabinet","ministry","budget","tax","ordinance","legislation","chief justice","supreme court","high court","judiciary","cj"],
  "Sports":        ["cricket","football","hockey","psl","pcb","match","tournament","player","team","score","fifa","squad","stadium","champion","trophy","world cup","test match","odi","t20","batting","bowling"],
  "Entertainment": ["film","drama","actor","actress","celebrity","lollywood","bollywood","music","singer","award","showbiz","tv show","netflix","youtube","fashion","model","entertainment"],
  "Weather":       ["weather","rain","flood","temperature","heatwave","storm","cyclone","fog","monsoon","drought","wind","humidity","rainfall","thunderstorm","smog","snowfall","heat wave","cold wave","weather update","weather forecast","weather report","pmd forecast","met office"],
  "International": ["india-pakistan","china-pakistan","us-pakistan","russia ukraine","middle east","nato","united nations","un security","ceasefire","diplomacy","foreign minister","foreign policy","bilateral","geopolitical","iran nuclear","saudi crown","modi government","white house statement","trump administration","global summit","world leaders"],
  "Crime":         ["murder","robbery","arrested","police","fir","kidnap","gang","drug","trafficking","corruption","fraud","theft","attack","blast","target killing","encounter","ranger","fia","raid","criminal","accused","convict","jail","prison","sentenced"],
  "Editorials":    ["editorial","opinion","analysis","perspective","columnist","view","comment"],
  "Bulletins":     ["breaking","flash","alert","urgent","bulletin","latest update"],
  "National":      ["pakistan","karachi","lahore","islamabad","peshawar","quetta","sindh","punjab","kpk","balochistan","multan","rawalpindi","faisalabad","hyderabad","sialkot","gujranwala"],
};

// Pakistani weather cities
const PK_CITIES = ["Karachi","Lahore","Islamabad","Peshawar","Quetta","Multan","Faisalabad","Rawalpindi","Hyderabad","Sialkot"];
const INTL_CITIES = ["London","Dubai","New York","Riyadh","Beijing","Delhi","Kabul","Tehran","Ankara"];

// Already-posted titles this run (dedup)
const postedTitles = new Set();

// ─────────────────────────────────────────────────────────────
// FETCH: NewsAPI — Pakistani news
// ─────────────────────────────────────────────────────────────
async function fetchPakistanNews() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?country=pk&pageSize=30&apiKey=${CONFIG.NEWSAPI_KEY}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]").map(a=>({...a,_region:"National"}));
  } catch(e) { console.log("NewsAPI PK error:",e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: NewsAPI — International news
// ─────────────────────────────────────────────────────────────
async function fetchInternationalNews() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${CONFIG.NEWSAPI_KEY}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]").map(a=>({...a,_region:"International"}));
  } catch(e) { console.log("NewsAPI INTL error:",e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: NewsAPI — Crime news Pakistan
// ─────────────────────────────────────────────────────────────
async function fetchCrimeNews() {
  try {
    const r = await fetch(`https://newsapi.org/v2/everything?q=crime+pakistan+police+arrested&language=en&sortBy=publishedAt&pageSize=15&apiKey=${CONFIG.NEWSAPI_KEY}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]").map(a=>({...a,_region:"Crime"}));
  } catch(e) { console.log("Crime news error:",e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: GNews — backup source
// ─────────────────────────────────────────────────────────────
async function fetchGNews() {
  try {
    const r = await fetch(`https://gnews.io/api/v4/top-headlines?country=pk&lang=en&max=20&token=${CONFIG.GNEWS_KEY}`);
    const d = await r.json();
    return (d.articles||[]).map(a=>({
      title:a.title, description:a.description, content:a.content,
      urlToImage:a.image, url:a.url, publishedAt:a.publishedAt,
      source:{name:a.source?.name||"GNews"}, _region:"National"
    }));
  } catch(e) { console.log("GNews error:",e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: Weather — Pakistani + International cities
// ─────────────────────────────────────────────────────────────
async function fetchWeather() {
  const results = [];
  // 3 PK cities + 2 international per run (rotate)
  const hour = new Date().getHours();
  const pkCities = [PK_CITIES[hour % PK_CITIES.length], PK_CITIES[(hour+1) % PK_CITIES.length], PK_CITIES[(hour+2) % PK_CITIES.length]];
  const intlCities = [INTL_CITIES[hour % INTL_CITIES.length], INTL_CITIES[(hour+1) % INTL_CITIES.length]];
  const allCities = [...pkCities.map(c=>({city:c,isPK:true})), ...intlCities.map(c=>({city:c,isPK:false}))];

  for(const {city, isPK} of allCities) {
    try {
      const r = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${CONFIG.WEATHERAPI_KEY}&q=${city}&days=2&aqi=yes`);
      const d = await r.json();
      if(!d.current) continue;
      results.push({
        title: `${city} Weather Today: ${d.current.condition.text}, ${Math.round(d.current.temp_c)}°C`,
        description: `Weather in ${city}: ${d.current.condition.text}. Temperature ${d.current.temp_c}°C, feels like ${d.current.feelslike_c}°C. Humidity ${d.current.humidity}%, Wind ${d.current.wind_kph} km/h. Tomorrow: ${d.forecast?.forecastday?.[1]?.day?.condition?.text||""}`,
        urlToImage: null,
        source: {name:"WeatherAPI"},
        publishedAt: new Date().toISOString(),
        _region: isPK ? "Weather-PK" : "Weather-INTL",
        _city: city,
        _weatherData: d,
      });
    } catch(e) { console.log(`Weather ${city} error:`,e.message); }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// AUTO-DETECT CATEGORY
// ─────────────────────────────────────────────────────────────
function detectCategory(title, desc, region) {
  const text = `${title} ${desc}`.toLowerCase();
  for(const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if(keywords.some(kw => text.includes(kw))) return cat;
  }
  if(region==="International") return "International";
  if(region&&region.startsWith("Weather")) return "Weather";
  if(region==="Crime") return "Crime";
  return "National";
}

// ─────────────────────────────────────────────────────────────
// CALL GEMINI API
// ─────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.75,maxOutputTokens:1200}})
    }
  );
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

// ─────────────────────────────────────────────────────────────
// REWRITE ARTICLE — Journalist style, no AI look
// ─────────────────────────────────────────────────────────────
// Wrap plain text into HTML <p> tags
function wrapInParagraphs(text) {
  if (!text) return '';
  if (text.includes('<p>') || text.includes('<h2>')) return text; // already HTML
  // Split on double newlines or single newlines
  const paras = text.split(/\n{2,}|(?<=\.)\s*\n(?=[A-Z])/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 0) return `<p>${text}</p>`;
  return paras.map(p => `<p>${p}</p>`).join('\n');
}

async function rewriteArticle(article, category) {
  const isWeather  = category === "Weather";
  const isCrime    = category === "Crime";
  const isEditorial= category === "Editorials";
  const isBulletin = category === "Bulletins";

  let bodyPrompt = "";

  if(isWeather) {
    bodyPrompt = `You are a weather reporter for Ek Awaz News Pakistan.
Write a 300-word weather report for ${article._city||"Pakistan"}.
Include: current temperature, feels like, humidity, wind speed, conditions.
Include tomorrow's forecast.
Add safety tips if weather is severe (rain/heat/fog).
Write like a real TV weather bulletin — conversational and helpful.
End with: "Stay updated with Ek Awaz News for the latest weather."
Data: ${article.description}`;

  } else if(isCrime) {
    bodyPrompt = `You are a senior crime reporter for Ek Awaz News Pakistan.
Write a factual 350-word crime news report based on this publicly reported news.
RULES:
- Report ONLY what is stated in the original report (no speculation)
- Include: What happened, Where, When, Who (if publicly named by police)
- Mention if suspect arrested or at large
- Include police/official statement
- Do NOT include graphic violence
- Do NOT reveal private victim information
- End with: "Police have registered an FIR and investigation is underway" if applicable
- Write like Dawn.com crime section
Source news: Title: ${article.title}. Details: ${article.description}`;

  } else if(isEditorial) {
    bodyPrompt = `You are a senior political analyst writing an opinion column for Ek Awaz News.
Write a 500-word editorial/column on this topic.
Structure:
1. Strong opening thesis (what is happening and why it matters)
2. Analysis of the current situation
3. Historical context for Pakistani readers
4. Impact on Pakistan and its people
5. What should be done / what to expect
6. Closing thought
Write like a Dawn.com editorial. Use intelligent, professional language.
No robotic phrases. Sound like an experienced Pakistani journalist.
Topic: ${article.title}. Background: ${article.description}`;

  } else if(isBulletin) {
    bodyPrompt = `You are a breaking news reporter for Ek Awaz News Pakistan.
Write a short 150-200 word urgent bulletin.
Start with BREAKING: or JUST IN:
Include the most important facts only.
End with "More details to follow. Stay with Ek Awaz News."
News: ${article.title}. ${article.description}`;

  } else {
    bodyPrompt = `You are a professional journalist for Ek Awaz News Pakistan.
Rewrite this news in 350-400 words.
RULES:
1. Write like BBC/Dawn.com — professional, clear, factual
2. Use inverted pyramid: most important fact first
3. Short sentences. Active voice.
4. Include: Who, What, When, Where, Why (5W)
5. Add Pakistani context where relevant
6. Include a quote from official if mentioned in original
7. End with: what happens next / what to watch
8. DO NOT use: "Furthermore", "Moreover", "In conclusion", "It is worth noting", "Notably"
9. Sound like a real human journalist, NOT an AI
Category: ${category}
Original: Title: ${article.title}
Content: ${article.description||""}
Source: ${article.source?.name||"News Agency"}`;
  }

  // SEO Title prompt
  const seoPrompt = `Write an SEO news headline for Pakistan audience.
Original: "${article.title}"
Rules: Under 65 characters. Include main keyword. Compelling. Like Dawn.com headline.
Return ONLY the headline. Nothing else.`;

  // Meta description prompt
  const metaPrompt = `Write a Google meta description for this news.
News: "${article.title}. ${(article.description||"").slice(0,100)}"
Rules: 140-155 characters exactly. Include keyword. End with "— Ek Awaz News".
Return ONLY the description. Nothing else.`;

  // Tags prompt
  const tagsPrompt = `Generate 6 SEO tags for Pakistan news audience.
News: "${article.title}"
Return ONLY comma-separated tags. Example: Pakistan, Karachi, PTI, Cricket
No hashtags. No quotes.`;

  try {
    // Call all Gemini requests (with small delays to avoid rate limit)
    const rawBody = await callGemini(bodyPrompt);
    await new Promise(r=>setTimeout(r,500));
    const seoTitle = await callGemini(seoPrompt);
    await new Promise(r=>setTimeout(r,500));
    const metaDesc = await callGemini(metaPrompt);
    await new Promise(r=>setTimeout(r,500));
    const tags = await callGemini(tagsPrompt);

    // Wrap body in <p> tags if plain text (site expects HTML)
    const body = wrapInParagraphs(rawBody || article.description || "");

    return {
      body:     body,
      seoTitle: (seoTitle||article.title).slice(0,70),
      metaDesc: (metaDesc||article.description||"").slice(0,160),
      tags:     tags || "Pakistan, News, Ek Awaz",
    };
  } catch(e) {
    console.log("Gemini error:",e.message);
    return {
      body:     article.description || article.title,
      seoTitle: article.title.slice(0,70),
      metaDesc: (article.description||"").slice(0,155) + " — Ek Awaz News",
      tags:     "Pakistan, News",
    };
  }
}

// ─────────────────────────────────────────────────────────────
// UPLOAD IMAGE TO CLOUDINARY + ADD WATERMARK
// ─────────────────────────────────────────────────────────────
async function uploadImage(imageUrl, title) {
  const placeholder = `https://via.placeholder.com/1200x630/CC0000/ffffff?text=${encodeURIComponent((title||"Ek Awaz News").slice(0,25))}`;
  const sourceUrl = imageUrl || placeholder;

  try {
    // Upload image via JSON body (more reliable than FormData with node-fetch)
    const uploadBody = {
      file: sourceUrl,
      upload_preset: CONFIG.CLOUDINARY_PRESET,
      folder: "ekawaz-news",
      transformation: "w_1200,h_630,c_fill,g_center",
    };

    const r = await fetch(
      `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD}/image/upload`,
      { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(uploadBody) }
    );
    const d = await r.json();

    if (!d.secure_url) {
      console.log("Cloudinary no URL returned:", JSON.stringify(d).slice(0,100));
      return sourceUrl;
    }

    // Apply watermark via Cloudinary URL transformation (most reliable method)
    if (CONFIG.WATERMARK_URL) {
      try {
        const wmB64 = Buffer.from(CONFIG.WATERMARK_URL).toString('base64');
        const parts  = d.secure_url.split('/upload/');
        // Bottom-left watermark, 150px wide, 85% opacity
        return `${parts[0]}/upload/w_1200,h_630,c_fill/l_fetch:${wmB64},w_150,g_south_west,x_12,y_12,o_85/${parts[1]}`;
      } catch(we) {
        console.log("Watermark transform error:", we.message);
        return d.secure_url;
      }
    }

    return d.secure_url;
  } catch(e) {
    console.log("Cloudinary error:", e.message);
    return sourceUrl;
  }
}

// ─────────────────────────────────────────────────────────────
// SAVE POST TO FIREBASE
// ─────────────────────────────────────────────────────────────
async function saveToFirebase(post) {
  const id = Date.now();
  const body = {
    fields: {
      id:            {integerValue: String(id)},
      title:         {stringValue: post.title},
      excerpt:       {stringValue: post.excerpt},
      body:          {stringValue: post.body},
      author:        {stringValue: CONFIG.AUTHOR},
      authorTitle:   {stringValue: post.authorTitle || CONFIG.AUTHOR_TITLE},
      category:      {stringValue: post.category},
      cat_key:       {stringValue: post.category.toLowerCase().replace(/[^a-z]/g,"")},
      type:          {stringValue: post.type},
      status:        {stringValue: "published"},
      date:          {stringValue: new Date().toISOString()},
      image:         {stringValue: post.image || ""},
      seoTitle:      {stringValue: post.seoTitle || post.title},
      metaDesc:      {stringValue: post.metaDesc || post.excerpt},
      tags:          {stringValue: post.tags || "Pakistan"},
      views:         {integerValue: "0"},
      likes:         {integerValue: "0"},
      source:        {stringValue: post.source || ""},
      sourceUrl:     {stringValue: post.sourceUrl || ""},
      autoPublished: {booleanValue: true},
    }
  };

  try {
    const r = await fetch(
      `${CONFIG.FIREBASE_BASE}/ekawaz_posts?documentId=post_${id}&key=${CONFIG.FIREBASE_KEY}`,
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}
    );
    if(r.ok) { console.log(`  ✅ Saved: ${post.title.slice(0,55)}...`); return id; }
    const err = await r.json(); console.log("  ❌ Firebase error:", JSON.stringify(err).slice(0,100));
  } catch(e) { console.log("  ❌ Firebase save error:", e.message); }
  return null;
}

// ─────────────────────────────────────────────────────────────
// UPDATE NEWS TICKER
// ─────────────────────────────────────────────────────────────
async function updateTicker(headlines) {
  try {
    const items = headlines.slice(0,12);
    const body = {
      fields: {
        ticker: {arrayValue:{values: items.map(t=>({stringValue:`• ${t}`}))}},
        tickerUpdatedAt: {stringValue: new Date().toISOString()}
      }
    };
    await fetch(
      `${CONFIG.FIREBASE_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CONFIG.FIREBASE_KEY}`,
      {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}
    );
    console.log(`\n📺 Ticker updated with ${items.length} headlines`);
  } catch(e) { console.log("Ticker error:", e.message); }
}

// ─────────────────────────────────────────────────────────────
// LOAD RECENT TITLES (avoid duplicates)
// ─────────────────────────────────────────────────────────────
async function loadRecentTitles() {
  try {
    const r = await fetch(`${CONFIG.FIREBASE_BASE}/ekawaz_posts?pageSize=100&key=${CONFIG.FIREBASE_KEY}`);
    const d = await r.json();
    (d.documents||[]).forEach(doc => {
      const t = doc.fields?.title?.stringValue;
      if(t) postedTitles.add(t.toLowerCase().slice(0,60));
    });
    console.log(`📋 Loaded ${postedTitles.size} recent titles (dedup check)`);
  } catch(e) { console.log("Could not load recent titles:", e.message); }
}

// ─────────────────────────────────────────────────────────────
// MAIN — runs every hour
// ─────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log("═══════════════════════════════════════");
  console.log("🗞️  EK AWAZ NEWS — AUTO PUBLISHER");
  console.log(`⏰  ${new Date().toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}`);
  console.log("═══════════════════════════════════════\n");

  // Load recent to avoid duplicates
  await loadRecentTitles();

  // Fetch all sources in parallel
  console.log("📡 Fetching news from all sources...");
  const [pkNews, intlNews, crimeNews, gnews, weather] = await Promise.all([
    fetchPakistanNews(),
    fetchInternationalNews(),
    fetchCrimeNews(),
    fetchGNews(),
    fetchWeather(),
  ]);

  const all = [...pkNews, ...intlNews, ...crimeNews, ...gnews, ...weather];
  console.log(`📰 Total fetched: ${all.length} articles`);

  // Deduplicate within this run first (same story from multiple sources)
  const seenThisRun = new Set();
  const dedupedAll = all.filter(a => {
    if (!a.title) return false;
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0, 50);
    if (seenThisRun.has(key)) return false;
    seenThisRun.add(key);
    return true;
  });

  // Filter already-posted titles + shuffle
  const fresh = dedupedAll
    .filter(a => a.title && !postedTitles.has(a.title.toLowerCase().slice(0,60)))
    .sort(() => Math.random() - 0.5)
    .slice(0, CONFIG.ARTICLES_PER_RUN);

  console.log(`✏️  Processing ${fresh.length} articles this run...\n`);

  const published = [];
  let count = 0;

  for(const article of fresh) {
    try {
      const category = detectCategory(article.title, article.description||"", article._region);

      // Content type
      let type = "Article";
      let authorTitle = "Staff Reporter";
      if(category==="Editorials") { type="Column"; authorTitle="Senior Analyst"; }
      else if(category==="Bulletins") { type="Bulletin"; authorTitle="News Desk"; }
      else if(category==="Crime") { type="Article"; authorTitle="Senior Reporter"; }
      else if(category==="Weather") { type="Article"; authorTitle="Weather Correspondent"; }
      else if(category==="International") { type="Article"; authorTitle="International Correspondent"; }

      console.log(`[${count+1}/${fresh.length}] ${category} → ${article.title.slice(0,50)}...`);

      // Rewrite with Gemini
      const rewritten = await rewriteArticle(article, category);

      // Upload image with watermark
      const image = await uploadImage(article.urlToImage||null, article.title);

      // Save to Firebase
      const saved = await saveToFirebase({
        title:      rewritten.seoTitle || article.title,
        excerpt:    rewritten.metaDesc || (article.description||"").slice(0,155),
        body:       rewritten.body,
        category,
        type,
        authorTitle,
        image,
        seoTitle:   rewritten.seoTitle,
        metaDesc:   rewritten.metaDesc,
        tags:       rewritten.tags,
        source:     article.source?.name || "",
        sourceUrl:  article.url || "",
      });

      if(saved) {
        count++;
        published.push(rewritten.seoTitle || article.title);
        postedTitles.add(article.title.toLowerCase().slice(0,60));
      }

      // 3 second pause between articles (respect rate limits)
      await new Promise(r => setTimeout(r, 3000));

    } catch(e) {
      console.log(`  ⚠️  Skipped: ${e.message}`);
    }
  }

  // Update ticker
  if(published.length > 0) await updateTicker(published);

  const mins = ((Date.now()-startTime)/60000).toFixed(1);
  console.log("\n═══════════════════════════════════════");
  console.log(`✅ DONE! Published ${count} articles in ${mins} mins`);
  console.log(`📅 Next run: in 1 hour`);
  console.log("═══════════════════════════════════════\n");
}

main().catch(e => { console.error("Fatal error:", e); process.exit(1); });
