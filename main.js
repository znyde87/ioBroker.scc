'use strict';

// Unbehandelte Fehler loggen (Adapter beendet sich sonst ggf. mit Code 0 durch Controller)
function sccLogErr(prefix, err) {
    try {
        const msg = (err && err.message) ? err.message : String(err);
        const stack = (err && err.stack) ? '\n' + err.stack : '';
        if (typeof process !== 'undefined' && process.stderr && process.stderr.write) {
            process.stderr.write('[SCC] ' + prefix + ' ' + msg + stack + '\n');
        }
    } catch (_) {}
}
process.on('uncaughtException', (err) => {
    sccLogErr('uncaughtException', err);
    process.exitCode = 1;
});
process.on('unhandledRejection', (reason, promise) => {
    sccLogErr('unhandledRejection', reason);
    process.exitCode = 1;
});

// Marker beim Laden schreiben (Controller hat main.js dann geladen)
function sccMarker(phase) {
    try {
        const fs = require('fs');
        const path = require('path');
        const file = path.join(__dirname, 'scc-start-marker.txt');
        fs.appendFileSync(file, new Date().toISOString() + ' ' + phase + '\n');
    } catch (_) {}
}
try {
    sccMarker('main.js loaded');
    if (typeof process !== 'undefined' && process.stdout && process.stdout.write) {
        process.stdout.write('[SCC] main.js loading\n');
    }
} catch (_) {}

let SCCAdapter;
try {
    const utils = require('@iobroker/adapter-core');
    SCCAdapter = require('./lib/adapter');
    if (typeof process !== 'undefined' && process.stdout && process.stdout.write) {
        process.stdout.write('[SCC] main.js require OK\n');
    }
} catch (e) {
    const msg = 'SCC main.js load error: ' + (e && e.message ? e.message : String(e));
    try {
        if (process.stderr && process.stderr.write) process.stderr.write('[SCC] ' + msg + '\n');
        if (e && e.stack) process.stderr.write(e.stack + '\n');
    } catch (_) {}
    throw e;
}

// Wie ioBroker-Example: Wenn main.js direkt gestartet wird (vom Controller), Instanz selbst erzeugen.
// Sonst Factory exportieren (z. B. Compact-Modus).
if (require.main === module) {
    try {
        sccMarker('main.js running as main');
        new SCCAdapter();
    } catch (e) {
        sccLogErr('main start', e);
        process.exitCode = 1;
    }
} else {
    module.exports = (options) => new SCCAdapter(options);
}
