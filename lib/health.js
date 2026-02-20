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
                warnings.push('Source without valid state ID (type: ' + (s.type || '?') + ')');
                continue;
            }
            try {
                const obj = await adapter.getObjectAsync(stateId);
                if (!obj) {
                    issues.push('Source does not exist: ' + stateId);
                }
                const val = sourceManager.getLastValueW(stateId);
                if (val == null && obj) {
                    warnings.push('Source has no current value: ' + stateId);
                }
            } catch (e) {
                issues.push('Source not readable: ' + stateId + ' – ' + (e && e.message));
            }
        }
    } else if (!config.sources || config.sources.length === 0) {
        warnings.push('No sources configured');
    }

    // Batterien prüfen
    const batteryManager = adapter.batteries;
    if (batteryManager && config.batteries && config.batteries.length > 0) {
        for (const b of config.batteries) {
            const socId = (b.socStateId || b.socState || '').trim();
            if (!socId) {
                warnings.push('Battery without SoC state');
                continue;
            }
            try {
                const obj = await adapter.getObjectAsync(socId);
                if (!obj) {
                    issues.push('Battery SoC does not exist: ' + socId);
                }
                const bid = batteryManager.getBatteryId(b);
                const soc = batteryManager.getSocPercent(bid);
                if (soc == null && obj) {
                    warnings.push('Battery SoC has no value: ' + socId);
                }
            } catch (e) {
                issues.push('Battery SoC not readable: ' + socId + ' – ' + (e && e.message));
            }
            const chargeId = (b.chargePowerStateId || b.chargePowerState || '').trim();
            if (chargeId) {
                try {
                    const obj = await adapter.getObjectAsync(chargeId);
                    if (!obj) warnings.push('Battery charge power does not exist: ' + chargeId);
                } catch (e) {
                    warnings.push('Battery charge power not readable: ' + chargeId);
                }
            }
            const dischargeId = (b.dischargePowerStateId || b.dischargePowerState || '').trim();
            if (dischargeId) {
                try {
                    const obj = await adapter.getObjectAsync(dischargeId);
                    if (!obj) warnings.push('Battery discharge power does not exist: ' + dischargeId);
                } catch (e) {
                    warnings.push('Battery discharge power not readable: ' + dischargeId);
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
                warnings.push('Rule without target state: ' + (r.name || '?'));
                continue;
            }
            try {
                const obj = await adapter.getObjectAsync(targetId);
                if (!obj) {
                    issues.push('Rule target does not exist: ' + targetId);
                }
            } catch (e) {
                issues.push('Rule target not readable: ' + targetId + ' – ' + (e && e.message));
            }
        }
    }

    const ok = issues.length === 0;
    return { ok, issues, warnings };
}

module.exports = { runHealthCheck };
