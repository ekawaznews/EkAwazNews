// ============================================================
// EK AWAZ NEWS — AUTO PUBLISHER FINAL CORRECT v8.0
// Uses Firebase Admin SDK — same format as savePostToFirebase()
// Post object is PLAIN JS, saved as setDoc(doc(db,'ekawaz_posts',String(id)), post)
// Ticker saved as setDoc(doc(db,'ekawaz','main'), {ticker:[...]}, {merge:true})
// Author: Umer Javed on EVERY single article
// ============================================================

import fetch from 'node-fetch';
import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Firebase Admin init ───────────────────────────────────────
// We use the service account JSON from GitHub secret
let db;
function initFirebase() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
  db = getFirestore();
}

// ── API Keys ──────────────────────────────────────────────────
const CFG = {
  GEMINI:    process.env.GEMINI_API_KEY,
  NEWSAPI:   process.env.NEWSAPI_KEY,
  GNEWS:     process.env.GNEWS_KEY,
  WEATHER:   process.env.WEATHERAPI_KEY,
  CLD_CLOUD: process.env.CLOUDINARY_CLOUD,
  CLD_PRE:   process.env.CLOUDINARY_PRESET,
  WATERMARK: process.env.WATERMARK_URL || 'https://raw.githubusercontent.com/ekawaznews/ekawaznews.github.io/main/ek-awaz-logo.png',
  AUTHOR:    'Umer Javed',
  PER_RUN:   12,
};

// ── Category keywords (comprehensive) ────────────────────────
const CAT_RULES = [
  { cat: 'Bulletins',     kws: ['breaking news','just in:','urgent:','flash:','developing story'] },
  { cat: 'Crime',         kws: ['murder','robbery','police arrested','fir registered','kidnapping','drug trafficking','corruption','fraud case','terrorist attack','bomb blast','target killing','rangers operation','fia raid','fia operation','criminal arrested','accused','sentenced','jail sentence','prison','killed in karachi','killed in lahore','shot dead','stabbed','dacoity','gang war','crime report','ctd operation'] },
  { cat: 'Sports',        kws: ['cricket','psl','pakistan super league','pcb','test match','odi cricket','t20 cricket','icc','world cup cricket','babar azam','shaheen afridi','naseem shah','mohammad rizwan','fakhar zaman','football match','hockey pakistan','olympics','asia cup','champions trophy','batting','bowling','wicket','innings','match result','tournament'] },
  { cat: 'Politics',      kws: ['pmln','pti','ppp','election','national assembly','provincial assembly','parliament','senate','prime minister','president of pakistan','imran khan','shehbaz sharif','asif zardari','nawaz sharif','maryam nawaz','bilawal bhutto','opposition leader','mna','mpa','political party','pdm','coalition government','bypolls','vote','ballot','speaker assembly'] },
  { cat: 'Government',    kws: ['federal cabinet','ministry of finance','ministry of interior','government policy','state bank of pakistan','sbp','income tax','budget 2026','ordinance','legislation','supreme court of pakistan','high court','chief justice','ogra','nepra','public service commission','ehsaas program','benazir income support','secp'] },
  { cat: 'Entertainment', kws: ['pakistani drama','lollywood','bollywood','actor','actress','pakistani singer','hum awards','ary film','showbiz','ary digital','geo entertainment','hum tv','drama serial','mahira khan','fawad khan','atif aslam','sajal ali','hania amir','film premiere','box office','entertainment news'] },
  { cat: 'Weather',       kws: ['weather today','weather forecast','pakistan weather','rain alert','flood warning','heatwave','storm warning','cyclone','fog alert','monsoon rain','drought','pmd forecast','pakistan meteorological department','met office','weather karachi','weather lahore','weather islamabad','weather peshawar','weather quetta','temperature'] },
  { cat: 'International', kws: ['united states','us president','american','india pakistan','china pakistan','russia ukraine','israel','iran nuclear','saudi arabia','united arab emirates','united kingdom','nato','united nations','trump','modi','white house','war news','ceasefire','diplomacy','foreign affairs','g20','imf pakistan','world bank','canada news','australia','france','germany','turkey','afghanistan','kashmir','middle east','khalistani','csis'] },
  { cat: 'Editorials',    kws: ['opinion:','editorial:','analysis:','op-ed','viewpoint','columnist','commentary on','column by'] },
  { cat: 'National',      kws: ['karachi','lahore','islamabad','peshawar','quetta','sindh','punjab','kpk','khyber pakhtunkhwa','balochistan','multan','rawalpindi','faisalabad','hyderabad','sialkot','gujranwala','sukkur','larkana','abbottabad','swat','gilgit','azad kashmir','pakistan'] },
];

// Valid category values matching index.html cat-chk values
const VALID_CATS = ['Politics','Government','Sports','Entertainment','Weather','International','National','Crime','Editorials','Columns','Bulletins','Home / General'];

// City lists for weather
const PK_CITIES   = ['Karachi','Lahore','Islamabad','Peshawar','Quetta','Multan','Faisalabad','Rawalpindi','Hyderabad','Sialkot','Gujranwala','Sukkur','Abbottabad','Larkana','Dera Ghazi Khan'];
const INTL_CITIES = ['London','Dubai','New York','Riyadh','Beijing','Delhi','Kabul','Tehran','Ankara','Washington','Paris','Istanbul','Doha','Abu Dhabi','Sydney'];

// Dedup store
const seenHashes   = new Set();
const seenWordSets = [];
const sleep        = ms => new Promise(r => setTimeout(r, ms));

function md5(s) { return crypto.createHash('md5').update(s.toLowerCase().trim()).digest('hex'); }

function isDupe(title, url) {
  if (url && seenHashes.has(md5(url))) return true;
  const clean = title.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
  if (seenHashes.has(md5(clean.slice(0,60)))) return true;
  const words = clean.split(/\s+/).filter(w=>w.length>4);
  for (const prev of seenWordSets) {
    if (words.filter(w=>prev.has(w)).length >= 4) return true;
  }
  return false;
}
function markSeen(title, url) {
  const clean = title.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
  seenHashes.add(md5(clean.slice(0,60)));
  if (url) seenHashes.add(md5(url));
  seenWordSets.push(new Set(clean.split(/\s+/).filter(w=>w.length>4)));
}

// ── Category detection ────────────────────────────────────────
function detectCat(title, desc, forced) {
  if (forced && VALID_CATS.includes(forced)) return forced;
  const txt = `${title} ${desc}`.toLowerCase();
  for (const {cat, kws} of CAT_RULES) {
    if (kws.some(kw => txt.includes(kw))) return cat;
  }
  return 'National';
}

// ── NEWS SOURCES ──────────────────────────────────────────────
async function fetchPK() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?country=pk&pageSize=30&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=='[Removed]'&&a.description.length>60).map(a=>({...a,_src:'PK'}));
  } catch(e){ console.log('NewsAPI PK:',e.message); return []; }
}

async function fetchINTL() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=='[Removed]'&&a.description.length>60).map(a=>({...a,_src:'INTL',_forcecat:'International'}));
  } catch(e){ console.log('NewsAPI INTL:',e.message); return []; }
}

async function fetchCrime() {
  try {
    const h = new Date().getHours();
    const q = ['crime murder arrested pakistan','fia rangers raid pakistan','corruption fraud accused pakistan'][h%3];
    const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${CFG.NEWSAPI}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.title!=='[Removed]'&&a.description.length>60).map(a=>({...a,_src:'Crime',_forcecat:'Crime'}));
  } catch(e){ console.log('Crime:',e.message); return []; }
}

async function fetchGNews() {
  try {
    const r = await fetch(`https://gnews.io/api/v4/top-headlines?country=pk&lang=en&max=20&token=${CFG.GNEWS}`);
    const d = await r.json();
    return (d.articles||[]).filter(a=>a.title&&a.description&&a.description.length>60).map(a=>({
      title:a.title,description:a.description,content:a.content||a.description,
      urlToImage:a.image,url:a.url,source:{name:a.source?.name||'GNews'},
      publishedAt:a.publishedAt,_src:'GNews'
    }));
  } catch(e){ console.log('GNews:',e.message); return []; }
}

async function fetchWeather() {
  if (!CFG.WEATHER) { console.log('⚠️ No WEATHERAPI_KEY'); return []; }
  const results = [];
  const h = new Date().getHours();
  const picks = [
    {city:PK_CITIES[h%15],isPK:true}, {city:PK_CITIES[(h+4)%15],isPK:true},
    {city:PK_CITIES[(h+8)%15],isPK:true}, {city:INTL_CITIES[h%15],isPK:false},
    {city:INTL_CITIES[(h+5)%15],isPK:false},
  ];
  for (const {city,isPK} of picks) {
    try {
      const r = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${CFG.WEATHER}&q=${encodeURIComponent(city)}&days=3&aqi=yes`);
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.current) continue;
      const t0=d.forecast?.forecastday?.[0]?.day;
      const t1=d.forecast?.forecastday?.[1]?.day;
      const t2=d.forecast?.forecastday?.[2]?.day;
      results.push({
        title:`${city} Weather Report: ${d.current.condition.text}, ${Math.round(d.current.temp_c)}°C Today`,
        description:`${city}: ${d.current.condition.text}. Temp ${d.current.temp_c}°C (feels like ${d.current.feelslike_c}°C). Humidity ${d.current.humidity}%. Wind ${d.current.wind_kph}km/h ${d.current.wind_dir}. UV ${d.current.uv}. Rain chance ${t0?.daily_chance_of_rain||0}%. Tomorrow: ${t1?.condition?.text} max ${t1?.maxtemp_c}°C min ${t1?.mintemp_c}°C. Day after: ${t2?.condition?.text} max ${t2?.maxtemp_c}°C.`,
        urlToImage:null, url:'https://www.weatherapi.com',
        source:{name:'WeatherAPI / PMD'}, publishedAt:new Date().toISOString(),
        _src:'Weather', _forcecat:'Weather', _city:city, _isPK:isPK, _wd:d,
      });
      console.log(`  🌤 ${city}: ${d.current.condition.text}, ${d.current.temp_c}°C`);
    } catch(e){ console.log(`Weather ${city}:`,e.message); }
    await sleep(400);
  }
  return results;
}

// ── GEMINI ────────────────────────────────────────────────────
async function gemini(prompt, maxTok=2200) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CFG.GEMINI}`,
      {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.78,maxOutputTokens:maxTok}})
      }
    );
    const d = await r.json();
    if (d.error) { console.log('Gemini error:',d.error.message); return ''; }
    return (d.candidates?.[0]?.content?.parts?.[0]?.text||'').trim();
  } catch(e){ console.log('Gemini:',e.message); return ''; }
}

// ── REWRITE ARTICLE ───────────────────────────────────────────
async function rewrite(article, cat) {
  const RULES = `
ABSOLUTE RULES:
1. Write ONLY in HTML: use <p>text</p> for paragraphs, <h2>text</h2> for headings
2. NO bullet points. NO numbered lists. NO hyphens as list items.
3. NO em dashes (—). Replace with period or comma.
4. NEVER use: Furthermore, Moreover, Additionally, In conclusion, It is worth noting, Notably, Importantly, It should be noted, In a significant development, Needless to say
5. NEVER start with: "In a", "In an", "In the", "This is", "There is"
6. Short sentences (max 20 words). Active voice. 3-4 sentences per paragraph.
7. Write exactly like Dawn.com journalist. Zero AI tone.
8. Bold key names: <strong>name</strong>
9. Output HTML only. No markdown. No asterisks. No # symbols.
`;

  let bodyPrompt = '';

  if (cat === 'Weather') {
    const wd=article._wd; const curr=wd?.current;
    const t0=wd?.forecast?.forecastday?.[0]?.day;
    const t1=wd?.forecast?.forecastday?.[1]?.day;
    const t2=wd?.forecast?.forecastday?.[2]?.day;
    const aqi=curr?.air_quality?.pm2_5?Math.round(curr.air_quality.pm2_5):null;
    const city=article._city||'Pakistan';

    bodyPrompt=`${RULES}
You are a professional weather reporter at Ek Awaz News Pakistan.
Write a detailed 650-word weather report for <strong>${city}</strong> in HTML format.

ACTUAL WEATHER DATA — use these exact numbers:
- Condition: ${curr?.condition?.text}
- Temperature: ${curr?.temp_c}°C (feels like ${curr?.feelslike_c}°C)
- Humidity: ${curr?.humidity}% | Wind: ${curr?.wind_kph}km/h from ${curr?.wind_dir}
- Pressure: ${curr?.pressure_mb}mb | UV Index: ${curr?.uv} | Visibility: ${curr?.vis_km}km
${aqi?`- Air Quality PM2.5: ${aqi}µg/m³`:''}
- Today: max ${t0?.maxtemp_c}°C / min ${t0?.mintemp_c}°C | Rain chance: ${t0?.daily_chance_of_rain||0}%
- Tomorrow: ${t1?.condition?.text} | max ${t1?.maxtemp_c}°C / min ${t1?.mintemp_c}°C | Rain: ${t1?.daily_chance_of_rain||0}%
- Day after: ${t2?.condition?.text} | max ${t2?.maxtemp_c}°C / min ${t2?.mintemp_c}°C

WRITE THESE EXACT SECTIONS with real data:
<h2>Current Weather Conditions in ${city}</h2>
<p>Vivid opening describing current situation using the exact temperature and conditions above.</p>

<h2>Temperature, Humidity and Wind Details</h2>
<p>Thorough analysis of all parameters. Use exact numbers from the data above.</p>

<h2>How This Weather Affects Daily Life in ${city}</h2>
<p>Impact on commuters, schools, markets, outdoor workers, and agriculture in ${city}.</p>

${aqi?`<h2>Air Quality Alert</h2>\n<p>Explain PM2.5 reading of ${aqi}µg/m³. Health impact. Who should stay indoors.</p>`:''}

<h2>Three-Day Forecast</h2>
<p>Tomorrow and day-after forecast with exact temperatures and rain probability from the data above.</p>

<h2>Safety Precautions and Advisory</h2>
<p>Specific safety tips relevant to today's conditions (heat/rain/fog/wind).</p>

<h2>${article._isPK?'Pakistan Met Department Advisory':'Official Weather Advisory'}</h2>
<p>What ${article._isPK?'Pakistan Meteorological Department (PMD)':'meteorological authorities'} advise for ${city} and surrounding areas.</p>

<p>Stay updated with <strong>Ek Awaz News</strong> for real-time weather from across ${article._isPK?'Pakistan':'the world'}. Our weather team monitors conditions round the clock.</p>`;

  } else if (cat === 'Crime') {
    bodyPrompt=`${RULES}
You are a senior crime reporter at Ek Awaz News Pakistan.
Write a complete 750-word factual crime report in HTML.

STRICT CRIME REPORTING RULES:
- Report ONLY facts from the original source. Zero speculation. Zero invented details.
- Include: exactly what happened, precise location, when, who (ONLY if officially named by police)
- Use "allegedly" and "accused of" for unproven claims. Always innocent until convicted.
- Include official police or government statement word-for-word if available
- State clearly: arrested / wanted / under investigation / FIR registered
- NO graphic violence descriptions. NO private victim information.
- Add evidence mentioned in official reports (CCTV, weapons recovered, etc.)

WRITE THESE SECTIONS:
<h2>[Factual, specific crime headline with location and type]</h2>
<p>Lead: The single most important fact. What happened, where exactly, when.</p>

<h2>Incident Details</h2>
<p>Complete factual account from official reports. Sequence of events as reported.</p>

<h2>Police Response and Action Taken</h2>
<p>How law enforcement responded. Operation launched. Arrests made. Evidence recovered.</p>

<h2>Official Statement</h2>
<p>Police spokesperson or SSP statement. What officials have confirmed publicly.</p>

<h2>Evidence and Investigation</h2>
<p>CCTV footage, weapons, witnesses, forensic evidence mentioned in official reports.</p>

<h2>Area Crime Context</h2>
<p>Has this area seen similar incidents? What law enforcement is doing about crime in this locality.</p>

<h2>Legal Proceedings</h2>
<p>FIR sections registered. Court appearance scheduled. Bail status. Investigation timeline.</p>

<p>Police have registered an FIR and investigations are underway. <strong>Ek Awaz News</strong> will continue to follow this case and provide updates as they emerge.</p>

Source: Title: ${article.title} | Details: ${article.description} | Source: ${article.source?.name||'News report'}`;

  } else if (cat==='Editorials'||cat==='Columns') {
    bodyPrompt=`${RULES}
You are a senior political analyst writing a newspaper column for Ek Awaz News Pakistan.
Write a complete 950-word editorial in HTML.

WRITE THESE SECTIONS (all flowing prose, NEVER bullet lists):
<h2>[Compelling, thought-provoking column title]</h2>
<p>Powerful opening: State clearly what is happening and why every Pakistani should pay attention. Be provocative and direct.</p>

<h2>The Current Situation</h2>
<p>Detailed factual analysis of what is happening. Use specific figures, dates, and names. Be precise.</p>

<h2>Historical Context</h2>
<p>How did Pakistan get here? What happened before? Which decisions led to this moment? Be specific about Pakistani history.</p>

<h2>Political Dimensions</h2>
<p>How different parties and political actors are responding. What their motivations are. Who benefits and who suffers.</p>

<h2>Economic and Social Impact on Pakistanis</h2>
<p>Real impact on ordinary Pakistani families, businesses, workers, and communities. Specific examples.</p>

<h2>Expert Perspectives</h2>
<p>What economists, legal experts, political scientists, or civil society organizations are saying about this development.</p>

<h2>Regional and International Implications</h2>
<p>How this affects Pakistan's foreign policy, trade, security, and standing in the world.</p>

<h2>The Way Forward</h2>
<p>Concrete, realistic options for Pakistan's government, institutions, and citizens. What should actually happen now.</p>

<p>A powerful, memorable closing thought. What is ultimately at stake for Pakistan. Make readers think.</p>

Topic: ${article.title} | Background: ${article.description}`;

  } else if (cat==='Bulletins') {
    bodyPrompt=`${RULES}
You are a breaking news reporter at Ek Awaz News Pakistan.
Write a 300-word urgent bulletin in HTML.

<p><strong>BREAKING:</strong> [The single most important fact in one direct sentence]</p>

<h2>What We Know So Far</h2>
<p>All confirmed facts. Label clearly what is confirmed vs unconfirmed.</p>

<h2>Official Response</h2>
<p>What authorities have said, if anything is available yet.</p>

<h2>What Happens Next</h2>
<p>Immediate next steps expected. What to watch.</p>

<p><strong>Ek Awaz News</strong> is monitoring this developing story. Refresh for live updates as they come in.</p>

News: ${article.title}. ${article.description}`;

  } else {
    const isIntl=cat==='International';
    const isSports=cat==='Sports';
    const isPol=cat==='Politics';
    const isGov=cat==='Government';

    bodyPrompt=`${RULES}
You are a senior journalist at Ek Awaz News Pakistan writing for a Pakistani audience.
Write a complete 900-word news article in HTML.

MANDATORY STRUCTURE (all flowing prose, NO bullet lists):
<h2>[Specific, informative headline — improve on the original to be more precise and engaging]</h2>

<p>LEAD: The most important single fact stated clearly and directly. Who did what, when, where. Be specific with names and numbers. Hook the reader in the first sentence.</p>

<h2>Full Story Details</h2>
<p>Expand on every aspect of the lead. All key facts, specific figures, exact names, precise locations, exact dates and times. Write minimum 3 detailed paragraphs here. Do NOT skip facts mentioned in the source.</p>

<h2>${isSports?'Match Details and Performance':'Background and Context'}</h2>
<p>${isSports?'Detailed match statistics, player individual performances, scores, milestones, records broken. Specific tournament standing and points table.':'Why this happened. What sequence of events or decisions led to this point. Important Pakistani context that readers need to understand.'}</p>

<h2>${isIntl?'Impact on Pakistan and the Region':isPol?'Political Reactions and Party Positions':isGov?'Policy Details and Who It Affects':'How This Affects Pakistan'}</h2>
<p>${isIntl?'How this international development specifically affects Pakistan. Foreign policy implications, trade impact, security concerns, Pakistani diaspora. Be specific about Pakistan\'s interests.':isPol?'How different political parties are responding. What PTI, PMLN, PPP, and other parties have said. Coalition implications. What this means for upcoming political developments.':isGov?'Specific policy measures announced. Which ministry implements. Implementation timeline. Who benefits and who pays. Impact on ordinary Pakistanis.':'Direct concrete impact on Pakistani citizens, businesses, government. Which provinces or cities are most affected.'}</p>

<h2>Official Statements and Reactions</h2>
<p>What government officials, party spokespeople, experts, or directly affected parties have said. Paraphrase any available statements clearly attributed to named individuals.</p>

<h2>${isSports?'Tournament Standing and Next Fixtures':'Expert Analysis and Wider Implications'}</h2>
<p>${isSports?'Current points table, team standings, upcoming fixtures, what this result means for qualification, rankings, or season.':'What political analysts, economists, legal experts, or international observers are saying. Wider regional or global implications of this development.'}</p>

<h2>What Happens Next</h2>
<p>Specific concrete next steps. Upcoming court hearings, assembly sessions, matches, state visits, policy reviews, or elections. Exact dates where known. What Ek Awaz News readers should watch for.</p>

<p>Strong closing: A final paragraph summarizing the significance and what this means for Pakistan's future. Why this story matters beyond today.</p>

Source article:
Title: ${article.title}
Content: ${article.description}${article.content&&article.content!==article.description?' Extra details: '+article.content.slice(0,350):''}
Source: ${article.source?.name||'News Agency'}`;
  }

  // SEO title
  const seoPrompt=`Write one SEO news headline for Pakistani audience.
Original: "${article.title}"
Category: ${cat}
Rules: Under 65 characters. Main keyword first. Like Dawn.com. No em dashes. No clickbait.
Return ONLY the headline. No quotes. Nothing else.`;

  // Meta description
  const metaPrompt=`Write Google meta description.
News: "${article.title}. ${(article.description||'').slice(0,100)}"
Rules: 148-158 characters exactly. Include keyword. End with " — Ek Awaz News".
Return ONLY the description. Nothing else.`;

  // Tags (15+)
  const tagsPrompt=`Generate 16 SEO tags for Pakistani news article.
Article: "${article.title}" | Category: ${cat}
Include: main topic keywords, people/organizations mentioned, Pakistani cities/provinces, related search terms Pakistanis use.
Return ONLY comma-separated tags. No hashtags. No quotes. No numbering.
Required inclusions: Pakistan, Ek Awaz News, Pakistani News, Umer Javed, ${cat}`;

  console.log('    ✍️  Writing body...');
  const body = await gemini(bodyPrompt, 2200);
  await sleep(800);
  console.log('    🔍  SEO...');
  const seoTitle = await gemini(seoPrompt, 100);
  await sleep(600);
  const metaDesc = await gemini(metaPrompt, 180);
  await sleep(600);
  const tagsRaw  = await gemini(tagsPrompt, 220);

  // Clean HTML body
  const cleanBody = (body||'<p>'+(article.description||'')+'</p>')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/^#+\s+(.+)$/gm,(m,t)=>`<h2>${t}</h2>`)
    .replace(/^[-•]\s+(.+)$/gm,'<p>$1</p>')
    .replace(/^\d+\.\s+(.+)$/gm,'<p>$1</p>')
    .replace(/ — /g,'. ').replace(/—/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();

  const wordCount = cleanBody.replace(/<[^>]*>/g,'').split(/\s+/).filter(Boolean).length;
  console.log(`    📄  ${wordCount} words`);

  return {
    body: cleanBody,
    seoTitle: (seoTitle||article.title).replace(/['"]/g,'').slice(0,70),
    metaDesc: (metaDesc||'').slice(0,160),
    tags: tagsRaw||'Pakistan, News, Breaking News, Ek Awaz News, Pakistani News',
  };
}

// ── UPLOAD IMAGE TO CLOUDINARY ────────────────────────────────
async function uploadImage(imgUrl, title) {
  const ph=`https://placehold.co/1200x630/CC0000/ffffff?text=${encodeURIComponent((title||'Ek Awaz News').slice(0,28))}`;
  const src=(imgUrl&&imgUrl.startsWith('http'))?imgUrl:ph;
  try {
    const form=new FormData();
    form.append('file',src);
    form.append('upload_preset',CFG.CLD_PRE);
    form.append('folder','ekawaz-auto');
    const wm=Buffer.from(CFG.WATERMARK).toString('base64');
    form.append('eager',`w_1200,h_630,c_fill,g_auto/l_fetch:${wm},w_160,g_south_east,x_12,y_12,o_80`);
    const r=await fetch(`https://api.cloudinary.com/v1_1/${CFG.CLD_CLOUD}/image/upload`,{method:'POST',body:form});
    const d=await r.json();
    return d.eager?.[0]?.secure_url||d.secure_url||src;
  } catch(e){ console.log('Cloudinary:',e.message); return src; }
}

// ── SAVE POST TO FIREBASE ADMIN SDK ──────────────────────────
// Exactly matches: setDoc(doc(db,'ekawaz_posts',String(post.id)), post)
async function savePost(post) {
  try {
    // The post object is saved as-is (plain JS) — same as savePostToFirebase() in index.html
    await db.collection('ekawaz_posts').doc(String(post.id)).set(post);
    console.log(`  ✅ [${post.category}] "${post.title.slice(0,55)}"`);
    return true;
  } catch(e) {
    console.log('  ❌ Firebase:', e.message);
    return false;
  }
}

// ── UPDATE TICKER ─────────────────────────────────────────────
// Exactly matches: setDoc(doc(db,'ekawaz','main'), {ticker:[...]}, {merge:true})
async function updateTicker(headlines) {
  try {
    const items = headlines.slice(0,15).map(h=>`• ${h}`);
    // merge:true preserves all other fields in ekawaz/main
    await db.collection('ekawaz').doc('main').set(
      { ticker: items, tickerUpdatedAt: new Date().toISOString() },
      { merge: true }
    );
    console.log(`\n📺 Ticker updated: ${items.length} headlines`);
  } catch(e) { console.log('❌ Ticker:', e.message); }
}

// ── LOAD RECENT FOR DEDUP ─────────────────────────────────────
async function loadRecent() {
  try {
    const snap = await db.collection('ekawaz_posts').limit(200).get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.title) markSeen(d.title, d.sourceUrl||'');
    });
    console.log(`📋 Dedup: loaded ${seenHashes.size} hashes from ${seenWordSets.length} posts`);
  } catch(e) { console.log('⚠️  Load recent:', e.message); }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log('════════════════════════════════════════════════');
  console.log('   🗞️  EK AWAZ NEWS — AUTO PUBLISHER v8.0');
  console.log(`   ⏰  ${new Date().toLocaleString('en-PK',{timeZone:'Asia/Karachi'})}`);
  console.log(`   👤  Author: ${CFG.AUTHOR}`);
  console.log('════════════════════════════════════════════════\n');

  initFirebase();
  await loadRecent();

  console.log('📡 Fetching news...\n');
  const [pk,intl,crime,gnews,weather] = await Promise.all([
    fetchPK(),fetchINTL(),fetchCrime(),fetchGNews(),fetchWeather()
  ]);

  const all=[...pk,...intl,...crime,...gnews,...weather];
  console.log(`📰 Fetched ${all.length}: PK:${pk.length} INTL:${intl.length} Crime:${crime.length} GNews:${gnews.length} Weather:${weather.length}\n`);

  const fresh = all
    .filter(a=>a.title&&!isDupe(a.title,a.url||''))
    .sort(()=>Math.random()-0.5)
    .slice(0,CFG.PER_RUN);

  console.log(`✏️  Processing ${fresh.length} unique articles...\n`);

  const published=[];
  let count=0;

  for (const [i,article] of fresh.entries()) {
    try {
      const cat = detectCat(article.title, article.description||'', article._forcecat);

      let type='Article';
      if (cat==='Editorials'||cat==='Columns') type='Column';
      else if (cat==='Bulletins') type='Bulletin';

      console.log(`\n[${i+1}/${fresh.length}] ${cat} → "${article.title.slice(0,62)}"`);

      const rw = await rewrite(article, cat);

      if (!rw.body || rw.body.replace(/<[^>]*>/g,'').trim().length < 300) {
        console.log('  ⚠️  Body too short, skip'); continue;
      }

      const image = await uploadImage(article.urlToImage||null, article.title);

      // Build tags array with minimum 15 tags
      let tags = (rw.tags||'Pakistan,News').split(',').map(t=>t.trim()).filter(Boolean);
      const fb=['Pakistan','Ek Awaz News','Pakistani News','Latest News','Breaking News',cat,'Umer Javed','Pakistan Today','News Pakistan','Today News','Pakistan News Today','Ek Awaz','اردو خبریں'];
      for (const f of fb) { if (tags.length>=16) break; if (!tags.some(t=>t.toLowerCase()===f.toLowerCase())) tags.push(f); }

      // ── POST OBJECT — EXACT MATCH to publishPost() in index.html ──────
      const catKey = cat.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'')||'national';
      const postId = Date.now() + Math.floor(Math.random()*999);

      const post = {
        id:           postId,
        title:        rw.seoTitle || article.title,
        excerpt:      rw.metaDesc || (article.description||'').slice(0,155),
        category:     cat,
        categories:   [cat],
        cat_key:      catKey,
        type:         type,
        author:       CFG.AUTHOR,
        body:         rw.body,
        image:        image || '',
        video:        '',
        audio:        '',
        pdf:          '',
        tags:         tags,
        status:       'published',
        isHeadline:   false,
        views:        0,
        likes:        0,
        date:         new Date().toISOString(),
        ad_slot:      '',
        lastEditedBy: 'Auto Publisher',
        lastEditedAt: new Date().toISOString(),
        scheduledAt:  '',
        series:       '',
        seoTitle:     rw.seoTitle || article.title,
        seoDesc:      rw.metaDesc || (article.description||'').slice(0,155),
        revisions:    [],
        sourceUrl:    article.url || '',
        sourceName:   article.source?.name || '',
        autoPublished: true,
      };

      const saved = await savePost(post);
      if (saved) {
        count++;
        published.push(post.title);
        markSeen(article.title, article.url||'');
      }

      await sleep(4000); // Gemini rate limit buffer

    } catch(e) { console.log('  ⚠️  Error:', e.message); }
  }

  if (published.length > 0) await updateTicker(published);

  const mins = ((Date.now()-t0)/60000).toFixed(1);
  console.log('\n════════════════════════════════════════════════');
  console.log(`   ✅ Published: ${count} articles in ${mins} min`);
  console.log(`   📅  Next run: 1 hour`);
  console.log('════════════════════════════════════════════════\n');
}

main().catch(e=>{console.error('💥 Fatal:',e);process.exit(1);});
