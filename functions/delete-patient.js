const admin = require('firebase-admin');

const PROJECT_ID = 'medassist-397be';
const BUCKET = 'medassist-397be.firebasestorage.app';

const phone = process.argv[2];
const confirm = process.argv.includes('--confirm');

if (!phone) {
  console.error('Usage: node delete-patient.js +12012700537 [--confirm]');
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
const db = admin.firestore();

const digits = phone.replace(/\D/g, '');
const variants = [...new Set([phone, '+' + digits, digits, digits.replace(/^1/, ''), '0' + digits.replace(/^1/, '')])];

async function findDocs(collection, field, values) {
  if (!values.length) return [];
  const snap = await db.collection(collection).where(field, 'in', values.slice(0, 30)).get();
  return snap.docs.map(d => d.ref);
}

async function main() {
  const targets = [];
  const authUids = new Set();

  for (const v of variants) {
    const ref = db.collection('patients').doc(v);
    const snap = await ref.get();
    const history = await ref.collection('history').limit(1).get();
    if (snap.exists || !history.empty) targets.push(ref);
  }

  const webProfiles = await db.collection('patients').where('phone', 'in', variants).get();
  webProfiles.forEach(d => {
    targets.push(d.ref);
    authUids.add(d.data().authUid || d.id);
  });

  const phoneDocIds = targets.map(r => r.id);
  const uids = [...authUids];

  targets.push(...(await findDocs('callSessions', 'phoneNumber', variants)));
  targets.push(...(await findDocs('chatSessions', 'phoneNumber', variants)));
  targets.push(...(await findDocs('appointments', 'patientPhone', variants)));
  targets.push(...(await findDocs('appointments', 'authUid', uids)));
  targets.push(...(await findDocs('appointments', 'patientId', [...phoneDocIds, ...uids])));
  targets.push(...(await findDocs('patientHistory', 'patientId', [...phoneDocIds, ...uids])));

  const unique = [...new Map(targets.map(r => [r.path, r])).values()];

  const bucket = admin.storage().bucket();
  const files = [];
  for (const v of variants) {
    const [list] = await bucket.getFiles({ prefix: `call-recordings/${v}/` });
    files.push(...list);
  }

  console.log('Phone variants searched:', variants.join(', '));
  console.log('\nFirestore documents (subcollections deleted too):');
  unique.forEach(r => console.log('  ', r.path));
  console.log('\nStorage files:');
  files.forEach(f => console.log('  ', f.name));
  console.log('\nAuth accounts:');
  uids.forEach(u => console.log('  ', u));
  console.log(`\n${unique.length} documents, ${files.length} files, ${uids.length} auth accounts`);

  if (!confirm) {
    console.log('\nDry run only. Re-run with --confirm to delete.');
    return;
  }

  for (const ref of unique) {
    await db.recursiveDelete(ref);
  }
  for (const f of files) {
    await f.delete();
  }
  for (const uid of uids) {
    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      console.log('Auth delete skipped for', uid, '-', err.code || err.message);
    }
  }
  console.log('\nDeleted.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});