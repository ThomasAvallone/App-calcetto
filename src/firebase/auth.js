import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, googleProvider, db } from './config';

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  const SUPER_ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';
  const emailLower = (user.email || '').toLowerCase();
  const isSuperAdminEmail = emailLower === SUPER_ADMIN_EMAIL.toLowerCase();

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      // Email salvata in lowercase per matching case-insensitive nelle query
      email: emailLower,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: isSuperAdminEmail ? 'superadmin' : 'viewer',
      createdAt: serverTimestamp(),
    });
  } else if (isSuperAdminEmail && snap.data().role === 'admin') {
    // Migra l'account owner da 'admin' a 'superadmin'.
    // NOTA: le rules permettono solo update del campo role qui (hasOnly(['role'])),
    // quindi NON posso aggiungere updates email/altri campi in questa stessa write.
    // L'eventuale normalizzazione email per docs legacy è gestita dal fallback
    // case-insensitive in findUserByEmail().
    await updateDoc(userRef, { role: 'superadmin' });
  }

  return user;
}

export async function logout() {
  await signOut(auth);
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserRole(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data().role : null;
}

// Legge l'intero documento utente (role + linkedPlayerId + …)
export async function getUserDoc(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function setUserRole(uid, role) {
  await setDoc(doc(db, 'users', uid), { role }, { merge: true });
}

// Lista di tutti gli utenti registrati (admin-only via rules).
// Usata da PlayersPage per il dropdown di collegamento email→player.
export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Trova un utente per email. Le nuove docs hanno email in lowercase, ma docs
// legacy potrebbero avere mixed-case: fallback case-insensitive via scan completo.
export async function findUserByEmail(email) {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', lower)));
  if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  // Fallback per docs legacy con email mixed-case
  const all = await getDocs(collection(db, 'users'));
  for (const d of all.docs) {
    if ((d.data().email || '').toLowerCase() === lower) {
      return { uid: d.id, ...d.data() };
    }
  }
  return null;
}

// Imposta o resetta il link a un player. Passare null per scollegare.
export async function setUserLinkedPlayer(uid, playerId) {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    linkedPlayerId: playerId || null,
    linkedPlayerUpdatedAt: serverTimestamp(),
  });
}
