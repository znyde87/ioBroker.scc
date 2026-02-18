# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/). Die Versionierung folgt **SemVer (Semantic Versioning)** wie bei der ioBroker-Entwicklung ([semver.org](https://semver.org/)).

## [Unreleased]

## [0.3.0] – 2025-02-17

### Hinzugefügt

- Flow-Tab: Haus-Diagramm mit Energiefluss (PV, Batterie, Netz, Last), animierte Linien mit Grün/Rot-Logik und Glow
- Flow-Tab: Live-Werte und Beschriftungen (Photovoltaik, Last, Batterie, Netz) mit farblicher Zustandsanzeige (grün/rot wie Linien)
- Option „Hausverbrauch aus Bilanz berechnen“ in der Konfiguration
- README und Dokumentation für GitHub (SCC = Self-Consumption Charging)

### Geändert

- Version in `io-package.json` an `package.json` angeglichen (0.3.0)
- Layout Flow-Tab: Haus links, Energie-/Leistungsverteilung Mitte, Quellen/Batterien/Geräte rechts; volle Breite, bessere Lesbarkeit

## [0.2.0]

- Konfiguration, Quellen, Batterien, Regeln, States (surplus, batteries, consumption, grid, autarky)

## [0.1.0]

- Erste Version (Grundgerüst)
