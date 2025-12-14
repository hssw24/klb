// storage.firebase.js
// Compat-Version für Firebase (Firestore). Bindet an window.kbStorage.
// Erwartet: firebase.initializeApp(firebaseConfig) wurde bereits in der HTML-Datei ausgeführt.

(function () {
  'use strict';

  if (window.kbStorage) {
    console.warn('kbStorage already defined, skipping firebase storage re-definition.');
    return;
  }

  if (typeof firebase === 'undefined' || !firebase.firestore) {
    console.error('Firebase SDK nicht gefunden. Bitte Firebase CDN-Skripte und firebase.initializeApp(...) vor storage.firebase.js einbinden.');
    window.kbStorage = {
      loadMeta: async () => { throw new Error('Firebase nicht initialisiert'); },
      saveMeta: async () => { throw new Error('Firebase nicht initialisiert'); },
      loadEntries: async () => { throw new Error('Firebase nicht initialisiert'); },
      addEntry: async () => { throw new Error('Firebase nicht initialisiert'); },
      toggleLockEntry: async () => { throw new Error('Firebase nicht initialisiert'); },
      deleteEntryById: async () => { throw new Error('Firebase nicht initialisiert'); },
      ensureDefaults: async () => { throw new Error('Firebase nicht initialisiert'); },
      addCourse: async () => { throw new Error('Firebase nicht initialisiert'); },
      updateCourseStudents: async () => { throw new Error('Firebase nicht initialisiert'); },
      getStudentsForCourse: async () => { throw new Error('Firebase nicht initialisiert'); },
      deleteCourse: async () => { throw new Error('Firebase nicht initialisiert'); }
    };
    return;
  }

  const db = firebase.firestore();

  // --- Meta (meta/kb_meta) ---
  async function loadMeta() {
    try {
      const ref = db.collection('meta').doc('kb_meta');
      const snap = await ref.get();
      if (!snap.exists) return { courses: [], subjects: [], teachers: [] };
      const data = snap.data() || {};
      if (Array.isArray(data.courses) && data.courses.length > 0 && typeof data.courses[0] === 'string') {
        data.courses = data.courses.map(name => ({ id: name, name, students: data.students || [] }));
      }
      data.courses = (data.courses || []).map(c => {
        if (!c) return { id: '', name: '', students: [] };
        if (!c.students) c.students = [];
        if (!c.id) c.id = c.name || ('kurs_' + Math.random().toString(36).slice(2, 8));
        return c;
      });
      return data;
    } catch (err) {
      console.error('loadMeta error', err);
      return { courses: [], subjects: [], teachers: [] };
    }
  }

  async function saveMeta(meta) {
    try {
      await db.collection('meta').doc('kb_meta').set(meta, { merge: true });
      return { ok: true };
    } catch (err) {
      console.error('saveMeta error', err);
      return { ok: false, reason: String(err) };
    }
  }

  // --- Entries ---
  async function loadEntries() {
    try {
      const snap = await db.collection('entries').orderBy('date').orderBy('hour').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('loadEntries error', err);
      return [];
    }
  }

  async function addEntry(entry) {
    try {
      const q = await db.collection('entries')
        .where('course', '==', entry.course)
        .where('date', '==', entry.date)
        .where('hour', '==', entry.hour)
        .get();
      if (!q.empty) {
        const existing = q.docs[0].data();
        if (existing.locked) return { ok: false, reason: 'Diese Stunde ist gesperrt und kann nicht überschrieben werden.' };
        return { ok: false, reason: 'Für diesen Kurs/Datum/Stunde existiert bereits ein Eintrag.' };
      }
      const toSave = Object.assign({}, entry);
      if (!toSave.createdAt) toSave.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('entries').add(toSave);
      return { ok: true };
    } catch (err) {
      console.error('addEntry error', err);
      return { ok: false, reason: String(err) };
    }
  }

  async function toggleLockEntry(id) {
    try {
      const ref = db.collection('entries').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return false;
      const current = snap.data();
      await ref.update({ locked: !current.locked });
      return true;
    } catch (err) {
      console.error('toggleLockEntry error', err);
      return false;
    }
  }

  async function deleteEntryById(id) {
    try {
      await db.collection('entries').doc(id).delete();
      return true;
    } catch (err) {
      console.error('deleteEntryById error', err);
      return false;
    }
  }

  // --- Kurs-API ---
  async function addCourse(courseName, studentsArray) {
    try {
      const meta = await loadMeta();
      const id = courseName;
      if ((meta.courses || []).find(c => c.id === id)) return { ok: false, reason: 'Kurs existiert bereits' };
      meta.courses = meta.courses || [];
      meta.courses.push({ id, name: courseName, students: studentsArray || [] });
      await saveMeta(meta);
      return { ok: true };
    } catch (err) {
      console.error('addCourse error', err);
      return { ok: false, reason: String(err) };
    }
  }

  async function updateCourseStudents(courseId, studentsArray) {
    try {
      const meta = await loadMeta();
      const c = (meta.courses || []).find(x => x.id === courseId);
      if (!c) return { ok: false, reason: 'Kurs nicht gefunden' };
      c.students = studentsArray;
      await saveMeta(meta);
      return { ok: true };
    } catch (err) {
      console.error('updateCourseStudents error', err);
      return { ok: false, reason: String(err) };
    }
  }

  async function getStudentsForCourse(courseId) {
    try {
      const meta = await loadMeta();
      const c = (meta.courses || []).find(x => x.id === courseId);
      return c ? (c.students || []) : [];
    } catch (err) {
      console.error('getStudentsForCourse error', err);
      return [];
    }
  }

  async function deleteCourse(courseId) {
    try {
      const meta = await loadMeta();
      meta.courses = (meta.courses || []).filter(c => c.id !== courseId);
      await saveMeta(meta);
      return { ok: true };
    } catch (err) {
      console.error('deleteCourse error', err);
      return { ok: false, reason: String(err) };
    }
  }

  // --- Defaults für Tests ---
  async function ensureDefaults() {
    try {
      const meta = await loadMeta();
      const hasCourses = Array.isArray(meta.courses) && meta.courses.length > 0;
      const hasSubjects = Array.isArray(meta.subjects) && meta.subjects.length > 0;
      const hasTeachers = Array.isArray(meta.teachers) && meta.teachers.length > 0;
      if (!hasCourses && !hasSubjects && !hasTeachers) {
        const defaultMeta = {
          courses: [{ id: 'RSA261', name: 'RSA261', students: ['Max Mustermann', 'Anna Beispiel'] }],
          subjects: ['Mathematik', 'Deutsch', 'Englisch'],
          teachers: ['Frau Müller', 'Herr Schmidt']
        };
        await saveMeta(defaultMeta);
      } else {
        meta.courses = (meta.courses || []).map(c => {
          if (!c) return { id: '', name: '', students: [] };
          if (!c.students) c.students = [];
          if (!c.id) c.id = c.name || ('kurs_' + Math.random().toString(36).slice(2, 8));
          return c;
        });
        await saveMeta(meta);
      }

      const entries = await loadEntries();
      if (!entries || entries.length === 0) {
        const sample = {
          course: 'RSA261',
          subject: 'Mathematik',
          teacher: 'Frau Müller',
          date: new Date().toISOString().slice(0, 10),
          hour: '1',
          content: 'Einführung (Beispiel)',
          absences: [],
          locked: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('entries').add(sample);
      }
    } catch (err) {
      console.error('ensureDefaults error', err);
    }
  }

  // --- Export API ---
  window.kbStorage = {
    loadMeta,
    saveMeta,
    loadEntries,
    addEntry,
    toggleLockEntry,
    deleteEntryById,
    addCourse,
    updateCourseStudents,
    getStudentsForCourse,
    deleteCourse,
    ensureDefaults
  };

  console.log('kbStorage (Firestore compat) initialized');
})();
