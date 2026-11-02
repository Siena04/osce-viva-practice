const main = document.getElementById('main');
const state = { cases: [], bankOpen: false, bankMode: 'viva', view: 'home', selected: null, partner: null, run: null, completed: new Set(JSON.parse(localStorage.getItem('osce-viva-completed') || '[]')) };
const labels = { viva: 'Viva', osce1: 'OSCE', osce2: 'Communication' };
const durations = { viva: [600, 300, 600], osce1: [600, 300], osce2: [300] };
const phaseNames = { viva: ['HMR preparation', 'ISBAR management plan', 'Examiner questions'], osce1: ['Station 1 · pharmacy presentation', 'Station 2 · challenging communication'], osce2: ['Challenging communication'] };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId = id => state.cases.find(c => c.id === id);
const modeLabel = type => labels[type] || type;
const caseMeta = c => `Case ${esc(c.id)} · Difficulty: ${esc(c.level)}`;
const fmt = n => `${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
const briefHtml = c => {
  const d = c.studentData;
  const briefing = `<div class="brief-list">${c.brief.map(p => `<p>${esc(p)}</p>`).join('')}</div>`;
  if (!d) return briefing;
  const rows = (items, headings) => `<div class="table-scroll"><table class="case-table"><thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${items.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const medicines = d.medications?.length ? `<h3>Current medicines and reported products</h3>${rows(d.medications,['Medicine','Dose / use','Indication'])}` : '';
  const results = d.results?.filter(row => !row.some(cell => String(cell).toLowerCase().includes('not supplied'))) || [];
  const observations = results.length ? `<h3>Results and observations</h3>${rows(results,['Measure','Result','When'])}` : '';
  return `${briefing}<div class="case-data"><p class="case-allergies"><strong>Allergies:</strong> ${esc(d.allergies)}</p>${medicines}${observations}</div>`;
};
const listHtml = values => `<ul class="check-list">${values.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
const promptList = values => values?.length ? values.map(value => `- ${value}`).join('\n') : '- Not supplied';
const roleplayButtons = () => `<div class="copy-options"><button class="btn btn-ghost" data-action="copy-roleplay" data-value="Codex">Copy for Codex</button><button class="btn btn-ghost" data-action="copy-roleplay" data-value="Claude">Copy for Claude</button></div>`;
const roleplayCopyUi = kind => `${roleplayButtons()}<p class="minor" id="copy-status" role="status">Paste into a new Codex, Claude, or other AI chat. The prompt includes ${kind === 'viva' ? 'examiner' : 'actor'} notes, so avoid reading ahead if you want an unspoiled attempt.</p>`;
function promptChart(c) {
  const d = c.studentData;
  if (!d) return 'Use the briefing and actor facts below.';
  const parts = [`Patient and medical history: ${d.patient}; ${d.history}`, `Allergies: ${d.allergies}`];
  if (d.medications?.length) parts.push(`Medicines:\n${promptList(d.medications.map(row => row.join(' | ')))}`);
  const results = d.results?.filter(row => !row.some(cell => String(cell).toLowerCase().includes('not supplied'))) || [];
  if (results.length) parts.push(`Results and observations:\n${promptList(results.map(row => row.join(' | ')))}`);
  return parts.join('\n');
}
function osceRoleplayPrompt(c) {
  return [
    'Run a standalone Australian final-year pharmacy OSCE Station 1 role-play. You have all case facts in this message; do not rely on earlier chat, local files, links, or attachments. The station is a 10-minute pharmacy presentation. I am the student pharmacist; you play the person presenting, and a prescriber or other professional if I ask to speak to one. My dashboard runs the timer.',
    'Stay in character. Start with one natural opening line based on the student briefing, then wait for my questions. Answer one question at a time in a conversational voice. Reveal actor facts only when I ask something relevant; do not recite the case, suggest diagnoses, coach me, or disclose the examiner checkpoints during the station. If a clinically important fact is not supplied below, say you do not know or would need to check rather than inventing a result, allergy, medicine, dose, or red flag. You may add ordinary conversational detail that does not change the clinical decision. If I request a phone call, switch roles briefly and respond consistently with these facts.',
    `Case ${c.id} · Difficulty: ${c.level}\n\nSTUDENT BRIEFING (visible to me):\n${promptList(c.brief)}`,
    `ADDITIONAL CHART (visible to me if supplied):\n${promptChart(c)}`,
    `ACTOR FACTS (for your role-play; do not reveal all at once):\n${promptList(c.actor)}`,
    `EXAMINER CHECKPOINTS (use only after I say "end station" or ask for feedback):\n${promptList(c.key)}`,
    `MODEL ANSWERS TO FOLLOW-UP QUESTIONS (keep hidden until feedback):\n${promptList(c.questions.map((q,i) => `${q} — ${c.review.answers[i]}`))}`,
    'When I say "end station", leave character and compare my performance against the specific checkpoints and model answers above. Identify missed history, clinical judgement, management, monitoring, scope and communication. Do not invent a numeric mark or an unlisted treatment dose. Begin the role-play now.'
  ].join('\n\n');
}
function vivaRoleplayPrompt(c) {
  return [
    'Run a standalone Australian final-year pharmacy Home Medicines Review (HMR) Viva. You have all case facts in this message; do not rely on earlier chat, local files, links, or attachments. I am the student pharmacist. My dashboard runs the clock and I write my preparation notes on paper. The format is 10 minutes to review the case, 5 minutes to present my medication review and management plan in ISBAR format (Introduction, Situation, Background, Assessment, Recommendation), then 10 minutes of examiner questions.',
    'During preparation, act as the patient or referrer only if I ask for a case clarification. Answer from the facts below, one question at a time. Do not volunteer hidden actor information, examiner priorities, suggested management, or the five questions. If a clinically important fact is not supplied, say it is unavailable rather than inventing a result, medicine, dose, allergy, or symptom.',
    'When I say "begin presentation", act as the examiner and listen to my ISBAR management-plan presentation without coaching or interrupting. Wait until I say "presentation complete". Then ask the five examiner questions below one at a time, waiting for each answer before continuing. You may ask a brief follow-up based on my answer, but do not give feedback until I say "end viva". Do not run your own timer or announce phase changes; I will use the dashboard.',
    `Case ${c.id} · Difficulty: ${c.level}\n\nSTUDENT BRIEFING (visible to me):\n${promptList(c.brief)}`,
    `HMR CHART (visible to me):\n${promptChart(c)}`,
    `ACTOR FACTS (use only to answer relevant clarification questions):\n${promptList(c.actor)}`,
    `EXAMINER PRIORITIES (keep hidden until the debrief):\n${promptList(c.key)}`,
    `FIVE EXAMINER QUESTIONS (ask only after my presentation, one at a time):\n${promptList(c.questions)}`,
    `MODEL ANSWERS TO QUESTIONS (keep hidden until the debrief):\n${promptList(c.questions.map((q,i) => `${q} — ${c.review.answers[i]}`))}`,
    'When I say "end viva", give a specific debrief against the ranked MRPs, actual medicine names/doses, recommendations, monitoring and model answers above. Distinguish supported conclusions from possible alternatives. Do not invent a numeric mark or unlisted treatment dose. Begin with only: "The case is ready. Let me know if you need clarification during your preparation."'
  ].join('\n\n');
}

function home() {
  const filtered = state.cases.filter(c => c.type === state.bankMode);
  main.innerHTML = `<section class="mode-grid"><button class="mode-card" data-action="random" data-value="viva"><span class="mode-icon" aria-hidden="true">VIVA</span><span class="mode-body"><span class="mode-title">Practice Viva</span><span class="viva-timeline" aria-label="10 minute preparation, 5 minute presentation, 10 minute questions"><span class="timeline-step"><strong>10 min</strong><span>HMR preparation</span></span><span class="timeline-step"><strong>5 min</strong><span>ISBAR management plan</span></span><span class="timeline-step"><strong>10 min</strong><span>Examiner questions</span></span></span></span><span class="mode-cta">Start <span>›</span></span></button><button class="mode-card" data-action="random" data-value="osce1"><span class="mode-icon" aria-hidden="true">OSCE</span><span class="mode-body"><span class="mode-title">Practice OSCE</span><span class="station-blocks"><span class="station-block"><strong>Station 1 · 10 min</strong><span>Manage a pharmacy presentation</span></span><span class="station-block"><strong>Station 2 · 5 min</strong><span>Challenging communication</span></span></span></span><span class="mode-cta">Start <span>›</span></span></button></section><section class="bank-section"><button class="bank-toggle" data-action="bank-toggle" aria-expanded="${state.bankOpen}"><span>Choose from the case bank</span><span>${state.bankOpen ? '−' : '+'}</span></button>${state.bankOpen ? `<div class="bank-content"><div class="toolbar">${[['viva','Viva'],['osce1','OSCE']].map(([value,label]) => `<button class="filter ${state.bankMode === value ? 'active' : ''}" data-action="bank-mode" data-value="${value}" aria-pressed="${state.bankMode === value}">${label}</button>`).join('')}</div><div class="case-grid">${filtered.map(c => `<button class="case-card" data-action="select" data-id="${esc(c.id)}"><div class="card-top"><span class="id">${esc(c.id)}</span>${state.completed.has(c.id) ? '<span class="status">Practised here ✓</span>' : ''}</div><h3>${esc(c.title)}</h3><div class="meta"><span class="mode-badge">${esc(modeLabel(c.type))}</span>${esc(c.topic)} · ${esc(c.level)}</div><span class="arrow">↗</span></button>`).join('')}</div><p class="minor">“Practised” is saved in this browser only.</p></div>` : ''}</section>`;
}

function detail() {
  const c = byId(state.selected);
  if (!c) return goHome();
  const isViva = c.type === 'viva';
  const isCircuit = c.type === 'osce1';
  main.innerHTML = `<div class="detail-head"><button class="back" data-action="home">← Viva or OSCE</button><span class="count">${esc(c.id)} · ${esc(modeLabel(c.type))}</span></div><section class="detail-hero"><div class="eyebrow">Codex practice case</div><h1>${esc(c.displayTitle || c.title)}</h1><p>${caseMeta(c)}</p></section><div class="detail-layout ${isViva ? 'viva-layout' : ''}"><section class="panel"><h2>Student briefing${isCircuit ? ' · Station 1' : ''}</h2>${briefHtml(c)}</section><aside class="panel side-panel"><h2>Ready to practise?</h2><p>Read only the briefing. Use your permitted resources and paper as in your mock. Examiner points stay hidden until the attempt ends.</p>${isCircuit ? '<div class="paper-note"><span class="paper-icon">②</span><span>Station 2 is chosen for you and appears when Station 1 ends.</span></div>' : ''}<button class="btn btn-primary" data-action="start">Start timed attempt →</button><button class="btn btn-secondary" data-action="random" data-value="${c.type}">Pick another case</button>${isViva ? '' : roleplayCopyUi('osce')}</aside></div>`;
}

function activeCase() {
  const c = byId(state.run.id);
  return c.type === 'osce1' && state.run.phase === 1 ? byId(state.run.partner) : c;
}
function session() {
  const r = state.run;
  const c = activeCase();
  const root = byId(r.id);
  const names = phaseNames[root.type];
  const duration = durations[root.type][r.phase];
  const questionPhase = root.type === 'viva' && r.phase === 2;
  main.innerHTML = `<div class="session"><div class="session-head"><button class="back" data-action="abort">← End attempt</button><span class="phase-label">${esc(root.id)} · phase ${r.phase + 1} of ${names.length}</span></div><section class="timer-panel" role="timer" aria-label="Time remaining"><div class="timer-top"><span class="eyebrow">Live station</span><span class="phase-name">${esc(names[r.phase])}</span></div><div class="timer" id="timer">${fmt(r.remaining)}</div><div class="progress-track"><div class="progress-fill" id="progress"></div></div><div class="timer-actions"><button class="btn btn-primary" data-action="pause">${r.paused ? 'Resume timer' : 'Pause timer'}</button><button class="btn btn-ghost" data-action="next">${r.phase === names.length - 1 ? 'Finish & debrief' : 'Next phase →'}</button><button class="btn btn-ghost" data-action="restart">Restart</button></div><div class="phase-strip">${names.map((_,i) => `<span class="phase-segment ${i < r.phase ? 'done' : i === r.phase ? 'active' : ''}" title="${esc(names[i])}"></span>`).join('')}</div></section>${root.type === 'viva' && r.phase === 1 ? `<section class="panel viva-task"><h2>Presentation task · 5 minutes</h2><p>Present your HMR review and management plan in ISBAR format.</p><p class="minor">If using an AI examiner, say “begin presentation” before you start and “presentation complete” when you finish.</p><div class="isbar-steps"><span><strong>I</strong> Introduction</span><span><strong>S</strong> Situation</span><span><strong>B</strong> Background</span><span><strong>A</strong> Assessment</span><span><strong>R</strong> Recommendation</span></div></section>` : ''}${root.type === 'viva' && r.phase === 0 ? `<section class="panel roleplay-panel"><h2>Simulate the Viva</h2><p>Copy the prompt into a new AI chat. Ask case clarifications during preparation, then write your management plan on paper. This timer runs your mock.</p>${roleplayCopyUi('viva')}</section>` : root.type === 'osce1' && r.phase === 0 ? `<section class="panel roleplay-panel"><h2>Simulate the patient</h2><p>Use another AI chat to take the history and practise your response while this timer runs.</p>${roleplayCopyUi('osce')}</section>` : ''}${root.type === 'viva' && r.phase > 0 ? '' : `<section class="panel session-brief"><div class="eyebrow">Codex practice case</div><h2>${esc(c.displayTitle || c.title)}</h2><p class="case-subheading">${caseMeta(c)}</p>${briefHtml(c)}</section>`}${questionPhase ? `<section class="panel"><h2>Examiner questions · 10 minutes</h2><p class="minor">Answer five questions about your HMR review and management plan. If using an AI examiner, it will ask one at a time; say “end viva” when finished for feedback. For solo practice, reveal a question below.</p>${r.questionIndex >= 0 ? `<div class="question-card">${esc(root.questions[r.questionIndex])}</div>` : ''}<button class="btn btn-secondary" data-action="question" ${r.questionIndex >= root.questions.length - 1 ? 'disabled' : ''}>${r.questionIndex < 0 ? 'Reveal first question' : 'Next question →'}</button></section>` : ''}</div>`;
  updateClock();
}

function debrief() {
  const root = byId(state.run.id);
  const partner = root.type === 'osce1' ? byId(state.run.partner) : null;
  const sections = [root, ...(partner ? [partner] : [])];
  const reviewSection = c => {
    const r = c.review;
    const problems = r.problems.map(([level, issue]) => `<li><span class="severity severity-${esc(level.toLowerCase())}">${esc(level)}</span><span>${esc(issue)}</span></li>`).join('');
    const qa = c.questions.map((q,i) => `<div class="answer-item"><h3>${i + 1}. ${esc(q)}</h3><p>${esc(r.answers[i])}</p></div>`).join('');
    const refs = r.references.map(([label,url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a></li>`).join('');
    return `<article class="case-review"><section class="panel review-title"><span class="eyebrow">${esc(c.id)} · ${esc(modeLabel(c.type))}</span><h2>${esc(c.displayTitle || c.title)}</h2></section><section class="panel"><h2>${c.type === 'viva' ? 'Ranked medication-related problems' : 'Problems and clinical priorities'}</h2><ol class="problem-list">${problems}</ol></section><section class="panel"><h2>Management plan</h2>${listHtml(r.plan)}${r.alternatives.length ? `<h3>Alternative pathway</h3>${listHtml(r.alternatives)}` : ''}</section><section class="panel"><h2>Follow-up and monitoring</h2>${listHtml(r.monitoring)}</section><section class="panel"><h2>Examiner questions · model answers</h2>${qa}</section><details class="panel review-details"><summary>Actor facts and sources</summary><h3>Actor facts</h3>${listHtml(c.actor)}<h3>Source checks</h3><ul class="review-sources">${refs}</ul></details></article>`;
  };
  main.innerHTML = `<div class="debrief"><div class="detail-head"><button class="back" data-action="home">← Viva or OSCE</button><span class="count">${esc(root.id)} · debrief</span></div><section class="detail-hero"><div class="eyebrow">Case review</div><h1>Compare your plan with the model answer.</h1><p>Check each ranked problem, the action you proposed, and how you would monitor the outcome.</p></section>${sections.map(reviewSection).join('')}<div class="debrief-actions"><button class="btn btn-primary" data-action="mark">${state.completed.has(root.id) ? 'Practised ✓' : 'Mark practised ✓'}</button><button class="btn btn-secondary" data-action="repeat">Repeat case</button><button class="btn btn-ghost" data-action="home">Choose another case</button></div><p class="minor">These are case-specific practice answers. Where the supplied resources defer exact prescribing to current AMH/eTG, verify the regimen and eligibility there before use.</p></div>`;
}

function rubricsPage() {
  const viva = [
    ['Identification of MRPs', 'viva-identification.png'],
    ['Resolution of MRPs', 'viva-resolution.png'],
    ['Patient-centred care', 'viva-patient-centred-care.png'],
    ['Roles and responsibilities', 'viva-roles.png'],
    ['Communication', 'viva-communication.png'],
    ['Response to questions', 'viva-questions.png']
  ];
  const osce = [
    ['Station 1 · Information gathering', 'osce-info-gathering.png'],
    ['Station 1 · Clinical management', 'osce-clinical-management.png'],
    ['Station 1 · Communication', 'osce-communication.png'],
    ['Station 1 · Patient-centred care', 'osce-patient-centred-care.png'],
    ['Station 2 · Challenging communication', 'osce-challenging-communication.png'],
    ['Station 2 · Professionalism', 'osce-professionalism.png']
  ];
  const clips = items => items.map(([label,filename]) => `<figure class="rubric-clip"><figcaption>${esc(label)}</figcaption><img src="rubric-clips/${filename}" alt="Exceptional performance band for ${esc(label)} from the 2026 marking rubric" loading="lazy"></figure>`).join('');
  main.innerHTML = `<div class="page-heading"><span class="eyebrow">PHRM4102 assessment</span><h1>Marking rubrics</h1><p>Clips show the Exceptional band only. Open the full PDF for all performance levels and marking notes.</p></div><div class="resource-grid rubric-grid"><section class="panel resource-card"><h2>Viva · 25%</h2>${clips(viva)}<a class="resource-link" href="resources/viva-rubric-2026.pdf" target="_blank" rel="noopener">Open full Viva rubric (PDF) ↗</a></section><section class="panel resource-card"><h2>OSCE · 20%</h2>${clips(osce)}<a class="resource-link" href="resources/osce-rubric-2026.pdf" target="_blank" rel="noopener">Open full OSCE rubric (PDF) ↗</a></section></div>`;
}

function resourcesPage() {
  main.innerHTML = `<div class="page-heading"><span class="eyebrow">PHRM4102 assessment</span><h1>Allowed resources</h1><p>Check the exam briefs and your allocated timetable before exam day. These links are for study and for access where your assessment permits.</p></div><div class="resource-grid"><section class="panel resource-card"><h2>Viva</h2><h3>Bring</h3><ul><li>Tabbed physical AMH</li><li>Basic stationery and UQ-approved calculator</li><li>Temporary MFA code on paper, if needed for online access</li></ul><h3>10-minute preparation</h3><ul><li>AMH Online and eTG are available to consult</li><li>Note paper is provided; you can take your notes into the oral component</li></ul><h3>5 + 10-minute oral component</h3><p>Use your notes. The exam brief says online resources are available during preparation, not during the oral component.</p><div class="link-stack"><a href="https://amhonline.amh.net.au/" target="_blank" rel="noopener">AMH Online ↗</a><a href="https://app.tg.org.au/" target="_blank" rel="noopener">Therapeutic Guidelines (eTG) ↗</a><a href="resources/viva-exam-brief.pdf" target="_blank" rel="noopener">Viva exam brief (PDF) ↗</a></div></section><section class="panel resource-card"><h2>OSCE</h2><h3>Bring</h3><ul><li>Tabbed physical AMH</li><li>Basic stationery and UQ-approved calculator</li></ul><h3>Provided at the station</h3><ul><li>Computer with the combined, bookmarked Queensland Health Acute Condition Guidelines and eTG excerpts</li><li>Note paper</li><li>Case-specific prescribing guidelines, if relevant</li></ul><p>Station 1 is a 10-minute pharmacy presentation; Station 2 is 5 minutes of challenging communication.</p><div class="link-stack"><a href="https://amhonline.amh.net.au/" target="_blank" rel="noopener">AMH Online (study access; bring physical AMH to OSCE) ↗</a><a href="resources/queensland-health-acute-condition-guidelines.pdf" target="_blank" rel="noopener">Bookmarked acute condition guide (PDF) ↗</a><a href="https://www.health.qld.gov.au/clinical-practice/guidelines-procedures/community-pharmacy-pilots/resources/acute-common-conditions" target="_blank" rel="noopener">Queensland Health guideline page ↗</a><a href="resources/osce-rubric-2026.pdf" target="_blank" rel="noopener">OSCE rubric (PDF) ↗</a></div></section></div>`;
}

function render() { const currentCase = state.view === 'session' ? activeCase() : state.view === 'detail' ? byId(state.selected) : null; document.title = currentCase ? `${currentCase.displayTitle || currentCase.title} · OSCE & Viva Practice` : 'OSCE & Viva Practice'; if (state.view === 'home') home(); else if (state.view === 'detail') detail(); else if (state.view === 'session') session(); else if (state.view === 'debrief') debrief(); else if (state.view === 'rubrics') rubricsPage(); else if (state.view === 'resources') resourcesPage(); }
function goHome() { state.view = 'home'; state.run = null; render(); window.scrollTo(0,0); }
function choosePartner() { const options = state.cases.filter(c => c.type === 'osce2'); const fresh = options.filter(c => !state.completed.has(c.id)); const pool = fresh.length ? fresh : options; return pool[Math.floor(Math.random() * pool.length)]?.id || null; }
function select(id) { const c = byId(id); state.selected = id; state.partner = c?.type === 'osce1' ? choosePartner() : null; state.view = 'detail'; render(); window.scrollTo(0,0); }
function randomCase(type) { const options = state.cases.filter(c => c.type === type); const fresh = options.filter(c => !state.completed.has(c.id)); const pool = (fresh.length ? fresh : options).filter(c => c.id !== state.selected); select((pool.length ? pool : options)[Math.floor(Math.random() * (pool.length ? pool.length : options.length))].id); }
function start() { const c = byId(state.selected); const phases = durations[c.type]; state.run = { id: c.id, partner: state.partner, phase: 0, remaining: phases[0], paused: false, deadline: Date.now() + phases[0] * 1000, questionIndex: -1 }; state.view = 'session'; render(); window.scrollTo(0,0); }
function bell() { try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const ctx = new C(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = 740; o.type = 'sine'; g.gain.setValueAtTime(.001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(.12,ctx.currentTime+.03); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.7); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+.72); } catch {} }
function next() { const r = state.run; if (!r) return; const c = byId(r.id); const phases = durations[c.type]; bell(); if (r.phase + 1 >= phases.length) { state.view = 'debrief'; render(); window.scrollTo(0,0); return; } r.phase++; r.remaining = phases[r.phase]; r.deadline = Date.now() + r.remaining * 1000; r.paused = false; r.questionIndex = -1; render(); window.scrollTo(0,0); }
function updateClock() { if (state.view !== 'session' || !state.run) return; const r = state.run; if (!r.paused) r.remaining = Math.max(0,Math.ceil((r.deadline - Date.now())/1000)); const t = document.getElementById('timer'); const p = document.getElementById('progress'); if (!t || !p) return; t.textContent = fmt(r.remaining); t.classList.toggle('warning',r.remaining <= 60 && r.remaining > 0); t.classList.toggle('ended',r.remaining === 0); const total = durations[byId(r.id).type][r.phase]; p.style.width = `${Math.max(0, r.remaining / total * 100)}%`; if (r.remaining === 0 && !r.paused) next(); }
async function copyRoleplayPrompt(platform) {
  const c = state.view === 'session' ? activeCase() : byId(state.selected);
  const status = document.getElementById('copy-status');
  if (!c || !['osce1', 'viva'].includes(c.type) || !status) return;
  try {
    await navigator.clipboard.writeText(c.type === 'viva' ? vivaRoleplayPrompt(c) : osceRoleplayPrompt(c));
    status.textContent = `Copied for ${platform}. Paste into a new AI chat and begin ${c.type === 'viva' ? 'your Viva' : 'the consultation'}.`;
  } catch {
    status.textContent = 'Clipboard access failed. Try again in a secure browser tab.';
  }
}

const menu = document.getElementById('app-menu');
const menuToggle = document.getElementById('menu-toggle');
function setMenu(open) { document.getElementById('station-menu-link').hidden = !state.run || state.view === 'session' || state.view === 'debrief'; menu.hidden = !open; menuToggle.setAttribute('aria-expanded',String(open)); menuToggle.setAttribute('aria-label',open ? 'Close menu' : 'Open menu'); }
menuToggle.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (!b) return; const page = b.dataset.page; setMenu(false); if (page === 'home') goHome(); else if (page === 'station' && state.run) { state.view = 'session'; render(); window.scrollTo(0,0); } else { if (state.view === 'session' && state.run) { state.run.remaining = Math.max(0,Math.ceil((state.run.deadline-Date.now())/1000)); state.run.paused = true; } state.view = page; render(); window.scrollTo(0,0); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

main.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = b.dataset.action; if (a === 'bank-toggle') { state.bankOpen = !state.bankOpen; render(); } else if (a === 'bank-mode') { state.bankMode = b.dataset.value; render(); } else if (a === 'random') randomCase(b.dataset.value); else if (a === 'select') select(b.dataset.id); else if (a === 'home') goHome(); else if (a === 'start') start(); else if (a === 'copy-roleplay') copyRoleplayPrompt(b.dataset.value); else if (a === 'pause') { const r = state.run; if (r.paused) { r.deadline = Date.now()+r.remaining*1000; r.paused = false; } else { r.remaining = Math.max(0,Math.ceil((r.deadline-Date.now())/1000)); r.paused = true; } render(); } else if (a === 'next') next(); else if (a === 'restart') start(); else if (a === 'abort') { state.view='debrief'; render(); } else if (a === 'question') { state.run.questionIndex++; render(); } else if (a === 'mark') { state.completed.add(state.run.id); if (state.run.partner && byId(state.run.id).type === 'osce1') state.completed.add(state.run.partner); localStorage.setItem('osce-viva-completed',JSON.stringify([...state.completed])); render(); } else if (a === 'repeat') { state.selected = state.run.id; state.view='detail'; render(); window.scrollTo(0,0); } });
setInterval(updateClock,200);
fetch('cases.json?v=20261102b').then(r => { if (!r.ok) throw Error('case bank unavailable'); return r.json(); }).then(cases => { state.cases = cases; render(); }).catch(() => { main.innerHTML = '<section class="panel"><h1>Case bank unavailable</h1><p>Reload the dashboard or open it through a web server.</p></section>'; });
