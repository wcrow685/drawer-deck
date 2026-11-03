#!/bin/bash
# Installs Drawer Deck as /Applications/Drawer Deck.app and starts it at login.
# Re-run after changing the code. Your config lives in ~/Library/Application Support/DrawerDeck
# and is never overwritten.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/Applications/Drawer Deck.app"
DATA="$HOME/Library/Application Support/DrawerDeck"
LABEL="io.github.wcrow685.drawerdeck"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"
DOMAIN="gui/$(id -u)"

echo "-> Building $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$DATA"
cp -R "$SRC/server.js" "$SRC/config.example.json" "$SRC/public" "$APP/Contents/Resources/"

# icon
TMP="$(mktemp -d)"
osascript -l JavaScript "$SRC/make-icon.js" "$TMP/icon.png" >/dev/null
mkdir "$TMP/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/icon.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$TMP"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Drawer Deck</string>
  <key>CFBundleDisplayName</key><string>Drawer Deck</string>
  <key>CFBundleIdentifier</key><string>$LABEL</string>
  <key>CFBundleExecutable</key><string>DrawerDeck</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# Clicking the app: make sure the server runs, then show where to point the iPod.
cat > "$APP/Contents/MacOS/DrawerDeck" <<SH
#!/bin/bash
launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || launchctl bootstrap "$DOMAIN" "$AGENT"
IFACE=\$(route -n get default 2>/dev/null | awk '/interface:/{print \$2}')
IP=\$(ipconfig getifaddr "\$IFACE" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)
osascript -e "display notification \"iPod'da aç: http://\$IP:8787\" with title \"Drawer Deck çalışıyor\""
sleep 1
open "http://localhost:8787/edit"
SH
chmod +x "$APP/Contents/MacOS/DrawerDeck"
touch "$APP"

echo "-> Writing $AGENT"
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$APP/Contents/Resources/server.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DECK_DATA</key><string>$DATA</string>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/DrawerDeck.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/DrawerDeck.log</string>
</dict>
</plist>
PLIST

echo "-> (Re)starting the server"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
# bootout returns before the old job is gone; bootstrapping too early fails with error 5
for _ in $(seq 1 50); do
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
  sleep 0.2
done
launchctl bootstrap "$DOMAIN" "$AGENT"
echo "Done. Drawer Deck runs now and at every login."
