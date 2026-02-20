# Changelog

All notable changes to this project are documented here.  
Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning follows **SemVer** ([semver.org](https://semver.org/)), as used in ioBroker development.  
Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/). Die Versionierung folgt **SemVer** ([semver.org](https://semver.org/)).

---

## [Unreleased]

## [0.3.3] – 2026-02-20

### Changed / Geändert

- **EN:** All adapter log messages (info, warn, error, debug) and health-check texts are now in English; rule debug and pidDebug.reason also in English.  
  **DE:** Alle Adapter-Logs (info, warn, error, debug) und Health-Check-Texte sind jetzt auf Englisch; Regel-Debug und pidDebug.reason ebenfalls.
- **EN:** Main README is in English; German version moved to `doc/de/README.md`; `admin/widgets/README.md` in English.  
  **DE:** Haupt-README auf Englisch; deutsche Fassung nach `doc/de/README.md` verschoben; `admin/widgets/README.md` auf Englisch.
- **EN:** Repository checker fixes (Issue #9): io-package.json – `common.news` as object (version-keyed), `licenseInformation`, `tier`, `globalDependencies` (admin), `adminTab.name` as object; removed deprecated `title`, `license`, `licenseUrl`, `languages`; admin jsonConfig: size attributes (xs, md, lg, xl) for tab_general fields; README Changelog section; `.commitinfo` in `.gitignore`.  
  **DE:** Repository-Checker-Anpassungen (Issue #9): io-package.json – `common.news` als Objekt, `licenseInformation`, `tier`, `globalDependencies`, `adminTab.name` als Objekt; veraltete Felder entfernt; Admin-Config Größenattribute; Changelog-Abschnitt in README; `.commitinfo` in `.gitignore`.

---

## [0.3.2] – 2026-02-19

### Added / Hinzugefügt

- **EN:** PID control: full implementation with process variable, setpoint, P/I terms, output in %; output capped; overtemperature protection for PID rules; rules configurable via Flow tab; PID simulation and debug in Flow.  
  **DE:** PID-Regelung: Vollständige Implementierung mit Istwert, Sollwert, P-/I-Anteil, Ausgang in %; Übertemperatur-Schutz; Regeln über Flow konfigurierbar; PID-Simulation und -Debug im Flow.
- **EN:** Overtemperature protection: optional states `tempLimitStateId` and `tempLimitMax` in config, Flow and jsonConfig.  
  **DE:** Übertemperatur-Schutz: optionale States `tempLimitStateId` und `tempLimitMax` in Konfiguration, Flow und jsonConfig.
- **EN:** PID device card shows “Current temperature” when overtemperature state is configured.  
  **DE:** PID-Karte (Geräte): Anzeige „Aktuelle Temperatur“, wenn Übertemperatur-State konfiguriert ist.

### Changed / Geändert

- **EN:** PID card under devices wider (min 320px, max 420px); label “Overtemperature” → “Current temperature”; rules use `getForeignStateAsync`.  
  **DE:** PID-Karte unter Geräte breiter; Bezeichnung „Übertemperatur“ → „Aktuelle Temperatur“; Rules nutzen `getForeignStateAsync`.

---

## [0.3.0] – 2025-02-17

### Added / Hinzugefügt

- **EN:** Flow tab: house diagram with energy flow (PV, battery, grid, load), animated lines, live values; option “Compute consumption from balance”; README and docs for GitHub.  
  **DE:** Flow-Tab: Haus-Diagramm mit Energiefluss (PV, Batterie, Netz, Last), animierte Linien, Live-Werte; Option „Hausverbrauch aus Bilanz berechnen“; README und Dokumentation.

### Changed / Geändert

- **EN:** Version synced in io-package.json and package.json; Flow tab layout: house left, distribution center, sources/batteries/devices right.  
  **DE:** Version in io-package.json und package.json angeglichen; Layout Flow-Tab: Haus links, Verteilung Mitte, Quellen/Batterien/Geräte rechts.

---

## [0.2.0]

- **EN:** Configuration, sources, batteries, rules, states (surplus, batteries, consumption, grid, autarky).  
  **DE:** Konfiguration, Quellen, Batterien, Regeln, States (surplus, batteries, consumption, grid, autarky).

---

## [0.1.0]

- **EN:** Initial version (scaffold).  
  **DE:** Erste Version (Grundgerüst).
