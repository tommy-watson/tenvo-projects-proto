// Contacts store — stand-in for Tenvo's contacts database inside the prototype.
// Lives in localStorage under 'wparContacts'. Seeded with a handful of AU names
// on first load so there's something to search against.
//
// Shape: array of { id, name, phone, email, createdAt }

(function(){
  const KEY = 'wparContacts';

  const SEED = [
    { name: 'Harry Thompson', phone: '0412 334 998', email: 'harry.thompson@gmail.com' },
    { name: 'Olivia Pearce', phone: '0423 118 445', email: 'olivia.p@outlook.com' },
    { name: 'James O’Connor', phone: '0407 889 221', email: 'jamesoc@gmail.com' },
    { name: 'Charlotte Nguyen', phone: '0432 554 100', email: 'char.nguyen@icloud.com' },
    { name: 'Daniel Rossi', phone: '0421 998 006', email: 'drossi@bigpond.com' },
    { name: 'Mia Robertson', phone: '0404 223 889', email: 'mia.robertson@outlook.com' },
    { name: 'Noah Patel', phone: '0416 332 005', email: 'noah.patel@yahoo.com.au' },
    { name: 'Isabella Khan', phone: '0409 775 118', email: 'bellak@gmail.com' },
    { name: 'William McKenzie', phone: '0427 004 998', email: 'bill.mckenzie@gmail.com' },
    { name: 'Grace Fitzgerald', phone: '0431 220 884', email: 'grace.fitz@gmail.com' },
  ];

  function uid(){ return 'c_'+Math.random().toString(36).slice(2,10); }

  function readRaw(){
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }

  function writeRaw(arr){
    localStorage.setItem(KEY, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('wpar:contacts-changed'));
  }

  function seedIfEmpty(){
    const existing = readRaw();
    if (Array.isArray(existing) && existing.length) return;
    const now = Date.now();
    writeRaw(SEED.map(c => ({ ...c, id: uid(), createdAt: now })));
  }

  seedIfEmpty();

  function all(){
    return readRaw() || [];
  }

  function get(id){
    return all().find(c => c.id === id) || null;
  }

  function search(query){
    const q = (query || '').trim().toLowerCase();
    if (!q) return all().slice(0, 8);
    return all().filter(c =>
      c.name.toLowerCase().includes(q)
      || (c.phone || '').replace(/\s/g,'').includes(q.replace(/\s/g,''))
      || (c.email || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }

  function add({ name, phone, email }){
    const list = all();
    const rec = {
      id: uid(),
      name: (name || '').trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      createdAt: Date.now(),
    };
    writeRaw([rec, ...list]);
    return rec;
  }

  function subscribe(cb){
    const onChange = () => cb(all());
    const onStorage = e => { if (e.key === KEY) cb(all()); };
    window.addEventListener('wpar:contacts-changed', onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('wpar:contacts-changed', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }

  window.wparContacts = { all, get, search, add, subscribe };
})();
