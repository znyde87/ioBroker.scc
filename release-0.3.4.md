# Release 0.3.4 – Git & npm

Version **0.3.4** ist in `package.json` und `io-package.json` gesetzt.

## Schritte im Terminal (Projektordner)

```powershell
cd c:\dev\iobroker.scc

git add -A
git status
git commit -m "Release 0.3.4: Flow picker state ID normalization, troubleshooting doc"
git tag v0.3.4

git push origin main
git push origin v0.3.4

npm publish
```

Falls Lock-Dateien: `Remove-Item .git\index.lock, .git\refs\tags\v0.3.4.lock -ErrorAction SilentlyContinue`

**Inhalt 0.3.4:** Flow-Picker normalisiert State-IDs (strip `scc.0.`-Prefix), README Fehlerbehebung „has no existing object“.
