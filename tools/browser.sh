#!/bin/bash
# Run a browser test with the machine-wide lock, so only ONE headless Chrome runs at a time across all sessions and helpers
# (two at once have crashed this machine twice). Usage:  bash tools/browser.sh <command...>     e.g.  PORT=8772 bash tools/browser.sh bash tools/dev.sh check
exec flock /tmp/hkoi_browser.lock "$@"
