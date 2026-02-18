# PV-Überschuss-Steuerung (ioBroker Adapter) – Konzept

## Ziel

Ein ioBroker-Adapter, der:
- **PV-Überschuss** aus einer oder mehreren Quellen (z. B. Shell Pro 3 EM, Wechselrichter, andere Zähler) berechnet,
- **Batterien (SoC)** einbindet – mehrere möglich – mit Priorität: **zuerst laden, dann Überschuss für Geräte, Rest ins Netz**,
- **Geräte/Steckdosen** (und beliebige Schalt-Ausgänge) abhängig vom **nach Batterie-Ladung verbleibenden** Überschuss schaltet,
- **Shell Pro 3 EM** als typische Quelle optimal unterstützt, aber **beliebige Datenpunkte** als Quelle erlaubt,
- **mehrere Wechselrichter/Quellen** und **mehrere Speicher** kombiniert,
- den Energiefluss **grafisch** darstellt (Admin-UI + nutzbare States für VIS/Dashboards).

---

## 0. Datenmodell: Quellen, Batterien, Verbraucher, Verbrauch, Einspeisung

Überblick über alle relevanten Größen und wie sie zusammenhängen:

| Begriff | Beschreibung | Woher / Adapter |
|--------|----------------|------------------|
| **Quellen** | Eingangsdatenpunkte für die Überschuss-Berechnung. Jede Quelle hat einen **Typ**. | Konfiguration: Tabelle „Quellen“ (State-ID + Typ). |
| **Quell-Typen** | **Erzeugung** (z. B. PV-Leistung), **Verbrauch** (Gesamtverbrauch, wird abgezogen), **Netzleistung** (am Zähler: negativ = Einspeisung), **Einspeisung** (direkter Einspeise-Datenpunkt). | Pro Quelle wählbar (oder global). |
| **Brutto-Überschuss** | Aus Quellen berechnet: z. B. Erzeugung − Verbrauch oder max(0, −Netzleistung). | State `surplus.powerW`. |
| **Batterien** | Speicher mit SoC (Ladezustand), optional **Ladeleistung** und **Entladeleistung** (Datenpunkte). | Konfiguration: SoC-State, optional Lade-/Entlade-State. |
| **Für Batterie reserviert** | Leistung, die „für Ladung“ zurückgehalten wird (fix oder aus Ladeleistung-State). | State `batteries.powerReservedW`. |
| **Für Verbraucher verfügbar** | Brutto − reserviert; das ist die Basis für die Schalt-Regeln. | State `surplus.availableForDevicesW`. |
| **Verbraucher** | Die Geräte/Steckdosen, die der Adapter schaltet (Regeln). | Konfiguration: Regeln mit Ziel-State. |
| **Verbrauch gesamt** | Haus-Gesamtverbrauch (Leistung). Kann als **Quelle** vom Typ „Verbrauch“ eingetragen werden (geht in Brutto ein) oder nur zur Anzeige. | Optional eigener State `consumption.totalW` (Summe aus Verbrauch-Quellen) oder ein Datenpunkt. |
| **Einspeisung** | Leistung ins Netz. Entweder aus einer **Quelle** vom Typ „Einspeisung“ oder berechnet als „Rest“ (Brutto − Reserviert − Verfügbar). | State `surplus.feedInW` (berechnet oder aus Quelle). |

**Fluss (vereinfacht):**

```
Quellen (Erzeugung, Verbrauch, Netz, Einspeisung)
    → Brutto-Überschuss (surplus.powerW)
    → [Batterien: SoC, Ladeleistung / Entladeleistung]
    → Für Batterie reserviert (batteries.powerReservedW)
    → Für Verbraucher verfügbar (surplus.availableForDevicesW)
    → Regeln schalten Verbraucher (rules.*.state)
    → Rest → Einspeisung (surplus.feedInW) bzw. Verbrauch gesamt (Anzeige)
```

- **Batterien**: Pro Batterie werden **SoC** (%), optional **Ladeleistung** (W) und **Entladeleistung** (W) unterstützt. Ladeleistung reduziert den „für Verbraucher verfügbar“-Anteil; Entladeleistung wird zur verfügbaren Leistung addiert (Batterie liefert mit).
- **Verbrauch gesamt**: Wenn Quellen vom Typ „Verbrauch“ konfiguriert sind, kann der Adapter die Summe als `consumption.totalW` ausgeben (Anzeige/VIS). Brutto = Erzeugung + Einspeisung − Verbrauch (je nach Konfiguration).
- **Einspeisung**: Entweder ein Datenpunkt vom Typ „Einspeisung“ als Quelle, oder berechnet: `feedInW = max(0, Brutto − Reserviert − Verfügbar)` (theoretischer Rest ins Netz).

---

## 1. Kernlogik: Was ist „PV-Überschuss“?

- **Variante A – Netzeinspeisung (empfohlen für Shell Pro 3 EM)**  
  Ein Zähler am Netzanschluss (z. B. Shelly Pro 3 EM) liefert die **Leistung am Netz**:
  - **Negativ** = Einspeisung (Überschuss),
  - **Positiv** = Bezug.
  - Überschuss (für die Logik) = `max(0, -Power_Netz)` oder Schwellwert-basiert.

- **Variante B – Erzeugung minus Verbrauch**  
  Getrennte Quellen:
  - Summe **Erzeugung** (z. B. Wechselrichter 1 + Wechselrichter 2),
  - minus **Gesamtverbrauch** (optional, z. B. anderer Zähler).
  - Überschuss = `max(0, Erzeugung - Verbrauch)`.

- **Variante C – Direkter „Überschuss“-Datenpunkt**  
  Manche Systeme liefern bereits einen State „Einspeiseleistung“ oder „Überschuss“.  
  Dieser kann als **einzige Quelle** oder in Kombination mit anderen verwendet werden.

Der Adapter sollte **A und B (und C)** abdecken, indem Quellen **konfigurierbar** und **kombinierbar** sind.

---

## 2. Quellen-Konfiguration (flexibel, mehrere Quellen)

### 2.1 Quell-Typen

| Typ              | Beschreibung                    | Beispiel (Shell Pro 3 EM)        | Beitrag zur Berechnung   |
|------------------|----------------------------------|-----------------------------------|---------------------------|
| **Netzleistung** | Leistung am Netz (negativ = Einspeisung) | `shelly.0.ShellyPro3EM-xxx.Power` (Total) | Überschuss = max(0, -Wert) |
| **Erzeugung**    | PV-Leistung (positiv)           | Wechselrichter-Adapter            | +Wert                     |
| **Verbrauch**    | Gesamtverbrauch (positiv)       | Zähler Total                      | -Wert                     |
| **Einspeisung**  | Bereits „Einspeiseleistung“     | Manche WR-Adapter                 | +Wert                     |

- Jede **Quelle** = ein ioBroker-Datenpunkt (State-ID) + **Typ** + optional **Gewichtung** (Faktor).
- **Mehrere Quellen** werden nach Typ zusammengefasst:
  - Überschuss = Summe(Erzeugung + Einspeisung) − Summe(Verbrauch)  
    **oder** bei Nutzung nur „Netzleistung“: Überschuss = max(0, −Netzleistung).
- Optional: **Nur eine Quelle** vom Typ „Netzleistung“ → dann direkt `max(0, -Wert)` ohne weitere Summen.

### 2.2 Wo was eintragen? (Shelly Hauptanschluss, Verbraucher)

| Was du hast | Wo eintragen | Erklärung |
|-------------|--------------|-----------|
| **Shelly (oder anderer Zähler) am Hauptanschluss** – ein Wert: positiv = Bezug, negativ = Einspeisung | Nur in **„Netzleistung (negativ = Einspeisung)“** | Das ist die **Netzleistung** am Hausanschluss. Der Adapter leitet daraus Überschuss, Netzbezug und Netzeinspeisung ab. **Nicht** in „Verbrauch“ eintragen. |
| **Hausverbrauch gesamt** – ein Datenpunkt für den Gesamtverbrauch des Hauses | In **„Hausverbrauch gesamt (ein Datenpunkt)“** | Wenn gesetzt: Dieser Wert wird für `consumption.totalW` und die Überschuss-Berechnung genutzt. Die Verbraucher-Zähler (Büro, Schuppen, …) sind dann **Teile davon** – sie werden **nicht** addiert, nur für Anzeige (Flow-Tab). |
| **Mehrere Verbraucher, die du einzeln zählst** (z. B. eigene Zähler pro Bereich) | In **„Verbrauch (Einzelzähler …)“** | **Ohne** Hausverbrauch gesamt: Die **Summe** wird als Hausverbrauch genutzt. **Mit** Hausverbrauch gesamt: Nur Anzeige (Teile des Gesamtverbrauchs), keine Addition. Nicht den Shelly vom Hauptanschluss eintragen. |
| **PV-Leistung** (Wechselrichter, Erzeugungszähler) | In **„Erzeugung (z. B. PV-Leistung)“** | Geht in Brutto-Überschuss und PV-Quellen gesamt ein. |
| **Direkter Einspeise-Datenpunkt** (falls nicht über Netzleistung) | In **„Einspeisung (direkter Datenpunkt)“** | Optional. |

- **Kurz:** Shelly Hauptanschluss → **eine** Zeile in **Netzleistung**. Hausverbrauch gesamt = ein Zähler für den Gesamtverbrauch; wenn gesetzt, sind die Verbraucher-Zähler Teile davon (nur Anzeige). Ohne Hausverbrauch gesamt: Verbraucher-Tabelle = Summe = Hausverbrauch.

### 2.3 Mehrere Wechselrichter

- Pro Wechselrichter eine Quelle vom Typ **„Erzeugung“** (oder „Einspeisung“, je nach WR).
- Adapter summiert alle Erzeugungs-Quellen.
- Optional: Eine **Verbrauchs**-Quelle abziehen (z. B. anderer Zähler oder Shell Pro 3 EM als Verbrauch nur wenn positiv).

### 2.4 Einheiten-Erkennung und Normalisierung (W, kW, Wh, kWh, …)

Damit Quellen und Batterien mit unterschiedlichen Einheiten (W, kW, Wh, kWh, % usw.) korrekt zusammengerechnet werden, erkennt der Adapter die Einheit und rechnet intern auf feste Basiseinheiten um.

#### Automatische Erkennung

- Beim Anlegen einer **Quelle** oder **Batterie** liest der Adapter das **State-Objekt** (`getObject(id)`) und wertet **`common.unit`** aus.
- Unterstützte Einheiten werden erkannt und einem **Normfaktor** zugeordnet (siehe Tabelle).
- **Falls keine Unit** gesetzt ist oder die Unit unbekannt ist: **manueller Override** in der Konfiguration (Dropdown „Einheit“) oder Heuristik (z. B. typische Wertebereiche: Wert &gt; 1000 oft kW, 0–100 oft %).

#### Leistung (Quellen, Ladeleistung) → intern immer **Watt (W)**

| Erkannte Unit | Typ        | Normfaktor → W      | Anmerkung |
|---------------|------------|----------------------|-----------|
| `W`, `w`      | Leistung   | 1                    | direkt    |
| `kW`, `kw`    | Leistung   | 1000                 | × 1000    |
| `Wh`, `wh`    | Energie    | **nicht** für Leistung nutzbar; ggf. Differenz pro Zeit (später) |
| `kWh`, `kwh`  | Energie    | wie Wh               |
| (leer/unbekannt) | –       | 1 (Annahme: W) oder Benutzer wählt manuell |

- **Energie (Wh/kWh)** ist keine Leistung; für Überschuss brauchen wir **Leistung (W)**. States mit Unit Wh/kWh werden entweder abgelehnt (Hinweis in der UI) oder nur mit **manueller** Zuordnung „als Leistung interpretieren“ (z. B. bei Zählern, die nur Wh liefern und man per Skript W ableitet).
- Optional: Adapter unterstützt **Wh/kWh** nur für **Batterie-Kapazität** (Anzeige „noch X kWh bis Ziel“), nicht für Quellen-Summen.

#### SoC und Anteile → intern immer **Prozent (%)**

| Erkannte Unit | Normfaktor → % |
|---------------|-----------------|
| `%`, `percent` | 1              |
| 0–1 (Dezimal) | × 100 (falls Werte typisch 0…1) |
| (leer/unbekannt) | 1 (Annahme: %) oder manuell |

- Wenn Werte im State typischerweise **0–1** sind (z. B. 0.85 = 85 %), kann die Erkennung „Dezimal“ wählen und mit 100 multiplizieren (oder Nutzer wählt „0–1“ in der Konfiguration).

#### Konfiguration pro Quelle / Batterie

- **Auto**: Adapter nutzt `common.unit` (und ggf. Heuristik).
- **Manuell**: Dropdown „Einheit“ – W, kW, %, Dezimal (0–1) – überschreibt Auto.
- Nach Erkennung/Override speichert der Adapter **einen internen Normfaktor** und wendet ihn bei jedem Wert an: `valueNormalized = value * factorToW` bzw. `valueNormalized = value * factorToPercent`.

#### Ausgabe des Adapters

- Alle **berechneten Leistungs-States** (z. B. `surplus.powerW`, `availableForDevicesW`) haben **fest** die Unit **`W`** in `common.unit`.
- SoC-States **`%`**. So sind VIS/Dashboards und Regeln immer in denselben Einheiten.

#### Kurzablauf

1. Beim **Laden der Konfiguration** (oder beim Hinzufügen einer Quelle/Batterie): `getObject(stateId)` → `common.unit` auslesen.
2. **Zuordnung** zu Normfaktor (W oder %) aus Tabelle; bei Unklarheit „manuell“ vorschlagen.
3. Bei **jeder Wertänderung**: `valueNormalized = value * factor` vor Summenbildung und Schwellwertvergleichen.
4. Schwellwerte in der **Konfiguration** (z. B. „Schwellwert EIN 500“) sind immer in **W** bzw. **%** – Nutzer gibt bewusst W bzw. % ein.

---

## 3. Berechneter Überschuss (States)

### 3.0 Alle States mit Überschuss-Logik (Übersicht)

Alle vom Adapter bereitgestellten States, geordnet nach Funktion:

**Netz**

| State | Typ | Beschreibung / Logik |
|-------|-----|------------------------|
| `grid.consumptionW` | number | **Netzbezug** (W). Aus Grid-Quelle: `max(0, Netzleistung)`; positiv = Bezug aus dem Netz. |
| `grid.feedInW` | number | **Netzeinspeisung** (W). Aus Grid-Quelle: `max(0, -Netzleistung)`; Leistung ins Netz. |

**Batterien**

| State | Typ | Beschreibung / Logik |
|-------|-----|------------------------|
| `batteries.<id>.soc` | number | **Batterie SoC** (%) – aus konfiguriertem SoC-Datenpunkt. |
| `batteries.<id>.chargePowerW` | number | **Batterie Ladeleistung** (W) – aus konfiguriertem Lade-Datenpunkt; geht in Reservierung ein. |
| `batteries.<id>.dischargePowerW` | number | **Batterie Entladeleistung** (W) – aus konfiguriertem Entlade-Datenpunkt; erhöht „für Geräte verfügbar“. |
| `batteries.<id>.needsCharge` | boolean | SoC < Ziel-SoC. |
| `batteries.<id>.targetSoc` | number | Konfiguriertes Ziel-SoC (%). |
| `batteries.allCharged` | boolean | Alle Batterien ≥ Ziel-SoC. |
| `batteries.powerReservedW` | number | Für Batterieladung reservierte Leistung (W). |

**Hausverbrauch**

| State | Typ | Beschreibung / Logik |
|-------|-----|------------------------|
| `consumption.totalW` | number | **Hausverbrauch insgesamt** (W) – Summe aller Quellen vom Typ „Verbrauch“. |

**PV- und Gerätequellen**

| State | Typ | Beschreibung / Logik |
|-------|-----|------------------------|
| `generation.totalW` | number | **PV-Quellen gesamt** (W) – Summe aller Quellen vom Typ „Erzeugung“. |
| `sources.<sid>.lastValue` | number | Letzter Wert pro konfigurierter Quelle (W, normalisiert). |
| `rules.<rid>.state` | boolean | **Gerätequellen** – aktuell ein/aus pro Regel (geschaltetes Gerät). |
| `rules.<rid>.lastSwitch` | string | Zeitpunkt der letzten Schaltung. |

**Überschuss und Autarkie**

| State | Typ | Beschreibung / Logik |
|-------|-----|------------------------|
| `surplus.powerW` | number | **Brutto-Überschuss** (W): bei Grid-Quelle `max(0, -Netz)`, sonst `max(0, Erzeugung + Einspeisung − Verbrauch)`. |
| `surplus.active` | boolean | Brutto-Überschuss ≥ Schwellwert. |
| `surplus.availableForDevicesW` | number | **Für Verbraucher verfügbar** (W) = `Brutto − Lade-Reserve + Entladeleistung`. Basis für Schalt-Regeln. |
| `surplus.availableForDevices` | boolean | Verfügbar ≥ Schwellwert. |
| `surplus.feedInW` | number | Einspeisung (W) – aus Einspeise-Quelle oder Grid oder berechnet. |
| `surplus.sourcesOk` | boolean | Mindestens eine Quelle liefert gültigen Wert. |
| `autarky.percent` | number | **Autarkie** (%) = `(1 − Netzbezug / Hausverbrauch) × 100` (0–100); bei Verbrauch 0: 100 % wenn kein Bezug, sonst 0 %. |

**Formel „für Verbraucher verfügbar“ (Kern der Überschuss-Logik):**

```
availableForDevicesW = max(0, surplus.powerW − batteries.powerReservedW + Σ Entladeleistung)
```

- Erst wird der **Brutto-Überschuss** aus Quellen berechnet.
- Davon wird die **für Batterien reservierte** Leistung (Ladeleistung oder Pauschale) abgezogen.
- Die **Entladeleistung** der Batterien wird addiert (Batterie liefert mit → mehr für Geräte verfügbar).

---

Vom Adapter bereitgestellte States (Beispiele):

| State (Beispiel)     | Typ   | Beschreibung                          |
|----------------------|-------|----------------------------------------|
| `surplus.powerW`     | number| **Brutto-**Überschuss in Watt (vor Batterie-Logik) |
| `surplus.active`     | boolean | Brutto-Überschuss > Schwellwert „Überschuss an“ |
| `surplus.sourcesOk`  | boolean | Alle konfigurierten Quellen liefern gültige Werte |
| `surplus.availableForDevicesW` | number | **Für Verbraucher nutzbar** (nach Batterie-Priorität, siehe Abschnitt 3.1) |
| `surplus.availableForDevices` | boolean | Nutzbarer Überschuss > Schwellwert (für Schalt-Regeln) |

- Schwellwert „Überschuss an“ global konfigurierbar (z. B. 50 W).

---

## 3.1 Batterien (SoC) und Prioritätenlogik

### Konfigurierbare Reihenfolge: Wer bekommt zuerst den Überschuss?

Der Adapter unterstützt **zwei Prioritäten**, damit die Logik zu unterschiedlichen Anlagen passt (Hybrid-Speicher, reine Überschuss-Steckdosen, WP etc.):

| Einstellung | Bedeutung | Wann sinnvoll? |
|-------------|-----------|----------------|
| **Batterie zuerst** (Standard) | Zuerst wird für die Batterie „reserviert“ (Ladeleistung oder Pauschale), der **Rest** ist für Geräte verfügbar. Rest → Netz. | Typisch bei Speichersystemen: Speicher füllen, danach WP/Steckdosen, was übrig ist geht ins Netz. |
| **Geräte zuerst** | Der **gesamte** Brutto-Überschuss gilt als „für Geräte verfügbar“ (keine Reservierung für Batterie). Die Batterie lädt physisch mit dem, was der Wechselrichter übrig lässt. | Wenn WP/Steckdosen wichtiger sind als schnelles Laden, oder wenn der WR die Aufteilung ohnehin selbst macht. |

- **Hausverbrauch**: Der **Brutto-Überschuss** ist je nach Quelle bereits „nach Hausverbrauch“ (z. B. bei Netz-Quelle: negativ = Einspeisung) oder wird aus Erzeugung − Verbrauch gebildet. Die Priorität betrifft nur: **Batterie** vs. **vom Adapter geschaltete Geräte**.
- Konfiguration: Im Admin unter **Allgemein** → **Überschuss-Priorität** wählen.

### Grundprinzip (bei „Batterie zuerst“)

```
PV-Erzeugung / Netzeinspeisung
        │
        ▼
   Brutto-Überschuss
        │
        ├──► [1] Batterien laden (wenn SoC < Ziel-SoC)
        │         → verbleibender Überschuss
        ├──► [2] Verbraucher (Steckdosen, WP, …) schalten
        │         → nach Schwellwerten
        └──► [3] Rest → Einspeisung ins Netz
```

Bei **„Geräte zuerst“** wird Schritt [1] bei der Berechnung von „für Verbraucher verfügbar“ nicht abgezogen; die Geräte sehen den vollen Überschuss, die Batterie bekommt in der Realität, was der WR übrig lässt.

### Batterie-Konfiguration (pro Speicher)

- **SoC-State**: ioBroker-Datenpunkt für Ladezustand in **%** (0–100).
- **Ziel-SoC (Ladeziel)**: z. B. 90 % – unterhalb davon gilt die Batterie als „ladebedürftig“.
- **Ladeleistung** (optional): Datenpunkt für aktuelle Ladeleistung (Watt). Wenn vorhanden, kann der Adapter den „für Batterie verbrauchten“ Anteil abziehen; sonst Schätzung oder pauschaler Abzug.
- **Kapazität (kWh)** (optional): Für Anzeige oder Abschätzung „noch X kWh bis Ziel“.
- **Name**: z. B. „Speicher Keller“, „BYD Battery 1“.

**Mehrere Batterien:**

- Jede Batterie einzeln konfigurierbar (eigener SoC-State, eigenes Ziel-SoC).
- **Aggregation**: „Batterien brauchen Ladung“ = mindestens eine Batterie hat SoC < Ziel-SoC.
- **Priorität unter den Batterien** (optional): Reihenfolge beim gedanklichen „Füllen“ (z. B. zuerst Speicher 1, dann Speicher 2) oder alle gleichberechtigt (Summe „Ladebedarf“).

### Berechnung „für Verbraucher verfügbar“

- **Ohne Batterien** (keine konfiguriert):  
  `availableForDevicesW = surplus.powerW + Σ Entladeleistung` (Entlade meist 0).
- **Mit Batterien**, Priorität **Batterie zuerst**:
  - **Alle Batterien ≥ Ziel-SoC** → keine Reservierung:  
    `availableForDevicesW = surplus.powerW + Σ Entladeleistung`.
  - **Mindestens eine Batterie < Ziel-SoC** → Reservierung wird abgezogen (batteryReserveW oder Summe Ladeleistung-States):  
    `availableForDevicesW = max(0, surplus.powerW − Reservierung + Σ Entladeleistung)`.
- **Mit Batterien**, Priorität **Geräte zuerst**:
  - Es wird **keine** Reservierung abgezogen:  
    `availableForDevicesW = surplus.powerW + Σ Entladeleistung`.  
  Die Batterie lädt weiterhin, soweit der Wechselrichter es zulässt; die Schalt-Regeln sehen den vollen Überschuss.

### Zusätzliche States für Batterien

| State (Beispiel)           | Typ    | Beschreibung |
|---------------------------|--------|----------------|
| `batteries.<batteryId>.soc` | number | Letzter gelesener SoC (%) |
| `batteries.<batteryId>.chargePowerW` | number | Ladeleistung (W) – geht in Reservierung ein |
| `batteries.<batteryId>.dischargePowerW` | number | Entladeleistung (W) – wird zu „verfügbar“ addiert |
| `batteries.<batteryId>.needsCharge` | boolean | SoC < Ziel-SoC |
| `batteries.<batteryId>.targetSoc` | number | Konfiguriertes Ziel-SoC |
| `batteries.allCharged`    | boolean | Alle Batterien ≥ Ziel-SoC |
| `batteries.powerReservedW`| number | Für Ladung „reservierte“ Leistung (Anzeige) |

Damit lässt sich die Logik erweitern: **Erst laden, dann Überschuss für Geräte, Rest ins Netz.**

---

## 4. Schalt-Regeln (Geräte/Steckdosen etc.)

### 4.1 Regel-Typ: Schwellwert-basiert

Pro **Regel** (z. B. eine Steckdose / ein Gerät):

- **Ziel-State**: ioBroker-State-ID zum Schalten (z. B. `shelly.0.Steckdose.Switch`).
- **Schwellwert EIN** (Watt): **Für Verbraucher verfügbar** (`availableForDevicesW`) ≥ diesem Wert → Gerät **ein**.
- **Schwellwert AUS** (Watt): Verfügbar ≤ diesem Wert → Gerät **aus** (Hysterese).
- **Min. Ein-Dauer** (Sekunden): Verhindert Flackern; Gerät bleibt mindestens X s an.
- **Min. Aus-Dauer** (Sekunden): Gerät bleibt mindestens X s aus.
- **Verzögerung EIN** (Sekunden): Erst nach X s Überschuss über Schwellwert → einschalten.
- **Verzögerung AUS** (Sekunden): Erst nach X s Überschuss unter Schwellwert → ausschalten.
- **Priorität** (optional): Reihenfolge bei mehreren Geräten (erst Gerät 1, dann 2 bei mehr Überschuss).

### 4.2 Mehrere Geräte / Kaskade

- Mehrere Regeln mit unterschiedlichen Schwellwerten:
  - Gerät 1: EIN ab 300 W, AUS unter 200 W.
  - Gerät 2: EIN ab 800 W, AUS unter 600 W.
- Optional: **Nur so viele Geräte einschalten, dass Überschuss nicht „überfahren“ wird** (z. B. Gerät 2 nur, wenn nach Schaltung von Gerät 1 noch ≥ 800 W übrig sind). Das ist erweiterbar („Reserve“ pro Gerät).

### 4.3 Ziel-State-Typen

- **Boolean**: `true` = ein, `false` = aus.
- **Number** (z. B. 0/1): 1 = ein, 0 = aus.
- Optional später: **Dimmer** (0–100 %) abhängig von Überschuss (PID-ähnlich).

---

## 5. Adapter-Struktur (sauber umsetzbar)

### 5.1 Objektbaum (Vorschlag)

```
scc.0
├── surplus
│   ├── powerW                  (number)   – Brutto-Überschuss (W)
│   ├── active                  (boolean)  – Brutto > Schwellwert
│   ├── availableForDevicesW    (number)   – für Verbraucher nutzbar (W)
│   ├── availableForDevices     (boolean)  – nutzbar > Schwellwert
│   ├── feedInW                 (number)   – Einspeisung (W), berechnet oder aus Quelle
│   └── sourcesOk               (boolean)
├── consumption
│   └── totalW                  (number)   – Verbrauch gesamt (W), Summe aus Quellen Typ „Verbrauch“
├── batteries
│   ├── allCharged              (boolean)  – alle ≥ Ziel-SoC
│   ├── powerReservedW          (number)   – für Ladung reserviert (W)
│   └── <batteryId>
│       ├── soc                 (number)   – aktueller SoC (%)
│       ├── needsCharge         (boolean)
│       ├── targetSoc           (number)   – Ziel-SoC (%)
│       ├── chargePowerW        (number)   – Ladeleistung (W), optional
│       └── dischargePowerW     (number)   – Entladeleistung (W), optional
├── sources
│   └── <sourceId>
│       └── lastValue           (number)   – letzter Wert (W)
└── rules
    └── <ruleId>
        ├── state               (boolean)  – aktuell ein/aus
        └── lastSwitch          (string)   – Zeitpunkt letzte Schaltung
```

### 5.2 Konfiguration (Admin)

- **Quellen** (Tabelle/Liste):
  - State-ID (Auswahl aus Objektbaum),
  - Typ: Netzleistung / Erzeugung / Verbrauch / Einspeisung,
  - **Einheit**: Auto (aus `common.unit`) oder manuell (W, kW, …), siehe Abschnitt 2.4,
  - Faktor (optional), Name.
- **Batterien** (Tabelle/Liste):
  - SoC-State-ID; **Einheit** Auto (%) / manuell (% oder 0–1); Ziel-SoC (%); optional Ladeleistung-State in W/kW (Auto/Manuell); optional Kapazität (kWh); Name, Priorität.
- **Globale Schwellwerte**:
  - „Überschuss an“ (Watt) für `surplus.active` und `surplus.availableForDevices`,
  - Reservierung für Batterie (W) oder „nutze Ladeleistung-States“.
- **Regeln** (Tabelle/Liste pro Schalt-Ziel):
  - Ziel-State-ID, Schwellwert EIN / AUS (Watt), Min.-Dauer, Verzögerung, Priorität, Aktiv.

### 5.3 Ablauf (Logik)

1. **Quellen lesen**: Bei Änderung (subscribe) oder Intervall → Werte mit **Einheiten-Normfaktor** (Abschnitt 2.4) in W umrechnen → Brutto-Überschuss berechnen.
2. **Batterien prüfen**: SoC aller Batterien lesen; `allCharged`, `needsCharge` pro Batterie, `powerReservedW` (Reservierung oder Ladeleistung).
3. **Für Verbraucher verfügbar**: `availableForDevicesW = surplus.powerW - powerReservedW` (bzw. 0 wenn negativ); States setzen.
4. **States setzen**: `surplus.*`, `batteries.*`.
5. **Regeln prüfen**: Anhand **availableForDevicesW** (nicht Brutto) – Hysterese, Verzögerung, Min.-Dauer → Ziel-State setzen.

### 5.4 Technik

- **State-Subscriptions** für alle Quell-States → sofortige Neuberechnung bei Änderung (wichtig bei Shelly/EM).
- Optional: **Intervall** als Fallback, wenn Quellen nicht subscribbar sind.
- **Keine Abhängigkeit** von einem bestimmten Gerät: nur State-IDs konfigurieren → funktioniert mit Shelly, Fronius, Solax, eigenem Script, etc.

---

## 5.5 Grafische Darstellung

Ziel: Energiefluss und Status auf einen Blick – **im Adapter** (Admin) und **in VIS/Dashboards** (über States).

### A) Eigenes Tab im Admin (Adapter-Web-UI)

- **Flussdiagramm** (SVG oder Canvas), z. B.:
  ```
  [ PV / Netz ] → Brutto-Überschuss (W)
        │
        ├─→ [ Batterie 1 ] SoC % (Ladeziel %)
        ├─→ [ Batterie 2 ] …
        ├─→ verfügbar für Verbraucher (W)
        │       ├─→ Gerät 1 (ein/aus)
        │       └─→ Gerät 2 (ein/aus)
        └─→ Rest → Netz (Einspeisung)
  ```
- **Live-Werte** aus den eigenen States eintragen (surplus.powerW, batteries.*.soc, rules.*.state).
- Einfache **Farbcodierung**: z. B. grün = Überschuss/Verbraucher an, grau = aus, orange = Batterie lädt.
- Optional: **Minimales Balkendiagramm** (Brutto | Reserviert Batterie | Verfügbar Verbraucher | Einspeisung).

Technik: Ein **Admin-Tab** (HTML/JS), der per **sendTo** oder **getState** die Werte vom Adapter abfragt und das Diagramm alle 1–2 s aktualisiert. Kein separates Backend nötig.

### B) States für VIS / ioBroker Dashboards

- Alle relevanten Werte sind **States** (siehe Objektbaum):
  - `surplus.powerW`, `surplus.availableForDevicesW`, `surplus.active`, `surplus.availableForDevices`
  - `batteries.allCharged`, `batteries.powerReservedW`, `batteries.<id>.soc`, `batteries.<id>.needsCharge`
  - `rules.<id>.state`
- In **VIS** oder **Material/Flot** lassen sich damit ohne Zusatz-Adapter:
  - Balken (Überschuss, verfügbar, reserviert),
  - Texte (SoC, „Lädt“ / „Voll“),
  - Icons (Gerät ein/aus)
darstellen.
- Optional: Adapter liefert ein **VIS-Widget** (custom widget) mit vorgezeichnetem Fluss (wie oben), das nur die State-IDs braucht – angenehm für Nutzer ohne eigene VIS-Bastelarbeit.

### C) Optional: Einfache HTML-Seite (iframe in VIS)

- Der Adapter hostet eine **statische HTML-Seite** (z. B. unter `adapter-url/vis.html`), die per **socket.io** oder **getState** die Werte vom ioBroker-Backend liest und das gleiche Flussdiagramm rendert.
- In VIS ein **iframe** oder **HTML-Widget** mit dieser URL → gleiche Grafik wie im Admin, im Dashboard.

Empfehlung: **A** für Konfiguration und Debug, **B** immer (States sind das Fundament), **C** oder ein **VIS-Widget** für Nutzer, die eine fertige Grafik wollen.

---

## 6. Kurzfassung der Idee

- **Eine** Überschuss-Größe aus **beliebigen** Quellen (Shell Pro 3 EM, mehrere WR, Zähler), konfigurierbar pro Datenpunkt mit Typ (Netzleistung/Erzeugung/Verbrauch/Einspeisung).
- **Batterien**: Mehrere Speicher mit SoC + Ziel-SoC; Priorität **erst laden, dann Überschuss für Geräte, Rest ins Netz**; States pro Batterie und aggregiert.
- **Berechnete States**: Brutto-Überschuss, **für Verbraucher verfügbar** (nach Batterie-Reserve), „Überschuss aktiv“, Quellen-OK, Batterie-Status.
- **Regeln**: Pro Gerät/Steckdose Schwellwerte EIN/AUS auf Basis **availableForDevicesW**, Hysterese, Min.-Dauer, Verzögerung, Priorität.
- **Einheiten**: Automatische Erkennung von **W, kW, Wh, kWh, %** (aus `common.unit`) + manueller Override; interne Normalisierung auf W (Leistung) und % (SoC); Schwellwerte immer in W bzw. %.
- **Grafik**: Admin-Tab mit Flussdiagramm (PV → Batterie → Verbraucher → Netz) + alle Werte als States für VIS/Dashboards; optional VIS-Widget oder iframe-Seite.

---

## 7. Erweiterte Funktionen (implementiert)

### Debug-Log für Regeln
- Konfig: **Debug-Log für Regeln** aktivieren + Loglevel **debug** stellen.
- Ausgabe: Warum eine Regel (noch) nicht schaltet (z. B. „avail 200W < Schwellwert 300W“, „Warte auf Min-AUS“, „Verz. EIN 5s/10s“).

### Health-Check
- State `info.health`: JSON mit `{ ok, issues, warnings }`.
- Prüft: Quellen, Batterien, Regeln – ob States existieren und Werte liefern.
- Läuft beim Start und alle 60 s.

### Statistik
- `stats.surplusHoursToday`: Überschuss-Stunden heute (h).
- `stats.autarkyPercentToday`: Autarkie heute (%).
- `stats.consumptionWhToday`, `stats.gridConsumptionWhToday`: Verbrauch/Netzbezug heute (Wh).

### Simulationsmodus
- Konfig: **Simulationsmodus** aktivieren.
- Regeln werden ausgewertet, aber **keine Geräte geschaltet** (keine `setState`).
- Nützlich zum Testen ohne echte Schaltbefehle.

### VIS-/Material-Widget
- `admin/widgets/scc-flow-widget.html`: Kompaktes Energiefluss-Widget.
- In VIS/Material als HTML-Widget einfügen; OID: `scc.0.flowData`.
- Alternative: Flow-Tab als iframe einbinden.

### PV-Vorhersage
- Konfig: `forecastEnabled`, `forecastSourceId` – Vorhersage-Datenpunkt (W oder kW) wird gelesen und im Flow-Tab sowie als `forecast.powerW` ausgegeben.

---

## 8. Logik-Check: Macht das so Sinn?

**Ja – der Aufbau ist konsistent.** Kurz zusammengefasst:

### Brutto-Überschuss
- **Nur Netzleistung (grid)** konfiguriert → Überschuss = `max(0, -gridW)`. Das ist die typische Shelly-Variante: ein Zähler, negativ = Einspeisung = Überschuss. Sinnvoll.
- **Erzeugung + Verbrauch (ohne grid)** → Überschuss = `max(0, Erzeugung − Verbrauch)`. Klassische Bilanz. Sinnvoll.
- **Wichtig:** Sobald **eine** Quelle vom Typ **grid** existiert, wird **nur** diese für den Überschuss genutzt (grid gewinnt). Erzeugung/Verbrauch werden dann für diese Berechnung ignoriert. Das vermeidet Doppelzählung (Shelly misst ja schon die Bilanz am Zähler). Wenn jemand trotzdem grid und Erzeugung/Verbrauch gleichzeitig nutzen will, müsste man die Logik erweitern (z. B. Option „grid nur für Anzeige“).

### Hausverbrauch gesamt vs. Einzelzähler
- **Hausverbrauch gesamt** gesetzt → Ein **Datenpunkt** liefert den Verbrauch; Einzelzähler (Büro, Kühltruhe) sind **consumptionDetail** und gehen **nicht** in die Überschuss-Berechnung ein (nur Anzeige). Korrekt, sonst würde man Teile doppelt zählen.
- **Ohne** Hausverbrauch gesamt → Summe der Verbraucher-Quellen = Hausverbrauch. Ebenfalls konsistent.
- **Hausverbrauch aus Bilanz berechnen** (Option) → Hausverbrauch = Netzbezug + Erzeugung + Batterie-Entladung − Einspeisung − Batterie-Ladung. Sinnvoll, wenn nur Shelly (Netz) + PV als Quellen: Der Shelly liefert nur die Netto-Leistung am Zähler; der echte Verbrauch ist Bezug + PV (bzw. plus/minus Batterie). Dann muss kein separater Hausverbrauch-Datenpunkt oder externes Script mehr die Bilanz berechnen.

### Für Verbraucher verfügbar
- Formel: `availableW = Brutto − reserviert + Entladeleistung` (bei battery_first).  
  Batterie wird zuerst „bedient“ (reserviert), der Rest + das, was die Batterie abgibt (Entladung), steht für Geräte zur Verfügung. Physikalisch nachvollziehbar.
- **devices_first**: `reserviert = 0` → gesamter Überschuss + Entladung für Geräte; Batterie lädt mit dem, was real fließt. Auch sinnvoll.

### Batterie-Reserve
- **useBatteryChargePower**: Reservierung = Summe der **tatsächlichen** Ladeleistung aus States. Entspricht dem, was die Batterie wirklich zieht.
- **Sonst**: Feste **batteryReserveW**, wenn mindestens eine Batterie noch nicht voll ist. Fallback, wenn keine Ladeleistung-States vorhanden sind. Beides schlüssig.

### Regeln
- Schwellwerte, Hysterese (EIN ab X W, AUS unter Y W), Min-EIN/Min-AUS, Verzögerung, Priorität. Standard-Überschuss-Steuerung; Reihenfolge nach Priorität ist konsistent.

### Autarkie
- `Autarkie = (1 − Netzbezug / Gesamtverbrauch) × 100 %`. Übliche Definition; Verbrauch und Netzbezug aus den gleichen Quellen/States. Sinnvoll.

**Fazit:** Die Logik ist stimmig aufgebaut. Einzige bewusste Einschränkung: Sobald eine Grid-Quelle existiert, dominiert sie die Überschuss-Berechnung (keine Mischung mit Erzeugung/Verbrauch in einer Formel). Das ist für den typischen Einsatz (ein Zähler am Hausanschluss) gewollt und vermeidet Fehlinterpretationen.
