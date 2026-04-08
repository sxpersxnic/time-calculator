// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('/time-calculator/service-worker.js')
			.then((registration) => {
				console.log(
					'Service Worker registered successfully:',
					registration.scope,
				);
			})
			.catch((error) => {
				console.log('Service Worker registration failed:', error);
			});
	});
}

// ----- History (localStorage) -----
let editingDate = null;

function loadHistory() {
	try {
		const raw = localStorage.getItem('workTimeHistory');
		return raw ? JSON.parse(raw) : [];
	} catch (e) {
		console.error('Failed to load history', e);
		return [];
	}
}

function saveHistory(history) {
	try {
		localStorage.setItem('workTimeHistory', JSON.stringify(history));
	} catch (e) {
		console.error('Failed to save history', e);
	}
}

function saveHistoryEntry() {
	// Build entry from current inputs/calculation
	const morningStart = document.getElementById('morning-start-time').value;
	const morningEnd = document.getElementById('morning-end-time').value;
	const afternoonStart = document.getElementById(
		'afternoon-start-time',
	).value;
	const afternoonEnd = document.getElementById('afternoon-end-time').value;
	const minimumTime = document.getElementById('minimum-time').value;

	// Build sessions list including extra sessions
	const extra = getExtraSessionsFromDOM();
	const sessions = [];
	if (morningStart || morningEnd)
		sessions.push({ start: morningStart, end: morningEnd });
	if (afternoonStart || afternoonEnd)
		sessions.push({ start: afternoonStart, end: afternoonEnd });
	extra.forEach((s) => {
		if (s.start || s.end) sessions.push(s);
	});

	const parsed = sessions.map((s) => ({
		startM: parseTimeToMinutes(s.start || ''),
		endM: parseTimeToMinutes(s.end || ''),
	}));
	const minHours = parseTargetToHours(minimumTime);
	if (
		parsed.length === 0 ||
		parsed.some((p) => isNaN(p.startM) || isNaN(p.endM)) ||
		isNaN(minHours)
	) {
		alert('Cannot save entry: one or more time fields are invalid.');
		return;
	}
	if (parsed.some((p) => p.endM <= p.startM)) {
		alert('Cannot save entry: end time must be after start time.');
		return;
	}
	parsed.sort((a, b) => a.startM - b.startM);
	const totalWorkMins = parsed.reduce((s, p) => s + (p.endM - p.startM), 0);
	const breaks = [];
	for (let i = 1; i < parsed.length; i++) {
		const g = Math.max(0, parsed[i].startM - parsed[i - 1].endM);
		breaks.push(g);
	}
	const configuredBreakMins =
		parseInt(document.getElementById('minimum-break-mins').value, 10) || 0;
	let penaltyMins = 0;
	breaks.forEach((g) => {
		if (g < configuredBreakMins) penaltyMins += configuredBreakMins - g;
	});
	const adjustedTotalHours = Math.max(0, (totalWorkMins - penaltyMins) / 60);
	const overtime = adjustedTotalHours - minHours;
	const morningHours =
		parsed.length > 0 ? (parsed[0].endM - parsed[0].startM) / 60 : 0;
	const afternoonHours =
		parsed.length > 1 ? (parsed[1].endM - parsed[1].startM) / 60 : 0;

	const entry = {
		date: editingDate ? editingDate : new Date().toISOString(),
		morningHours: Number(morningHours.toFixed(3)),
		afternoonHours: Number(afternoonHours.toFixed(3)),
		totalHours: Number(adjustedTotalHours.toFixed(3)),
		overtime: Number(overtime.toFixed(3)),
		raw: {
			sessions: sessions,
			minimumTime,
			configuredBreakMins,
		},
	};

	const history = loadHistory();
	// Prevent duplicate-day saves: if an entry for the same YYYY-MM-DD exists, prompt to overwrite
	const entryDateKey =
		(entry.date && entry.date.slice(0, 10)) ||
		new Date().toISOString().slice(0, 10);
	const existingIndex = history.findIndex(
		(h) => h && h.date && h.date.slice(0, 10) === entryDateKey,
	);
	if (!editingDate && existingIndex !== -1) {
		const overwrite = confirm(
			`An entry for ${entryDateKey} already exists. Overwrite it?`,
		);
		if (!overwrite) return; // abort save
		history[existingIndex] = entry;
		saveHistory(history);
		loadHistoryViewer();
		alert('Existing entry overwritten');
		return;
	}

	if (editingDate) {
		const idx = history.findIndex(
			(item) => item && item.date === editingDate,
		);
		if (idx !== -1) {
			history[idx] = entry;
		} else {
			history.push(entry);
		}
		editingDate = null;
		// Restore Save button text
		const saveBtn = document.getElementById('save-entry-btn');
		if (saveBtn) saveBtn.textContent = 'Save Entry';
		const cancelBtn = document.getElementById('cancel-edit-btn');
		if (cancelBtn) cancelBtn.style.display = 'none';
		alert('Entry updated');
	} else {
		history.push(entry);
		alert('Entry saved to history');
	}
	// Keep history reasonable length
	const maxEntries = 365;
	if (history.length > maxEntries)
		history.splice(0, history.length - maxEntries);
	saveHistory(history);
	loadHistoryViewer();
}

// Time format preference
function loadTimeFormatPreference() {
	const pref = localStorage.getItem('timeFormat') || '24';
	const select = document.getElementById('time-format-select');
	if (select) select.value = pref;
	return pref;
}

function saveTimeFormatPreference(val) {
	localStorage.setItem('timeFormat', val);
}

function startEditEntry(dateISO) {
	const history = loadHistory();
	const entry = history.find((item) => item && item.date === dateISO);
	if (!entry) {
		alert('Entry not found');
		return;
	}
	// Populate inputs with raw values
	const raw = entry.raw || {};
	if (raw.morningStart)
		document.getElementById('morning-start-time').value = raw.morningStart;
	if (raw.morningEnd)
		document.getElementById('morning-end-time').value = raw.morningEnd;
	if (raw.afternoonStart)
		document.getElementById('afternoon-start-time').value =
			raw.afternoonStart;
	if (raw.afternoonEnd)
		document.getElementById('afternoon-end-time').value = raw.afternoonEnd;
	if (raw.minimumTime)
		document.getElementById('minimum-time').value = raw.minimumTime;
	// Set editing state
	editingDate = dateISO;
	const saveBtn = document.getElementById('save-entry-btn');
	if (saveBtn) saveBtn.textContent = 'Update Entry';
	const cancelBtn = document.getElementById('cancel-edit-btn');
	if (cancelBtn) cancelBtn.style.display = 'inline-flex';
	// Recalculate to show current values
	calculateWorkingTime();
}

function cancelEdit() {
	editingDate = null;
	const saveBtn = document.getElementById('save-entry-btn');
	if (saveBtn) saveBtn.textContent = 'Save Entry';
	const cancelBtn = document.getElementById('cancel-edit-btn');
	if (cancelBtn) cancelBtn.style.display = 'none';
	// Optionally reload saved data
	loadSavedData();
	calculateWorkingTime();
}

function exportHistory() {
	const history = loadHistory();
	const blob = new Blob([JSON.stringify(history, null, 2)], {
		type: 'application/json',
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `time-history-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

function importHistoryFromFile(file) {
	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const parsed = JSON.parse(e.target.result);
			if (!Array.isArray(parsed))
				throw new Error('Invalid history format');

			const existing = loadHistory();
			const replace = confirm(
				'Replace existing history? OK = Replace, Cancel = Merge',
			);
			let merged;
			if (replace) {
				merged = parsed;
			} else {
				merged = existing.concat(parsed);
				// de-dup by ISO date if available
				const seen = new Map();
				merged.reverse().forEach((item) => {
					if (item && item.date && !seen.has(item.date))
						seen.set(item.date, item);
				});
				merged = Array.from(seen.values()).reverse();
			}
			saveHistory(merged);
			loadHistoryViewer();
			alert('History imported successfully');
		} catch (err) {
			console.error('Import failed', err);
			alert('Failed to import history: invalid file');
		}
	};
	reader.readAsText(file);
}

function loadHistoryViewer() {
	const viewer = document.getElementById('history-viewer');
	if (!viewer) return;
	const history = loadHistory();
	if (!history || history.length === 0) {
		viewer.innerHTML = '<div>No history entries</div>';
		return;
	}
	// Show latest 10 entries
	const last = history.slice(-10).reverse();
	viewer.innerHTML = last
		.map((h) => {
			const date = new Date(h.date).toLocaleString();
			// Use data-date to identify the entry for actions
			return (
				`<div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border-subtle);">` +
				`<div><strong>${date}</strong> — ${h.totalHours}h (OT: ${h.overtime >= 0 ? '+' : ''}${h.overtime}h)</div>` +
				`<div style="display:flex;gap:0.5rem;">
					<button class="clear-data-btn edit-history-btn" data-date="${h.date}">Edit</button>
					<button class="clear-data-btn delete-history-btn" data-date="${h.date}">Delete</button>
				</div>` +
				`</div>`
			);
		})
		.join('');

	// Update aggregates whenever history viewer is refreshed
	if (typeof computeAggregates === 'function') computeAggregates();
}

// Compute aggregates and render into aggregates card
function computeAggregates() {
	const history = loadHistory();
	const now = new Date();
	const startOfWeek = new Date(now);
	const dow = (now.getDay() + 6) % 7; // Monday=0
	startOfWeek.setDate(now.getDate() - dow);
	startOfWeek.setHours(0, 0, 0, 0);

	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfYear = new Date(now.getFullYear(), 0, 1);

	let saldo = 0;
	let weekTotal = 0;
	let monthTotal = 0;
	let yearTotal = 0;
	let totalEntries = 0;
	let totalBreakMins = 0;
	let breakCount = 0;

	history.forEach((entry) => {
		if (!entry || !entry.date) return;
		const d = new Date(entry.date);
		const th = Number(entry.totalHours) || 0;
		const ot = Number(entry.overtime) || 0;
		saldo += ot;

		if (d >= startOfWeek) weekTotal += th;
		if (d >= startOfMonth) monthTotal += th;
		if (d >= startOfYear) yearTotal += th;

		totalEntries += 1;

		// break minutes: prefer raw.actualBreakMins or raw.actualBreakMins-like keys
		const raw = entry.raw || {};
		let b = null;
		if (typeof raw.actualBreakMins !== 'undefined')
			b = Number(raw.actualBreakMins);
		else if (
			typeof raw.actualBreakMins === 'undefined' &&
			typeof raw.actualBreakMins !== 'undefined'
		)
			b = Number(raw.actualBreakMins);
		else if (typeof raw.breakMins !== 'undefined')
			b = Number(raw.breakMins);
		else if (raw.morningEnd && raw.afternoonStart) {
			const me = parseTimeToMinutes(raw.morningEnd);
			const as = parseTimeToMinutes(raw.afternoonStart);
			if (!isNaN(me) && !isNaN(as)) b = Math.max(0, as - me);
		}
		if (b !== null && !isNaN(b)) {
			totalBreakMins += b;
			breakCount += 1;
		}
	});

	const avgPerEntry = totalEntries
		? history.reduce((s, e) => s + (Number(e.totalHours) || 0), 0) /
			totalEntries
		: 0;
	const avgBreak = breakCount ? totalBreakMins / breakCount : 0;

	// Render
	const aggSaldo = document.getElementById('agg-saldo');
	const aggWeek = document.getElementById('agg-week');
	const aggMonth = document.getElementById('agg-month');
	const aggYear = document.getElementById('agg-year');
	const aggAvg = document.getElementById('agg-avg');
	const aggAvgBreak = document.getElementById('agg-avg-break');

	if (aggSaldo)
		aggSaldo.textContent = `Total Overtime (saldo): ${formatDuration(saldo)}`;
	if (aggWeek)
		aggWeek.textContent = `This Week: ${formatDuration(weekTotal)}`;
	if (aggMonth)
		aggMonth.textContent = `This Month: ${formatDuration(monthTotal)}`;
	if (aggYear)
		aggYear.textContent = `This Year: ${formatDuration(yearTotal)}`;
	if (aggAvg)
		aggAvg.textContent = `Average per Entry: ${formatDuration(avgPerEntry)}`;
	if (aggAvgBreak)
		aggAvgBreak.textContent = `Average Break: ${Math.round(avgBreak)} min`;
}

// Chart: weekly worktime bar chart using Chart.js
let weeklyChart = null;
function renderWeeklyChart() {
	const history = loadHistory();
	const now = new Date();
	// build labels for the last 7 days (Mon-Sun ending today)
	const labels = [];
	const totals = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(now.getDate() - i);
		d.setHours(0, 0, 0, 0);
		labels.push(
			d.toLocaleDateString(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
			}),
		);
		const dayKey = d.toISOString().slice(0, 10);
		const dayTotal = history.reduce((sum, entry) => {
			if (!entry || !entry.date) return sum;
			if (entry.date.slice(0, 10) === dayKey)
				return sum + (Number(entry.totalHours) || 0);
			return sum;
		}, 0);
		totals.push(Number(dayTotal.toFixed(3)));
	}

	const ctx = document.getElementById('weeklyChart').getContext('2d');
	if (weeklyChart) {
		weeklyChart.data.labels = labels;
		weeklyChart.data.datasets[0].data = totals;
		weeklyChart.update();
		return;
	}

	weeklyChart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels,
			datasets: [
				{
					label: 'Work hours',
					data: totals,
					backgroundColor: 'rgba(66,153,225,0.6)',
				},
			],
		},
		options: {
			scales: {
				y: { beginAtZero: true },
			},
			plugins: { legend: { display: false } },
		},
	});
}

// Re-render chart when history changes
document.addEventListener('DOMContentLoaded', () => {
	// render initially
	renderWeeklyChart();
	// hook into history viewer updates by overriding loadHistoryViewer call sites
	// We call render after loadHistoryViewer is called elsewhere
	const originalLoad = loadHistoryViewer;
	loadHistoryViewer = function () {
		originalLoad();
		renderWeeklyChart();
	};
});
// Modal editing for history entries
let modalEditingKey = null;

function openHistoryEditModal(dateISO) {
	const history = loadHistory();
	const entry = history.find((item) => item && item.date === dateISO);
	if (!entry) {
		alert('Entry not found');
		return;
	}
	modalEditingKey = dateISO;
	const raw = entry.raw || {};
	// Date input value (YYYY-MM-DD)
	const dateInput = document.getElementById('modal-date');
	const d = new Date(entry.date);
	// Use local date portion
	const isoDate = d.toISOString().slice(0, 10);
	if (dateInput) dateInput.value = isoDate;

	if (raw.morningStart)
		document.getElementById('modal-morning-start').value = raw.morningStart;
	if (raw.morningEnd)
		document.getElementById('modal-morning-end').value = raw.morningEnd;
	if (raw.afternoonStart)
		document.getElementById('modal-afternoon-start').value =
			raw.afternoonStart;
	if (raw.afternoonEnd)
		document.getElementById('modal-afternoon-end').value = raw.afternoonEnd;
	if (raw.minimumTime)
		document.getElementById('modal-minimum-time').value = raw.minimumTime;

	// compute break minutes if possible
	const ms = parseTimeToMinutes(raw.morningEnd || '');
	const as = parseTimeToMinutes(raw.afternoonStart || '');
	const breakMins = isNaN(ms) || isNaN(as) ? 30 : Math.max(0, as - ms);
	const breakInput = document.getElementById('modal-break-mins');
	if (breakInput) breakInput.value = breakMins;

	const modal = document.getElementById('history-modal');
	if (modal) modal.setAttribute('aria-hidden', 'false');
	// focus first input
	setTimeout(() => {
		document.getElementById('modal-morning-start').focus();
	}, 50);
}

function closeHistoryModal() {
	modalEditingKey = null;
	const modal = document.getElementById('history-modal');
	if (modal) modal.setAttribute('aria-hidden', 'true');
}

// Initialize modal listeners
function initHistoryModalHandlers() {
	const form = document.getElementById('history-modal-form');
	const cancelBtn = document.getElementById('modal-cancel-btn');
	const deleteBtn = document.getElementById('modal-delete-btn');

	if (form) {
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			// Read values
			const dateVal = document.getElementById('modal-date').value; // YYYY-MM-DD
			const morningStart = document.getElementById(
				'modal-morning-start',
			).value;
			const morningEnd =
				document.getElementById('modal-morning-end').value;
			const afternoonStart = document.getElementById(
				'modal-afternoon-start',
			).value;
			const afternoonEnd = document.getElementById(
				'modal-afternoon-end',
			).value;
			const minimumTime =
				document.getElementById('modal-minimum-time').value;
			const breakMins =
				parseInt(
					document.getElementById('modal-break-mins').value,
					10,
				) || 0;

			const ms = parseTimeToMinutes(morningStart);
			const me = parseTimeToMinutes(morningEnd);
			const as = parseTimeToMinutes(afternoonStart);
			const ae = parseTimeToMinutes(afternoonEnd);
			const minHours = parseTargetToHours(minimumTime);

			if ([ms, me, as, ae].some((v) => isNaN(v)) || isNaN(minHours)) {
				alert('Cannot save: one or more fields are invalid.');
				return;
			}

			const morningHours = (me - ms) / 60;
			const afternoonHours = (ae - as) / 60;
			let totalHours = morningHours + afternoonHours;
			// apply break penalty if break between sessions is less than breakMins
			const actualBreak = as - me;
			if (actualBreak < breakMins) {
				const penalty = (breakMins - actualBreak) / 60;
				totalHours = Math.max(0, totalHours - penalty);
			}

			const overtime = totalHours - minHours;

			const entry = {
				date: dateVal + 'T00:00:00.000Z',
				morningHours: Number(morningHours.toFixed(3)),
				afternoonHours: Number(afternoonHours.toFixed(3)),
				totalHours: Number(totalHours.toFixed(3)),
				overtime: Number(overtime.toFixed(3)),
				raw: {
					morningStart,
					morningEnd,
					afternoonStart,
					afternoonEnd,
					minimumTime,
					breakMins,
				},
			};

			const history = loadHistory();
			if (modalEditingKey) {
				const idx = history.findIndex(
					(item) => item && item.date === modalEditingKey,
				);
				if (idx !== -1) {
					history[idx] = entry;
				} else {
					history.push(entry);
				}
			} else {
				history.push(entry);
			}
			saveHistory(history);
			loadHistoryViewer();
			closeHistoryModal();
			alert('Entry saved');
		});
	}

	if (cancelBtn) {
		cancelBtn.addEventListener('click', (e) => {
			e.preventDefault();
			closeHistoryModal();
		});
	}

	if (deleteBtn) {
		deleteBtn.addEventListener('click', (e) => {
			e.preventDefault();
			if (!modalEditingKey) return alert('No entry selected');
			if (!confirm('Delete this history entry?')) return;
			const history = loadHistory();
			const idx = history.findIndex(
				(item) => item && item.date === modalEditingKey,
			);
			if (idx !== -1) {
				history.splice(idx, 1);
				saveHistory(history);
				loadHistoryViewer();
				closeHistoryModal();
				alert('Entry deleted');
			} else {
				alert('Entry not found');
			}
		});
	}

	// close on backdrop click or Esc
	const backdrop = document.getElementById('history-modal-backdrop');
	if (backdrop) backdrop.addEventListener('click', closeHistoryModal);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeHistoryModal();
	});
}

// Attach history UI handlers
document.addEventListener('DOMContentLoaded', function () {
	const saveEntryBtn = document.getElementById('save-entry-btn');
	const exportBtn = document.getElementById('export-history-btn');
	const importBtn = document.getElementById('import-history-btn');
	const importInput = document.getElementById('import-history-input');

	if (saveEntryBtn) saveEntryBtn.addEventListener('click', saveHistoryEntry);
	if (exportBtn) exportBtn.addEventListener('click', exportHistory);
	if (importBtn && importInput) {
		importBtn.addEventListener('click', () => importInput.click());
		importInput.addEventListener('change', (e) => {
			if (e.target.files && e.target.files[0])
				importHistoryFromFile(e.target.files[0]);
			e.target.value = '';
		});
	}

	const clearHistoryBtn = document.getElementById('clear-history-btn');
	if (clearHistoryBtn) {
		clearHistoryBtn.addEventListener('click', () => {
			if (
				confirm(
					'Are you sure you want to clear all history entries? This cannot be undone.',
				)
			) {
				localStorage.removeItem('workTimeHistory');
				loadHistoryViewer();
				alert('History cleared');
			}
		});
	}

	// Delegate delete clicks from viewer
	const viewer = document.getElementById('history-viewer');
	if (viewer) {
		viewer.addEventListener('click', (e) => {
			const del =
				e.target.closest && e.target.closest('.delete-history-btn');
			if (del && del.dataset && del.dataset.date) {
				const date = del.dataset.date;
				if (confirm('Delete this history entry?')) {
					const history = loadHistory();
					const idx = history.findIndex(
						(item) => item && item.date === date,
					);
					if (idx !== -1) {
						history.splice(idx, 1);
						saveHistory(history);
						loadHistoryViewer();
						alert('Entry deleted');
					} else {
						alert('Entry not found');
					}
				}
				return;
			}

			const edit =
				e.target.closest && e.target.closest('.edit-history-btn');
			if (edit && edit.dataset && edit.dataset.date) {
				openHistoryEditModal(edit.dataset.date);
				return;
			}
		});
	}

	// Initialize modal handlers for history editor
	initHistoryModalHandlers();

	loadHistoryViewer();
});

// PWA Install Prompt
let deferredPrompt;
const installButton = document.createElement('button');
installButton.className = 'install-button';
installButton.innerHTML = `
	<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
		<polyline points="7 10 12 15 17 10"></polyline>
		<line x1="12" y1="15" x2="12" y2="3"></line>
	</svg>
	Install App
`;
installButton.style.display = 'none';
installButton.setAttribute('aria-label', 'Install app');

window.addEventListener('beforeinstallprompt', (e) => {
	// Prevent the mini-infobar from appearing on mobile
	e.preventDefault();
	// Stash the event so it can be triggered later
	deferredPrompt = e;
	// Update UI to show the install button
	installButton.style.display = 'flex';
	document.body.appendChild(installButton);
});

installButton.addEventListener('click', async () => {
	if (!deferredPrompt) {
		return;
	}
	// Show the install prompt
	deferredPrompt.prompt();
	// Wait for the user to respond to the prompt
	const { outcome } = await deferredPrompt.userChoice;
	console.log(`User response to the install prompt: ${outcome}`);
	// Clear the deferredPrompt
	deferredPrompt = null;
	// Hide the install button
	installButton.style.display = 'none';
});

window.addEventListener('appinstalled', () => {
	console.log('PWA was installed');
	installButton.style.display = 'none';
	deferredPrompt = null;
});

// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

// Check for saved theme preference or default to system preference
const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia(
	'(prefers-color-scheme: dark)',
).matches;

// Set initial theme
if (savedTheme) {
	htmlElement.setAttribute('data-theme', savedTheme);
} else if (systemPrefersDark) {
	htmlElement.setAttribute('data-theme', 'dark');
} else {
	htmlElement.setAttribute('data-theme', 'light');
}

// Toggle theme on button click
themeToggle.addEventListener('click', () => {
	const currentTheme = htmlElement.getAttribute('data-theme');
	const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

	htmlElement.setAttribute('data-theme', newTheme);
	localStorage.setItem('theme', newTheme);
});

// Auto-calculate on input change
document.addEventListener('DOMContentLoaded', function () {
	const inputs = document.querySelectorAll('input[type="time"]');
	const clearDataBtn = document.getElementById('clear-data-btn');

	// Initialize time format selector
	const timeFormatSelect = document.getElementById('time-format-select');
	if (timeFormatSelect) {
		// load saved preference
		const pref = loadTimeFormatPreference();
		timeFormatSelect.value = pref;
		timeFormatSelect.addEventListener('change', (e) => {
			saveTimeFormatPreference(e.target.value);
			// Inform user
			const help = document.getElementById('time-format-help');
			if (help)
				help.textContent =
					e.target.value === '12'
						? 'Inputs may display in 12-hour format; target/duration remain 24-hour/decimal.'
						: 'Target/duration fields remain 24-hour/decimal for calculations.';
		});
	}

	// Load saved data from localStorage
	loadSavedData();

	// Update status visibility based on saved data
	updateDataStatus();

	// Add event listeners for auto-save and calculation
	inputs.forEach((input) => {
		input.addEventListener('change', () => {
			saveData();
			calculateWorkingTime();
		});
		input.addEventListener('input', calculateWorkingTime);
	});

	// minimum break input should also trigger save & recalc
	const minBreakInput = document.getElementById('minimum-break-mins');
	if (minBreakInput) {
		minBreakInput.addEventListener('change', () => {
			saveData();
			calculateWorkingTime();
		});
		minBreakInput.addEventListener('input', calculateWorkingTime);
	}

	// Add session button
	const addSessionBtn = document.getElementById('add-session-btn');
	if (addSessionBtn) {
		addSessionBtn.addEventListener('click', (e) => {
			e.preventDefault();
			addSessionRow('', '');
			saveData();
			calculateWorkingTime();
		});
	}

	// Clear data button handler
	clearDataBtn.addEventListener('click', () => {
		if (confirm('Are you sure you want to clear all saved data?')) {
			clearSavedData();
			// Reset inputs to default values
			document.getElementById('morning-start-time').value = '08:00';
			document.getElementById('morning-end-time').value = '12:30';
			document.getElementById('afternoon-start-time').value = '13:00';
			document.getElementById('afternoon-end-time').value = '16:54';
			document.getElementById('minimum-time').value = '08:24';
			document.getElementById('minimum-break-mins').value = '30';
			// Recalculate with default values
			calculateWorkingTime();
			// Update status
			updateDataStatus();
		}
	});

	// Initial calculation
	calculateWorkingTime();
});

// Update data status indicator
function updateDataStatus() {
	const dataStatus = document.getElementById('data-status');
	const statusText = document.getElementById('status-text');
	const savedData = localStorage.getItem('workTimeData');

	if (savedData) {
		try {
			const data = JSON.parse(savedData);
			const lastSaved = new Date(data.lastSaved);
			const now = new Date();
			const diffMinutes = Math.floor((now - lastSaved) / 1000 / 60);

			if (diffMinutes < 1) {
				statusText.textContent = 'Data saved just now';
			} else if (diffMinutes < 60) {
				statusText.textContent = `Data saved ${diffMinutes} minute${
					diffMinutes > 1 ? 's' : ''
				} ago`;
			} else if (diffMinutes < 1440) {
				const hours = Math.floor(diffMinutes / 60);
				statusText.textContent = `Data saved ${hours} hour${
					hours > 1 ? 's' : ''
				} ago`;
			} else {
				const days = Math.floor(diffMinutes / 1440);
				statusText.textContent = `Data saved ${days} day${
					days > 1 ? 's' : ''
				} ago`;
			}
			dataStatus.style.opacity = '1';
		} catch (error) {
			dataStatus.style.opacity = '0';
		}
	} else {
		statusText.textContent = 'No saved data';
		dataStatus.style.opacity = '0.5';
	}
}

// Save data to localStorage
function saveData() {
	const data = {
		morningStart: document.getElementById('morning-start-time').value,
		morningEnd: document.getElementById('morning-end-time').value,
		afternoonStart: document.getElementById('afternoon-start-time').value,
		afternoonEnd: document.getElementById('afternoon-end-time').value,
		minimumTime: document.getElementById('minimum-time').value,
		minimumBreakMinutes:
			parseInt(document.getElementById('minimum-break-mins').value, 10) ||
			0,
		// persist extra dynamic sessions
		extraSessions: getExtraSessionsFromDOM(),
		lastSaved: new Date().toISOString(),
	};

	localStorage.setItem('workTimeData', JSON.stringify(data));
	updateDataStatus();
	console.log('Data saved to localStorage');
}

// Load saved data from localStorage
function loadSavedData() {
	const savedData = localStorage.getItem('workTimeData');

	if (savedData) {
		try {
			const data = JSON.parse(savedData);

			// Restore values to inputs
			if (data.morningStart) {
				document.getElementById('morning-start-time').value =
					data.morningStart;
			}
			if (data.morningEnd) {
				document.getElementById('morning-end-time').value =
					data.morningEnd;
			}
			if (data.afternoonStart) {
				document.getElementById('afternoon-start-time').value =
					data.afternoonStart;
			}
			if (data.afternoonEnd) {
				document.getElementById('afternoon-end-time').value =
					data.afternoonEnd;
			}
			if (data.minimumTime) {
				document.getElementById('minimum-time').value =
					data.minimumTime;
			}

			// restore minimum break minutes
			if (typeof data.minimumBreakMinutes !== 'undefined') {
				document.getElementById('minimum-break-mins').value =
					data.minimumBreakMinutes;
			}

			// restore extra sessions if any
			if (
				Array.isArray(data.extraSessions) &&
				data.extraSessions.length > 0
			) {
				const container = document.getElementById(
					'extra-sessions-list',
				);
				if (container) container.innerHTML = '';
				data.extraSessions.forEach((s) => {
					addSessionRow(s.start || '', s.end || '');
				});
			}

			console.log('Data loaded from localStorage');
		} catch (error) {
			console.error('Error loading saved data:', error);
		}
	}
}

// Clear saved data
function clearSavedData() {
	localStorage.removeItem('workTimeData');
	console.log('Saved data cleared');
}

function formatDuration(hours) {
	const h = Math.floor(hours);
	const m = Math.round((hours - h) * 60);
	return `${h}h ${m}m`;
}

// Parse a time string into minutes since midnight.
// Accepts formats: "HH:MM", "H:MM", and "h:mm AM/PM" (with or without space).
function parseTimeToMinutes(timeStr) {
	if (!timeStr || typeof timeStr !== 'string') return NaN;
	const s = timeStr.trim();

	// Match formats with AM/PM
	const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
	if (ampmMatch) {
		let hours = parseInt(ampmMatch[1], 10);
		const minutes = parseInt(ampmMatch[2], 10);
		const ampm = ampmMatch[3].toLowerCase();
		if (ampm === 'am') {
			if (hours === 12) hours = 0;
		} else {
			if (hours !== 12) hours = (hours % 12) + 12;
		}
		return hours * 60 + minutes;
	}

	// Match 24-hour format HH:MM or H:MM
	const hhmmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
	if (hhmmMatch) {
		const hours = parseInt(hhmmMatch[1], 10);
		const minutes = parseInt(hhmmMatch[2], 10);
		return hours * 60 + minutes;
	}

	// Match plain hours like "8" or "8.5"
	const num = parseFloat(s.replace(',', '.'));
	if (!isNaN(num)) {
		return Math.round(num * 60);
	}

	return NaN;
}

// Parse the target/minimum time into decimal hours.
// Accepts "HH:MM", "H:MM", "h:mm AM/PM", or numeric hours ("8" or "8.5").
function parseTargetToHours(timeStr) {
	if (!timeStr) return NaN;
	// If contains ':' or AM/PM, parse as time and convert
	if (timeStr.indexOf(':') !== -1 || /am|pm/i.test(timeStr)) {
		const mins = parseTimeToMinutes(timeStr);
		return isNaN(mins) ? NaN : mins / 60;
	}
	// Otherwise try numeric hours
	const num = parseFloat(timeStr.replace(',', '.'));
	return isNaN(num) ? NaN : num;
}

// --- Dynamic extra sessions helpers ---
function addSessionRow(startVal = '', endVal = '') {
	const container = document.getElementById('extra-sessions-list');
	if (!container) return;
	const row = document.createElement('div');
	row.className = 'extra-session-row';
	row.style.display = 'flex';
	row.style.gap = '0.5rem';
	row.style.alignItems = 'center';

	const start = document.createElement('input');
	start.type = 'time';
	start.className = 'extra-start';
	start.value = startVal;
	start.addEventListener('change', () => {
		saveData();
		calculateWorkingTime();
	});

	const arrow = document.createElement('div');
	arrow.textContent = '→';
	arrow.style.padding = '0 0.25rem';

	const end = document.createElement('input');
	end.type = 'time';
	end.className = 'extra-end';
	end.value = endVal;
	end.addEventListener('change', () => {
		saveData();
		calculateWorkingTime();
	});

	const removeBtn = document.createElement('button');
	removeBtn.type = 'button';
	removeBtn.className = 'clear-data-btn remove-session-btn';
	removeBtn.textContent = 'Remove';
	removeBtn.addEventListener('click', () => {
		row.remove();
		saveData();
		calculateWorkingTime();
	});

	row.appendChild(start);
	row.appendChild(arrow);
	row.appendChild(end);
	row.appendChild(removeBtn);
	container.appendChild(row);
}

function getExtraSessionsFromDOM() {
	const rows = document.querySelectorAll(
		'#extra-sessions-list .extra-session-row',
	);
	return Array.from(rows).map((r) => {
		const s = (r.querySelector('.extra-start') || {}).value || '';
		const e = (r.querySelector('.extra-end') || {}).value || '';
		return { start: s, end: e };
	});
}

function updateSessionDuration(sessionId, duration) {
	const element = document.getElementById(sessionId);
	if (element) {
		if (duration < 0) {
			element.textContent = 'Duration: Invalid times';
			element.style.color = '#fca5a5';
		} else {
			element.textContent = `Duration: ${formatDuration(duration)}`;
			element.style.color = 'var(--text-secondary)';
		}
	}
}

function calculateWorkingTime() {
	const morningStartTime =
		document.getElementById('morning-start-time').value;
	const morningEndTime = document.getElementById('morning-end-time').value;
	const afternoonStartTime = document.getElementById(
		'afternoon-start-time',
	).value;
	const afternoonEndTime =
		document.getElementById('afternoon-end-time').value;
	const minimumTime = document.getElementById('minimum-time').value;
	const extraSessions = getExtraSessionsFromDOM();
	const rawSessions = [];
	if (morningStartTime || morningEndTime)
		rawSessions.push({ start: morningStartTime, end: morningEndTime });
	if (afternoonStartTime || afternoonEndTime)
		rawSessions.push({ start: afternoonStartTime, end: afternoonEndTime });
	extraSessions.forEach((s) => {
		if (s.start || s.end) rawSessions.push(s);
	});

	const resultCard = document.getElementById('result');
	const progressBar = document.getElementById('progress-bar');

	if (!rawSessions || rawSessions.length === 0 || !minimumTime) {
		resultCard.className = 'result-card';
		resultCard.innerHTML = `
			<div class="result-text">Enter your work times to see results</div>
		`;
		progressBar.style.width = '0%';
		return;
	}

	const sessionsParsed = rawSessions.map((s) => {
		return {
			startM: parseTimeToMinutes(s.start || ''),
			endM: parseTimeToMinutes(s.end || ''),
		};
	});
	const minTimeInHours = parseTargetToHours(minimumTime);

	if (
		sessionsParsed.some((s) => isNaN(s.startM) || isNaN(s.endM)) ||
		isNaN(minTimeInHours)
	) {
		resultCard.className = 'result-card error';
		resultCard.innerHTML = `
			<div class="result-text">One or more time fields are invalid. Please check your entries.</div>
		`;
		progressBar.style.width = '0%';
		return;
	}

	if (sessionsParsed.some((s) => s.endM <= s.startM)) {
		resultCard.className = 'result-card error';
		resultCard.innerHTML = `
			<div class="result-text">End times must be after start times. Please check your entries.</div>
		`;
		progressBar.style.width = '0%';
		return;
	}

	sessionsParsed.sort((a, b) => a.startM - b.startM);

	const totalWorkMins = sessionsParsed.reduce(
		(sum, s) => sum + (s.endM - s.startM),
		0,
	);
	const breaks = [];
	for (let i = 1; i < sessionsParsed.length; i++) {
		const prev = sessionsParsed[i - 1];
		const cur = sessionsParsed[i];
		const gap = Math.max(0, cur.startM - prev.endM);
		breaks.push(gap);
	}
	const minimumBreakMins =
		parseInt(document.getElementById('minimum-break-mins').value, 10) || 0;
	let penaltyMins = 0;
	breaks.forEach((g) => {
		if (g < minimumBreakMins) penaltyMins += minimumBreakMins - g;
	});

	const totalDiff = totalWorkMins / 60;
	const penaltyHours = penaltyMins / 60;
	const adjustedTotal = Math.max(0, totalDiff - penaltyHours);

	// Update first-two session duration displays for compatibility
	const firstDiff =
		sessionsParsed.length > 0
			? (sessionsParsed[0].endM - sessionsParsed[0].startM) / 60
			: 0;
	const secondDiff =
		sessionsParsed.length > 1
			? (sessionsParsed[1].endM - sessionsParsed[1].startM) / 60
			: 0;
	updateSessionDuration('morning-duration', firstDiff);
	updateSessionDuration('afternoon-duration', secondDiff);

	const formattedTotal = formatDuration(adjustedTotal);

	// Calculate progress percentage (use adjusted total after penalty)
	const progressPercent = Math.min(
		(adjustedTotal / minTimeInHours) * 100,
		100,
	);
	progressBar.style.width = `${progressPercent}%`;

	const targetDisplay = formatDuration(minTimeInHours);

	// Compare adjusted total (after penalty) with minimum
	// Show signed difference and explicit needed/achieved amounts
	const diff = adjustedTotal - minTimeInHours; // positive => overtime achieved, negative => needed
	const diffSign = diff >= 0 ? '+' : '-';
	const diffAbs = Math.abs(diff);
	const diffFormatted = formatDuration(diffAbs);

	if (diff >= 0) {
		// Overtime achieved
		resultCard.className = 'result-card success';
		resultCard.innerHTML = `
			<div class="result-text">
				<div style="font-size:1.25rem;margin-bottom:0.5rem;">Total: <span class="result-success">${formattedTotal}</span></div>
				<div>Overtime achieved: <span class="result-success">${formatDuration(diff)}</span></div>
				<div style="font-size:0.9rem;color:var(--text-muted);margin-top:0.5rem">Difference: ${diffSign}${diffFormatted}</div>
			</div>
		`;
	} else {
		// Below target — show how much is needed
		resultCard.className = 'result-card warning';
		resultCard.innerHTML = `
			<div class="result-text">
				<div style="font-size:1.25rem;margin-bottom:0.5rem;">Total: <span class="result-highlight">${formattedTotal}</span></div>
				<div>You need <span class="result-warning">${formatDuration(diffAbs)}</span> more to reach your target of ${targetDisplay}</div>
				${penaltyHours > 0 ? `<div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">Break penalty applied: ${formatDuration(penaltyHours)}</div>` : ''}
				<div style="font-size:0.9rem;color:var(--text-muted);margin-top:0.25rem">Difference: ${diffSign}${diffFormatted}</div>
			</div>
		`;
	}
}

