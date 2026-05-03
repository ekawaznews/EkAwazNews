// ============================================================
// EK AWAZ NEWS — AUTO PUBLISHER v5.0
// FIXES: Long SEO articles (800+ words), Weather working,
// Strong dedup, 15+ tags, No hyphens, No AI signs
// Author: Umer Javed on EVERY article
// ============================================================

import fetch from 'node-fetch';

const CFG = {
  GEMINI:    process.env.GEMINI_API_KEY,
  NEWSAPI:   process.env.NEWSAPI_KEY,
  GNEWS:     process.env.GNEWS_KEY,
  WEATHER:   process.env.WEATHERAPI_KEY,
  CLD_CLOUD: process.env.CLOUDINARY_CLOUD,
  CLD_PRE:   process.env.CLOUDINARY_PRESET,
  WATERMARK: process.env.WATERMARK_URL || "https://raw.githubusercontent.com/ekawaznews/ekawaznews.github.io/main/ek-awaz-logo.png",
  FB_KEY:    "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8",
  FB_BASE:   "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents",
  AUTHOR:    "Umer Javed",
  PER_RUN:   14,
};

// ── CATEGORIES ───────────────────────────────────────────────
const CATS = {
  "Politics":      ["politics","pmln","pti","ppp","election","senator","prime minister","president","imran khan","shehbaz","zardari","nawaz sharif","vote","assembly","opposition","mna","mpa","parliament","bypolls","party","political","pdm","coalition"],
  "Government":    ["government policy","federal budget","cabinet","ministry","tax rate","ordinance","legislation","supreme court","high court","chief justice","judiciary","sbp","state bank","ogra","nepra","public sector","provincial government","cm","governor"],
  "Sports":        ["cricket","football","hockey","psl","pcb","match","tournament","squad","stadium","champion","trophy","world cup","t20","odi","test match","batting","bowling","icc","babar azam","shaheen","fifa","athlete","olympics","wicket","innings","over","run","goal"],
  "Entertainment": ["film","drama","actor","actress","celebrity","lollywood","bollywood","music","singer","award","showbiz","tv show","netflix","youtube","fashion","entertainment","ary digital","geo entertainment","hum tv","drama serial","mahira","fawad","atif aslam"],
  "Weather":       ["weather","rain","flood","temperature","heatwave","storm","cyclone","fog","monsoon","drought","wind speed","humidity","forecast","rainfall","thunderstorm","smog","snowfall","heat wave","cold wave","met department","pmd"],
  "International": ["usa","united states","america","india","china","russia","ukraine","israel","iran","saudi arabia","uae","united kingdom","europe","nato","united nations","trump","modi","white house","war","ceasefire","diplomacy","foreign minister","g20","imf","world bank","un","global"],
  "Crime":         ["murder","robbery","arrested","police","fir","kidnap","gang","drug","trafficking","corruption","fraud","theft","attack","blast","target killing","encounter","rangers","fia","raid","criminal","accused","sentenced","jail","prison","killed","shot dead","stabbed","gang war","dacoity","kidnapping"],
  "Editorials":    ["editorial","opinion","analysis","perspective","columnist","commentary","op-ed","view point"],
  "Bulletins":     ["breaking","flash","alert","urgent","just in","developing"],
  "National":      ["pakistan","karachi","lahore","islamabad","peshawar","quetta","sindh","punjab","kpk","khyber","balochistan","multan","rawalpindi","faisalabad","hyderabad","sialkot","gujranwala","sukkur","larkana","dera ghazi khan"],
};

// All Pakistani + International weather cities
const PK_CITIES   = ["Karachi","Lahore","Islamabad","Peshawar","Quetta","Multan","Faisalabad","Rawalpindi","Hyderabad","Sialkot","Gujranwala","Sukkur","Larkana","Dera Ghazi Khan","Abbottabad"];
const INTL_CITIES = ["London","Dubai","New York","Riyadh","Beijing","Delhi","Kabul","Tehran","Ankara","Washington","Paris","Istanbul","Doha","Abu Dhabi","Sydney"];

// ── DEDUP STORE ───────────────────────────────────────────────
const usedTitles = new Set();
const usedWords  = [];   // stores arrays of key words
const sleep      = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// FETCH: Pakistani News
// ─────────────────────────────────────────────────────────────
async function fetchPK() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?country=pk&pageSize=30&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[])
      .filter(a => a.title && a.description && a.title !== "[Removed]" && a.description.length > 60)
      .map(a => ({...a, _src:"PK"}));
  } catch(e) { console.log("❌ NewsAPI PK:", e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: International News
// ─────────────────────────────────────────────────────────────
async function fetchINTL() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[])
      .filter(a => a.title && a.description && a.title !== "[Removed]" && a.description.length > 60)
      .map(a => ({...a, _src:"INTL", _forcecat:"International"}));
  } catch(e) { console.log("❌ NewsAPI INTL:", e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: Crime News Pakistan
// ─────────────────────────────────────────────────────────────
async function fetchCrime() {
  try {
    const r = await fetch(`https://newsapi.org/v2/everything?q=(crime OR murder OR arrested OR police OR raid) AND pakistan&language=en&sortBy=publishedAt&pageSize=15&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[])
      .filter(a => a.title && a.description && a.title !== "[Removed]" && a.description.length > 60)
      .map(a => ({...a, _src:"Crime", _forcecat:"Crime"}));
  } catch(e) { console.log("❌ Crime:", e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: GNews (backup source)
// ─────────────────────────────────────────────────────────────
async function fetchGNews() {
  try {
    const r = await fetch(`https://gnews.io/api/v4/top-headlines?country=pk&lang=en&max=20&token=${CFG.GNEWS}`);
    const d = await r.json();
    return (d.articles||[])
      .filter(a => a.title && a.description && a.description.length > 60)
      .map(a => ({
        title:       a.title,
        description: a.description,
        content:     a.content || a.description,
        urlToImage:  a.image,
        url:         a.url,
        source:      { name: a.source?.name || "GNews" },
        publishedAt: a.publishedAt,
        _src:        "GNews"
      }));
  } catch(e) { console.log("❌ GNews:", e.message); return []; }
}

// ─────────────────────────────────────────────────────────────
// FETCH: Weather — Pakistani + International Cities
// ─────────────────────────────────────────────────────────────
async function fetchWeather() {
  if (!CFG.WEATHER) { console.log("⚠️ No WEATHERAPI_KEY set"); return []; }
  const results = [];
  const h = new Date().getHours();

  // Pick 4 PK cities + 2 INTL cities per run (rotating)
  const pkPicks   = [PK_CITIES[h % 15], PK_CITIES[(h+4)%15], PK_CITIES[(h+7)%15], PK_CITIES[(h+11)%15]];
  const intlPicks = [INTL_CITIES[h % 15], INTL_CITIES[(h+5)%15]];
  const allCities = [...pkPicks.map(c=>({city:c,isPK:true})), ...intlPicks.map(c=>({city:c,isPK:false}))];

  for (const {city, isPK} of allCities) {
    try {
      const r = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${CFG.WEATHER}&q=${encodeURIComponent(city)}&days=3&aqi=yes`
      );
      if (!r.ok) { console.log(`⚠️ Weather API error for ${city}: ${r.status}`); continue; }
      const d = await r.json();
      if (!d.current) { console.log(`⚠️ No weather data for ${city}`); continue; }

      const today  = d.forecast?.forecastday?.[0]?.day;
      const tmr    = d.forecast?.forecastday?.[1]?.day;
      const dayAfter = d.forecast?.forecastday?.[2]?.day;
      const aqi    = d.current.air_quality;
      const aqiPM  = aqi?.pm2_5 ? Math.round(aqi.pm2_5) : null;

      results.push({
        title:       `${city} Weather Report Today: ${d.current.condition.text}, Temperature ${Math.round(d.current.temp_c)}°C`,
        description: `${city} is experiencing ${d.current.condition.text.toLowerCase()} weather. Temperature: ${d.current.temp_c}°C (feels like ${d.current.feelslike_c}°C). Humidity: ${d.current.humidity}%. Wind: ${d.current.wind_kph}km/h from ${d.current.wind_dir}. UV Index: ${d.current.uv}. Visibility: ${d.current.vis_km}km. Tomorrow: ${tmr?.condition?.text||'similar'} max ${tmr?.maxtemp_c||'--'}°C min ${tmr?.mintemp_c||'--'}°C. Day after: ${dayAfter?.condition?.text||'similar'} max ${dayAfter?.maxtemp_c||'--'}°C.${aqiPM ? ` Air Quality PM2.5: ${aqiPM}µg/m³.` : ''}`,
        urlToImage:  null,
        url:         "https://www.weatherapi.com",
        source:      { name: "WeatherAPI / PMD" },
        publishedAt: new Date().toISOString(),
        _src:        "Weather",
        _forcecat:   "Weather",
        _city:       city,
        _isPK:       isPK,
        _weatherRaw: d,
      });
      console.log(`  🌤 Fetched weather: ${city}`);
    } catch(e) { console.log(`❌ Weather ${city}:`, e.message); }
    await sleep(500);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// CATEGORY DETECTION
// ─────────────────────────────────────────────────────────────
function detectCat(title, desc, forced) {
  if (forced) return forced;
  const txt = `${title} ${desc}`.toLowerCase();
  const order = ["Bulletins","Crime","Sports","Politics","Government","Entertainment","Weather","International","Editorials","National"];
  for (const cat of order) {
    if (CATS[cat]?.some(k => txt.includes(k))) return cat;
  }
  return "National";
}

// ─────────────────────────────────────────────────────────────
// DEDUP CHECK — strong word-overlap detection
// ─────────────────────────────────────────────────────────────
function isDupe(title) {
  const key = title.toLowerCase().trim().slice(0, 60);
  if (usedTitles.has(key)) return true;

  // Extract meaningful words (5+ chars)
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 5);

  // Check overlap with previously used word sets
  for (const prev of usedWords) {
    const matches = words.filter(w => prev.includes(w)).length;
    if (matches >= 3) return true; // 3+ matching words = duplicate topic
  }
  return false;
}

function markUsed(title) {
  usedTitles.add(title.toLowerCase().trim().slice(0, 60));
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 5);
  usedWords.push(words);
}

// ─────────────────────────────────────────────────────────────
// GEMINI API CALL
// ─────────────────────────────────────────────────────────────
async function gemini(prompt, maxTokens = 2000) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CFG.GEMINI}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.78, maxOutputTokens: maxTokens }
        })
      }
    );
    const d = await r.json();
    if (d.error) { console.log("Gemini API error:", d.error.message); return ""; }
    return (d.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch(e) { console.log("❌ Gemini:", e.message); return ""; }
}

// ─────────────────────────────────────────────────────────────
// REWRITE — Long SEO Articles (800+ words)
// ─────────────────────────────────────────────────────────────
async function rewrite(article, cat) {

  // ── ABSOLUTE RULES (applied to ALL content types) ─────────
  const RULES = `
STRICT WRITING RULES — NEVER BREAK THESE:
1. Write ONLY in flowing HTML paragraphs. Use <p>text</p> tags for each paragraph.
2. NO bullet points. NO numbered lists. NO dashes as list markers.
3. NO em dashes (—). NO hyphens connecting ideas. Use a period or comma instead.
4. NEVER use these words/phrases: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably, Importantly, It should be noted, In a significant development, It is important to note, As we know, Needless to say
5. NEVER start the article with: "In a", "In an", "In the", "This is", "There is", "There are"
6. Active voice ALWAYS. Short clear sentences. 3 to 4 sentences per paragraph.
7. Sound exactly like a real Dawn.com or BBC journalist. Zero AI tone.
8. Bold important names and facts using <strong>name</strong> tags.
9. Separate each paragraph with a blank line.
10. Output ONLY HTML. No markdown. No asterisks (*). No hash (#) headings unless specified.
`;

  let bodyPrompt = "";

  // ── WEATHER ARTICLE (600+ words) ──────────────────────────
  if (cat === "Weather") {
    const city   = article._city || "Pakistan";
    const isPK   = article._isPK;
    const wd     = article._weatherRaw;
    const curr   = wd?.current;
    const today  = wd?.forecast?.forecastday?.[0]?.day;
    const tmr    = wd?.forecast?.forecastday?.[1]?.day;
    const day2   = wd?.forecast?.forecastday?.[2]?.day;
    const aqi    = curr?.air_quality?.pm2_5 ? Math.round(curr.air_quality.pm2_5) : null;

    bodyPrompt = `${RULES}
You are a senior weather reporter at Ek Awaz News. Write a COMPLETE 650-word weather report for ${city} in HTML format.

REAL WEATHER DATA TO USE:
- Current condition: ${curr?.condition?.text || article.description}
- Temperature: ${curr?.temp_c}°C (feels like: ${curr?.feelslike_c}°C)
- Humidity: ${curr?.humidity}%
- Wind: ${curr?.wind_kph} km/h from ${curr?.wind_dir}
- UV Index: ${curr?.uv}
- Visibility: ${curr?.vis_km} km
- Pressure: ${curr?.pressure_mb} mb
${aqi ? `- Air Quality (PM2.5): ${aqi}µg/m³` : ""}
- Today high/low: ${today?.maxtemp_c}°C / ${today?.mintemp_c}°C
- Chance of rain today: ${today?.daily_chance_of_rain || 0}%
- Tomorrow: ${tmr?.condition?.text}, High ${tmr?.maxtemp_c}°C, Low ${tmr?.mintemp_c}°C, Rain chance ${tmr?.daily_chance_of_rain || 0}%
- Day after tomorrow: ${day2?.condition?.text}, High ${day2?.maxtemp_c}°C, Low ${day2?.mintemp_c}°C

STRUCTURE (all in flowing prose paragraphs):
<h2>Current Weather Conditions in ${city}</h2>
<p>Opening paragraph: describe the current situation vividly</p>

<h2>Temperature and Humidity</h2>
<p>Detailed temp, humidity, wind, UV, visibility analysis</p>

<h2>Impact on Daily Life</h2>
<p>How this weather is affecting commuters, businesses, schools, outdoor activities in ${city}</p>
${aqi ? `<h2>Air Quality Alert</h2><p>Explain the air quality reading and safety advice</p>` : ""}

<h2>2-Day Forecast</h2>
<p>Tomorrow and day after tomorrow forecast in detail</p>

<h2>Safety Precautions</h2>
<p>Practical safety tips relevant to today's conditions (heat/rain/fog/cold)</p>

<h2>Met Department Advisory</h2>
<p>${isPK ? "What Pakistan Meteorological Department (PMD) advises for this weather" : "Official weather advisory for " + city}</p>

Close with: <p>Stay tuned to <strong>Ek Awaz News</strong> for real-time weather updates from across ${isPK ? "Pakistan" : "the world"}. Our weather team monitors conditions 24 hours a day to keep you safe and informed.</p>`;

  // ── CRIME ARTICLE (700+ words) ─────────────────────────────
  } else if (cat === "Crime") {
    bodyPrompt = `${RULES}
You are a senior crime correspondent at Ek Awaz News Pakistan.
Write a COMPLETE 700-word factual crime report in HTML format.

STRICT CRIME JOURNALISM RULES:
- Report ONLY verifiable facts from the original source. Zero speculation.
- Include: what happened, exact location, when, who (only officially named persons)
- Use "allegedly" and "accused of" for unproven claims
- Include official police/government statement
- State clearly if suspect is arrested, at large, or under investigation
- NO graphic violence descriptions
- NO private victim personal information  
- NO invented details or speculation
- Always add: "Police have registered an FIR and investigations are underway"

STRUCTURE:
<h2>[Descriptive headline about the crime]</h2>
<p>Lead: What happened, where, when — most important fact first</p>

<h2>Incident Details</h2>
<p>Full details of what occurred based on official reports</p>

<h2>Police Response</h2>
<p>How police responded, what action was taken, arrests made</p>

<h2>Official Statement</h2>
<p>Quote or paraphrase of official police/government statement</p>

<h2>Background</h2>
<p>Relevant context — has this happened before in this area? Crime trends?</p>

<h2>Legal Proceedings</h2>
<p>FIR details, court appearance, bail status if known</p>

<h2>Investigation Status</h2>
<p>What investigators are doing, any leads, timeline</p>

Close with: <p><strong>Ek Awaz News</strong> will continue monitoring this case and provide updates as the investigation progresses. Citizens with information are urged to contact their local police station.</p>

Original report:
Title: ${article.title}
Details: ${article.description}
Source: ${article.source?.name || "News report"}`;

  // ── EDITORIAL / COLUMN (900+ words) ───────────────────────
  } else if (cat === "Editorials" || cat === "Columns") {
    bodyPrompt = `${RULES}
You are a senior political analyst at Ek Awaz News Pakistan writing a newspaper column.
Write a COMPLETE 900-word editorial in HTML format.

STRUCTURE (flowing prose, NO bullet lists):
<h2>[Compelling column title related to topic]</h2>
<p>Opening paragraph: A powerful, thought-provoking statement about what is happening and why every Pakistani should care</p>

<h2>The Current Situation</h2>
<p>Detailed analysis of what is happening right now, with facts and figures</p>

<h2>Historical Context</h2>
<p>How did we get here? Relevant Pakistani history or precedent that explains the current situation</p>

<h2>Political Dimensions</h2>
<p>How different political parties and figures are responding or are involved</p>

<h2>Economic and Social Impact</h2>
<p>Real impact on ordinary Pakistani families, businesses, and communities</p>

<h2>What Experts Are Saying</h2>
<p>What analysts, economists, or subject matter experts think about this development</p>

<h2>Regional and International Implications</h2>
<p>How this affects Pakistan's relationships with neighbors and the wider world</p>

<h2>The Way Forward</h2>
<p>What should Pakistan's government, institutions, and citizens do? What are the realistic options?</p>

<p>Powerful closing thought: A memorable final statement that summarizes the stakes</p>

Topic: ${article.title}
Background: ${article.description}`;

  // ── BULLETIN (300 words) ───────────────────────────────────
  } else if (cat === "Bulletins") {
    bodyPrompt = `${RULES}
You are a breaking news reporter at Ek Awaz News Pakistan.
Write a 300-word urgent breaking news bulletin in HTML format.

<p><strong>BREAKING:</strong> [Single most important fact — the core of the story]</p>

<h2>What We Know So Far</h2>
<p>All confirmed facts available at this time</p>

<h2>Official Response</h2>
<p>What authorities or officials have said (if available)</p>

<p>Close with: <strong>Ek Awaz News</strong> is actively monitoring this developing situation. Refresh this page for the latest updates as they come in.</p>

News: ${article.title}. ${article.description}`;

  // ── STANDARD ARTICLE: National, International, Sports, etc. (800+ words) ──
  } else {
    const isIntl   = cat === "International";
    const isSports = cat === "Sports";
    const isPol    = cat === "Politics";
    const isEnt    = cat === "Entertainment";

    bodyPrompt = `${RULES}
You are a professional senior journalist at Ek Awaz News Pakistan writing for a Pakistani audience.
Write a COMPLETE 850-word news article in HTML format.

STRUCTURE (all flowing prose, NO bullet lists):

<h2>[Rewrite the headline to be specific and compelling]</h2>

<p>LEAD PARAGRAPH: The single most important fact stated clearly. Who did what, when, where. Hook the reader immediately.</p>

<h2>Full Story Details</h2>
<p>Expand on the lead. All key facts, figures, names, dates, and locations. Be specific.</p>

<h2>${isSports ? "Match/Event Details" : isPol ? "Political Background" : isEnt ? "More About This Story" : "Background and Context"}</h2>
<p>${isSports ? "Detailed match facts, player performances, statistics, tournament standing" : isPol ? "What led to this development. Party positions, previous statements, political history" : isEnt ? "More details about the personalities involved and the significance" : "Why this happened. What events or decisions led to this point."}</p>

<h2>${isIntl ? "Pakistan's Perspective" : "Impact on Pakistan"}</h2>
<p>${isIntl ? "How this international development affects Pakistan, its foreign policy, economy, or security" : "How this news directly affects Pakistani citizens, businesses, or government policy"}</p>

<h2>Official Statements and Reactions</h2>
<p>What officials, spokespeople, experts, or affected parties have said. Include any available quotes or statements.</p>

<h2>Regional Context</h2>
<p>${isIntl ? "How neighboring countries and regional powers are responding to this development" : "How this compares to similar developments in other Pakistani provinces or regions"}</p>

<h2>What Analysts Are Saying</h2>
<p>Expert opinion, analyst commentary, or civil society reaction to this news</p>

<h2>What Happens Next</h2>
<p>Concrete next steps, upcoming events, deadlines, or decisions that will follow from this story</p>

<p>Closing: A strong final paragraph summarizing the significance and what readers should watch for.</p>

Source article:
Title: ${article.title}
Content: ${article.description}${article.content && article.content !== article.description ? "\nAdditional details: " + article.content.slice(0, 400) : ""}
Source: ${article.source?.name || "News Agency"}`;
  }

  // ── SEO TITLE ──────────────────────────────────────────────
  const seoPrompt = `Write an SEO-optimized news headline for a Pakistani audience.
Original: "${article.title}"
Category: ${cat}
Rules:
- Under 65 characters total
- Include the main keyword in first 3 words if possible
- Compelling and click-worthy like Dawn.com or Geo.tv
- NO em dashes, NO excessive punctuation
- NO clickbait words like "shocking", "unbelievable"
Return ONLY the headline text. No quotes. Nothing else.`;

  // ── META DESCRIPTION ───────────────────────────────────────
  const metaPrompt = `Write a Google search meta description for this news article.
Headline: "${article.title}"
Category: ${cat}
Rules:
- Between 148 and 158 characters EXACTLY
- Include the main keyword naturally
- Factual, informative, click-worthy
- End with " — Ek Awaz News"
Return ONLY the description. Nothing else. Count characters carefully.`;

  // ── TAGS (15+ tags) ────────────────────────────────────────
  const tagsPrompt = `Generate exactly 15 to 18 SEO tags for this Pakistani news article.
Headline: "${article.title}"
Category: ${cat}

Include tags for:
- Main topic keywords
- People or organizations mentioned
- Location (city, province, country)
- Category keywords
- Related topics Pakistani readers would search
- Urdu/English mixed relevant terms

Return ONLY a plain comma-separated list. Example: Pakistan, Lahore, PTI, Imran Khan, Punjab, Cricket, PCB, T20, National News, Pakistan News, Breaking News, Ek Awaz News
No hashtags. No numbering. No quotes. One line only.`;

  // Call Gemini for all 4 outputs
  console.log(`    ✍️  Writing article body...`);
  const body = await gemini(bodyPrompt, 2200);
  await sleep(800);
  console.log(`    🔍  Writing SEO title...`);
  const seoTitle = await gemini(seoPrompt, 100);
  await sleep(600);
  console.log(`    📝  Writing meta description...`);
  const metaDesc = await gemini(metaPrompt, 180);
  await sleep(600);
  console.log(`    🏷️  Generating tags...`);
  const tags = await gemini(tagsPrompt, 200);

  // ── CLEAN OUTPUT ───────────────────────────────────────────
  const cleanBody = (body || "<p>" + (article.description || "Content not available.") + "</p>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^#+\s+(.+)$/gm, (m, t) => `<h2>${t}</h2>`)
    .replace(/^[-•]\s+(.+)$/gm, "<p>$1</p>")
    .replace(/^\d+\.\s+(.+)$/gm, "<p>$1</p>")
    .replace(/ — /g, ". ")
    .replace(/—/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    body:     cleanBody,
    seoTitle: (seoTitle || article.title).replace(/['"]/g, "").slice(0, 70),
    metaDesc: (metaDesc || "").slice(0, 160),
    tags:     tags || "Pakistan, News, Breaking News, Ek Awaz News, Pakistani News, Latest News",
  };
}

// ─────────────────────────────────────────────────────────────
// UPLOAD IMAGE TO CLOUDINARY + WATERMARK
// ─────────────────────────────────────────────────────────────
async function uploadImage(imgUrl, title) {
  const placeholder = `https://placehold.co/1200x630/CC0000/ffffff?text=${encodeURIComponent((title || "Ek Awaz News").slice(0, 28))}`;
  const src = (imgUrl && imgUrl.startsWith("http")) ? imgUrl : placeholder;

  try {
    const form = new FormData();
    form.append("file", src);
    form.append("upload_preset", CFG.CLD_PRE);
    form.append("folder", "ekawaz-auto");

    // Resize to standard 1200x630 + watermark bottom-right
    const wm = Buffer.from(CFG.WATERMARK).toString("base64");
    form.append("eager", `w_1200,h_630,c_fill,g_auto/l_fetch:${wm},w_160,g_south_east,x_12,y_12,o_80`);

    const r = await fetch(
      `https://api.cloudinary.com/v1_1/${CFG.CLD_CLOUD}/image/upload`,
      { method: "POST", body: form }
    );
    const d = await r.json();
    return d.eager?.[0]?.secure_url || d.secure_url || src;
  } catch(e) {
    console.log("❌ Cloudinary:", e.message);
    return src;
  }
}

// ─────────────────────────────────────────────────────────────
// SAVE TO FIREBASE — Exact structure matching index.html
// ─────────────────────────────────────────────────────────────
async function savePost(post) {
  const id = Date.now();
  const catKey = post.category.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "national";

  const doc = {
    fields: {
      id:            { integerValue: String(id) },
      title:         { stringValue: post.title },
      excerpt:       { stringValue: post.excerpt },
      body:          { stringValue: post.body },
      category:      { stringValue: post.category },
      categories:    { arrayValue: { values: [{ stringValue: post.category }] } },
      cat_key:       { stringValue: catKey },
      type:          { stringValue: post.type || "Article" },
      author:        { stringValue: CFG.AUTHOR },
      status:        { stringValue: "published" },
      isHeadline:    { booleanValue: false },
      views:         { integerValue: "0" },
      likes:         { integerValue: "0" },
      _liked:        { booleanValue: false },
      date:          { stringValue: new Date().toISOString() },
      lastEditedAt:  { stringValue: new Date().toISOString() },
      lastEditedBy:  { stringValue: "Auto Publisher" },
      image:         { stringValue: post.image || "" },
      video:         { stringValue: "" },
      audio:         { stringValue: "" },
      pdf:           { stringValue: "" },
      tags:          { arrayValue: { values: post.tagsArr.map(t => ({ stringValue: t.trim() })) } },
      seoTitle:      { stringValue: post.seoTitle || post.title },
      seoDesc:       { stringValue: post.metaDesc || post.excerpt },
      series:        { stringValue: "" },
      scheduledAt:   { stringValue: "" },
      ad_slot:       { stringValue: "" },
      sourceUrl:     { stringValue: post.sourceUrl || "" },
      sourceName:    { stringValue: post.sourceName || "" },
      autoPublished: { booleanValue: true },
      revisions:     { arrayValue: { values: [] } },
    }
  };

  try {
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz_posts?documentId=post_${id}&key=${CFG.FB_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) }
    );
    if (r.ok) {
      console.log(`  ✅ [${post.category}] "${post.title.slice(0, 55)}"`);
      return id;
    }
    const err = await r.json();
    console.log("  ❌ Firebase error:", JSON.stringify(err).slice(0, 150));
  } catch(e) { console.log("  ❌ Firebase:", e.message); }
  return null;
}

// ─────────────────────────────────────────────────────────────
// UPDATE TICKER
// ─────────────────────────────────────────────────────────────
async function updateTicker(headlines) {
  try {
    const body = {
      fields: {
        ticker: { arrayValue: { values: headlines.slice(0, 15).map(h => ({ stringValue: `• ${h}` })) } },
        tickerUpdatedAt: { stringValue: new Date().toISOString() }
      }
    };
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CFG.FB_KEY}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (r.ok) console.log(`📺 Ticker updated: ${headlines.length} headlines`);
  } catch(e) { console.log("❌ Ticker:", e.message); }
}

// ─────────────────────────────────────────────────────────────
// LOAD RECENT TITLES FROM FIREBASE (dedup)
// ─────────────────────────────────────────────────────────────
async function loadRecent() {
  try {
    const r = await fetch(`${CFG.FB_BASE}/ekawaz_posts?pageSize=200&key=${CFG.FB_KEY}`);
    const d = await r.json();
    (d.documents || []).forEach(doc => {
      const t = doc.fields?.title?.stringValue;
      if (t) markUsed(t);
    });
    console.log(`📋 Dedup: loaded ${usedTitles.size} recent titles`);
  } catch(e) { console.log("⚠️ Could not load recent titles:", e.message); }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log("════════════════════════════════════════════════");
  console.log("   🗞️  EK AWAZ NEWS — AUTO PUBLISHER v5.0");
  console.log(`   ⏰  ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`);
  console.log(`   📌  Author: Umer Javed | Target: ${CFG.PER_RUN} articles`);
  console.log("════════════════════════════════════════════════\n");

  // Load recent to avoid duplicates
  await loadRecent();

  // Fetch all sources in parallel
  console.log("📡 Fetching news from all sources...\n");
  const [pk, intl, crime, gnews, weather] = await Promise.all([
    fetchPK(), fetchINTL(), fetchCrime(), fetchGNews(), fetchWeather()
  ]);

  const all = [...pk, ...intl, ...crime, ...gnews, ...weather];
  console.log(`\n📰 Fetched: ${all.length} total`);
  console.log(`   PK:${pk.length} | INTL:${intl.length} | Crime:${crime.length} | GNews:${gnews.length} | Weather:${weather.length}\n`);

  // Filter duplicates, shuffle, pick PER_RUN
  const fresh = all
    .filter(a => a.title && !isDupe(a.title))
    .sort(() => Math.random() - 0.5)
    .slice(0, CFG.PER_RUN);

  console.log(`✏️  Processing ${fresh.length} unique articles...\n`);

  const published = [];
  let count = 0;

  for (const [i, article] of fresh.entries()) {
    try {
      const cat = detectCat(article.title, article.description || "", article._forcecat);

      // Set content type and author title per category
      let type = "Article";
      let authorTitle = "Staff Reporter";
      if (cat === "Editorials" || cat === "Columns") { type = "Column";  authorTitle = "Senior Analyst"; }
      else if (cat === "Bulletins")   { type = "Bulletin"; authorTitle = "News Desk"; }
      else if (cat === "Crime")       { authorTitle = "Senior Reporter"; }
      else if (cat === "Weather")     { authorTitle = "Weather Correspondent"; }
      else if (cat === "International") { authorTitle = "International Correspondent"; }
      else if (cat === "Sports")      { authorTitle = "Sports Reporter"; }
      else if (cat === "Politics")    { authorTitle = "Political Reporter"; }
      else if (cat === "Entertainment") { authorTitle = "Entertainment Reporter"; }

      console.log(`\n[${i+1}/${fresh.length}] ── ${cat.toUpperCase()} ──`);
      console.log(`   "${article.title.slice(0, 65)}"`);

      // Rewrite with Gemini
      const rw = await rewrite(article, cat);

      // Validate body length
      if (!rw.body || rw.body.length < 200) {
        console.log(`  ⚠️  Body too short (${rw.body?.length || 0} chars), skipping`);
        continue;
      }

      console.log(`  📄  Body: ${rw.body.length} chars | Tags: ${rw.tags.split(",").length}`);

      // Upload image with watermark
      const image = await uploadImage(article.urlToImage || null, article.title);

      // Parse tags into array, ensure at least 10 tags
      let tagsArr = (rw.tags || "Pakistan, News").split(",").map(t => t.trim()).filter(Boolean);
      // Add fallback tags if less than 10
      const fallbackTags = ["Pakistan", "Ek Awaz News", "Pakistani News", "Latest News", "Breaking News", cat, "Umer Javed", "News Pakistan"];
      while (tagsArr.length < 10) {
        const fb = fallbackTags.find(t => !tagsArr.includes(t));
        if (fb) tagsArr.push(fb); else break;
      }

      // Save to Firebase
      const saved = await savePost({
        title:      rw.seoTitle || article.title,
        excerpt:    rw.metaDesc || (article.description || "").slice(0, 155),
        body:       rw.body,
        category:   cat,
        type,
        authorTitle,
        image,
        seoTitle:   rw.seoTitle,
        metaDesc:   rw.metaDesc,
        tagsArr,
        sourceUrl:  article.url || "",
        sourceName: article.source?.name || "",
      });

      if (saved) {
        count++;
        published.push(rw.seoTitle || article.title);
        markUsed(article.title);
      }

      // 4 second pause (respect Gemini rate limits)
      await sleep(4000);

    } catch(e) {
      console.log(`  ⚠️  Error:`, e.message);
    }
  }

  // Update breaking news ticker
  if (published.length > 0) await updateTicker(published);

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log("\n════════════════════════════════════════════════");
  console.log(`   ✅ DONE! Published ${count}/${fresh.length} articles`);
  console.log(`   ⏱️  Time: ${mins} minutes`);
  console.log(`   📅  Next run: 1 hour`);
  console.log("════════════════════════════════════════════════\n");
}

main().catch(e => { console.error("💥 Fatal error:", e); process.exit(1); });
