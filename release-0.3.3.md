# Release 0.3.3 – GitHub & npm

Version **0.3.3** ist in `package.json` und `io-package.json` gesetzt. Führe diese Schritte **in deinem Terminal** im Projektordner aus.

## 1. Git Lock entfernen (falls nötig)

Falls `git add` meldet: "Unable to create '.git/index.lock'":

```powershell
Remove-Item c:\dev\iobroker.scc\.git\index.lock -ErrorAction SilentlyContinue
```

## 2. Commit & Tag

```powershell
cd c:\dev\iobroker.scc

git add -A
git status
git commit -m "Release 0.3.3: English logs/README, repo checker fixes, bilingual changelog"
git tag v0.3.3
```

## 3. Zu GitHub pushen

```powershell
git push origin main
git push origin v0.3.3
```

## 4. Auf npm veröffentlichen

Erst einloggen (einmalig), wenn noch nicht geschehen:

```powershell
npm login
```

Dann publishen:

```powershell
cd c:\dev\iobroker.scc
npm publish
```

Falls du den Adapter nur als **öffentlichen** Scope publishen willst und es Fehler gibt, probiere:

```powershell
npm publish --access public
```

---

**Zusammenfassung 0.3.3:** Log-Meldungen und README auf Englisch, deutsche README in `doc/de/`, Repository-Checker-Anpassungen (io-package, jsonConfig, Changelog), Changelog zweisprachig (EN/DE).
