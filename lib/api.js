const { createEncounter, validate } = require('./encounter');
const { SEED } = require('./cases');
const fs = require('fs');
const filesystemPath = require('path');
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function snapshot(state) {
  return JSON.parse(JSON.stringify(state, (_, value) => value instanceof Map ? [...value] : value instanceof Set ? [...value] : value));
}
function createApi({storePath} = {}) {
  let profiles = SEED.map(p => freeze({...clone(p), version: 1}));
  if (storePath && fs.existsSync(storePath)) {
    const saved = JSON.parse(fs.readFileSync(storePath,'utf8'));
    if (!Array.isArray(saved) || saved.some(p => validate(p).some(e => e.s === 'error'))) throw new Error('Published case recovery file is invalid; preserve it and restore a valid backup');
    profiles = saved.map(freeze);
  }
  const encounters = new Map();
  function fail(status, message) { throw Object.assign(new Error(message), {status}); }
  return function dispatch(method, path, body = {}) {
    if (path === '/api/cases' && method === 'GET') return {profiles: clone(profiles)};
    if (path === '/api/cases' && method === 'POST') {
      const p = body.profile;
      if (!p || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id || '') || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120 || !Array.isArray(p.facts) || !Array.isArray(p.obj) || p.facts.length > 200 || p.obj.length > 100) fail(400, 'Invalid synthetic case schema');
      const errors = validate(p).filter(e => e.s === 'error');
      if (errors.length) fail(400, errors.map(e => e.m).join('; '));
      const published = freeze({...clone(p), version: profiles.filter(x => x.id === p.id).length + 1});
      if (storePath) {
        try {
          fs.mkdirSync(filesystemPath.dirname(storePath),{recursive:true});
          fs.writeFileSync(storePath + '.tmp',JSON.stringify([...profiles,published]));
          fs.renameSync(storePath + '.tmp',storePath);
        } catch (error) { throw Object.assign(new Error('Cannot save published version; check recovery directory permissions', {cause:error}), {status:503}); }
      }
      profiles.push(published);
      return {profile: clone(published)};
    }
    if (path === '/api/encounters' && method === 'POST') {
      const p = profiles.find(x => x.id === body.caseId && x.version === Number(body.version));
      if (!p) fail(404, 'Published case version unavailable; publish the draft first');
      const encounter = createEncounter(p);
      encounters.set(encounter.state.id, encounter);
      return {state: snapshot(encounter.state)};
    }
    const match = path.match(/^\/api\/encounters\/([^/]+)\/(turns|actions)$/);
    if (!match || method !== 'POST') fail(404, 'Unknown API route');
    const encounter = encounters.get(match[1]);
    if (!encounter) fail(404, 'Encounter unavailable; start a new visit');
    if (match[2] === 'turns') {
      if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000 || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)) fail(400, 'Question and bounded request ID required');
      const before = encounter.state.turns;
      const result = encounter.ask(body.question, body.requestId);
      return {...result, replayed: before === encounter.state.turns, state: snapshot(encounter.state)};
    }
    const actions = {open: 'openSec', reviewSection: 'recordSectionReview', reviewArtifact: 'reviewArtifact', reconcile: 'reconcile'};
    if (body.action === 'role' && typeof body.value === 'string' && body.value.length <= 80) { encounter.state.role = body.value; return {state:snapshot(encounter.state)}; }
    if (body.action === 'plan' && typeof body.value === 'string' && body.value.trim() && body.value.length <= 2000) {
      encounter.state.plan.push({t:body.value,r:encounter.state.role,at:new Date().toISOString(),v:encounter.state.plan.length+1});
      return {state:snapshot(encounter.state)};
    }
    if (body.action === 'handoff' && typeof body.value === 'string' && body.value.length <= 10000) {
      const facts = encounter.state.p.facts.filter(f => encounter.state.disc.has(f.id));
      const included = facts.filter(f => {
        const text = body.value.toLowerCase();
        return text.includes(f.label.toLowerCase()) || (typeof f.k === 'string' && f.k.length > 2 && text.includes(f.k.toLowerCase()));
      });
      encounter.state.ho = {inc:included.length,tot:facts.length,om:facts.filter(f => !included.includes(f)).map(f => f.label)};
      encounter.state.ev.push({n:encounter.state.ev.length+1,t:new Date().toISOString(),role:encounter.state.role,type:'handoff',text:'SBAR submitted; keyword coverage only'});
      return {state:snapshot(encounter.state)};
    }
    if (!actions[body.action] || typeof body.value !== 'string' || body.value.length > 2000) fail(400, 'Invalid encounter action');
    if (body.action === 'open' && !['ov', 'hx', 'meds', 'labs', 'img', 'notes', 'soc'].includes(body.value)) fail(400, 'Unknown chart section');
    encounter[actions[body.action]](body.value);
    return {state: snapshot(encounter.state)};
  };
}
module.exports = { createApi };
