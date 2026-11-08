const $ = (s) => document.querySelector(s);
const list = $('#task-list');
const API_URL = new URL('api/plan', window.location.href);
const DAY = 86400000;
const defaults = {
  startDate: '2026-11-09', deadline: '2026-12-20', daysPerWeek: 5, hoursPerDay: 4,
  tasks: [
    { name: 'Requirements & proposal', category: 'Planning', hours: 12 },
    { name: 'Architecture, diagrams & UI', category: 'Planning', hours: 14 },
    { name: 'Bluetooth message prototype', category: 'Build', hours: 32 },
    { name: 'Framed audio & playback', category: 'Build', hours: 35 },
    { name: 'Live audio integration', category: 'Build', hours: 40 },
    { name: 'Testing, fixes & documentation', category: 'Delivery', hours: 25 },
  ],
};
let savedTimer;

function dateFrom(value) { return new Date(`${value}T00:00:00Z`); }
function dateString(date) { return date.toISOString().slice(0, 10); }
function formatDate(date, opts = { month: 'short', day: 'numeric' }) { return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(date); }
function workingDays(from, to, perWeek) {
  const result = [];
  for (let date = new Date(from); date <= to; date = new Date(date.getTime() + DAY)) {
    const day = date.getUTCDay();
    if (perWeek === 7 || (perWeek === 6 ? day !== 0 : day !== 0 && day !== 6)) result.push(new Date(date));
  }
  return result;
}
function getPlan() {
  return {
    startDate: $('#start-date').value,
    deadline: $('#deadline').value,
    daysPerWeek: Number($('#days-week').value),
    hoursPerDay: Math.max(0.5, Number($('#hours-day').value) || 0.5),
    tasks: [...list.querySelectorAll('.task-row')].map(row => ({
      name: row.querySelector('.task-name').value.trim() || 'Untitled milestone',
      category: row.querySelector('.task-category').value,
      hours: Math.max(0.5, Number(row.querySelector('.task-hours').value) || 0.5),
    })),
  };
}
function setDirty() { $('#save-label').textContent = 'Unsaved changes'; $('#save-btn').classList.add('dirty'); }
function addTask(task = { name: 'New milestone', category: 'Build', hours: 8 }) {
  const row = $('#task-template').content.firstElementChild.cloneNode(true);
  row.querySelector('.task-name').value = task.name;
  row.querySelector('.task-category').value = ['Planning', 'Build', 'Delivery'].includes(task.category) ? task.category : 'Build';
  row.querySelector('.task-hours').value = task.hours;
  row.querySelector('.remove-task').addEventListener('click', () => { row.remove(); renumber(); update(); setDirty(); });
  row.querySelectorAll('input, select').forEach(el => el.addEventListener('input', () => { update(); setDirty(); }));
  row.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => { update(); setDirty(); }));
  list.append(row);
  renumber();
}
function renumber() { [...list.children].forEach((row, i) => row.querySelector('.task-index').textContent = String(i + 1).padStart(2, '0')); }
function update() {
  const plan = getPlan();
  const total = plan.tasks.reduce((sum, task) => sum + task.hours, 0);
  const startValue = dateFrom(plan.startDate);
  const todayUtc = new Date();
  const start = Number.isFinite(startValue.getTime()) ? startValue : new Date(Date.UTC(todayUtc.getFullYear(), todayUtc.getMonth(), todayUtc.getDate()));
  const deadlineValue = dateFrom(plan.deadline);
  const validWindow = Number.isFinite(deadlineValue.getTime()) && Number.isFinite(startValue.getTime()) && deadlineValue >= start;
  const deadline = Number.isFinite(deadlineValue.getTime()) ? deadlineValue : start;
  const daysToDeadline = validWindow ? workingDays(start, deadline, plan.daysPerWeek).length : 0;
  const required = daysToDeadline ? total / daysToDeadline : 0;
  const duration = Math.ceil(total / plan.hoursPerDay);
  const projectedHorizon = start.getTime() + Math.max(0, duration * 3) * DAY;
  const horizon = new Date(Math.max(projectedHorizon, deadline.getTime()));
  const days = workingDays(start, horizon, plan.daysPerWeek);
  const finish = days[Math.max(0, duration - 1)] || start;
  $('#total-hours').textContent = Number.isInteger(total) ? total : total.toFixed(1);
  $('#task-total-hours').textContent = Number.isInteger(total) ? total : total.toFixed(1);
  $('#task-count').textContent = plan.tasks.length;
  $('#tasks-subtitle').textContent = `${plan.tasks.length} milestones · edit estimates to shape your pace`;
  $('#daily-hours').textContent = required ? required.toFixed(1) : '—';
  $('#finish-date').textContent = plan.tasks.length ? formatDate(finish) : '—';
  $('#finish-note').textContent = plan.tasks.length ? `${duration} working days at ${plan.hoursPerDay} hrs / day` : 'Add a milestone to schedule the work';
  const fits = required > 0 && required <= plan.hoursPerDay;
  $('#capacity-status').textContent = fits ? 'Fits your capacity' : required ? 'More time needed' : 'Set a deadline';
  $('#capacity-pill').textContent = required ? (fits ? 'ON TRACK' : `+${(required - plan.hoursPerDay).toFixed(1)} HRS / DAY`) : 'NEEDS DATES';
  $('#capacity-pill').classList.toggle('over', Boolean(required && !fits));
  $('#capacity-note').textContent = required ? `${daysToDeadline} working days until your deadline` : 'Choose a valid start and deadline';
  $('#insight-text').textContent = required ? (fits ? `Plan for ${required.toFixed(1)} focused hours on each working day to finish by ${formatDate(deadline)}.` : `At ${plan.hoursPerDay} hrs/day, you may finish around ${formatDate(finish)}. Increase daily time or extend the deadline.`) : 'Set your dates and estimates to see your daily pace.';
  $('#timeline-summary').textContent = required ? `${total.toFixed(1)} hours · ${duration} working days projected` : 'Schedule updates as you edit estimates';
  drawGantt(plan, days, duration);
}
function drawGantt(plan, allDays, duration) {
  const gantt = $('#gantt');
  if (!plan.tasks.length) { gantt.innerHTML = '<div class="gantt-empty">Add a milestone to see your project timeline.</div>'; return; }
  const days = allDays.slice(0, Math.min(70, Math.max(duration, workingDays(dateFrom(plan.startDate), dateFrom(plan.deadline), plan.daysPerWeek).length, 12)));
  if (!days.length) { gantt.innerHTML = '<div class="gantt-empty">Choose a valid start date to draw the timeline.</div>'; return; }
  const months = [];
  days.forEach((d, i) => {
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, label: formatDate(d, { month: 'long', year: 'numeric' }), start: i, count: 1 });
    else months[months.length - 1].count++;
  });
  const color = { Planning: '#95b69a', Build: '#77a78c', Delivery: '#b8ca85' };
  const monthsHtml = months.map(m => `<span class="month-label" style="width:${(m.count / days.length * 100).toFixed(3)}%">${m.label}</span>`).join('');
  const heads = days.map((d, i) => `<span class="day-label ${[0,6].includes(d.getUTCDay()) ? 'weekend' : ''}" title="${formatDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}">${formatDate(d, { weekday: 'short' })[0]}<br>${d.getUTCDate()}</span>`).join('');
  let offset = 0;
  const rows = plan.tasks.map(task => {
    const startOffset = offset;
    const taskDays = Math.max(1, Math.ceil(task.hours / plan.hoursPerDay));
    offset += taskDays;
    if (startOffset >= days.length) return '';
    const visibleDuration = Math.max(1, Math.min(taskDays, days.length - startOffset));
    const cls = task.category.toLowerCase();
    const width = `${(visibleDuration / days.length * 100).toFixed(3)}%`;
    const left = `${(startOffset / days.length * 100).toFixed(3)}%`;
    const todayIndex = days.findIndex(d => dateString(d) === dateString(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))));
    const today = todayIndex >= 0 ? `<span class="today-line" style="left:${(todayIndex / days.length * 100).toFixed(3)}%"></span>` : '';
    return `<div class="gantt-row"><div class="gantt-task"><i style="background:${color[task.category] || color.Build}"></i><b title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</b></div><div class="gantt-track" style="--n:${days.length}">${days.map(d => `<i class="gantt-cell ${[0,6].includes(d.getUTCDay()) ? 'weekend' : ''}"></i>`).join('')}<span class="bar ${cls}" style="left:${left};width:${width}" title="${escapeHtml(task.name)} · ${task.hours} h"></span>${startOffset < days.length - 4 ? `<span class="bar-label" style="left:${left}">${task.hours}h</span>` : ''}${today}</div></div>`;
  }).join('');
  gantt.innerHTML = `<div class="gantt-scroll"><div class="gantt-grid" style="--n:${days.length};min-width:${182 + days.length * 19}px"><div class="gantt-month">${monthsHtml}</div><div class="gantt-dayhead" style="--n:${days.length}"><span></span>${heads}</div>${rows}</div></div>`;
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function loadPlan(plan) {
  const data = plan || defaults;
  $('#start-date').value = data.startDate || defaults.startDate;
  $('#deadline').value = data.deadline || defaults.deadline;
  $('#days-week').value = String(data.daysPerWeek || 5);
  $('#hours-day').value = data.hoursPerDay || 4;
  list.innerHTML = '';
  (data.tasks || defaults.tasks).forEach(addTask);
  update();
}
async function savePlan() {
  const button = $('#save-btn');
  button.disabled = true;
  $('#save-label').textContent = 'Saving to SQLite';
  try {
    const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getPlan()) });
    if (!response.ok) throw new Error('Could not save plan');
    $('#save-label').textContent = `Saved at ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`;
    button.classList.remove('dirty');
  } catch (error) {
    $('#save-label').textContent = 'Save failed · check server';
    console.error(error);
  } finally { button.disabled = false; }
}
$('#save-btn').addEventListener('click', savePlan);
$('#add-task').addEventListener('click', () => { addTask(); update(); setDirty(); list.lastElementChild.querySelector('.task-name').focus(); });
$('#start-date').addEventListener('input', () => { update(); setDirty(); });
$('#deadline').addEventListener('input', () => { update(); setDirty(); });
$('#days-week').addEventListener('change', () => { update(); setDirty(); });
$('#hours-day').addEventListener('input', () => { update(); setDirty(); });
fetch(API_URL).then(r => r.json()).then(data => {
  loadPlan(data.plan);
  $('#save-label').textContent = data.plan ? `Saved${data.updatedAt ? ` · ${data.updatedAt.slice(0, 10)}` : ''}` : 'New plan · not saved yet';
  if (!data.plan) setDirty();
}).catch(() => {
  loadPlan(null);
  $('#save-label').textContent = 'Database unavailable';
});
