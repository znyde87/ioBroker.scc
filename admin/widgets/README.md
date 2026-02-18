# SCC VIS/Material Widgets

## Energiefluss-Widget

Die Datei `scc-flow-widget.html` enthält ein kompaktes Energiefluss-Widget für **VIS** oder **Material**.

### Nutzung in VIS

1. In VIS eine neue View erstellen oder bestehende öffnen.
2. **Widget hinzufügen** → **HTML** (oder "HTML-Widget").
3. Den Inhalt von `scc-flow-widget.html` einfügen.
4. OID auf `scc.0.flowData` setzen (falls das HTML-Widget OID unterstützt).
5. Bei anderer Instanz: `scc.0` durch `scc.X` ersetzen (X = Instanznummer).

### Nutzung in Material

1. Material-Adapter installieren.
2. Eine neue Karte mit HTML-Inhalt erstellen.
3. Den Inhalt von `scc-flow-widget.html` einfügen.
4. Datenpunkt `scc.0.flowData` anbinden (falls Material HTML-Karten OID unterstützen).

### Alternative: Flow-Tab als iframe

Der Admin-Tab **Flow** (`/adapter/scc/flow.html`) kann in VIS als iframe eingebettet werden:

```html
<iframe src="/adapter/scc/flow.html?instance=0" style="width:100%;height:400px;border:0;"></iframe>
```

(Instance-Parameter anpassen bei anderer Instanznummer.)
