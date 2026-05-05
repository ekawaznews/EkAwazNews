// EK AWAZ NEWS — TICKER UPDATER (Firebase Admin)
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return getFirestore();
}

async function main() {
  console.log('📺 Updating Ek Awaz News Ticker...');
  const db = initFirebase();

  // Fetch latest 50 published posts
  const snap = await db.collection('ekawaz_posts')
    .where('status', '==', 'published')
    .orderBy('date', 'desc')
    .limit(50)
    .get();

  const posts = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.title) posts.push({ title: d.title, date: d.date || '' });
  });

  if (posts.length === 0) {
    console.log('⚠️ No posts found');
    return;
  }

  const items = posts.slice(0, 15).map(p => `• ${p.title}`);

  await db.collection('ekawaz').doc('main').set(
    { ticker: items, tickerUpdatedAt: new Date().toISOString() },
    { merge: true }
  );

  console.log(`✅ Ticker updated with ${items.length} headlines:`);
  items.forEach(h => console.log(`   ${h.slice(0, 70)}`));
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
