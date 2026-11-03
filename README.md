<img src="docs/logo.png" width="128" alt="Drawer Deck logo">

# Drawer Deck

Turn an old iPod touch, iPhone or PS Vita from your drawer into a Stream Deck-style control panel for your Mac. Nothing is installed on the device: a small server runs on the Mac and the device opens a page in its browser.

![Drawer Deck in landscape](docs/deck.png)

- **8 big keys** that open apps, websites or Shortcuts, with real app icons
- **Now playing** from Spotify or Apple Music, with cover art and playback controls
- **Live stats:** network speed, Mac and Bluetooth battery levels, RAM usage
- **RAM list:** tap the bottom bar to see the heaviest apps and quit one
- **Editor on the Mac:** assign keys, rename them and drag to reorder; the device updates by itself
- **No dependencies:** plain Node.js, and ES5 on the device so very old browsers work

The interface text is in Turkish.

## Tested on

| Device | Browser |
| --- | --- |
| iPod touch 4th gen | Safari, iOS 6.1.6 |
| PS Vita | Built-in browser, firmware 3.74 |

The Mac side needs macOS and Node.js 18 or newer.

## Install

```bash
git clone https://github.com/wcrow685/drawer-deck.git
cd drawer-deck
./install.sh
```

This installs `Drawer Deck.app` in `/Applications` and a LaunchAgent, so the server starts at every login and restarts if it crashes. Your settings live in `~/Library/Application Support/DrawerDeck` and are kept when you reinstall.

To try it without installing, run `node server.js`.

## Use

1. Open **Drawer Deck** on the Mac. A notification shows the address and the editor opens.
2. On the device, join the same Wi-Fi and open `http://<mac-ip>:8787`.
3. On iOS, use **Add to Home Screen** for full screen, and set Auto-Lock to Never.

macOS asks for permission the first time the server controls Spotify or Music.

## Key types

Use the editor, or edit `config.json` in the settings folder:

```json
{ "label": "Mail", "app": "Mail" }
{ "label": "News", "url": "https://example.com" }
{ "label": "Focus", "shortcut": "My Shortcut" }
```

## Security

**Only use this on a network you trust.** The deck page has no password, so anyone on the same network can open it, press keys and quit the apps in the RAM list. Keys can only run what you configured.

The editor only works from the Mac itself, and the server refuses requests that come from other websites.

## Uninstall

```bash
launchctl bootout gui/$(id -u)/io.github.wcrow685.drawerdeck
rm ~/Library/LaunchAgents/io.github.wcrow685.drawerdeck.plist
rm -rf "/Applications/Drawer Deck.app" ~/Library/Application\ Support/DrawerDeck
```

## Credits

Inspired by [OldPhoneDeck](https://github.com/GLAUCOMA82/OldPhoneDeck). Drawer Deck is a separate implementation and shares no code with it.

## License

[MIT](LICENSE)

---

## Türkçe özet

Çekmecedeki eski iPod touch, iPhone veya PS Vita'yı Mac için Stream Deck benzeri bir panele çevirir. Cihaza bir şey kurulmaz: Mac'te küçük bir sunucu çalışır, cihaz tarayıcısından sayfayı açar. Kurmak için `./install.sh` çalıştır, sonra aynı Wi-Fi'daki cihazda `http://<mac-ip>:8787` adresini aç. Deste sayfasında şifre yok, sadece güvendiğin ağlarda kullan.
