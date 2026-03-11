#!/bin/bash
# Watches source files and prints a notice when changes are detected.
# Pair with the "Extensions Reloader" Chrome extension for one-click reloads,
# or use web-ext for fully automatic reloads in a separate Chrome profile.
#
# Setup:
#   brew install fswatch
#
# Usage:
#   chmod +x watch.sh && ./watch.sh

echo "Watching for changes... (Ctrl+C to stop)"

fswatch -o content.js background.js popup.js popup.html manifest.json styles.css config.js \
  | while read -r; do
    echo "[$(date +%H:%M:%S)] Files changed — reload the extension at chrome://extensions"
  done
