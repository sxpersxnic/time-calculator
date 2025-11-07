# PWA Testing Guide

## How to Test the Working Time Calculator PWA

### Quick Start

1. **Start a local server**

    ```bash
    # Using Python (if available)
    python3 -m http.server 8000

    # Or using Node.js (if available)
    npx http-server -p 8000

    # Or using PHP (if available)
    php -S localhost:8000
    ```

2. **Open in browser**
    - Navigate to `http://localhost:8000`
    - Or if deployed: `https://sxpersxnic.github.io/time-calculator`

### Testing PWA Features

#### 1. Test Service Worker

1. Open Developer Tools (F12)
2. Go to Application tab (Chrome/Edge) or Storage tab (Firefox)
3. Check "Service Workers" section
4. You should see the service worker registered and running

#### 2. Test Offline Functionality

1. Open the app in your browser
2. Use the app normally
3. Open DevTools → Network tab
4. Enable "Offline" mode
5. Refresh the page
6. The app should still work!

#### 3. Test Install Functionality

**On Desktop (Chrome/Edge):**

1. Look for the install icon (⊕) in the address bar
2. Or click the "Install App" button at the bottom
3. Click "Install"
4. The app opens in a standalone window

**On Mobile (Chrome/Safari):**

1. Tap the browser menu (⋮ or share icon)
2. Select "Add to Home Screen" or "Install App"
3. The app will be added to your home screen

**On Mobile (Auto-prompt):**

1. Simply look for the "Install App" button
2. Tap it and confirm installation

#### 4. Test Caching

1. Open DevTools → Application → Cache Storage
2. Look for `time-calculator-v1`
3. All app resources should be listed:
    - index.html
    - styles.css
    - script.js
    - manifest.json
    - icon-192.svg
    - icon-512.svg

#### 5. Test Theme Persistence

1. Toggle between light/dark mode
2. Refresh the page
3. Your theme preference should be remembered

### PWA Checklist

✅ Service Worker registered successfully
✅ Manifest.json properly configured
✅ Icons (SVG) available in correct sizes
✅ Works offline after first visit
✅ Installable on desktop and mobile
✅ Responsive design (mobile-first)
✅ Theme toggle with localStorage
✅ Real-time calculations
✅ Visual feedback with progress bar

### Troubleshooting

**Service Worker not registering?**

-   Make sure you're using HTTPS or localhost
-   Check browser console for errors
-   Clear cache and reload

**Install prompt not showing?**

-   Only works on HTTPS or localhost
-   User must interact with the page first
-   May not show if already installed
-   Some browsers have engagement requirements

**App not working offline?**

-   Visit the app online first
-   Service worker needs to cache resources
-   Check cache storage in DevTools

**Icons not showing?**

-   Check that SVG files are in the root directory
-   Verify manifest.json paths are correct
-   Clear cache and reinstall

### Browser-Specific Notes

**Chrome/Edge:**

-   Best PWA support
-   Shows install prompt automatically
-   Supports all features

**Safari (iOS/macOS):**

-   Limited PWA support
-   Manual "Add to Home Screen" required
-   Some service worker limitations

**Firefox:**

-   Good PWA support
-   May require manual installation
-   Full service worker support

### Performance Tips

1. **First Load:**

    - Service worker installs
    - Resources are cached
    - Subsequent loads are faster

2. **Updates:**

    - Change `CACHE_NAME` in service-worker.js
    - Old caches are automatically deleted
    - Users get updates on next visit

3. **Cache Strategy:**
    - Cache-first for static resources
    - Network-first for dynamic content
    - Offline fallback always available

### Deployment

When deploying to GitHub Pages or other hosting:

1. Ensure all paths in manifest.json are correct
2. Test on HTTPS (required for service workers)
3. Verify icons are accessible
4. Check service worker scope matches deployment path
5. Test installation on multiple devices

### Additional Resources

-   [PWA Checklist](https://web.dev/pwa-checklist/)
-   [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
-   [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
-   [Workbox](https://developers.google.com/web/tools/workbox) (for advanced caching)

---

**Enjoy your Progressive Web App! 🎉**

