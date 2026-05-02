// ============================================================
// EK AWAZ NEWS — AUTO PUBLISHER v4.0 FINAL
// Matches EXACT post structure from index.html
// Fixes: empty body, hyphens, duplicate posts, wrong cats
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

const CATS = {
  "Politics":      ["politics","pmln","pti","ppp","election","senator","prime minister","president","imran khan","shehbaz","zardari","nawaz","vote","assembly","opposition","mna","mpa","parliament","bypolls","party leader"],
  "Government":    ["government policy","federal","cabinet","ministry","budget","tax","ordinance","legislation","supreme court","high court","chief justice","judiciary","sbp","state bank","public sector"],
  "Sports":        ["cricket","football","hockey","psl","pcb","match","tournament","squad","stadium","champion","trophy","world cup","t20","odi","test match","batting","bowling","icc","babar","shaheen","fifa","athlete","olympics","hockey"],
  "Entertainment": ["film","drama","actor","actress","celebrity","lollywood","bollywood","music","singer","award","showbiz","tv show","netflix","youtube","fashion","entertainment","ary digital","geo entertainment","hum tv","drama serial","ranbir","deepika","mahira"],
  "Weather":       ["weather","rain","flood","temperature","heatwave","storm","cyclone","fog","monsoon","drought","wind","humidity","forecast","rainfall","thunderstorm","smog","snowfall","heat wave","cold wave"],
  "International": ["usa","america","india","china","russia","ukraine","israel","iran","saudi arabia","uae","united kingdom","europe","nato","united nations","trump","modi","white house","war","ceasefire","diplomacy","foreign","global","g20","imf","world bank","un security"],
  "Crime":         ["murder","robbery","arrested","police","fir","kidnap","gang","drug","trafficking","corruption","fraud","theft","attack","blast","target killing","encounter","rangers","fia","raid","criminal","accused","sentenced","jail","prison","killed","shot dead","stabbed","crime report","gang war"],
  "Editorials":    ["editorial","opinion","analysis","perspective","columnist","commentary","op-ed"],
  "Bulletins":     ["breaking news","flash","alert","urgent","just in","developing story"],
  "National":      ["pakistan","karachi","lahore","islamabad","peshawar","quetta","sindh","punjab","kpk","khyber","balochistan","multan","rawalpindi","faisalabad","hyderabad","sialkot","gujranwala","sukkur"],
};

const PK_CITIES   = ["Karachi","Lahore","Islamabad","Peshawar","Quetta","Multan","Faisalabad","Rawalpindi","Hyderabad","Sialkot"];
const INTL_CITIES = ["London","Dubai","New York","Riyadh","Beijing","Delhi","Kabul","Tehran","Ankara","Washington"];
const usedTitles  = new Set();
const sleep       = ms => new Promise(r => setTimeout(r, ms));

// ── FETCH NEWS ───────────────────────────────────────────────
async function fetchPK() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?country=pk&pageSize=30&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]"&&a.description.length>50).map(a=>({...a,_src:"PK"}));
  } catch(e){ console.log("NewsAPI PK:",e.message); return []; }
}

async function fetchINTL() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]"&&a.description.length>50).map(a=>({...a,_src:"INTL",_forcecat:"International"}));
  } catch(e){ console.log("NewsAPI INTL:",e.message); return []; }
}

async function fetchCrime() {
  try {
    const r = await fetch(`https://newsapi.org/v2/everything?q=(crime OR murder OR arrested OR police) AND pakistan&language=en&sortBy=publishedAt&pageSize=15&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=="[Removed]"&&a.description.length>50).map(a=>({...a,_src:"Crime",_forcecat:"Crime"}));
  } catch(e){ console.log("Crime news:",e.message); return []; }
}

async function fetchGNews() {
  try {
    const r = await fetch(`https://gnews.io/api/v4/top-headlines?country=pk&lang=en&max=20&token=${CFG.GNEWS}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.description.length>50).map(a=>({
      title:a.title, description:a.description, content:a.content||a.description,
      urlToImage:a.image, url:a.url, source:{name:a.source?.name||"GNews"},
      publishedAt:a.publishedAt, _src:"GNews"
    }));
  } catch(e){ console.log("GNews:",e.message); return []; }
}

async function fetchWeather() {
  const results = [];
  const h = new Date().getHours();
  const cities = [
    {city:PK_CITIES[h%10], isPK:true},
    {city:PK_CITIES[(h+3)%10], isPK:true},
    {city:PK_CITIES[(h+6)%10], isPK:true},
    {city:INTL_CITIES[h%10], isPK:false},
  ];
  for(const {city, isPK} of cities) {
    try {
      const r = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${CFG.WEATHER}&q=${encodeURIComponent(city)}&days=2&aqi=yes`);
      const d = await r.json();
      if(!d.current) continue;
      const tmr = d.forecast?.forecastday?.[1]?.day;
      results.push({
        title: `${city} Weather Today: ${d.current.condition.text}, ${Math.round(d.current.temp_c)}°C`,
        description: `${city} is experiencing ${d.current.condition.text.toLowerCase()} conditions with a temperature of ${d.current.temp_c}°C, feeling like ${d.current.feelslike_c}°C. Humidity is at ${d.current.humidity}% and winds are blowing at ${d.current.wind_kph} km/h. Tomorrow: ${tmr?.condition?.text||"similar weather"} with high of ${tmr?.maxtemp_c||"--"}°C.`,
        urlToImage:null, url:"https://www.weatherapi.com",
        source:{name:"WeatherAPI"}, publishedAt:new Date().toISOString(),
        _src:"Weather", _forcecat:"Weather", _city:city, _isPK:isPK,
      });
    } catch(e){ console.log(`Weather ${city}:`,e.message); }
    await sleep(300);
  }
  return results;
}

// ── CATEGORY DETECTION ────────────────────────────────────────
function detectCat(title, desc, forced) {
  if(forced) return forced;
  const txt = `${title} ${desc}`.toLowerCase();
  const order = ["Bulletins","Crime","Sports","Politics","Government","Entertainment","Weather","International","Editorials","National"];
  for(const cat of order) {
    if(CATS[cat]?.some(k => txt.includes(k))) return cat;
  }
  return "National";
}

// ── GEMINI CALL ───────────────────────────────────────────────
async function gemini(prompt) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CFG.GEMINI}`,
      { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.78, maxOutputTokens:1400} })
      }
    );
    const d = await r.json();
    return (d.candidates?.[0]?.content?.parts?.[0]?.text||"").trim();
  } catch(e){ console.log("Gemini:",e.message); return ""; }
}

// ── REWRITE ARTICLE ───────────────────────────────────────────
async function rewrite(article, cat) {
  const RULES = `
WRITING RULES — FOLLOW STRICTLY:
- Write ONLY in flowing paragraphs. Wrap each paragraph in <p> tags.
- NO bullet points. NO numbered lists. NO hyphens as list markers.
- NO em dashes (—) anywhere. Use a period or comma instead.
- NEVER start sentences with: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably, Importantly, It should be noted, In a significant development
- NEVER start the article with "In a", "In an", "In the", "This is"
- Active voice. Short sentences. Sound like a real Pakistani journalist.
- Each paragraph: 3 to 4 sentences. No single-sentence paragraphs.
- Output HTML only. No markdown. No asterisks. No # headers unless specified.
`;

  let bodyPrompt = "";

  if(cat==="Weather") {
    bodyPrompt = `${RULES}
You are a professional weather reporter for Ek Awaz News Pakistan.
Write a 320-word weather report in HTML paragraph format for ${article._city}.

Cover these naturally in flowing prose:
- Current temperature and what it feels like
- Humidity, wind speed and direction
- How conditions affect daily life in ${article._city}
- Tomorrow forecast (high, low, conditions)
- Safety tips if severe weather (heat, rain, fog, smog)

Close with: <p>Stay updated with Ek Awaz News for the latest weather conditions from across ${article._isPK?"Pakistan":"the world"}.</p>

Weather data: ${article.description}`;

  } else if(cat==="Crime") {
    bodyPrompt = `${RULES}
You are a senior crime reporter at Ek Awaz News Pakistan.
Write a factual 370-word crime report in HTML paragraph format.

Rules:
- Report ONLY what is stated in the original (no speculation or invented details)
- Include: what happened, where, when, and who (only if officially named)
- State if a suspect is arrested, wanted, or under investigation
- Include official police or government statement if mentioned
- Do NOT describe graphic violence
- Do NOT reveal private victim information
- Use "allegedly" when guilt is not proven
- Close with: <p>Police have registered an FIR and investigations are underway. Ek Awaz News will continue to follow this developing story.</p>

Original: Title: ${article.title} | Details: ${article.description}`;

  } else if(cat==="Editorials"||cat==="Columns") {
    bodyPrompt = `${RULES}
You are a senior Pakistani political analyst writing a newspaper column for Ek Awaz News.
Write a 520-word editorial in HTML paragraph format on this topic.

Cover in flowing prose (no subheadings, no lists):
1. Strong opening: what is happening and why Pakistanis should care
2. Analysis of the current situation with relevant facts
3. Historical context from Pakistan's perspective
4. Impact on ordinary Pakistanis (economy, security, society)
5. What different sides or experts are saying
6. What should happen or what to watch next
7. A thoughtful closing statement

Write at the level of Dawn.com or The News International editorial page.
Topic: ${article.title} | Background: ${article.description}`;

  } else if(cat==="Bulletins") {
    bodyPrompt = `${RULES}
You are a breaking news reporter at Ek Awaz News Pakistan.
Write a 180-word urgent bulletin in HTML paragraph format.

Start with: <p><strong>BREAKING:</strong> [Most important fact in one powerful sentence]</p>
Then 2 to 3 short paragraphs covering available details.
Close with: <p>Ek Awaz News is monitoring this story and will provide updates as they emerge.</p>

News: ${article.title}. ${article.description}`;

  } else {
    const extra = cat==="International" ? "Connect this story to Pakistan's interests where relevant." : "";
    const sports = cat==="Sports" ? "Include player or team details, tournament context, and any stats mentioned." : "";
    bodyPrompt = `${RULES}
You are a professional journalist at Ek Awaz News writing for a Pakistani audience.
Write a complete 400-word news article in HTML paragraph format.

Structure (all in flowing prose, NOT bullet points or lists):
Paragraph 1 (Lead): The single most important fact. Who, what, when, where.
Paragraph 2 (Details): Expand on the lead with supporting facts and key figures.
Paragraph 3 (Context): Why this matters for Pakistan and the region. Background information.
Paragraph 4 (Reaction): Official statement, expert reaction, or quote if mentioned.
Paragraph 5 (Outlook): What happens next. Implications. What to watch.

${extra}
${sports}

Source article:
Title: ${article.title}
Content: ${article.description}${article.content&&article.content.length>100?" | Extra: "+article.content.slice(0,250):""}
Source: ${article.source?.name||"News Agency"}`;
  }

  const seoPrompt = `Write a compelling SEO headline for a Pakistani news audience.
Original: "${article.title}" | Category: ${cat}
Rules: Under 65 characters. Include main keyword. Like Dawn.com style. No hyphens. No clickbait.
Return ONLY the headline. No quotes. Nothing else.`;

  const metaPrompt = `Write a Google search meta description.
News: "${article.title}. ${(article.description||"").slice(0,100)}"
Rules: 145 to 155 characters. Include keyword. End with " — Ek Awaz News".
Return ONLY the description. Nothing else.`;

  const tagsPrompt = `Generate 7 SEO tags for Pakistani news audience.
Article: "${article.title}" | Category: ${cat}
Return ONLY comma-separated plain text tags. Example: Pakistan, Lahore, Cricket, PCB, T20
No hashtags. No quotes. No numbering.`;

  const body = await gemini(bodyPrompt);
  await sleep(700);
  const seoTitle = await gemini(seoPrompt);
  await sleep(700);
  const metaDesc = await gemini(metaPrompt);
  await sleep(700);
  const tags = await gemini(tagsPrompt);

  // Clean output
  const cleanBody = (body||article.description||"<p>No content available.</p>")
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.*?)\*/g,"<em>$1</em>")
    .replace(/^#{1,3}\s+(.+)$/gm,"<h3>$1</h3>")
    .replace(/^[-•]\s+(.+)$/gm,"<p>$1</p>")
    .replace(/^\d+\.\s+(.+)$/gm,"<p>$1</p>")
    .replace(/ — /g,". ").replace(/—/g," ")
    .trim();

  return {
    body:     cleanBody,
    seoTitle: (seoTitle||article.title).replace(/['"]/g,"").slice(0,70),
    metaDesc: (metaDesc||"").slice(0,160),
    tags:     tags||"Pakistan, News, Ek Awaz News",
  };
}

// ── UPLOAD IMAGE ──────────────────────────────────────────────
async function uploadImage(imgUrl, title) {
  const ph = `https://via.placeholder.com/1200x630/CC0000/ffffff?text=${encodeURIComponent((title||"Ek Awaz").slice(0,25))}`;
  const src = (imgUrl&&imgUrl.startsWith("http")) ? imgUrl : ph;
  try {
    const { FormData } = await import('node-fetch');
    const form = new FormData();
    form.append("file", src);
    form.append("upload_preset", CFG.CLD_PRE);
    form.append("folder", "ekawaz-auto");
    form.append("eager", `w_1200,h_630,c_fill,g_auto/l_fetch:${Buffer.from(CFG.WATERMARK).toString("base64")},w_160,g_south_east,x_12,y_12,o_80`);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CFG.CLD_CLOUD}/image/upload`,{method:"POST",body:form});
    const d = await r.json();
    return d.eager?.[0]?.secure_url||d.secure_url||src;
  } catch(e){ console.log("Cloudinary:",e.message); return src; }
}

// ── SAVE TO FIREBASE ──────────────────────────────────────────
async function savePost(post) {
  const id = Date.now();
  const catKey = post.category.toLowerCase()
    .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").replace(/-+/g,"-").replace(/^-|-$/g,"")||"general";

  const doc = {
    fields: {
      id:            {integerValue:String(id)},
      title:         {stringValue:post.title},
      excerpt:       {stringValue:post.excerpt},
      body:          {stringValue:post.body},
      category:      {stringValue:post.category},
      categories:    {arrayValue:{values:[{stringValue:post.category}]}},
      cat_key:       {stringValue:catKey},
      type:          {stringValue:post.type},
      author:        {stringValue:CFG.AUTHOR},
      status:        {stringValue:"published"},
      isHeadline:    {booleanValue:false},
      views:         {integerValue:"0"},
      likes:         {integerValue:"0"},
      _liked:        {booleanValue:false},
      date:          {stringValue:new Date().toISOString()},
      lastEditedAt:  {stringValue:new Date().toISOString()},
      lastEditedBy:  {stringValue:"Auto Publisher"},
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
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(doc)}
    );
    if(r.ok){ console.log(`  ✅ [${post.category}] ${post.title.slice(0,52)}`); return id; }
    const e = await r.json();
    console.log("  ❌ Firebase:",JSON.stringify(e).slice(0,120));
  } catch(e){ console.log("  ❌ Firebase:",e.message); }
  return null;
}

// ── UPDATE TICKER ─────────────────────────────────────────────
async function updateTicker(headlines) {
  try {
    const body = {fields:{
      ticker:{arrayValue:{values:headlines.slice(0,12).map(h=>({stringValue:`• ${h}`}))}},
      tickerUpdatedAt:{stringValue:new Date().toISOString()}
    }};
    const r = await fetch(
      `${CFG.FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${CFG.FB_KEY}`,
      {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}
    );
    if(r.ok) console.log(`📺 Ticker updated with ${headlines.length} headlines`);
  } catch(e){ console.log("Ticker:",e.message); }
}

// ── DEDUP ─────────────────────────────────────────────────────
async function loadRecent() {
  try {
    const r = await fetch(`${CFG.FB_BASE}/ekawaz_posts?pageSize=150&key=${CFG.FB_KEY}`);
    const d = await r.json();
    (d.documents||[]).forEach(doc=>{
      const t = doc.fields?.title?.stringValue;
      if(t) usedTitles.add(t.toLowerCase().slice(0,55));
    });
    console.log(`📋 Loaded ${usedTitles.size} recent titles for dedup`);
  } catch(e){ console.log("Dedup load failed:",e.message); }
}

function isDupe(title) {
  const k = title.toLowerCase().slice(0,55);
  if(usedTitles.has(k)) return true;
  const words = title.toLowerCase().split(/\s+/).filter(w=>w.length>4);
  for(const s of usedTitles){
    if(words.filter(w=>s.includes(w)).length >= 3) return true;
  }
  return false;
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log("════════════════════════════════════════════");
  console.log("   🗞️  EK AWAZ NEWS AUTO PUBLISHER v4.0");
  console.log(`   ⏰  ${new Date().toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}`);
  console.log("════════════════════════════════════════════\n");

  await loadRecent();
  console.log("📡 Fetching news...");
  const [pk,intl,crime,gnews,weather] = await Promise.all([fetchPK(),fetchINTL(),fetchCrime(),fetchGNews(),fetchWeather()]);
  const all = [...pk,...intl,...crime,...gnews,...weather];
  console.log(`📰 Total: ${all.length} | PK:${pk.length} INTL:${intl.length} Crime:${crime.length} GNews:${gnews.length} Weather:${weather.length}\n`);

  const fresh = all.filter(a=>a.title&&!isDupe(a.title)).sort(()=>Math.random()-0.5).slice(0,CFG.PER_RUN);
  console.log(`✏️  Processing ${fresh.length} articles...\n`);

  const published = [];
  let count = 0;

  for(const [i,article] of fresh.entries()) {
    try {
      const cat = detectCat(article.title, article.description||"", article._forcecat);
      let type="Article", authorTitle="Staff Reporter";
      if(cat==="Editorials"||cat==="Columns"){type="Column";authorTitle="Senior Analyst";}
      else if(cat==="Bulletins"){type="Bulletin";authorTitle="News Desk";}
      else if(cat==="Crime"){authorTitle="Senior Reporter";}
      else if(cat==="Weather"){authorTitle="Weather Correspondent";}
      else if(cat==="International"){authorTitle="International Correspondent";}
      else if(cat==="Sports"){authorTitle="Sports Reporter";}
      else if(cat==="Politics"){authorTitle="Political Reporter";}

      console.log(`[${i+1}/${fresh.length}] ${cat} → "${article.title.slice(0,52)}..."`);

      const rw = await rewrite(article, cat);
      if(!rw.body||rw.body.length<100){console.log("  ⚠️ Empty body, skipping"); continue;}

      const image = await uploadImage(article.urlToImage||null, article.title);
      const tagsArr = (rw.tags||"Pakistan, News").split(",").map(t=>t.trim()).filter(Boolean);

      const saved = await savePost({
        title:rw.seoTitle||article.title,
        excerpt:rw.metaDesc||(article.description||"").slice(0,155),
        body:rw.body, category:cat, type, authorTitle, image,
        seoTitle:rw.seoTitle, metaDesc:rw.metaDesc, tagsArr,
        sourceUrl:article.url||"", sourceName:article.source?.name||"",
      });

      if(saved){
        count++;
        published.push(rw.seoTitle||article.title);
        usedTitles.add(article.title.toLowerCase().slice(0,55));
      }
      await sleep(3500);
    } catch(e){ console.log(`  ⚠️ Error:`,e.message); }
  }

  if(published.length>0) await updateTicker(published);
  const mins=((Date.now()-t0)/60000).toFixed(1);
  console.log("\n════════════════════════════════════════════");
  console.log(`   ✅ Done! Published ${count} articles in ${mins} min`);
  console.log("════════════════════════════════════════════\n");
}

main().catch(e=>{console.error("💥 Fatal:",e);process.exit(1);});
