// storage.firebase.js
// Firestore (compat) helper API used by index.html and admin.html
// Erwartet: firebase.initializeApp(...) wurde bereits auf der Seite aufgerufen.

(function(){
  if (!window.firebase || !firebase.firestore) {
    console.error('Firebase not loaded');
    window.kbStorage = {
      loadMeta: async ()=>({ courses:[], subjects:[], teachers:[] }),
      loadEntries: async ()=>[],
      addEntry: async ()=>({ ok:false, reason:'firebase missing' }),
      updateEntry: async ()=>({ ok:false, reason:'firebase missing' }),
      deleteEntryById: async ()=>({ ok:false }),
      toggleLockEntry: async ()=>({ ok:false }),
      ensureDefaults: async ()=>{},
      getStudentsForCourse: async ()=>[]
    };
    return;
  }

  const db = firebase.firestore();
  const META_DOC = 'kb_meta';
  const META_COLL = 'meta';
  const ENTRIES_COLL = 'entries';

  // --- Meta ---
  async function loadMeta(){
    try {
      const snap = await db.collection(META_COLL).doc(META_DOC).get();
      if (!snap.exists) return { courses:[], subjects:[], teachers:[] };
      return snap.data() || { courses:[], subjects:[], teachers:[] };
    } catch (err) {
      console.error('loadMeta error', err);
      return { courses:[], subjects:[], teachers:[] };
    }
  }

  async function saveMeta(meta){
    try {
      await db.collection(META_COLL).doc(META_DOC).set(meta, { merge: true });
      return { ok: true };
    } catch (err) {
      console.error('saveMeta error', err);
      return { ok: false, reason: err.message || String(err) };
    }
  }

  // --- Entries ---
  async function loadEntries(){
    try {
      // bevorzugte Abfrage mit Composite-Index
      const snap = await db.collection(ENTRIES_COLL).orderBy('date').orderBy('hour').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('loadEntries error', err);
      console.error('loadEntries message:', err.message);
      // Fallback: einfache Abfrage ohne orderBy
      try {
        const snap2 = await db.collection(ENTRIES_COLL).get();
        return snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err2) {
        console.error('loadEntries fallback error', err2);
        return [];
      }
    }
  }

  async function addEntry(entry){
    try {
      const res = await db.collection(ENTRIES_COLL).add(entry);
      return { ok: true, id: res.id };
    } catch (err) {
      console.error('addEntry error', err);
      return { ok: false, reason: err.message || String(err) };
    }
  }

  async function updateEntry(id, data){
    try {
      if (!id) return { ok: false, reason: 'missing id' };
      const docRef = db.collection(ENTRIES_COLL).doc(id);
      const snap = await docRef.get();
      if (!snap.exists) return { ok: false, reason: 'not found' };
      const current = snap.data() || {};
      if (current.locked) return { ok: false, reason: 'locked' };
      await docRef.update(data);
      return { ok: true };
    } catch (err) {
      console.error('updateEntry error', err);
      return { ok: false, reason: err.message || String(err) };
    }
  }

  async function deleteEntryById(id){
    try {
      await db.collection(ENTRIES_COLL).doc(id).delete();
      return { ok: true };
    } catch (err) {
      console.error('deleteEntryById error', err);
      return { ok: false, reason: err.message || String(err) };
    }
  }

  async function toggleLockEntry(id){
    try {
      const docRef = db.collection(ENTRIES_COLL).doc(id);
      const snap = await docRef.get();
      if (!snap.exists) return { ok: false, reason: 'not found' };
      const current = snap.data() || {};
      await docRef.update({ locked: !current.locked });
      return { ok: true };
    } catch (err) {
      console.error('toggleLockEntry error', err);
      return { ok: false, reason: err.message || String(err) };
    }
  }

  // --- Courses / Students helpers (meta.courses is array of {id,name,students:[]}) ---
  async function getStudentsForCourse(courseId){
    try {
      const meta = await loadMeta();
      const c = (meta.courses || []).find(x => x.id === courseId);
      return c ? (c.students || []) : [];
    } catch (err) {
      console.error('getStudentsForCourse error', err);
      return [];
    }
  }

  async function addCourse(name, students){
    try {
      const meta = await loadMeta();
      meta.courses = meta.courses || [];
      // generate id from name if not provided
      const id = name.replace(/\s+/g,'').toUpperCase();
      if (meta.courses.find(c=>c.id === id)) return { ok:false, reason:'exists' };
      meta.courses.push({ id, name, students: students || [] });
      await saveMeta(meta);
      return { ok:true, id };
    } catch (err) {
      console.error('addCourse error', err);
      return { ok:false, reason: err.message || String(err) };
    }
  }

  async function deleteCourse(id){
    try {
      const meta = await loadMeta();
      meta.courses = (meta.courses || []).filter(c => c.id !== id);
      await saveMeta(meta);
      return { ok:true };
    } catch (err) {
      console.error('deleteCourse error', err);
      return { ok:false, reason: err.message || String(err) };
    }
  }

  // ensure defaults: create meta doc if missing
  async function ensureDefaults(){
    try {
      const meta = await loadMeta();
      let changed = false;
      if (!meta.courses) { meta.courses = []; changed = true; }
      if (!meta.subjects) { meta.subjects = []; changed = true; }
      if (!meta.teachers) { meta.teachers = []; changed = true; }
      if (changed) await saveMeta(meta);
      return { ok:true };
    } catch (err) {
      console.error('ensureDefaults error', err);
      return { ok:false, reason: err.message || String(err) };
    }
  }

  // expose API
  window.kbStorage = {
    loadMeta,
    saveMeta,
    loadEntries,
    addEntry,
    updateEntry,
    deleteEntryById,
    toggleLockEntry,
    getStudentsForCourse,
    addCourse,
    deleteCourse,
    ensureDefaults
  };
})();
