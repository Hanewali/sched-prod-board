#!/bin/sh
# Builds dist/ from app/: writes the git sha into the page and config.js from the saved session.
# usage: scripts/build.sh <receipts.json>
set -e
cd "$(dirname "$0")/.."
sha=$(git rev-parse --short=12 HEAD)
rm -rf dist && cp -R app dist
sed -i.bak "s/__BUILD_SHA__/$sha/g" dist/index.html && rm dist/index.html.bak
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
require("fs").writeFileSync("dist/config.js",
  `export const API = "https://hq.mega.dev/challenges/show-me-when/api";\nexport const SESSION = ${JSON.stringify(r.session)};\n`);
' "$1"
echo "built dist/ at $sha"
