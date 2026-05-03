// ============================================================
// EK AWAZ NEWS — TICKER UPDATER
// Fetches latest 15 post titles from Firebase
// Updates the breaking news ticker automatically
// Run: node update-ticker.js
// ============================================================

import fetch from 'node-fetch';

const FB_KEY  = "AIzaSyDI1IGHh7ZVDWUIV-rhMMg0m534th_bcx8";
const FB_BASE = "https://firestore.googleapis.com/v1/projects/ekawaznews-a114a/databases/(default)/documents";

async function main() {
  console.log("📺 Updating Ek Awaz News Ticker...");

  // Fetch latest 50 posts
  const r = await fetch(`${FB_BASE}/ekawaz_posts?pageSize=50&key=${FB_KEY}`);
  const d = await r.json();

  const posts = (d.documents||[])
    .map(doc => ({
      title: doc.fields?.title?.stringValue || "",
      date:  doc.fields?.date?.stringValue  || "",
    }))
    .filter(p => p.title)
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 15);

  if (posts.length === 0) {
    console.log("⚠️  No posts found");
    return;
  }

  const items = posts.map(p => `• ${p.title}`);

  // Try main ticker path
  const body = {
    fields: {
      ticker:          { arrayValue: { values: items.map(h=>({stringValue:h})) } },
      tickerUpdatedAt: { stringValue: new Date().toISOString() },
    }
  };

  const r2 = await fetch(
    `${FB_BASE}/ekawaz/main?updateMask.fieldPaths=ticker&updateMask.fieldPaths=tickerUpdatedAt&key=${FB_KEY}`,
    { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }
  );

  if (r2.ok) {
    console.log(`✅ Ticker updated with ${items.length} headlines:`);
    items.forEach(h => console.log(`   ${h.slice(0,70)}`));
  } else {
    const err = await r2.text();
    console.log("❌ Ticker update failed:", err.slice(0,200));
  }
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
