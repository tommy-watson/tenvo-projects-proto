// Wharparilla block state — single source of truth across every surface
// (agent control centre, buyer ebook, future project website).
//
// Storage: localStorage key 'wparBlocks'. Shape:
//   { "<stage>-<num>": { status, hold, pendingHolds[], waitlist[] } }
//
// Any surface that mutates state goes through this module. Writes trigger
// a 'wpar:blocks-changed' CustomEvent on window AND write to localStorage —
// the latter fires the native 'storage' event in other tabs, giving us
// cross-tab live sync for free.
//
// Classic (non-module) script so the globals are available synchronously to
// inline <script> blocks loaded after it.
(function(){
  const KEY = 'wparBlocks';
  const LEGACY_KEY = 'wparHolds';

  const STATUS = Object.freeze({
    FUTURE: 'future',
    AVAILABLE: 'available',
    ON_HOLD_PENDING: 'on_hold_pending',           // buyer requested, waiting on agent (= "Enquiries" lane)
    ON_HOLD: 'on_hold',                           // agent placed, intention form sent, awaiting signature
    HOLD_SIGNED: 'hold_signed',                   // intention form signed by buyer
    CONTRACT_REVIEW: 'contract_review',           // contract issued, under review by solicitors
    UNDER_CONTRACT_CONDITIONAL: 'contract_conditional',   // contract signed, conditions pending
    UNDER_CONTRACT_UNCONDITIONAL: 'contract_unconditional', // all conditions met, awaiting settlement
    SOLD: 'sold',                                 // settled
    // Legacy — kept so older stored records don't break reads
    UNDER_CONTRACT: 'under_contract',
  });

  function defaultRecord(){
    return { status: STATUS.AVAILABLE, hold: null, pendingHolds: [], waitlist: [] };
  }

  function readRaw(){
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }

  function writeRaw(obj){
    localStorage.setItem(KEY, JSON.stringify(obj));
    window.dispatchEvent(new CustomEvent('wpar:blocks-changed'));
  }

  function migrateIfNeeded(){
    if (localStorage.getItem(KEY)) return;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    try {
      const old = JSON.parse(legacy);
      const next = {};
      for (const [key, h] of Object.entries(old)) {
        next[key] = {
          status: STATUS.ON_HOLD,
          hold: {
            purchasers: [{ name: h.name || '', phone: h.phone || '', email: h.email || '' }],
            source: 'agent',
            placedBy: null,
            placedAt: h.placedAt || Date.now(),
            expiry: null,
            depositReceived: { received: false, amount: 0 },
            solicitor: { name: '', firm: '' },
            notes: h.notes || '',
          },
          pendingHolds: [],
          waitlist: [],
        };
      }
      writeRaw(next);
    } catch { /* leave legacy as-is */ }
  }

  migrateIfNeeded();

  function getAll(){ return readRaw(); }

  function getBlock(key){ return readRaw()[key] || defaultRecord(); }

  function mutate(key, fn){
    const all = readRaw();
    const cur = all[key] || defaultRecord();
    const next = fn(cur);
    if (next == null) delete all[key]; else all[key] = next;
    writeRaw(all);
  }

  function uid(){ return Math.random().toString(36).slice(2, 10); }

  // Buyer-facing: request a hold.
  // Available  → appended to pendingHolds (agent approves later).
  // Held / UC  → appended to waitlist.
  function requestHold(key, { name, phone, email, source }){
    if (!name || !phone) return { ok: false, reason: 'missing-name-or-phone' };
    const entry = {
      id: uid(),
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim(),
      source: source || 'ebook',
      placedAt: Date.now(),
    };
    let placedTo = null;
    mutate(key, cur => {
      if (cur.status === STATUS.AVAILABLE || cur.status === STATUS.ON_HOLD_PENDING) {
        placedTo = 'pending';
        return { ...cur, status: STATUS.ON_HOLD_PENDING, pendingHolds: [...cur.pendingHolds, entry] };
      }
      if (cur.status === STATUS.ON_HOLD || cur.status === STATUS.UNDER_CONTRACT) {
        placedTo = 'waitlist';
        return { ...cur, waitlist: [...cur.waitlist, entry] };
      }
      placedTo = 'rejected';
      return cur;
    });
    return { ok: placedTo !== 'rejected', placedTo };
  }

  function makeIntentionForm(){
    return {
      token: 't_' + Math.random().toString(36).slice(2, 12),
      sentAt: Date.now(),
      signedAt: null,
      signatureName: null,
      acknowledgements: null,
    };
  }

  // Agent-facing: place a direct hold immediately (buyer is on the phone).
  // Generates the intention-to-hold token so Tenvo can "send" the whitelabelled
  // form to the purchaser — the form page keys off the token.
  function placeDirectHold(key, { purchasers, notes, placedBy, contactId }){
    mutate(key, cur => ({
      ...cur,
      status: STATUS.ON_HOLD,
      hold: {
        purchasers: purchasers.map(p => ({
          name: (p.name || '').trim(),
          phone: (p.phone || '').trim(),
          email: (p.email || '').trim(),
        })),
        contactId: contactId || null,
        source: 'agent',
        placedBy: placedBy || null,
        placedAt: Date.now(),
        expiry: null,
        depositReceived: { received: false, amount: 0 },
        solicitor: { name: '', firm: '' },
        notes: (notes || '').trim(),
        intentionForm: makeIntentionForm(),
      },
      // Any pending requests become waitlist entries — someone else wins.
      pendingHolds: [],
      waitlist: [
        ...cur.waitlist,
        ...cur.pendingHolds.map(p => ({ id: p.id, name: p.name, phone: p.phone, email: p.email, source: p.source, placedAt: p.placedAt })),
      ],
    }));
  }

  function approvePending(key, pendingId, { contactId } = {}){
    mutate(key, cur => {
      const chosen = cur.pendingHolds.find(p => p.id === pendingId);
      if (!chosen) return cur;
      const others = cur.pendingHolds.filter(p => p.id !== pendingId);
      return {
        ...cur,
        status: STATUS.ON_HOLD,
        hold: {
          purchasers: [{ name: chosen.name, phone: chosen.phone, email: chosen.email }],
          contactId: contactId || null,
          source: chosen.source,
          placedBy: null,
          placedAt: Date.now(),
          expiry: null,
          depositReceived: { received: false, amount: 0 },
          solicitor: { name: '', firm: '' },
          notes: '',
          intentionForm: makeIntentionForm(),
        },
        pendingHolds: [],
        waitlist: [
          ...cur.waitlist,
          ...others.map(p => ({ id: p.id, name: p.name, phone: p.phone, email: p.email, source: p.source, placedAt: p.placedAt })),
        ],
      };
    });
  }

  function declinePending(key, pendingId){
    mutate(key, cur => {
      const remaining = cur.pendingHolds.filter(p => p.id !== pendingId);
      return {
        ...cur,
        pendingHolds: remaining,
        status: remaining.length ? STATUS.ON_HOLD_PENDING : (cur.hold ? cur.status : STATUS.AVAILABLE),
      };
    });
  }

  function releaseHold(key){
    mutate(key, cur => ({ ...cur, status: STATUS.AVAILABLE, hold: null }));
  }

  function promoteFromWaitlist(key, waitlistId){
    mutate(key, cur => {
      const entry = cur.waitlist.find(w => w.id === waitlistId);
      if (!entry) return cur;
      return {
        ...cur,
        waitlist: cur.waitlist.filter(w => w.id !== waitlistId),
        pendingHolds: [...cur.pendingHolds, { ...entry }],
        status: cur.hold ? cur.status : STATUS.ON_HOLD_PENDING,
      };
    });
  }

  function removeFromWaitlist(key, waitlistId){
    mutate(key, cur => ({ ...cur, waitlist: cur.waitlist.filter(w => w.id !== waitlistId) }));
  }

  function subscribe(cb){
    const onChange = () => cb(getAll());
    const onStorage = e => { if (e.key === KEY) cb(getAll()); };
    window.addEventListener('wpar:blocks-changed', onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('wpar:blocks-changed', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }

  function applyToSvg(mpMeta){
    if (!mpMeta) return;
    const all = readRaw();
    const allPaths = [
      ...Object.values(mpMeta.availByStage || {}).flat(),
      ...Object.values(mpMeta.soldByStage || {}).flat(),
      ...Object.values(mpMeta.upcomingByStage || {}).flat(),
    ];
    allPaths.forEach(p => {
      p.el?.classList.remove(
        'is-hold', 'is-pending', 'is-signed', 'is-review',
        'is-contract-cond', 'is-contract-uncond', 'is-under-contract',
      );
    });
    for (const [key, rec] of Object.entries(all)) {
      const [stg, num] = key.split('-');
      const path = (mpMeta.availByStage?.[stg] || []).find(p => String(p.num) === num)?.el
                || (mpMeta.soldByStage?.[stg] || []).find(p => String(p.num) === num)?.el
                || (mpMeta.upcomingByStage?.[stg] || []).find(p => String(p.num) === num)?.el;
      if (!path) continue;
      switch (rec.status) {
        case STATUS.ON_HOLD:                      path.classList.add('is-hold'); break;
        case STATUS.ON_HOLD_PENDING:              path.classList.add('is-pending'); break;
        case STATUS.HOLD_SIGNED:                  path.classList.add('is-signed'); break;
        case STATUS.CONTRACT_REVIEW:              path.classList.add('is-review'); break;
        case STATUS.UNDER_CONTRACT_CONDITIONAL:   path.classList.add('is-contract-cond'); break;
        case STATUS.UNDER_CONTRACT_UNCONDITIONAL: path.classList.add('is-contract-uncond'); break;
        case STATUS.UNDER_CONTRACT:               path.classList.add('is-under-contract'); break; // legacy
      }
    }
  }

  function counts(){
    const all = readRaw();
    const out = { pending: 0, hold: 0, signed: 0, review: 0, contract: 0, sold: 0 };
    for (const rec of Object.values(all)) {
      switch (rec.status) {
        case STATUS.ON_HOLD_PENDING: out.pending++; break;
        case STATUS.ON_HOLD: out.hold++; break;
        case STATUS.HOLD_SIGNED: out.signed++; break;
        case STATUS.CONTRACT_REVIEW: out.review++; break;
        case STATUS.UNDER_CONTRACT_CONDITIONAL:
        case STATUS.UNDER_CONTRACT_UNCONDITIONAL:
        case STATUS.UNDER_CONTRACT: out.contract++; break;
        case STATUS.SOLD: out.sold++; break;
      }
    }
    return out;
  }

  // Look up a block by the intention-to-hold form token (used by the buyer-
  // facing form page to find its record).
  function findByFormToken(token){
    const all = readRaw();
    for (const [key, rec] of Object.entries(all)) {
      if (rec.hold?.intentionForm?.token === token) {
        return { key, record: rec };
      }
    }
    return null;
  }

  // Buyer signs the intention-to-hold form — stamps the hold record AND
  // promotes the block from ON_HOLD → HOLD_SIGNED so the agent knows contracts
  // are ready to draw.
  function signIntentionForm(token, { signatureName, acknowledgements }){
    const match = findByFormToken(token);
    if (!match) return { ok: false, reason: 'token-not-found' };
    mutate(match.key, cur => {
      if (!cur.hold || cur.hold.intentionForm?.token !== token) return cur;
      return {
        ...cur,
        status: STATUS.HOLD_SIGNED,
        hold: {
          ...cur.hold,
          intentionForm: {
            ...cur.hold.intentionForm,
            signedAt: Date.now(),
            signatureName: (signatureName || '').trim(),
            acknowledgements: acknowledgements || null,
          },
        },
      };
    });
    return { ok: true };
  }

  // Agent: issue a contract on a signed hold. Moves the block into "Contract
  // Review" (contract sent to solicitors, not yet signed by both parties).
  function issueContract(key){
    mutate(key, cur => {
      if (!cur.hold) return cur;
      return {
        ...cur,
        status: STATUS.CONTRACT_REVIEW,
        hold: {
          ...cur.hold,
          contract: {
            ...(cur.hold.contract || {}),
            issuedAt: cur.hold.contract?.issuedAt || Date.now(),
          },
        },
      };
    });
  }

  // Agent: contract signed by both parties, now subject to conditions
  // (finance, cooling-off, pest/building, etc.).
  function markConditional(key){
    mutate(key, cur => {
      if (!cur.hold) return cur;
      return {
        ...cur,
        status: STATUS.UNDER_CONTRACT_CONDITIONAL,
        hold: {
          ...cur.hold,
          contract: {
            ...(cur.hold.contract || {}),
            issuedAt: cur.hold.contract?.issuedAt || Date.now(),
            conditionalAt: Date.now(),
          },
        },
      };
    });
  }

  // Agent: a conditional contract has had all conditions removed.
  function markUnconditional(key){
    mutate(key, cur => {
      if (!cur.hold) return cur;
      return {
        ...cur,
        status: STATUS.UNDER_CONTRACT_UNCONDITIONAL,
        hold: {
          ...cur.hold,
          contract: { ...(cur.hold.contract || {}), unconditionalAt: Date.now() },
        },
      };
    });
  }

  // Agent: settlement happened.
  function markSettled(key){
    mutate(key, cur => {
      if (!cur.hold) return cur;
      return {
        ...cur,
        status: STATUS.SOLD,
        hold: {
          ...cur.hold,
          contract: { ...(cur.hold.contract || {}), settledAt: Date.now() },
        },
      };
    });
  }

  // Agent: re-issue the intention-to-hold form (new sentAt — same token).
  function resendIntentionForm(key){
    mutate(key, cur => {
      if (!cur.hold?.intentionForm) return cur;
      return {
        ...cur,
        hold: {
          ...cur.hold,
          intentionForm: { ...cur.hold.intentionForm, sentAt: Date.now() },
        },
      };
    });
  }

  window.wparBlocks = {
    STATUS,
    defaultRecord,
    getAll,
    getBlock,
    requestHold,
    placeDirectHold,
    approvePending,
    declinePending,
    releaseHold,
    promoteFromWaitlist,
    removeFromWaitlist,
    subscribe,
    applyToSvg,
    counts,
    findByFormToken,
    signIntentionForm,
    issueContract,
    markConditional,
    markUnconditional,
    markSettled,
    resendIntentionForm,
  };
})();
