'use strict';

const RULE_TYPE = { ON_OFF: 'on_off', PID: 'pid' };

/**
 * Regel-Engine: Schwellwerte (EIN/AUS), PID (0–100 % z. B. Shelly Dimmer 0–10 V).
 * @param {object} adapter - ioBroker Adapter
 * @param {object[]} rulesConfig - native.rules
 */
function RuleEngine(adapter, rulesConfig) {
    this.adapter = adapter;
    this.config = Array.isArray(rulesConfig) ? rulesConfig : [];
    this.ruleState = {};  // ruleId -> { currentOn, onSince, offSince, delayOnAt, delayOffAt } oder { lastTs, lastI, lastOutput } (PID) oder { currentOn } (Temp)
}

function toStateIdString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object' && v.id != null) return String(v.id).trim();
    return '';
}

RuleEngine.prototype.getRuleId = function (r) {
    return r.id || (r.targetStateId && r.targetStateId.replace(/[.\s]/g, '_')) || (r.outputStateId && r.outputStateId.replace(/[.\s]/g, '_')) || `rule_${this.config.indexOf(r)}`;
};

RuleEngine.prototype.evaluate = async function (availableForDevicesW) {
    const now = Date.now();
    const avail = Number(availableForDevicesW) || 0;
    const debugRules = this.adapter.config && this.adapter.config.debugRules === true;
    const simulationMode = this.adapter.config && this.adapter.config.simulationMode === true;

    const sorted = [...this.config]
        .filter(r => r.enabled !== false)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));

    for (const r of sorted) {
        const ruleType = (r.ruleType || RULE_TYPE.ON_OFF);
        const ruleId = this.getRuleId(r);

        if (ruleType === RULE_TYPE.PID) {
            await this._evaluatePid(r, ruleId, avail, now, simulationMode, debugRules);
            continue;
        }

        // --- on_off (Standard): nur Schwellwerte, keine „Aktiv wenn“-Bedingungen ---
        let state = this.ruleState[ruleId] || { currentOn: false, onSince: null, offSince: null, delayOnAt: null, delayOffAt: null };

        const thresholdOn = Number(r.thresholdOn) || 0;
        const devicePowerW = Math.max(0, Number(r.devicePowerW) || 0);
        const effectiveThresholdOn = devicePowerW > 0 ? Math.max(thresholdOn, devicePowerW) : thresholdOn;
        const thresholdOff = Number(r.thresholdOff) !== undefined ? Number(r.thresholdOff) : thresholdOn * 0.5;
        const minOnSec = Number(r.minOnSec) || 0;
        const minOffSec = Number(r.minOffSec) || 0;
        const delayOnSec = Number(r.delayOnSec) || 0;
        const delayOffSec = Number(r.delayOffSec) || 0;

        const wantOn = avail >= effectiveThresholdOn;
        const wantOff = avail <= thresholdOff;

        if (wantOn && !state.currentOn) {
            if (delayOnSec > 0) {
                if (!state.delayOnAt) state.delayOnAt = now;
                const delayElapsed = (now - state.delayOnAt) / 1000;
                if (delayElapsed >= delayOnSec) {
                    if (minOffSec > 0 && state.offSince && (now - state.offSince) / 1000 < minOffSec) {
                        if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Waiting for min OFF (${minOffSec}s)`);
                    } else {
                        state.currentOn = true;
                        state.onSince = now;
                        state.delayOnAt = null;
                        state.delayOffAt = null;
                        if (!simulationMode) await this.setTargetState(r, true);
                        else if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Simulation: would switch ON`);
                    }
                }
            } else {
                if (minOffSec > 0 && state.offSince && (now - state.offSince) / 1000 < minOffSec) { /* no-op */ } else {
                    state.currentOn = true;
                    state.onSince = now;
                    state.delayOnAt = null;
                    state.delayOffAt = null;
                    if (!simulationMode) await this.setTargetState(r, true);
                    else if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Simulation: would switch ON`);
                }
            }
        } else if (!wantOn) {
            state.delayOnAt = null;
        }

        if (wantOff && state.currentOn) {
            if (delayOffSec > 0) {
                if (!state.delayOffAt) state.delayOffAt = now;
                const delayElapsed = (now - state.delayOffAt) / 1000;
                if (delayElapsed >= delayOffSec) {
                    if (minOnSec > 0 && state.onSince && (now - state.onSince) / 1000 < minOnSec) { /* no-op */ } else {
                        state.currentOn = false;
                        state.offSince = now;
                        state.delayOffAt = null;
                        state.delayOnAt = null;
                        if (!simulationMode) await this.setTargetState(r, false);
                        else if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Simulation: would switch OFF`);
                    }
                }
            } else {
                if (minOnSec > 0 && state.onSince && (now - state.onSince) / 1000 < minOnSec) { /* no-op */ } else {
                    state.currentOn = false;
                    state.offSince = now;
                    state.delayOffAt = null;
                    state.delayOnAt = null;
                    if (!simulationMode) await this.setTargetState(r, false);
                    else if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Simulation: would switch OFF`);
                }
            }
        } else if (!wantOff) {
            state.delayOffAt = null;
        }

        this.ruleState[ruleId] = state;
    }
};

/**
 * PI-Regelung: Ausgang 0–100 % (z. B. Shelly Dimmer 0–10 V) aus Leistung/Sollwert.
 * Optional: Override (z. B. bei niedrigem Verbrauch + Temp < 70 → fester Wert 80 %).
 */
RuleEngine.prototype._evaluatePid = async function (r, ruleId, availableForDevicesW, now, simulationMode, debugRules) {
    let state = this.ruleState[ruleId];
    if (!state || state.lastTs == null) {
        state = { lastTs: now, lastI: 0, lastOutput: 0 };
        this.ruleState[ruleId] = state;
    }

    const inputSource = r.pidInputSource || 'surplus';  // 'surplus' | 'state' (Leistung W) | 'temperature' (Temperaturfühler)
    const isTemperatureInput = inputSource === 'temperature';

    let processVar = availableForDevicesW;  // W oder °C je nach Eingang
    const inputStateId = toStateIdString(r.pidInputStateId || r.inputStateId);
    const getState = this.adapter.getForeignStateAsync || this.adapter.getStateAsync;
    if (inputSource === 'state' && inputStateId) {
        try {
            const st = await getState.call(this.adapter, inputStateId);
            const v = st && st.val != null ? Number(st.val) : null;
            if (v != null && !isNaN(v)) processVar = v;
        } catch (e) {
            if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] PID input read: ${e.message}`);
        }
    } else if (isTemperatureInput) {
        const tempId = toStateIdString(r.pidInputStateId || r.pidTempStateId || r.tempStateId);
        if (!tempId) { this.ruleState[ruleId] = state; return; }
        try {
            const st = await getState.call(this.adapter, tempId);
            const v = st && st.val != null ? Number(st.val) : null;
            if (v != null && !isNaN(v)) processVar = v;
            else { this.ruleState[ruleId] = state; return; }
        } catch (e) {
            if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] PID temperature read: ${e.message}`);
            this.ruleState[ruleId] = state;
            return;
        }
    }

    const setpointW = Number(r.pidSetpointW) != null ? Number(r.pidSetpointW) : 250;
    const setpointTemp = Number(r.pidSetpointTemp) != null ? Number(r.pidSetpointTemp) : 50;
    const setpoint = isTemperatureInput ? setpointTemp : setpointW;
    const Xp = Number(r.pidXp) > 0 ? Number(r.pidXp) : (isTemperatureInput ? 10 : 20000);
    const Tn = Number(r.pidTn) > 0 ? Number(r.pidTn) : 9;
    const outputStateId = r.outputStateId || r.pidOutputStateId || r.targetStateId;
    if (!outputStateId) {
        this.ruleState[ruleId] = state;
        return;
    }

    // Schwellwerte Überschuss (nur bei Eingang Überschuss oder Leistungs-Datenpunkt): EIN ab (W), AUS unter (W)
    const thresholdOnW = (inputSource === 'surplus' || inputSource === 'state') ? Number(r.pidThresholdOnW) : null;
    const thresholdOffW = (inputSource === 'surplus' || inputSource === 'state') ? Number(r.pidThresholdOffW) : null;
    var pidDebug = { processVar, setpoint, unit: isTemperatureInput ? '°C' : 'W' };
    if (thresholdOffW != null && !isNaN(thresholdOffW) && processVar < thresholdOffW) {
        state.lastOutput = 0;
        state.lastI = 0;
        state.pidDebug = Object.assign({}, pidDebug, { output: 0, reason: 'AUS unter (W)' });
        if (!simulationMode) await this.setTargetStateValue(outputStateId, 0);
        this.ruleState[ruleId] = state;
        return;
    }
    if (thresholdOnW != null && !isNaN(thresholdOnW) && thresholdOnW > 0 && processVar < thresholdOnW) {
        state.lastOutput = 0;
        state.pidDebug = Object.assign({}, pidDebug, { output: 0, reason: 'unter EIN ab (W)' });
        if (!simulationMode) await this.setTargetStateValue(outputStateId, 0);
        this.ruleState[ruleId] = state;
        return;
    }

    // Aktiv-wenn (UND): Regel nur ausführen, wenn alle gesetzten Bedingungen erfüllt sind (z. B. total <= x UND temp < y)
    const checkEnableCond = async (stateId, maxVal) => {
        if (!stateId || maxVal == null || isNaN(Number(maxVal))) return true;
        try {
            const sid = toStateIdString(stateId);
            if (!sid) return true;
            const st = await getState.call(this.adapter, sid);
            const v = st && st.val != null ? Number(st.val) : null;
            return v != null && v <= Number(maxVal);
        } catch (e) { return false; }
    };
    if (r.enableCondition1StateId && (r.enableCondition1Max != null && !isNaN(Number(r.enableCondition1Max)))) {
        const ok = await checkEnableCond(toStateIdString(r.enableCondition1StateId), r.enableCondition1Max);
        if (!ok) {
            if (!simulationMode) await this.setTargetStateValue(outputStateId, 0);
            state.lastOutput = 0;
            state.currentOn = false;
            state.pidDebug = Object.assign({}, pidDebug, { output: 0, reason: 'Aktiv-wenn 1 nicht erfüllt' });
            this.ruleState[ruleId] = state;
            return;
        }
    }
    if (r.enableCondition2StateId && (r.enableCondition2Max != null && !isNaN(Number(r.enableCondition2Max)))) {
        const ok = await checkEnableCond(toStateIdString(r.enableCondition2StateId), r.enableCondition2Max);
        if (!ok) {
            if (!simulationMode) await this.setTargetStateValue(outputStateId, 0);
            state.lastOutput = 0;
            state.currentOn = false;
            state.pidDebug = Object.assign({}, pidDebug, { output: 0, reason: 'Aktiv-wenn 2 nicht erfüllt' });
            this.ruleState[ruleId] = state;
            return;
        }
    }

    // Übertemperatur-Schutz: wenn Temperatur >= Grenzwert → Ausgang 0 % (z. B. Speicher 60 °C)
    const tempLimitId = toStateIdString(r.tempLimitStateId || r.tempLimitTempStateId);
    const tempLimitMax = r.tempLimitMax != null && !isNaN(Number(r.tempLimitMax)) ? Number(r.tempLimitMax) : null;
    if (tempLimitId && tempLimitMax != null) {
        try {
            const st = await getState.call(this.adapter, tempLimitId);
            const tempVal = st && st.val != null ? Number(st.val) : null;
            if (tempVal != null && !isNaN(tempVal) && tempVal >= tempLimitMax) {
                state.lastOutput = 0;
                state.lastI = 0;
                state.pidDebug = Object.assign({}, pidDebug, { output: 0, reason: 'Overtemperature ≥ ' + tempLimitMax + ' °C' });
                if (!simulationMode) await this.setTargetStateValue(outputStateId, 0);
                if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Overtemperature: ${tempVal} °C >= ${tempLimitMax} °C → output 0%`);
                this.ruleState[ruleId] = state;
                return;
            }
        } catch (e) {
            if (debugRules) this.adapter.log.debug(`[Rule ${ruleId}] Temperature limit read: ${e.message}`);
        }
    }

    // Heizstab/Temperatur-PID: error = Soll - Ist (zu kalt → positiver Fehler → mehr Heizung)
    const error = setpoint - processVar;

    // Bei Überschuss/Leistung: Ist ≥ Soll heißt „genug da“ → Ausgang 100 % (Gerät darf voll nutzen, z. B. 100 W)
    if (!isTemperatureInput && setpoint > 0 && processVar >= setpoint) {
        state.lastOutput = 100;
        state.pidDebug = { processVar, setpoint, error, p: 0, i: state.lastI, output: 100, unit: 'W' };
        if (!simulationMode) await this.setTargetStateValue(outputStateId, 100);
        state.lastTs = now;
        this.ruleState[ruleId] = state;
        return;
    }

    // Override: Verknüpfung wählbar – alle Bedingungen UND oder mind. eine ODER (z. B. total <= 0.17 UND power < 3000 UND temp < 70 → 80 %)
    const overrideValue = Number(r.pidOverrideValue);
    const hasOverrideCond = !!(r.overrideTotalStateId || (r.overridePowerMax != null && !isNaN(Number(r.overridePowerMax))) || r.overrideTempStateId || r.overrideTempState);
    const overrideMode = (r.overrideConditionMode || 'all') === 'any' ? 'any' : 'all';
    if (hasOverrideCond && !isNaN(overrideValue) && overrideValue >= 0 && overrideValue <= 100) {
        const condTotal = r.overrideTotalStateId ? await (async () => {
            try {
                const oid = toStateIdString(r.overrideTotalStateId);
                if (!oid) return null;
                const st = await getState.call(this.adapter, oid);
                const v = st && st.val != null ? Number(st.val) : null;
                const maxVal = Number(r.overrideTotalMax);
                return v != null && (maxVal == null || isNaN(maxVal) || v <= maxVal);
            } catch (e) { return false; }
        })() : null;
        const condPower = (r.overridePowerMax != null && !isNaN(Number(r.overridePowerMax))) ? (processVar < Number(r.overridePowerMax)) : null;
        const condTemp = (r.overrideTempStateId || r.overrideTempState) ? await (async () => {
            try {
                const tid = toStateIdString(r.overrideTempStateId || r.overrideTempState);
                if (!tid) return null;
                const st = await getState.call(this.adapter, tid);
                const v = st && st.val != null ? Number(st.val) : null;
                const maxTemp = Number(r.overrideTempMax);
                return v != null && maxTemp != null && !isNaN(maxTemp) && v < maxTemp;
            } catch (e) { return false; }
        })() : null;
        const conds = [condTotal, condPower, condTemp].filter(c => c !== null);
        const overrideOk = conds.length > 0 && (overrideMode === 'any' ? conds.some(Boolean) : conds.every(Boolean));
        if (overrideOk) {
            state.lastOutput = Math.round(overrideValue);
            state.pidDebug = Object.assign({}, pidDebug, { error: setpoint - processVar, p: 0, i: state.lastI, output: state.lastOutput, reason: 'Override' });
            if (!simulationMode) await this.setTargetStateValue(outputStateId, state.lastOutput);
            state.lastTs = now;
            this.ruleState[ruleId] = state;
            return;
        }
    }

    // PI: p = (100/Xp)*error (error = Soll - Ist; bei Temperatur: zu kalt → error > 0 → mehr Ausgang), i += p * dt * Tn, output = 0 + p + i, clamp 0–100, anti-windup
    const dtSec = (now - state.lastTs) / 1000;
    const p = (100 / Xp) * error;
    const lasti = state.lastI;
    let i = state.lastI + p * dtSec * Tn;
    let output = 0 + p + i;
    if (output > 100) {
        output = 100;
        i = lasti;
    } else if (output < 0) {
        output = 0;
        i = lasti;
    }
    let outRounded = Math.round(Math.max(0, Math.min(100, output)));

    // Bei Eingang Überschuss/Leistung: Ausgang begrenzen – es darf nie mehr genutzt werden als vorhanden ist (z. B. 50 W Überschuss → max 50 % bei 100 W Soll)
    if (!isTemperatureInput && setpoint > 0 && processVar >= 0) {
        const maxByAvailable = Math.min(100, Math.round((processVar / setpoint) * 100));
        outRounded = Math.min(outRounded, Math.max(0, maxByAvailable));
    }

    state.pidDebug = { processVar, setpoint, error, p, i, output: outRounded, unit: isTemperatureInput ? '°C' : 'W' };
    if (!simulationMode) await this.setTargetStateValue(outputStateId, outRounded);
    state.lastTs = now;
    state.lastI = i;
    state.lastOutput = outRounded;
    state.currentOn = outRounded > 0;
    this.ruleState[ruleId] = state;
};

RuleEngine.prototype.setTargetState = async function (rule, on) {
    const targetStateId = rule.targetStateId || rule.targetState;
    if (!targetStateId) return;
    const val = on ? (rule.valueOn !== undefined ? rule.valueOn : true) : (rule.valueOff !== undefined ? rule.valueOff : false);
    try {
        await this.adapter.setStateAsync(targetStateId, { val, ack: true });
    } catch (e) {
        this.adapter.log.warn(`Rule ${rule.id || targetStateId}: setState failed - ${e.message}`);
    }
};

RuleEngine.prototype.setTargetStateValue = async function (stateId, value) {
    if (!stateId) return;
    try {
        await this.adapter.setStateAsync(stateId, { val: value, ack: true });
    } catch (e) {
        this.adapter.log.warn(`Rule setState ${stateId}: ${e.message}`);
    }
};

RuleEngine.prototype.getRuleStates = function () {
    const out = {};
    for (const r of this.config) {
        const ruleId = this.getRuleId(r);
        const state = this.ruleState[ruleId];
        const ruleType = r.ruleType || RULE_TYPE.ON_OFF;

        if (ruleType === RULE_TYPE.PID) {
            const output = state && state.lastOutput != null ? state.lastOutput : 0;
            const o = {
                state: output > 0,
                outputPercent: output,
                lastSwitch: state && state.lastTs ? new Date(state.lastTs).toISOString() : null
            };
            if (state && state.pidDebug) o.pidDebug = state.pidDebug;
            out[ruleId] = o;
            continue;
        }

        out[ruleId] = {
            state: state ? state.currentOn : false,
            lastSwitch: state && (state.onSince || state.offSince)
                ? new Date(Math.max(state.onSince || 0, state.offSince || 0)).toISOString()
                : null
        };
    }
    return out;
};

module.exports = { RuleEngine, RULE_TYPE };
