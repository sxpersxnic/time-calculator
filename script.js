// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('/service-worker.js')
			.then((registration) => {
				console.log(
					'Service Worker registered successfully:',
					registration.scope
				);
			})
			.catch((error) => {
				console.log('Service Worker registration failed:', error);
			});
	});
}

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
	'(prefers-color-scheme: dark)'
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
	inputs.forEach((input) => {
		input.addEventListener('change', calculateWorkingTime);
		input.addEventListener('input', calculateWorkingTime);
	});

	// Initial calculation
	calculateWorkingTime();
});

function formatDuration(hours) {
	const h = Math.floor(hours);
	const m = Math.round((hours - h) * 60);
	return `${h}h ${m}m`;
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
		'afternoon-start-time'
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

	const morningStart = new Date(`1970-01-01T${morningStartTime}:00`);
	const morningEnd = new Date(`1970-01-01T${morningEndTime}:00`);
	const afternoonStart = new Date(`1970-01-01T${afternoonStartTime}:00`);
	const afternoonEnd = new Date(`1970-01-01T${afternoonEndTime}:00`);
	const minTimeParts = minimumTime.split(':');
	const minTimeInHours =
		parseInt(minTimeParts[0]) + parseInt(minTimeParts[1]) / 60;

	const morningDiff = (morningEnd - morningStart) / (1000 * 60 * 60);
	const afternoonDiff = (afternoonEnd - afternoonStart) / (1000 * 60 * 60);
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
            Great job! You've exceeded your target by <span class="result-success">${formatDuration(
				overtime
			)}</span>
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
          You need <span class="result-warning">${formatDuration(
				hoursNeeded
			)}</span> more to reach your target of ${minTimeParts[0]}:${
			minTimeParts[1]
		}
        </div>
      </div>
    `;
	}
}

