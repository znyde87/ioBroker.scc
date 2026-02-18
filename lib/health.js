'use strict';

/**
 * Health-Check: Prüft ob alle konfigurierten States existieren und Werte liefern.
 * @param {object} adapter - ioBroker Adapter
 * @param {object} config - Adapter-Konfiguration (sources, batteries, rules)
 * @returns {Promise<{ok: boolean, issues: string[], warnings: string[]}>}
 */
async function runHealthCheck(adapter, config) {
    const issues = [];
    const warnings = [];

    const prefix = adapter.namespace + '.';

    // Quellen prüfen
    const sourceManager = adapter.sources;
    if (sourceManager && config.sources && config.sources.length > 0) {
        for (const s of config.sources) {
            const stateId = sourceManager.getStateId(s);
            if (!stateId) {
                warnings.push('Quelle ohne gültige State-ID (Typ: ' + (s.type || '?') + ')');
                continue;
            }
            try {
                const obj = await adapter.getObjectAsync(stateId);
                if (!obj) {
                    issues.push('Quelle existiert nicht: ' + stateId);
                }
                const val = sourceManager.getLastValueW(stateId);
                if (val == null && obj) {
                    warnings.push('Quelle ohne aktuellen Wert: ' + stateId);
                }
            } catch (e) {
                issues.push('Quelle nicht abrufbar: ' + stateId + ' – ' + (e && e.message));
            }
        }
    } else if (!config.sources || config.sources.length === 0) {
        warnings.push('Keine Quellen konfiguriert');
    }

    // Batterien prüfen
    const batteryManager = adapter.batteries;
    if (batteryManager && config.batteries && config.batteries.length > 0) {
        for (const b of config.batteries) {
            const socId = (b.socStateId || b.socState || '').trim();
            if (!socId) {
                warnings.push('Batterie ohne SoC-Datenpunkt');
                continue;
            }
            try {
                const obj = await adapter.getObjectAsync(socId);
                if (!obj) {
                    issues.push('Batterie SoC existiert nicht: ' + socId);
                }
                const bid = batteryManager.getBatteryId(b);
                const soc = batteryManager.getSocPercent(bid);
                if (soc == null && obj) {
                    warnings.push('Batterie SoC ohne Wert: ' + socId);
                }
            } catch (e) {
                issues.push('Batterie SoC nicht abrufbar: ' + socId + ' – ' + (e && e.message));
            }
            const chargeId = (b.chargePowerStateId || b.chargePowerState || '').trim();
            if (chargeId) {
                try {
                    const obj = await adapter.getObjectAsync(chargeId);
                    if (!obj) warnings.push('Batterie Ladeleistung existiert nicht: ' + chargeId);
                } catch (e) {
                    warnings.push('Batterie Ladeleistung nicht abrufbar: ' + chargeId);
                }
            }
            const dischargeId = (b.dischargePowerStateId || b.dischargePowerState || '').trim();
            if (dischargeId) {
                try {
                    const obj = await adapter.getObjectAsync(dischargeId);
                    if (!obj) warnings.push('Batterie Entladeleistung existiert nicht: ' + dischargeId);
                } catch (e) {
                    warnings.push('Batterie Entladeleistung nicht abrufbar: ' + dischargeId);
                }
            }
        }
    }

    // Regeln prüfen (Ziel-States)
    const ruleEngine = adapter.rules;
    if (ruleEngine && config.rules && config.rules.length > 0) {
        for (const r of config.rules) {
            let targetId = r.targetStateId || r.targetState;
            if (targetId && typeof targetId === 'object' && targetId.id != null) targetId = targetId.id;
            if (!targetId || typeof targetId !== 'string') {
                warnings.push('Regel ohne Ziel-Datenpunkt: ' + (r.name || '?'));
                continue;
            }
            try {
                const obj = await adapter.getObjectAsync(targetId);
                if (!obj) {
                    issues.push('Regel-Ziel existiert nicht: ' + targetId);
                }
            } catch (e) {
                issues.push('Regel-Ziel nicht abrufbar: ' + targetId + ' – ' + (e && e.message));
            }
        }
    }

    const ok = issues.length === 0;
    return { ok, issues, warnings };
}

module.exports = { runHealthCheck };
