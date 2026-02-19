# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/). Die Versionierung folgt **SemVer (Semantic Versioning)** wie bei der ioBroker-Entwicklung ([semver.org](https://semver.org/)).

## [Unreleased]

## [0.3.2] – 2026-02-19

### Hinzugefügt

- **PID-Regelung:** Vollständige Implementierung – Regelung mit Istwert (processVar), Sollwert (setpoint), P-/I-Anteil, Ausgang in %; Ausgang begrenzt auf (Ist/Soll)·100 %, bei Ist ≥ Soll volle 100 %
- **Übertemperatur-Schutz** für PID-Regeln: optionale States `tempLimitStateId` und `tempLimitMax` in Konfiguration, Flow und jsonConfig; Regel reduziert/aus bei Überschreitung
- **Regeln über Flow konfigurierbar:** Regeln (inkl. PID) können im Admin über den Flow-Tab bzw. verknüpfte Konfiguration eingestellt werden; Speichern auch ohne sendTo (Fallback per Socket setObject)
- **PID-Erklärung** im Flow und in der jsonConfig-Dokumentation
- **Admin-Tab „Regeln“:** Prominenter Hinweis mit Link zum Flow zur Regel-Konfiguration
- **PID-Simulation:** Im Adapter-Modus „Simulation“ – States Ueberschuss_W, Temperatur_C, Ausgang_Pct; Slider für Überschuss im Flow; Ablauf jede Sekunde
- **PID-Debug im Flow:** Bei aktivierter Simulation Button „PID-Logik anzeigen“, Modal mit Erklärung und Slider; Anzeige von processVar, setpoint, error, P, I, Ausgang in flowData
- **PID-Karte (Geräte):** Anzeige „Aktuelle Temperatur“ nur wenn ein Übertemperatur-State konfiguriert ist (`tempLimitStateId`); Adapter liest den State und liefert den Wert in den Flow-Daten

### Geändert

- **PID-Karte** unter Geräte breiter (min-width 320px, max-width 420px); Bezeichnung von „Übertemperatur“ zu „Aktuelle Temperatur“
- Rules: Lese-States auf `getForeignStateAsync` umgestellt; Adapter liest Simulations-State mit `getForeignStateAsync` für Kompatibilität

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
