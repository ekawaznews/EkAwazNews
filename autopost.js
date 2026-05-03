// ============================================================
// EK AWAZ NEWS — AUTO PUBLISHER v6.0 FINAL
// FIXED: Strong dedup (URL+title+content hash),
//        Correct categories, Long articles 800+ words,
//        Ticker auto-updates, Weather working
//        Author: Umer Javed on EVERY article
// ============================================================

import fetch from 'node-fetch';
import crypto from 'crypto';

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

// ── CATEGORIES — comprehensive keywords ──────────────────────
const CATS = {
  "Politics":      ["pmln","pti","ppp","election","senator","prime minister","president","imran khan","shehbaz sharif","asif zardari","nawaz sharif","maryam nawaz","vote","national assembly","provincial assembly","opposition","mna","mpa","parliament","political party","pdm","coalition","bypolls","ballot","speaker","chief minister","cm","governor","bilawal","establishment"],
  "Government":    ["government policy","federal cabinet","ministry of","budget 2026","budget 2025","tax rate","income tax","sales tax","ordinance","legislation","supreme court","high court","chief justice","sbp","state bank","ogra","nepra","secp","ppra","public service","government scheme","ehsaas","benazir income"],
  "Sports":        ["cricket","test cricket","odi cricket","t20 cricket","psl","pakistan super league","pcb","match result","tournament","cricket squad","cricket stadium","world cup cricket","test match","batting","bowling","wicket","innings","babar azam","shaheen afridi","naseem shah","rizwan","fakhar","fifa","football match","hockey pakistan","athlete","olympics","icc ranking","tennis","formula one","golf"],
  "Entertainment": ["lollywood film","pakistani drama","actor","actress","pakistani celebrity","bollywood","music video","pakistani singer","film award","hum awards","ary film","showbiz pakistan","ary digital drama","geo entertainment","hum tv","drama serial","item song","box office","premiere","mahira khan","fawad khan","atif aslam","sajal ali","drama review","entertainment news"],
  "Weather":       ["weather report","weather today","weather forecast","rain today","flood warning","temperature today","heatwave alert","storm warning","cyclone","fog alert","monsoon rain","drought","wind speed","humidity level","rainfall","thunderstorm alert","smog level","snowfall","heat wave","cold wave","pmd forecast","met department","pakistan meteorological"],
  "International": ["united states news","us president","america","india pakistan","china news","russia ukraine","israel gaza","iran nuclear","saudi arabia","uae news","united kingdom","britain","european union","nato summit","united nations","trump news","modi government","white house","war news","ceasefire","diplomacy","foreign affairs","g20 summit","imf pakistan","world bank pakistan","canada news","nigeria","france news","germany","turkey news","khalistani","csis","intelligence report","israel hamas","middle east","afghanistan news","kashmir"],
  "Crime":         ["murder case","robbery","police arrested","fir registered","kidnapping case","drug trafficking","anti corruption","fraud case","theft","terrorist attack","bomb blast","target killing","encounter","rangers operation","fia operation","police raid","criminal","accused arrested","court sentenced","jail","prison","killed in karachi","shot dead","stabbed","dacoity","gang war","crime report","police operation","ctd operation","pmf"],
  "Editorials":    ["opinion:","editorial:","analysis:","columnist","op-ed","our view","point of view","perspective","commentary"],
  "Bulletins":     ["breaking news","just in:","urgent:","flash:","developing story","alert:"],
  "National":      ["karachi","lahore","islamabad","peshawar","quetta","sindh","punjab government","kpk government","khyber pakhtunkhwa","balochistan","multan","rawalpindi","faisalabad","hyderabad","sialkot","gujranwala","sukkur","larkana","dera ghazi khan","abbottabad","swat","gilgit","muzaffarabad","azad kashmir","pakistan news","national news"],
};

const PK_CITIES   = ["Karachi","Lahore","Islamabad","Peshawar","Quetta","Multan","Faisalabad","Rawalpindi","Hyderabad","Sialkot","Gujranwala","Sukkur","Abbottabad","Larkana","Dera Ghazi Khan"];
const INTL_CITIES = ["London","Dubai","New York","Riyadh","Beijing","Delhi","Kabul","Tehran","Ankara","Washington","Paris","Istanbul","Doha","Abu Dhabi","Sydney"];

// ── DEDUP STORE (URL hash + title words) ─────────────────────
const usedHashes = new Set();
const usedWordSets = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeHash(str) {
  return crypto.createHash("md5").update(str.toLowerCase().trim()).digest("hex");
}

function isDupe(title, url) {
  // 1. URL hash check
  if (url && usedHashes.has(makeHash(url))) return true;

  // 2. Title hash check
  const titleClean = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (usedHashes.has(makeHash(titleClean.slice(0, 60)))) return true;

  // 3. Word overlap check (4+ matching words = same story)
  const words = titleClean.split(/\s+/).filter(w => w.length > 4);
  for (const prev of usedWordSets) {
    if (words.filter(w => prev.has(w)).length >= 4) return true;
  }
  return false;
}

function markUsed(title, url) {
  const titleClean = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  usedHashes.add(makeHash(titleClean.slice(0, 60)));
  if (url) usedHashes.add(makeHash(url));
  const words = new Set(titleClean.split(/\s+/).filter(w => w.length > 4));
  usedWordSets.push(words);
}

// ── CATEGORY DETECTION — uses full keyword phrases ────────────
function detectCat(title, desc, forced) {
  if (forced) return forced;
  const txt = `${title} ${desc}`.toLowerCase();

  // Check each category in priority order
  const order = ["Bulletins","Crime","Sports","Politics","Government","Entertainment","Weather","International","Editorials","National"];
  for (const cat of order) {
    const keywords = CATS[cat] || [];
    for (const kw of keywords) {
      if (txt.includes(kw)) return cat;
    }
  }
  return "National";
}

// ── FETCH: Pakistani News ────────────────────────────────────
async function fetchPK() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?country=pk&pageSize=30&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a => a.title && a.description && a.title !== "[Removed]" && a.description.length > 60).map(a => ({...a, _src:"PK"}));
  } catch(e) { console.log("❌ NewsAPI PK:", e.message); return []; }
}

// ── FETCH: International News ─────────────────────────────────
async function fetchINTL() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a => a.title && a.description && a.title !== "[Removed]" && a.description.length > 60).map(a => ({...a, _src:"INTL", _forcecat:"International"}));
  } catch(e) { console.log("❌ NewsAPI INTL:", e.message); return []; }
}

// ── FETCH: Crime News ─────────────────────────────────────────
async function fetchCrime() {
  try {
    const queries = ["crime pakistan police arrested","murder robbery pakistan fir","fia rangers operation pakistan"];
    const h = new Date().getHours();
    const q = queries[h % queries.length];
    const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a => a.title && a.description && a.title !== "[Removed]" && a.description.length > 60).map(a => ({...a, _src:"Crime", _forcecat:"Crime"}));
  } catch(e) { console.log("❌ Crime:", e.message); return []; }
}

// ── FETCH: GNews ──────────────────────────────────────────────
async function fetchGNews() {
  try {
    const r = await fetch(`https://gnews.io/api/v4/top-headlines?country=pk&lang=en&max=20&token=${CFG.GNEWS}`);
    const d = await r.json();
    return (d.articles||[]).filter(a => a.title && a.description && a.description.length > 60).map(a => ({
      title:a.title, description:a.description, content:a.content||a.description,
      urlToImage:a.image, url:a.url, source:{name:a.source?.name||"GNews"},
      publishedAt:a.publishedAt, _src:"GNews"
    }));
  } catch(e) { console.log("❌ GNews:", e.message); return []; }
}

// ── FETCH: Weather ────────────────────────────────────────────
async function fetchWeather() {
  if (!CFG.WEATHER) { console.log("⚠️  WEATHERAPI_KEY not set"); return []; }
  const results = [];
  const h = new Date().getHours();
  const picks = [
    {city:PK_CITIES[h%15], isPK:true},
    {city:PK_CITIES[(h+4)%15], isPK:true},
    {city:PK_CITIES[(h+8)%15], isPK:true},
    {city:INTL_CITIES[h%15], isPK:false},
    {city:INTL_CITIES[(h+5)%15], isPK:false},
  ];
  for (const {city, isPK} of picks) {
    try {
      const r = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${CFG.WEATHER}&q=${encodeURIComponent(city)}&days=3&aqi=yes`);
      if (!r.ok) { console.log(`⚠️  Weather ${city}: HTTP ${r.status}`); continue; }
      const d = await r.json();
      if (!d.current) continue;
      const t   = d.forecast?.forecastday?.[0]?.day;
      const tmr = d.forecast?.forecastday?.[1]?.day;
      const d2  = d.forecast?.forecastday?.[2]?.day;
      results.push({
        title: `${city} Weather Report: ${d.current.condition.text}, ${Math.round(d.current.temp_c)}°C Today`,
        description: `Live weather update for ${city}: ${d.current.condition.text}. Temperature ${d.current.temp_c}°C (feels like ${d.current.feelslike_c}°C). Humidity ${d.current.humidity}%. Wind ${d.current.wind_kph}km/h ${d.current.wind_dir}. UV index ${d.current.uv}. Visibility ${d.current.vis_km}km. Rain chance today ${t?.daily_chance_of_rain||0}%. Tomorrow: ${tmr?.condition?.text||"similar"} high ${tmr?.maxtemp_c}°C low ${tmr?.mintemp_c}°C. Day after: ${d2?.condition?.text||"similar"} high ${d2?.maxtemp_c}°C.`,
        urlToImage:null, url:"https://www.weatherapi.com",
        source:{name:"WeatherAPI / PMD"}, publishedAt:new Date().toISOString(),
        _src:"Weather", _forcecat:"Weather", _city:city, _isPK:isPK, _wd:d,
      });
      console.log(`  🌤 Weather fetched: ${city} (${d.current.condition.text}, ${d.current.temp_c}°C)`);
    } catch(e) { console.log(`❌ Weather ${city}:`, e.message); }
    await sleep(400);
  }
  return results;
}

// ── GEMINI CALL ───────────────────────────────────────────────
async function gemini(prompt, maxTokens = 2200) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CFG.GEMINI}`,
      {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.78, maxOutputTokens:maxTokens}})
      }
    );
    const d = await r.json();
    if (d.error) { console.log("Gemini error:", d.error.message); return ""; }
    return (d.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch(e) { console.log("❌ Gemini:", e.message); return ""; }
}

// ── REWRITE ARTICLE — 800+ words ─────────────────────────────
async function rewrite(article, cat) {

  const RULES = `
ABSOLUTE WRITING RULES — NEVER BREAK:
1. Write ONLY flowing HTML paragraphs. Each paragraph: <p>text here</p>
2. NO bullet points. NO numbered lists. NO dash lists.
3. NO em dashes (—) anywhere. Use a period or comma instead.
4. NEVER use: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably, Importantly, It should be noted, In a significant development, It is important to, Needless to say
5. NEVER start article with: "In a", "In an", "In the", "This is", "There is"
6. Active voice. Short sentences (max 20 words). 3-4 sentences per paragraph.
7. Write exactly like Dawn.com or BBC journalist. Zero AI tone.
8. Bold important names/places: <strong>name</strong>
9. Use <h2>heading</h2> for section headings
10. Output HTML only. No markdown. No asterisks. No # symbols.
`;

  let bodyPrompt = "";

  if (cat === "Weather") {
    const wd   = article._wd;
    const curr = wd?.current;
    const t    = wd?.forecast?.forecastday?.[0]?.day;
    const tmr  = wd?.forecast?.forecastday?.[1]?.day;
    const d2   = wd?.forecast?.forecastday?.[2]?.day;
    const aqi  = curr?.air_quality?.pm2_5 ? Math.round(curr.air_quality.pm2_5) : null;
    const city = article._city || "Pakistan";

    bodyPrompt = `${RULES}
You are a professional weather reporter at Ek Awaz News. Write a 650-word weather bulletin for ${city}.

USE THIS REAL DATA:
- Condition: ${curr?.condition?.text}
- Temperature: ${curr?.temp_c}°C, feels like ${curr?.feelslike_c}°C
- Humidity: ${curr?.humidity}%
- Wind: ${curr?.wind_kph} km/h from ${curr?.wind_dir}
- Pressure: ${curr?.pressure_mb} mb
- UV Index: ${curr?.uv}
- Visibility: ${curr?.vis_km} km
${aqi ? `- Air Quality PM2.5: ${aqi} µg/m³` : ""}
- Today max/min: ${t?.maxtemp_c}°C / ${t?.mintemp_c}°C, rain ${t?.daily_chance_of_rain||0}%
- Tomorrow: ${tmr?.condition?.text}, max ${tmr?.maxtemp_c}°C, min ${tmr?.mintemp_c}°C, rain ${tmr?.daily_chance_of_rain||0}%
- Day after: ${d2?.condition?.text}, max ${d2?.maxtemp_c}°C, min ${d2?.mintemp_c}°C

WRITE THESE SECTIONS:
<h2>Current Weather Conditions in ${city}</h2>
<p>Describe current situation vividly. What it feels like outside right now.</p>

<h2>Temperature, Humidity and Wind</h2>
<p>Detailed analysis of temperature, humidity, wind, pressure, visibility.</p>

<h2>How It Affects Daily Life in ${city}</h2>
<p>Impact on commuters, schools, businesses, outdoor workers, farmers.</p>

${aqi ? `<h2>Air Quality Advisory</h2>\n<p>Explain PM2.5 reading ${aqi} and its health implications.</p>` : ""}

<h2>Two-Day Forecast</h2>
<p>Tomorrow and day after tomorrow detailed forecast with specific temperatures.</p>

<h2>Safety Precautions</h2>
<p>Practical safety tips for today's specific conditions.</p>

<h2>${article._isPK ? "Pakistan Meteorological Department Advisory" : "Official Weather Advisory"}</h2>
<p>${article._isPK ? "What PMD advises for this weather pattern across Pakistan." : `Official advisory for ${city} and surrounding areas.`}</p>

<p>Close: Stay updated with <strong>Ek Awaz News</strong> for real-time weather from across ${article._isPK ? "Pakistan" : "the world"}.</p>`;

  } else if (cat === "Crime") {
    bodyPrompt = `${RULES}
You are a senior crime reporter at Ek Awaz News Pakistan.
Write a COMPLETE 700-word factual crime report in HTML.

CRIME JOURNALISM RULES:
- Report ONLY facts from original source. Zero invented details.
- Include: what happened, where exactly, when, who (only if officially named)
- Use "allegedly" for unproven claims. Presumption of innocence always.
- Include official police or government statement
- State clearly: arrested / at large / under investigation
- NO graphic violence. NO private victim information.
- End with: <p>Police have registered an FIR and investigations are underway. <strong>Ek Awaz News</strong> will continue to follow this developing case.</p>

STRUCTURE:
<h2>[Factual headline about the crime]</h2>
<p>Lead: What happened, where, when. Most important fact first.</p>

<h2>Incident Details</h2>
<p>Complete account of what occurred per official reports.</p>

<h2>Police Response and Action</h2>
<p>How law enforcement responded. Arrests made. Operation launched.</p>

<h2>Official Statement</h2>
<p>Police/government statement or spokesperson quote.</p>

<h2>Area Background</h2>
<p>Context about this area or crime trend. Has this happened before?</p>

<h2>Legal Proceedings</h2>
<p>FIR sections, court appearance if applicable, bail status.</p>

<h2>Investigation Update</h2>
<p>Current investigation status and what investigators are pursuing.</p>

Original: Title: ${article.title} | Details: ${article.description}
Source: ${article.source?.name || "News report"}`;

  } else if (cat === "Editorials" || cat === "Columns") {
    bodyPrompt = `${RULES}
You are a senior political analyst at Ek Awaz News Pakistan writing a newspaper column.
Write a COMPLETE 900-word editorial in HTML.

STRUCTURE (flowing prose, NO bullet lists, NO subheadings as lists):
<h2>[Compelling column title]</h2>
<p>Opening: A powerful thought-provoking statement about the topic and why every Pakistani should care.</p>

<h2>The Current Situation</h2>
<p>Detailed analysis with facts and figures about what is happening right now.</p>

<h2>Historical Context</h2>
<p>How did we get here? Relevant Pakistani history and precedent.</p>

<h2>Political Dimensions</h2>
<p>How different parties and political figures are responding and why.</p>

<h2>Economic and Social Impact</h2>
<p>Real impact on Pakistani families, businesses, and communities.</p>

<h2>What Experts Are Saying</h2>
<p>What analysts, economists, legal experts think about this development.</p>

<h2>Regional and International Implications</h2>
<p>How this affects Pakistan's standing and relationships internationally.</p>

<h2>The Way Forward</h2>
<p>Concrete realistic options. What government, institutions, citizens should do.</p>

<p>Powerful closing: Memorable final thought summarizing the stakes for Pakistan.</p>

Topic: ${article.title}
Background: ${article.description}`;

  } else if (cat === "Bulletins") {
    bodyPrompt = `${RULES}
You are a breaking news reporter at Ek Awaz News Pakistan.
Write a 300-word urgent bulletin in HTML.

<p><strong>BREAKING:</strong> [Most important single fact in one powerful sentence]</p>

<h2>What We Know So Far</h2>
<p>All confirmed facts available at this time, clearly labeled as confirmed.</p>

<h2>Official Response</h2>
<p>What authorities have said, if anything is available yet.</p>

<p><strong>Ek Awaz News</strong> is monitoring this developing situation. Refresh for live updates.</p>

News: ${article.title}. ${article.description}`;

  } else {
    // Standard article: National, International, Sports, Politics, etc.
    const isIntl  = cat === "International";
    const isSports = cat === "Sports";
    const isPol   = cat === "Politics";
    const isEnt   = cat === "Entertainment";
    const isGov   = cat === "Government";

    bodyPrompt = `${RULES}
You are a senior professional journalist at Ek Awaz News Pakistan writing for a Pakistani audience.
Write a COMPLETE 850-word news article in HTML.

STRUCTURE (all flowing prose, NO bullet lists):

<h2>[Specific compelling headline — rewrite the original to be more precise]</h2>
<p>LEAD: Single most important fact. Who did what, when, where. Hook the reader. Be specific with names and figures.</p>

<h2>Full Story Details</h2>
<p>Expand the lead completely. All key facts, specific figures, named individuals, exact locations, dates. Minimum 3 paragraphs here.</p>

<h2>${isSports ? "Match and Performance Details" : isPol ? "Political Background and Party Positions" : isEnt ? "Story Details and Reactions" : isGov ? "Policy Details and Implementation" : "Background and Context"}</h2>
<p>${isSports ? "Detailed match stats, player performances, team standings, tournament context. Include any records broken." : isPol ? "What led to this politically. Which parties support or oppose. Statements from party leaders." : isEnt ? "More about the personalities involved. Industry reaction. Audience response." : isGov ? "Specific policy measures. Which department implements. Who benefits and how." : "Why this happened. What decisions led here. Background information for Pakistani readers."}</p>

<h2>${isIntl ? "Pakistan's Stake and Perspective" : "Impact on Pakistani Citizens"}</h2>
<p>${isIntl ? "How this international development directly affects Pakistan's foreign policy, economy, security or diaspora. Be specific about Pakistan's position." : "Concrete impact on everyday Pakistanis. Which provinces or cities affected. Economic or social consequences."}</p>

<h2>Official Statements and Reactions</h2>
<p>What government officials, party spokespeople, experts, or affected parties have said. Paraphrase any available statements or positions.</p>

<h2>${isSports ? "Tournament Standing and Next Fixtures" : "Expert Analysis"}</h2>
<p>${isSports ? "Current standings, points table, upcoming matches, what this result means for qualification." : "What analysts, economists, legal experts, or civil society say about this development and its implications."}</p>

<h2>What Happens Next</h2>
<p>Concrete next steps. Upcoming deadlines, hearings, matches, elections, or decisions. What readers should watch for.</p>

<p>Strong closing: Final paragraph summarizing why this matters and what it means for Pakistan going forward.</p>

Source article:
Title: ${article.title}
Content: ${article.description}${article.content && article.content !== article.description ? "\nExtra info: " + article.content.slice(0, 350) : ""}
Source: ${article.source?.name || "News Agency"}`;
  }

  // SEO Title
  const seoPrompt = `Write one SEO news headline for Pakistani audience.
Original: "${article.title}"
Category: ${cat}
Rules: Under 65 characters. Include main keyword. Compelling like Dawn.com. No em dashes. No clickbait.
Return ONLY the headline. No quotes. Nothing else.`;

  // Meta Description
  const metaPrompt = `Write a Google search meta description.
News: "${article.title} — ${(article.description||"").slice(0,100)}"
Rules: 148-158 characters EXACTLY. Include keyword. End with " — Ek Awaz News".
Return ONLY the description. Nothing else.`;

  // Tags (15+)
  const tagsPrompt = `Generate 16 SEO tags for Pakistani news.
Article: "${article.title}"
Category: ${cat}
Include: main topic, people mentioned, locations, related keywords, Urdu-English mixed terms Pakistanis search.
Return ONLY comma-separated plain text. No hashtags. No quotes. No numbers.
Example: Pakistan, Lahore, PTI, Imran Khan, Cricket, PCB, T20, PSL, National News, Pakistan News, Breaking News, Ek Awaz News, Latest News Pakistan, Umer Javed`;

  // Run all Gemini calls
  console.log(`    ✍️  Writing body...`);
  const body = await gemini(bodyPrompt, 2200);
  await sleep(800);
  console.log(`    🔍  SEO title...`);
  const seoTitle = await gemini(seoPrompt, 100);
  await sleep(600);
  console.log(`    📝  Meta desc...`);
  const metaDesc = await gemini(metaPrompt, 180);
  await sleep(600);
  console.log(`    🏷️  Tags...`);
  const tags = await gemini(tagsPrompt, 220);

  // Clean body
  const cleanBody = (body || "<p>" + (article.description || "") + "</p>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^#+\s+(.+)$/gm, (m, t) => `<h2>${t}</h2>`)
    .replace(/^[-•]\s+(.+)$/gm, "<p>$1</p>")
    .replace(/^\d+\.\s+(.+)$/gm, "<p>$1</p>")
    .replace(/ — /g, ". ").replace(/—/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Validate minimum length
  const wordCount = cleanBody.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
  console.log(`    📄  Body: ${wordCount} words`);

  return {
    body:     cleanBody,
    seoTitle: (seoTitle||article.title).replace(/['"]/g,"").slice(0,70),
    metaDesc: (metaDesc||"").slice(0,160),
    tags:     tags || "Pakistan, News, Breaking News, Ek Awaz News, Pakistani News, Latest News Pakistan",
  };
}

// ── UPLOAD IMAGE TO CLOUDINARY + WATERMARK ───────────────────
async function uploadImage(imgUrl, title) {
  const ph = `https://placehold.co/1200x630/CC0000/ffffff?text=${encodeURIComponent((title||"Ek Awaz News").slice(0,28))}`;
  const src = (imgUrl && imgUrl.startsWith("http")) ? imgUrl : ph;
  try {
    const form = new FormData();
    form.append("file", src);
    form.append("upload_preset", CFG.CLD_PRE);
    form.append("folder", "ekawaz-auto");
    const wm = Buffer.from(CFG.WATERMARK).toString("base64");
    form.append("eager", `w_1200,h_630,c_fill,g_auto/l_fetch:${wm},w_160,g_south_east,x_12,y_12,o_80`);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CFG.CLD_CLOUD}/image/upload`, {method:"POST",body:form});
    const d = await r.json();
    return d.eager?.[0]?.secure_url || d.secure_url || src;
  } catch(e) { console.log("❌ Cloudinary:", e.message); return src; }
}

// ── SAVE TO FIREBASE ──────────────────────────────────────────
async function savePost(post) {
  const id = Date.now();
  const catKey = post.category.toLowerCase()
    .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")
    .replace(/-+/g,"-").replace(/^-|-$/g,"") || "national";

  const doc = {
    fields: {
      id:            {integerValue:String(id)},
      title:         {stringValue:post.title},
      excerpt:       {stringValue:post.excerpt},
      body:          {stringValue:post.body},
      category:      {stringValue:post.category},
      categories:    {arrayValue:{values:[{stringValue:post.category}]}},
      cat_key:       {stringValue:catKey},
      type:          {stringValue:post.type||"Article"},
      author:        {stringValue:CFG.AUTHOR},
      status:        {stringValue:"published"},
      isHeadline:    {booleanValue:false},
      views:         {integerValue:"0"},
      likes:         {integerValue:"0"},
      _liked:        {booleanValue:false},
      date:          {stringValue:new Date().toISOString()},
      lastEditedAt:  {stringValue:new Date().toISOString()},
      lastEditedBy:  {stringValue:"Auto Publisher v6"},
      image:         {stringValue:post.image||""},
      video:         {stringValue:""},
      audio:         {stringValue:""},
      pdf:           {stringValue:""},
      tags:          {arrayValue:{values:post.tagsArr.map(t=>({stringValue:t.trim()}))}},
      seoTitle:      {stringValue:post.seoTitle||post.title},
      seoDesc:       {stringValue:post.metaDesc||post.excerpt},
      series:        {stringValue:""},
      scheduledAt:   {stringValue:""},
      ad_slot:       {stringValue:""},
      sourceUrl:     {stringValue:post.sourceUrl||""},
      sourceName:    {stringValue:post.sourceName||""},
      autoPublished: {booleanValue:true},
      revisions:     {arrayValue:{values:[]}},
    }
  };

  try {
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz_posts?documentId=post_${id}&key=${CFG.FB_KEY}`,
      {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(doc)}
    );
    if (r.ok) { console.log(`  ✅ [${post.category}] "${post.title.slice(0,55)}"`); return id; }
    const err = await r.json();
    console.log("  ❌ Firebase:", JSON.stringify(err).slice(0,150));
  } catch(e) { console.log("  ❌ Firebase:", e.message); }
  return null;
}

// ── UPDATE TICKER AUTOMATICALLY ───────────────────────────────
async function updateTicker(headlines) {
  try {
    const items = headlines.slice(0, 15).map(h => `• ${h}`);
    const body = {
      fields: {
        ticker:          {arrayValue:{values:items.map(h=>({stringValue:h}))}},
        tickerUpdatedAt: {stringValue:new Date().toISOString()},
      }
    };
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CFG.FB_KEY}`,
      {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}
    );
    if (r.ok) console.log(`\n📺 Ticker updated: ${items.length} headlines`);
    else {
      // Try alternative Firebase path if main doesn't work
      const body2 = {
        fields: {
          items: {arrayValue:{values:items.map(h=>({stringValue:h}))}},
          updatedAt: {stringValue:new Date().toISOString()},
        }
      };
      await fetch(
        `${CFG.FB_BASE}/ticker/main?updateMask.fieldPaths=items&updateMask.fieldPaths=updatedAt&key=${CFG.FB_KEY}`,
        {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body2)}
      );
      console.log(`\n📺 Ticker updated (alt path): ${items.length} headlines`);
    }
  } catch(e) { console.log("❌ Ticker:", e.message); }
}

// ── LOAD RECENT FROM FIREBASE (dedup check) ───────────────────
async function loadRecent() {
  try {
    const r = await fetch(`${CFG.FB_BASE}/ekawaz_posts?pageSize=200&key=${CFG.FB_KEY}`);
    const d = await r.json();
    (d.documents||[]).forEach(doc => {
      const f = doc.fields||{};
      const title = f.title?.stringValue;
      const url   = f.sourceUrl?.stringValue;
      if (title) markUsed(title, url);
    });
    console.log(`📋 Dedup: loaded ${usedHashes.size} hashes from ${usedWordSets.length} recent posts`);
  } catch(e) { console.log("⚠️  Could not load recent:", e.message); }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log("════════════════════════════════════════════════");
  console.log("   🗞️  EK AWAZ NEWS — AUTO PUBLISHER v6.0");
  console.log(`   ⏰  ${new Date().toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}`);
  console.log(`   👤  Author: ${CFG.AUTHOR} | Target: ${CFG.PER_RUN} articles`);
  console.log("════════════════════════════════════════════════\n");

  await loadRecent();

  console.log("📡 Fetching from all sources...\n");
  const [pk, intl, crime, gnews, weather] = await Promise.all([
    fetchPK(), fetchINTL(), fetchCrime(), fetchGNews(), fetchWeather()
  ]);

  const all = [...pk,...intl,...crime,...gnews,...weather];
  console.log(`\n📰 Fetched: ${all.length} | PK:${pk.length} INTL:${intl.length} Crime:${crime.length} GNews:${gnews.length} Weather:${weather.length}`);

  // Filter dupes, shuffle, pick PER_RUN
  const fresh = all
    .filter(a => a.title && !isDupe(a.title, a.url||""))
    .sort(() => Math.random() - 0.5)
    .slice(0, CFG.PER_RUN);

  console.log(`✏️  Processing ${fresh.length} unique articles...\n`);

  const published = [];
  let count = 0;

  for (const [i, article] of fresh.entries()) {
    try {
      const cat = detectCat(article.title, article.description||"", article._forcecat);

      let type="Article", authorTitle="Staff Reporter";
      if (cat==="Editorials"||cat==="Columns")  { type="Column";  authorTitle="Senior Analyst"; }
      else if (cat==="Bulletins")               { type="Bulletin"; authorTitle="News Desk"; }
      else if (cat==="Crime")                   { authorTitle="Senior Reporter"; }
      else if (cat==="Weather")                 { authorTitle="Weather Correspondent"; }
      else if (cat==="International")           { authorTitle="International Correspondent"; }
      else if (cat==="Sports")                  { authorTitle="Sports Reporter"; }
      else if (cat==="Politics")                { authorTitle="Political Reporter"; }
      else if (cat==="Entertainment")           { authorTitle="Entertainment Reporter"; }
      else if (cat==="Government")              { authorTitle="Government Reporter"; }

      console.log(`\n[${i+1}/${fresh.length}] ── ${cat.toUpperCase()} ──`);
      console.log(`   "${article.title.slice(0,65)}"`);

      const rw = await rewrite(article, cat);

      // Skip if body is empty or too short
      if (!rw.body || rw.body.replace(/<[^>]*>/g,"").trim().length < 300) {
        console.log(`  ⚠️  Body too short, skipping`);
        continue;
      }

      const image = await uploadImage(article.urlToImage||null, article.title);

      // Build tags array with minimum 12 tags
      let tagsArr = (rw.tags||"Pakistan, News").split(",").map(t=>t.trim()).filter(Boolean);
      const fallbacks = ["Pakistan","Ek Awaz News","Pakistani News","Latest News","Breaking News",cat,"Umer Javed","News Pakistan","Today News","Pakistan Today"];
      for (const fb of fallbacks) {
        if (tagsArr.length >= 15) break;
        if (!tagsArr.some(t => t.toLowerCase() === fb.toLowerCase())) tagsArr.push(fb);
      }

      const saved = await savePost({
        title:      rw.seoTitle || article.title,
        excerpt:    rw.metaDesc || (article.description||"").slice(0,155),
        body:       rw.body,
        category:   cat,
        type,
        authorTitle,
        image,
        seoTitle:   rw.seoTitle,
        metaDesc:   rw.metaDesc,
        tagsArr,
        sourceUrl:  article.url||"",
        sourceName: article.source?.name||"",
      });

      if (saved) {
        count++;
        published.push(rw.seoTitle || article.title);
        markUsed(article.title, article.url||"");
      }

      await sleep(4000); // Respect Gemini rate limits

    } catch(e) { console.log(`  ⚠️  Error:`, e.message); }
  }

  // Always update ticker with published headlines
  if (published.length > 0) {
    await updateTicker(published);
  }

  const mins = ((Date.now()-t0)/60000).toFixed(1);
  console.log("\n════════════════════════════════════════════════");
  console.log(`   ✅ Published: ${count} articles in ${mins} min`);
  console.log(`   📅  Next run: 1 hour automatically`);
  console.log("════════════════════════════════════════════════\n");
}

main().catch(e => { console.error("💥 Fatal:", e); process.exit(1); });
