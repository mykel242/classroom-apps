#!/bin/sh
# Bump the build number and stamp the time; every app shows this at the bottom.
cd "$(dirname "$0")/.."
n=$(( $(sed -n 's/.*n:\([0-9]*\).*/\1/p' shared/version.js 2>/dev/null || echo 0) + 1 ))
when=$(TZ=America/New_York date '+%Y-%m-%d %H:%M')
echo "window.APP_VERSION={n:$n,built:'$when'};" > shared/version.js
for a in lap setup goals; do sed -i "s/^const BUILD=.*/const BUILD='$n';/" $a/sw.js; done
echo "build $n  $when"
