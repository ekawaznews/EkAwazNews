// ============================================================
// EK AWAZ NEWS — AUTO PUBLISHER v7.0 FINAL CORRECT
// Uses EXACT Firebase SDK (same as index.html savePostToFirebase)
// Uses EXACT post object structure from publishPost() function
// Author: Umer Javed on every article
// ============================================================

import fetch from 'node-fetch';
import crypto from 'crypto';

// ── Firebase config (from index.html) ────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8",
  projectId:         "ekawaznews-a114a",
  // Firestore REST endpoint
  baseUrl:           "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents",
};

// ── API Keys ──────────────────────────────────────────────────
const CFG = {
  GEMINI:    process.env.GEMINI_API_KEY,
  NEWSAPI:   process.env.NEWSAPI_KEY,
  GNEWS:     process.env.GNEWS_KEY,
  WEATHER:   process.env.WEATHERAPI_KEY,
  CLD_CLOUD: process.env.CLOUDINARY_CLOUD,
  CLD_PRE:   process.env.CLOUDINARY_PRESET,
  WATERMARK: process.env.WATERMARK_URL || "https://raw.githubusercontent.com/ekawaznews/ekawaznews.github.io/main/ek-awaz-logo.png",
  FB_KEY:    FIREBASE_CONFIG.apiKey,
  FB_BASE:   FIREBASE_CONFIG.baseUrl,
  AUTHOR:    "Umer Javed",
  PER_RUN:   12,
};

// ── EXACT category values from index.html checkboxes ─────────
// These must EXACTLY match the values in index.html cat-chk inputs
const VALID_CATS = ["Politics", "Government", "Sports", "Entertainment", "Weather", "International", "National", "Crime", "Editorials", "Columns", "Bulletins", "Videos", "Home / General"];

// ── Category detection keywords ───────────────────────────────
const CAT_KEYS = {
  "Politics":      ["pmln","pti","ppp","election","senator","prime minister","president","imran khan","shehbaz sharif","asif zardari","nawaz sharif","maryam nawaz","mna","mpa","national assembly","senate","parliament","political party","pdm","coalition","bypolls","opposition leader","party chairman"],
  "Government":    ["federal cabinet","ministry of finance","ministry of interior","government policy","state bank","sbp","tax rate","income tax","budget 2026","ordinance","legislation","supreme court of pakistan","high court","chief justice of pakistan","ogra","nepra","public service commission","ehsaas program","benazir income support"],
  "Sports":        ["cricket","psl 2026","pakistan cricket","pcb","test match","odi","t20","icc","world cup cricket","babar azam","shaheen afridi","naseem shah","mohammad rizwan","fakhar zaman","football match","pakistan football","hockey pakistan","olympics","asia cup","champions trophy","batting","bowling","wicket","innings","match result"],
  "Entertainment": ["pakistani drama","lollywood film","actor arrested","actress","bollywood","music video","pakistan singer","hum awards","ary film awards","showbiz","ary digital","geo entertainment","hum tv","drama serial","mahira khan","fawad khan","atif aslam","sajal ali","hania amir","imran abbas","film premiere","box office pakistan"],
  "Weather":       ["weather today","weather forecast","pakistan weather","rain alert","flood warning","temperature pakistan","heatwave pakistan","storm warning","cyclone","fog alert","monsoon rain","drought","pmd forecast","pakistan meteorological department","met office","weather karachi","weather lahore","weather islamabad","weather peshawar","weather quetta"],
  "International": ["united states","us president","american","india pakistan","china pakistan","russia ukraine","israel gaza","iran nuclear","saudi arabia","united arab emirates","united kingdom","nato summit","united nations","trump","modi government","white house","war news","ceasefire","diplomacy","foreign affairs","g20","imf pakistan loan","world bank pakistan","canada","australia","france","germany","turkey","khalistani","csis intelligence","middle east","afghanistan","kashmir dispute"],
  "Crime":         ["murder karachi","murder lahore","robbery pakistan","police arrested","fir registered","kidnapping pakistan","drug trafficking","anti corruption","fraud case pakistan","terrorist attack","blast pakistan","target killing","rangers operation","fia operation","police raid karachi","police raid lahore","ctd operation","crime karachi","killed in","shot dead","stabbed","dacoity","gang war pakistan","arrested by police","convicted","jail sentence"],
  "Editorials":    ["opinion:","editorial:","analysis:","op-ed","viewpoint","our view","columnist","commentary on","column by"],
  "Bulletins":     ["breaking:","just in:","urgent:","flash:","developing:","breaking news","latest update","alert:"],
  "National":      ["pakistan","karachi","lahore","islamabad","peshawar","quetta","sindh","punjab","kpk","khyber pakhtunkhwa","balochistan","multan","rawalpindi","faisalabad","hyderabad","sialkot","gujranwala","sukkur","larkana","abbottabad","swat","gilgit baltistan","azad kashmir"],
};

const PK_CITIES   = ["Karachi","Lahore","Islamabad","Peshawar","Quetta","Multan","Faisalabad","Rawalpindi","Hyderabad","Sialkot","Gujranwala","Sukkur","Abbottabad","Larkana","Dera Ghazi Khan"];
const INTL_CITIES = ["London","Dubai","New York","Riyadh","Beijing","Delhi","Kabul","Tehran","Ankara","Washington","Paris","Istanbul","Doha","Abu Dhabi","Sydney"];

// ── Dedup store ───────────────────────────────────────────────
const usedHashes   = new Set();
const usedWordSets = [];
const sleep        = ms => new Promise(r => setTimeout(r, ms));

function md5(str) {
  return crypto.createHash("md5").update(str.toLowerCase().trim()).digest("hex");
}

function isDupe(title, url) {
  if (url && usedHashes.has(md5(url))) return true;
  const clean = title.toLowerCase().replace(/[^a-z0-9\s]/g,"").trim();
  if (usedHashes.has(md5(clean.slice(0,60)))) return true;
  const words = clean.split(/\s+/).filter(w => w.length > 4);
  for (const prev of usedWordSets) {
    if (words.filter(w => prev.has(w)).length >= 4) return true;
  }
  return false;
}

function markUsed(title, url) {
  const clean = title.toLowerCase().replace(/[^a-z0-9\s]/g,"").trim();
  usedHashes.add(md5(clean.slice(0,60)));
  if (url) usedHashes.add(md5(url));
  usedWordSets.push(new Set(clean.split(/\s+/).filter(w => w.length > 4)));
}

// ── Category detection ────────────────────────────────────────
function detectCat(title, desc, forced) {
  if (forced && VALID_CATS.includes(forced)) return forced;
  const txt = `${title} ${desc}`.toLowerCase();
  const order = ["Bulletins","Crime","Sports","Politics","Government","Entertainment","Weather","International","Editorials","National"];
  for (const cat of order) {
    const kws = CAT_KEYS[cat] || [];
    for (const kw of kws) { if (txt.includes(kw)) return cat; }
  }
  return "National";
}

// ── FETCH: Pakistani news ─────────────────────────────────────
async function fetchPK() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?country=pk&pageSize=30&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]"&&a.description.length>60).map(a=>({...a,_src:"PK"}));
  } catch(e) { console.log("❌ NewsAPI PK:", e.message); return []; }
}

// ── FETCH: International news ─────────────────────────────────
async function fetchINTL() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]"&&a.description.length>60).map(a=>({...a,_src:"INTL",_forcecat:"International"}));
  } catch(e) { console.log("❌ NewsAPI INTL:", e.message); return []; }
}

// ── FETCH: Crime news ─────────────────────────────────────────
async function fetchCrime() {
  try {
    const h = new Date().getHours();
    const queries = ["crime murder arrested pakistan police fir","fia rangers operation pakistan raid","corruption fraud pakistan arrested accused"];
    const q = queries[h % queries.length];
    const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]"&&a.description.length>60).map(a=>({...a,_src:"Crime",_forcecat:"Crime"}));
  } catch(e) { console.log("❌ Crime:", e.message); return []; }
}

// ── FETCH: GNews ──────────────────────────────────────────────
async function fetchGNews() {
  try {
    const r = await fetch(`https://gnews.io/api/v4/top-headlines?country=pk&lang=en&max=20&token=${CFG.GNEWS}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.description.length>60).map(a=>({
      title:a.title, description:a.description, content:a.content||a.description,
      urlToImage:a.image, url:a.url, source:{name:a.source?.name||"GNews"},
      publishedAt:a.publishedAt, _src:"GNews"
    }));
  } catch(e) { console.log("❌ GNews:", e.message); return []; }
}

// ── FETCH: Weather ────────────────────────────────────────────
async function fetchWeather() {
  if (!CFG.WEATHER) { console.log("⚠️  No WEATHERAPI_KEY"); return []; }
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
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.current) continue;
      const t0 = d.forecast?.forecastday?.[0]?.day;
      const t1 = d.forecast?.forecastday?.[1]?.day;
      const t2 = d.forecast?.forecastday?.[2]?.day;
      results.push({
        title:`${city} Weather Report: ${d.current.condition.text}, ${Math.round(d.current.temp_c)}°C Today`,
        description:`${city}: ${d.current.condition.text}. Temp ${d.current.temp_c}°C feels like ${d.current.feelslike_c}°C. Humidity ${d.current.humidity}%. Wind ${d.current.wind_kph}km/h ${d.current.wind_dir}. UV ${d.current.uv}. Rain chance ${t0?.daily_chance_of_rain||0}%. Tomorrow: ${t1?.condition?.text} high ${t1?.maxtemp_c}°C low ${t1?.mintemp_c}°C rain ${t1?.daily_chance_of_rain||0}%. Day after: ${t2?.condition?.text} high ${t2?.maxtemp_c}°C.`,
        urlToImage:null, url:"https://www.weatherapi.com",
        source:{name:"WeatherAPI / PMD"}, publishedAt:new Date().toISOString(),
        _src:"Weather", _forcecat:"Weather", _city:city, _isPK:isPK, _wd:d,
      });
      console.log(`  🌤 ${city}: ${d.current.condition.text}, ${d.current.temp_c}°C`);
    } catch(e) { console.log(`❌ Weather ${city}:`, e.message); }
    await sleep(400);
  }
  return results;
}

// ── GEMINI call ───────────────────────────────────────────────
async function gemini(prompt, maxTokens=2200) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CFG.GEMINI}`,
      {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.78, maxOutputTokens:maxTokens}})
      }
    );
    const d = await r.json();
    if (d.error) { console.log("Gemini error:", d.error.message); return ""; }
    return (d.candidates?.[0]?.content?.parts?.[0]?.text||"").trim();
  } catch(e) { console.log("❌ Gemini:", e.message); return ""; }
}

// ── REWRITE — 800+ word articles ─────────────────────────────
async function rewrite(article, cat) {
  const RULES = `
ABSOLUTE RULES — NEVER BREAK:
1. Write ONLY in HTML paragraphs: <p>text</p> for each paragraph
2. Use <h2>heading</h2> for section headings
3. NO bullet points. NO numbered lists. NO dashes as list items.
4. NO em dashes (—). Replace with period or comma.
5. NEVER use: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably, Importantly, It should be noted, In a significant development
6. NEVER start article with: "In a", "In an", "In the", "This is", "There is"
7. Active voice. Short sentences max 20 words. 3-4 sentences per paragraph.
8. Write like Dawn.com or BBC — professional, clear, zero AI tone.
9. Bold key names and figures: <strong>name</strong>
10. Output HTML only. No markdown, no asterisks (*), no # symbols.
`;

  let bodyPrompt = "";

  if (cat === "Weather") {
    const wd=article._wd; const curr=wd?.current;
    const t0=wd?.forecast?.forecastday?.[0]?.day;
    const t1=wd?.forecast?.forecastday?.[1]?.day;
    const t2=wd?.forecast?.forecastday?.[2]?.day;
    const aqi=curr?.air_quality?.pm2_5?Math.round(curr.air_quality.pm2_5):null;
    const city=article._city||"Pakistan";

    bodyPrompt=`${RULES}
You are a professional weather reporter at Ek Awaz News. Write a 650-word weather report for ${city} in HTML.

REAL DATA:
- Condition: ${curr?.condition?.text}
- Temp: ${curr?.temp_c}°C (feels ${curr?.feelslike_c}°C)
- Humidity: ${curr?.humidity}% | Wind: ${curr?.wind_kph}km/h ${curr?.wind_dir}
- UV: ${curr?.uv} | Visibility: ${curr?.vis_km}km | Pressure: ${curr?.pressure_mb}mb
${aqi?`- Air Quality PM2.5: ${aqi}µg/m³`:""}
- Today high/low: ${t0?.maxtemp_c}°C/${t0?.mintemp_c}°C, rain ${t0?.daily_chance_of_rain||0}%
- Tomorrow: ${t1?.condition?.text}, ${t1?.maxtemp_c}°C/${t1?.mintemp_c}°C, rain ${t1?.daily_chance_of_rain||0}%
- Day after: ${t2?.condition?.text}, ${t2?.maxtemp_c}°C/${t2?.mintemp_c}°C

WRITE:
<h2>Current Conditions in ${city}</h2>
<p>Vivid description of current weather. What it feels like to be outside right now.</p>

<h2>Temperature, Humidity and Wind</h2>
<p>Detailed analysis of all weather parameters using the real data above.</p>

<h2>Impact on Daily Life</h2>
<p>How this weather affects commuters, schools, businesses, outdoor activities in ${city}.</p>

${aqi?`<h2>Air Quality</h2>\n<p>Explain PM2.5 reading of ${aqi} and health implications.</p>`:""}

<h2>Two-Day Forecast</h2>
<p>Detailed tomorrow and day-after forecast with specific temperatures.</p>

<h2>Safety Advisory</h2>
<p>Practical safety tips for today's specific conditions (heat/rain/fog/cold).</p>

<h2>${article._isPK?"Pakistan Met Department Advisory":"Official Weather Advisory"}</h2>
<p>Official meteorological advice for ${city}.</p>

<p>End: Stay updated with <strong>Ek Awaz News</strong> for real-time weather from ${article._isPK?"Pakistan":"around the world"}.</p>`;

  } else if (cat === "Crime") {
    bodyPrompt=`${RULES}
You are a senior crime reporter at Ek Awaz News Pakistan. Write a 700-word crime report in HTML.

STRICT RULES:
- Facts from original source ONLY. No speculation. No invented details.
- Include: what, where, when, who (only officially named people)
- Use "allegedly" for unproven claims
- Include official police statement
- NO graphic violence. NO private victim details.
- End with: <p>Police have registered an FIR and investigations are underway. <strong>Ek Awaz News</strong> will continue to follow this case.</p>

<h2>[Factual crime headline]</h2>
<p>Lead: What happened, where, when.</p>

<h2>Incident Details</h2>
<p>Complete account from official reports.</p>

<h2>Police Response</h2>
<p>Law enforcement action. Arrests. Operation details.</p>

<h2>Official Statement</h2>
<p>Police or government spokesperson statement.</p>

<h2>Area Context</h2>
<p>Background about the area or crime pattern.</p>

<h2>Legal Status</h2>
<p>FIR registered. Court appearance. Investigation status.</p>

Source: Title: ${article.title} | Details: ${article.description} | From: ${article.source?.name||"news report"}`;

  } else if (cat==="Editorials"||cat==="Columns") {
    bodyPrompt=`${RULES}
You are a senior analyst at Ek Awaz News Pakistan. Write a 900-word editorial in HTML.

<h2>[Compelling column title]</h2>
<p>Powerful opening: what is happening and why every Pakistani should care.</p>

<h2>Current Situation</h2>
<p>Detailed analysis with facts and figures.</p>

<h2>Historical Context</h2>
<p>How did we get here? Pakistan's history and precedent.</p>

<h2>Political Dimensions</h2>
<p>How parties and political figures are responding.</p>

<h2>Economic and Social Impact</h2>
<p>Real impact on Pakistani families and businesses.</p>

<h2>Expert Perspectives</h2>
<p>What analysts, economists, and legal experts say.</p>

<h2>International Implications</h2>
<p>Pakistan's standing regionally and globally.</p>

<h2>The Way Forward</h2>
<p>Concrete realistic options. What should happen next.</p>

<p>Memorable closing thought summarizing the stakes.</p>

Topic: ${article.title} | Background: ${article.description}`;

  } else if (cat==="Bulletins") {
    bodyPrompt=`${RULES}
You are a breaking news reporter at Ek Awaz News. Write a 300-word urgent bulletin in HTML.

<p><strong>BREAKING:</strong> [Single most important fact]</p>

<h2>What We Know So Far</h2>
<p>All confirmed facts clearly labeled.</p>

<h2>Official Response</h2>
<p>What authorities have said if available.</p>

<p><strong>Ek Awaz News</strong> is monitoring this story. Refresh for live updates.</p>

News: ${article.title}. ${article.description}`;

  } else {
    const isIntl=cat==="International";
    const isSports=cat==="Sports";
    const isPol=cat==="Politics";

    bodyPrompt=`${RULES}
You are a senior journalist at Ek Awaz News Pakistan writing for a Pakistani audience.
Write a COMPLETE 850-word news article in HTML.

<h2>[Specific compelling headline — rewrite original to be more precise and informative]</h2>

<p>LEAD: Most important single fact. Who did what, when, where. Be specific with names and figures. Hook the reader.</p>

<h2>Full Story Details</h2>
<p>All key facts, specific figures, named individuals, exact locations and dates. Write minimum 3 paragraphs with full detail.</p>

<h2>${isSports?"Match and Performance Details":isPol?"Political Background":"Background and Context"}</h2>
<p>${isSports?"Match stats, player performances, team standings, tournament context, records broken.":isPol?"Political history. Party positions. What different factions say and why.":"Why this happened. What decisions or events led to this point. Important background."}</p>

<h2>${isIntl?"Pakistan's Stake in This":"Impact on Pakistan"}</h2>
<p>${isIntl?"How this directly affects Pakistan's foreign policy, economy, security or Pakistani diaspora. Be specific.":"Concrete impact on Pakistani citizens. Which areas or communities are affected. Economic or social consequences."}</p>

<h2>Official Statements and Reactions</h2>
<p>What government officials, party spokespeople, experts, or affected parties have said. Paraphrase available statements.</p>

<h2>${isSports?"Tournament Standing":"Expert Analysis"}</h2>
<p>${isSports?"Current points table, upcoming fixtures, what this result means for qualification or rankings.":"What political analysts, economists, legal experts, or civil society say about this development."}</p>

<h2>What Happens Next</h2>
<p>Concrete next steps. Upcoming hearings, elections, matches, deadlines. What readers should watch.</p>

<p>Strong closing: Final paragraph summarizing why this matters for Pakistan going forward.</p>

Title: ${article.title}
Content: ${article.description}${article.content&&article.content!==article.description?" More: "+article.content.slice(0,300):""}
Source: ${article.source?.name||"News Agency"}`;
  }

  // SEO Title
  const seoPrompt=`Write one SEO headline for Pakistani news.
Original: "${article.title}"
Category: ${cat}
Rules: Under 65 characters. Main keyword included. Like Dawn.com. No em dashes.
Return ONLY the headline. No quotes.`;

  // Meta description
  const metaPrompt=`Write Google meta description.
News: "${article.title}. ${(article.description||"").slice(0,100)}"
Rules: 148-158 characters. Include keyword. End with " — Ek Awaz News".
Return ONLY the description.`;

  // Tags (15+)
  const tagsPrompt=`Generate 16 SEO tags for Pakistani news article.
Article: "${article.title}" | Category: ${cat}
Include: main topic, people/organizations, Pakistani cities/regions, related search terms.
Return ONLY comma-separated tags. No hashtags. No quotes.
Example: Pakistan, Lahore, PTI, Imran Khan, Cricket, PCB, T20, PSL, News, Breaking News, Ek Awaz News, Latest News Pakistan, Umer Javed, Pakistani News Today, ${cat}`;

  console.log(`    ✍️  Writing body...`);
  const body = await gemini(bodyPrompt, 2200);
  await sleep(800);
  console.log(`    🔍  SEO...`);
  const seoTitle = await gemini(seoPrompt, 100);
  await sleep(600);
  const metaDesc = await gemini(metaPrompt, 180);
  await sleep(600);
  const tagsRaw  = await gemini(tagsPrompt, 220);

  // Clean body
  const cleanBody = (body||"<p>"+(article.description||"")+"</p>")
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.*?)\*/g,"<em>$1</em>")
    .replace(/^#+\s+(.+)$/gm,(m,t)=>`<h2>${t}</h2>`)
    .replace(/^[-•]\s+(.+)$/gm,"<p>$1</p>")
    .replace(/^\d+\.\s+(.+)$/gm,"<p>$1</p>")
    .replace(/ — /g,". ").replace(/—/g," ")
    .replace(/\n{3,}/g,"\n\n")
    .trim();

  const wordCount = cleanBody.replace(/<[^>]*>/g,"").split(/\s+/).filter(Boolean).length;
  console.log(`    📄  ${wordCount} words`);

  return {
    body: cleanBody,
    seoTitle: (seoTitle||article.title).replace(/['"]/g,"").slice(0,70),
    metaDesc: (metaDesc||"").slice(0,160),
    tags: tagsRaw||"Pakistan, News, Breaking News, Ek Awaz News, Pakistani News",
  };
}

// ── Upload image to Cloudinary ────────────────────────────────
async function uploadImage(imgUrl, title) {
  const ph=`https://placehold.co/1200x630/CC0000/ffffff?text=${encodeURIComponent((title||"Ek Awaz").slice(0,28))}`;
  const src=(imgUrl&&imgUrl.startsWith("http"))?imgUrl:ph;
  try {
    const form=new FormData();
    form.append("file",src);
    form.append("upload_preset",CFG.CLD_PRE);
    form.append("folder","ekawaz-auto");
    const wm=Buffer.from(CFG.WATERMARK).toString("base64");
    form.append("eager",`w_1200,h_630,c_fill,g_auto/l_fetch:${wm},w_160,g_south_east,x_12,y_12,o_80`);
    const r=await fetch(`https://api.cloudinary.com/v1_1/${CFG.CLD_CLOUD}/image/upload`,{method:"POST",body:form});
    const d=await r.json();
    return d.eager?.[0]?.secure_url||d.secure_url||src;
  } catch(e) { console.log("❌ Cloudinary:", e.message); return src; }
}

// ── SAVE TO FIREBASE — EXACT same as savePostToFirebase() ─────
// Your site uses: setDoc(doc(db, 'ekawaz_posts', String(post.id)), postObject)
// post.id is a Number (Date.now()), document ID = String(post.id)
// The post object is a plain JS object — NOT Firestore REST format
async function saveToFirebase(post) {
  const postId = post.id;
  const docId  = String(postId);

  // Use Firestore REST API to write the exact same structure
  // as savePostToFirebase() in index.html
  const fields = {};

  // Convert each field to Firestore REST format
  const toField = (v) => {
    if (v === null || v === undefined) return {nullValue:null};
    if (typeof v === "boolean")  return {booleanValue:v};
    if (typeof v === "number")   return {integerValue:String(v)};
    if (Array.isArray(v))        return {arrayValue:{values:v.map(item=>toField(item))}};
    if (typeof v === "object")   return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,val])=>[k,toField(val)]))}};
    return {stringValue:String(v)};
  };

  for (const [k,v] of Object.entries(post)) {
    fields[k] = toField(v);
  }

  const url = `${CFG.FB_BASE}/ekawaz_posts?documentId=${docId}&key=${CFG.FB_KEY}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({fields})
    });

    if (r.ok) {
      console.log(`  ✅ [${post.category}] "${post.title.slice(0,55)}"`);
      return true;
    }

    // If document already exists, use PATCH to update
    if (r.status === 409) {
      const patchUrl = `${CFG.FB_BASE}/ekawaz_posts/${docId}?key=${CFG.FB_KEY}`;
      const r2 = await fetch(patchUrl, {
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({fields})
      });
      if (r2.ok) { console.log(`  ✅ [PATCHED] "${post.title.slice(0,55)}"`); return true; }
    }

    const err = await r.json();
    console.log("  ❌ Firebase:", JSON.stringify(err).slice(0,200));
  } catch(e) { console.log("  ❌ Firebase:", e.message); }
  return false;
}

// ── UPDATE TICKER in ekawaz/main ─────────────────────────────
async function updateTicker(headlines) {
  // Your site reads ticker from ekawaz/main document as array
  // setDoc(doc(db,'ekawaz','main'), mainData, {merge:true})
  try {
    const items = headlines.slice(0,15);
    const tickerField = {
      arrayValue: {
        values: items.map(h=>({stringValue:`• ${h}`}))
      }
    };
    const body = {
      fields: {
        ticker: tickerField,
        tickerUpdatedAt: {stringValue: new Date().toISOString()}
      }
    };
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CFG.FB_KEY}`,
      {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}
    );
    if (r.ok) console.log(`📺 Ticker updated: ${items.length} headlines`);
    else console.log("❌ Ticker failed:", (await r.text()).slice(0,200));
  } catch(e) { console.log("❌ Ticker:", e.message); }
}

// ── Load recent posts for dedup ───────────────────────────────
async function loadRecent() {
  try {
    const r = await fetch(`${CFG.FB_BASE}/ekawaz_posts?pageSize=200&key=${CFG.FB_KEY}`);
    const d = await r.json();
    (d.documents||[]).forEach(doc=>{
      const f=doc.fields||{};
      const title=f.title?.stringValue;
      const url=f.sourceUrl?.stringValue;
      if(title) markUsed(title, url||"");
    });
    console.log(`📋 Dedup: ${usedHashes.size} hashes, ${usedWordSets.length} posts`);
  } catch(e) { console.log("⚠️  Load recent:", e.message); }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const t0=Date.now();
  console.log("════════════════════════════════════════════════");
  console.log("   🗞️  EK AWAZ NEWS — AUTO PUBLISHER v7.0");
  console.log(`   ⏰  ${new Date().toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}`);
  console.log(`   👤  Author: ${CFG.AUTHOR}`);
  console.log("════════════════════════════════════════════════\n");

  await loadRecent();

  console.log("📡 Fetching news...\n");
  const [pk,intl,crime,gnews,weather]=await Promise.all([
    fetchPK(),fetchINTL(),fetchCrime(),fetchGNews(),fetchWeather()
  ]);

  const all=[...pk,...intl,...crime,...gnews,...weather];
  console.log(`📰 Fetched ${all.length}: PK:${pk.length} INTL:${intl.length} Crime:${crime.length} GNews:${gnews.length} Weather:${weather.length}\n`);

  const fresh=all
    .filter(a=>a.title&&!isDupe(a.title,a.url||""))
    .sort(()=>Math.random()-0.5)
    .slice(0,CFG.PER_RUN);

  console.log(`✏️  Processing ${fresh.length} unique articles...\n`);

  const published=[];
  let count=0;

  for(const [i,article] of fresh.entries()) {
    try {
      const cat=detectCat(article.title, article.description||"", article._forcecat);

      // Determine type and author — EXACT same values as index.html
      let type="Article", authorName=CFG.AUTHOR;
      if(cat==="Editorials"||cat==="Columns") type="Column";
      else if(cat==="Bulletins") type="Bulletin";

      console.log(`\n[${i+1}/${fresh.length}] ${cat} → "${article.title.slice(0,60)}"`);

      const rw=await rewrite(article,cat);

      if(!rw.body||rw.body.replace(/<[^>]*>/g,"").trim().length<200) {
        console.log("  ⚠️  Empty body, skip"); continue;
      }

      const image=await uploadImage(article.urlToImage||null, article.title);

      // Build tags array
      let tagsArr=(rw.tags||"Pakistan,News").split(",").map(t=>t.trim()).filter(Boolean);
      const fallbacks=["Pakistan","Ek Awaz News","Pakistani News","Latest News","Breaking News",cat,"Umer Javed","Pakistan Today","News Pakistan","Today News"];
      for(const fb of fallbacks) {
        if(tagsArr.length>=15) break;
        if(!tagsArr.some(t=>t.toLowerCase()===fb.toLowerCase())) tagsArr.push(fb);
      }

      // ── POST OBJECT — EXACT same fields as publishPost() in index.html ──
      const postId = Date.now() + Math.floor(Math.random()*1000);

      const post = {
        id:           postId,
        title:        rw.seoTitle || article.title,
        excerpt:      rw.metaDesc || (article.description||"").slice(0,155),
        category:     cat,
        categories:   [cat],
        cat_key:      cat.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").replace(/-+/g,"-").replace(/^-|-$/g,"")||"national",
        type:         type,
        author:       CFG.AUTHOR,
        body:         rw.body,
        image:        image||"",
        video:        "",
        audio:        "",
        pdf:          "",
        tags:         tagsArr,
        status:       "published",
        isHeadline:   false,
        views:        0,
        likes:        0,
        date:         new Date().toISOString(),
        ad_slot:      "",
        lastEditedBy: "Auto Publisher",
        lastEditedAt: new Date().toISOString(),
        scheduledAt:  "",
        series:       "",
        seoTitle:     rw.seoTitle||article.title,
        seoDesc:      rw.metaDesc||(article.description||"").slice(0,155),
        revisions:    [],
        sourceUrl:    article.url||"",
        sourceName:   article.source?.name||"",
        autoPublished: true,
      };

      const saved=await saveToFirebase(post);
      if(saved) {
        count++;
        published.push(post.title);
        markUsed(article.title, article.url||"");
      }

      await sleep(4000); // Rate limit buffer

    } catch(e) { console.log("  ⚠️  Error:", e.message); }
  }

  if(published.length>0) await updateTicker(published);

  const mins=((Date.now()-t0)/60000).toFixed(1);
  console.log("\n════════════════════════════════════════════════");
  console.log(`   ✅ Published: ${count} articles in ${mins} min`);
  console.log(`   📅  Next run: 1 hour`);
  console.log("════════════════════════════════════════════════\n");
}

main().catch(e=>{console.error("💥 Fatal:",e);process.exit(1);});
