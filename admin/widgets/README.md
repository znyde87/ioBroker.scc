# SCC VIS/Material Widgets

## Energy flow widget

The file `scc-flow-widget.html` contains a compact energy flow widget for **VIS** or **Material**.

### Using in VIS

1. Create a new view in VIS or open an existing one.
2. **Add widget** → **HTML** (or "HTML widget").
3. Paste the content of `scc-flow-widget.html`.
4. Set OID to `scc.0.flowData` (if the HTML widget supports OID).
5. For a different instance: replace `scc.0` with `scc.X` (X = instance number).

### Using in Material

1. Install the Material adapter.
2. Create a new card with HTML content.
3. Paste the content of `scc-flow-widget.html`.
4. Bind data point `scc.0.flowData` (if Material HTML cards support OID).

### Alternative: Flow tab as iframe

The Admin **Flow** tab (`/adapter/scc/flow.html`) can be embedded in VIS as an iframe:

```html
<iframe src="/adapter/scc/flow.html?instance=0" style="width:100%;height:400px;border:0;"></iframe>
```

(Adjust the instance parameter for a different instance number.)
