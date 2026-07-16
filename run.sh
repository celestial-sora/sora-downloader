#!/bin/bash

echo "=============================================="
echo "       Starting Sora Downloader..."
echo "=============================================="
echo ""

# Open local browser after 3 seconds in a background process
echo "[1/2] Preparing browser redirection to http://localhost:3000..."
(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:3000"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
  else
    echo "Could not detect browser launcher. Please open http://localhost:3000 manually."
  fi
) &

# Start Next.js development server in foreground
echo "[2/2] Launching Next.js development server..."
echo ""
npm run dev
