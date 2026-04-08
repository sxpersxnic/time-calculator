// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('/service-worker.js')
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

	const ms = parseTimeToMinutes(morningStart);
	const me = parseTimeToMinutes(morningEnd);
	const as = parseTimeToMinutes(afternoonStart);
	const ae = parseTimeToMinutes(afternoonEnd);
	const minHours = parseTargetToHours(minimumTime);

	if ([ms, me, as, ae].some((v) => isNaN(v)) || isNaN(minHours)) {
		alert('Cannot save entry: one or more time fields are invalid.');
		return;
	}

	const morningHours = (me - ms) / 60;
	const afternoonHours = (ae - as) / 60;
	const totalHours = morningHours + afternoonHours;
	const overtime = totalHours - minHours;

	const entry = {
		date: editingDate ? editingDate : new Date().toISOString(),
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
		},
	};

	const history = loadHistory();
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
		.map((h, idx) => {
			const date = new Date(h.date).toLocaleString();
			// Use data-date to identify the entry for deletion
			return (
				`<div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border-subtle);">` +
				`<div><strong>${date}</strong> — ${h.totalHours}h (OT: ${h.overtime >= 0 ? '+' : ''}${h.overtime}h)</div>` +
				`<div><button class="clear-data-btn delete-history-btn" data-date="${h.date}">Delete</button></div>` +
				`</div>`
			);
		})
		.join('');
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
				startEditEntry(edit.dataset.date);
				return;
			}
		});
	}

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

	const resultCard = document.getElementById('result');
	const progressBar = document.getElementById('progress-bar');

	if (
		!morningStartTime ||
		!morningEndTime ||
		!afternoonStartTime ||
		!afternoonEndTime ||
		!minimumTime
	) {
		resultCard.className = 'result-card';
		resultCard.innerHTML = `
			<div class="result-text">Enter your work times to see results</div>
		`;
		progressBar.style.width = '0%';
		return;
	}

	// Parse times into minutes to avoid Date parsing differences across browsers
	const morningStartMins = parseTimeToMinutes(morningStartTime);
	const morningEndMins = parseTimeToMinutes(morningEndTime);
	const afternoonStartMins = parseTimeToMinutes(afternoonStartTime);
	const afternoonEndMins = parseTimeToMinutes(afternoonEndTime);
	const minTimeInHours = parseTargetToHours(minimumTime);

	if (
		[
			morningStartMins,
			morningEndMins,
			afternoonStartMins,
			afternoonEndMins,
		].some((v) => isNaN(v)) ||
		isNaN(minTimeInHours)
	) {
		resultCard.className = 'result-card error';
		resultCard.innerHTML = `
			<div class="result-text">One or more time fields are invalid. Please check your entries.</div>
		`;
		progressBar.style.width = '0%';
		return;
	}

	const morningDiff = (morningEndMins - morningStartMins) / 60;
	const afternoonDiff = (afternoonEndMins - afternoonStartMins) / 60;
	const totalDiff = morningDiff + afternoonDiff;

	// Update session durations
	updateSessionDuration('morning-duration', morningDiff);
	updateSessionDuration('afternoon-duration', afternoonDiff);

	if (morningDiff < 0 || afternoonDiff < 0) {
		resultCard.className = 'result-card error';
		resultCard.innerHTML = `
			<div class="result-text">End times must be after start times. Please check your entries.</div>
		`;
		progressBar.style.width = '0%';
		return;
	}

	const formattedTotal = formatDuration(totalDiff);

	// Calculate progress percentage
	const progressPercent = Math.min((totalDiff / minTimeInHours) * 100, 100);
	progressBar.style.width = `${progressPercent}%`;

	const targetDisplay = formatDuration(minTimeInHours);

	if (totalDiff >= minTimeInHours) {
		// Met or exceeded minimum
		const overtime = totalDiff - minTimeInHours;

		resultCard.className = 'result-card success';
		if (overtime > 0.01) {
			resultCard.innerHTML = `
				<div class="result-text">
					<div style="font-size: 1.25rem; margin-bottom: 0.5rem;">
						Total: <span class="result-success">${formattedTotal}</span>
					</div>
					<div>
						Great job! You've exceeded your target by <span class="result-success">${formatDuration(overtime)}</span>
					</div>
				</div>
			`;
		} else {
			resultCard.innerHTML = `
				<div class="result-text">
					<div style="font-size: 1.25rem; margin-bottom: 0.5rem;">
						Total: <span class="result-success">${formattedTotal}</span>
					</div>
					<div>Perfect! You've met your target hours exactly.</div>
				</div>
			`;
		}
	} else {
		// Below minimum
		const hoursNeeded = minTimeInHours - totalDiff;

		resultCard.className = 'result-card warning';
		resultCard.innerHTML = `
			<div class="result-text">
				<div style="font-size: 1.25rem; margin-bottom: 0.5rem;">
					Total: <span class="result-highlight">${formattedTotal}</span>
				</div>
				<div>
					You need <span class="result-warning">${formatDuration(hoursNeeded)}</span> more to reach your target of ${targetDisplay}
				</div>
			</div>
		`;
	}
}

