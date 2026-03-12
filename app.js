/**
 * Shift Happens Core Logic
 * Unified implementation of legacy Python scripts
 */

class ShiftHappensScheduler {
    constructor() {
        this.state = {
            instructors: [], // Combined list of MRR && Primary instructors
            schedule: {},    // { day: { time: [staff] } }
            history: [],
            config: {
                halfHourCourses: ['MA 15800', 'MA 16010', 'MA 16020'],
                potentialCore: ['MA 15800', 'MA 16010', 'MA 16020', 'MA 16100', 'MA 16200', 'MA 26100', 'MA 16500', 'MA 16600'],
                coreCourses: [], // Filtered core courses found in data
                days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                slots: ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"],
                slotsByDay: {
                    Mon: ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"],
                    Tue: ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"],
                    Wed: ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"],
                    Thu: ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"],
                    Fri: ["09:30", "10:30", "11:30", "12:30"]
                }
            }
        };
        this.dayRank = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5 };
    }

    // --- Helpers ---
    getRowValue(row, candidates) {
        if (!row || Array.isArray(row)) return "";
        const keys = Object.keys(row);
        const lower = keys.map(k => k.toLowerCase());
        for (const cand of candidates) {
            const idx = lower.findIndex(k => k.includes(cand));
            if (idx !== -1) {
                const key = keys[idx];
                const val = row[key];
                if (val !== undefined && val !== null) return String(val).trim();
            }
        }
        return "";
    }

    normalizePref(pref) {
        const v = String(pref || '').trim().toLowerCase();
        if (!v) return "No preference";
        if (v.includes('yes')) return "Yes";
        if (v.includes('no') && !v.includes('preference')) return "No";
        return "No preference";
    }

    parseName(name) {
        const raw = String(name || '').trim();
        if (!raw) return { first: "", last: "", full: "" };
        if (raw.includes(',')) {
            const parts = raw.split(',');
            const last = (parts[0] || "").trim();
            const first = (parts[1] || "").trim();
            return { first, last, full: `${last}${first ? ', ' + first : ''}`.trim() };
        }
        const parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
            return { first: "", last: parts[0], full: parts[0] };
        }
        const last = parts[parts.length - 1];
        const first = parts.slice(0, -1).join(' ');
        return { first, last, full: `${last}, ${first}` };
    }

    extractNameFromRow(row, fallbackIndexFirst = 2, fallbackIndexLast = 1) {
        if (Array.isArray(row)) {
            const first = row[fallbackIndexFirst] || "";
            const last = row[fallbackIndexLast] || "";
            const combined = `${last}${first ? ', ' + first : ''}`.trim();
            const parsed = this.parseName(combined);
            return parsed.full ? parsed : { first: String(first || ""), last: String(last || ""), full: combined };
        }
        const first = this.getRowValue(row, ['first', 'given']);
        const last = this.getRowValue(row, ['last', 'surname', 'family']);
        if (first || last) {
            const full = `${last}${first ? ', ' + first : ''}`.trim();
            return { first, last, full };
        }
        const name = this.getRowValue(row, ['name']);
        return this.parseName(name);
    }
    cleanNameParts(name) {
        if (!name) return new Set();
        const clean = String(name)
            .replace(/\(instr\)/gi, "")
            .replace(/[^a-zA-Z\s,]/g, ' ')
            .toLowerCase()
            .replace(/,/g, ' ');
        return new Set(clean.split(/\s+/).filter(p => p.length > 1));
    }

    normalizeCourse(c) {
        if (!c) return "";
        // Remove all spaces && special chars, convert to upper
        // "MA 16100" -> "MA16100", "MA 161" -> "MA161"
        return String(c).replace(/[\s\-_]/g, '').toUpperCase();
    }

    convert24h(timeStr) {
        if (!timeStr) return "";
        const match = timeStr.toLowerCase().match(/(\d+):(\d+)(a|p)/);
        if (!match) return timeStr;
        let h = parseInt(match[1]);
        const m = match[2];
        const ampm = match[3];
        if (ampm === 'p' && h !== 12) h += 12;
        else if (ampm === 'a' && h === 12) h = 0;
        return `${h.toString().padStart(2, '0')}:${m}`;
    }

    parseDays(daysStr) {
        const res = [];
        let str = daysStr;
        if (str.includes('TTh')) {
            res.push('Tue', 'Thu');
            str = str.replace('TTh', '');
        }
        if (str.includes('Th')) {
            res.push('Thu');
            str = str.replace('Th', '');
        }
        const dayMap = { 'M': 'Mon', 'T': 'Tue', 'W': 'Wed', 'F': 'Fri' };
        for (const char of str) {
            if (dayMap[char]) res.push(dayMap[char]);
        }
        return [...new Set(res)];
    }

    getSlotsForDay(day) {
        const byDay = this.state.config.slotsByDay || {};
        const list = byDay[day];
        if (Array.isArray(list) && list.length) return list;
        return this.state.config.slots || [];
    }

    getAllSlots() {
        const set = new Set();
        (this.state.config.days || []).forEach(d => {
            this.getSlotsForDay(d).forEach(s => set.add(s));
        });
        return Array.from(set).sort();
    }

    setScheduleConfig(days, slots, slotsByDay) {
        const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const cleanDays = Array.from(new Set((days || []).map(d => String(d).trim()).filter(Boolean)))
            .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

        let cleanSlots = Array.from(new Set((slots || []).map(s => String(s).trim()).filter(Boolean)))
            .sort();

        const cleanSlotsByDay = {};
        if (slotsByDay) {
            Object.entries(slotsByDay).forEach(([day, list]) => {
                const cleaned = Array.from(new Set((list || []).map(s => String(s).trim()).filter(Boolean))).sort();
                if (cleaned.length) cleanSlotsByDay[day] = cleaned;
                cleaned.forEach(s => cleanSlots.push(s));
            });
            cleanSlots = Array.from(new Set(cleanSlots)).sort();
        }

        if (cleanDays.length) this.state.config.days = cleanDays;
        if (cleanSlots.length) this.state.config.slots = cleanSlots;
        if (slotsByDay) this.state.config.slotsByDay = cleanSlotsByDay;

        // Clear derived schedule artifacts when config changes
        this.state.schedule = {};
        this.state.history = [];
        this.state.activeAssignment = null;
        this.state.optimizationCount = 0;
    }


    computeCoreCourses() {
        const normalizedPotential = this.state.config.potentialCore.map(c => this.normalizeCourse(c));
        this.state.config.coreCourses = this.state.config.potentialCore.filter((core, idx) => {
            const normCore = normalizedPotential[idx];
            return this.state.instructors.some(inst => {
                const normInst = this.normalizeCourse(inst.course);
                return normInst.includes(normCore) || normCore.includes(normInst);
            });
        });
    }

    getMissingCoreForEntries(entries) {
        const coreCourses = this.state.config.coreCourses || [];
        if (!coreCourses.length) return [];

        const primaries = entries.filter(e => !e.isMRR).map(e => e.course);
        const normPrimaries = primaries.map(p => this.normalizeCourse(p));

        return coreCourses.filter(core => {
            const nc = this.normalizeCourse(core);
            return !normPrimaries.some(np => np.includes(nc) || nc.includes(np));
        });
    }

    slotNeedsMRR(d, t) {
        const entries = this.state.schedule[d]?.[t] || [];
        const missing = this.getMissingCoreForEntries(entries);
        const hasMRR = entries.some(e => e.isMRR);
        return missing.length > 0 && !hasMRR;
    }


    assignToSlot(person, slotId) {
        const [d, t] = slotId.split(' ');
        if (!this.state.schedule[d] || !this.state.schedule[d][t]) return false;
        if (person.assignments.includes(slotId)) return false;
        if (person.unavail.includes(slotId)) return false;
        this.state.schedule[d][t].push({ name: person.name, course: person.course, isMRR: person.isMRR });
        person.assignments.push(slotId);
        person.assigned = person.assignments.length;
        return true;
    }

    unassignFromSlot(person, slotId) {
        const [d, t] = slotId.split(' ');
        if (!this.state.schedule[d] || !this.state.schedule[d][t]) return false;
        this.state.schedule[d][t] = this.state.schedule[d][t].filter(s => s.name !== person.name);
        person.assignments = person.assignments.filter(a => a !== slotId);
        person.assigned = person.assignments.length;
        return true;
    }



    fillUnderAssigned() {
        const { days } = this.state.config;
        const schedule = this.state.schedule;

        const getScore = (person, d, t) => {
            let score = (schedule[d][t].length ** 2) * 25;

            if (!schedule[d][t].some(s => s.course === person.course)) score -= 80;

            if (!person.isMRR) {
                const missing = this.getMissingCoreForEntries(schedule[d][t] || []);
                const hasMRR = (schedule[d][t] || []).some(s => s.isMRR);
                const isCore = (this.state.config.coreCourses || []).some(core => {
                    const nc = this.normalizeCourse(core);
                    const np = this.normalizeCourse(person.course);
                    return np.includes(nc) || nc.includes(np);
                });
                if (isCore && missing.some(m => {
                    const nm = this.normalizeCourse(m);
                    const np = this.normalizeCourse(person.course);
                    return np.includes(nm) || nm.includes(np);
                })) {
                    score -= hasMRR ? 40 : 120;
                }
            }

            const slotsForDay = this.getSlotsForDay(d);
            const tIdx = slotsForDay.indexOf(t);
            const hasAdjacent = person.assignments.some(a => {
                const [ad, at] = a.split(' ');
                if (ad !== d) return false;
                const atIdx = slotsForDay.indexOf(at);
                return Math.abs(tIdx - atIdx) === 1;
            });

            if (person.pref === 'Yes' && hasAdjacent) score -= 100;
            else if (person.pref === 'No' && hasAdjacent) score += 150;

            return score;
        };

        let progress = true;
        while (progress) {
            progress = false;
            const under = this.state.instructors.filter(p => p.assigned < p.required);
            if (!under.length) break;

            for (const person of under) {
                const possible = [];
                for (const d of days) {
                    for (const t of this.getSlotsForDay(d)) {
                        const slotId = `${d} ${t}`;
                        if (person.unavail.includes(slotId) || person.assignments.includes(slotId)) continue;
                        possible.push({ d, t, score: getScore(person, d, t) });
                    }
                }

                if (possible.length) {
                    possible.sort((a, b) => a.score - b.score);
                    const best = possible[0];
                    schedule[best.d][best.t].push({ name: person.name, course: person.course, isMRR: person.isMRR });
                    person.assignments.push(`${best.d} ${best.t}`);
                    person.assigned = person.assignments.length;
                    progress = true;
                }
            }
        }
    }
    ensureCoverageWithMRR() {
        const coreCourses = this.state.config.coreCourses || [];
        if (!coreCourses.length) return;

        const mrrStaff = this.state.instructors.filter(i => i.isMRR);
        if (!mrrStaff.length) return;

        const slotsNeedingMRR = [];
        for (const d of this.state.config.days) {
            for (const t of this.getSlotsForDay(d)) {
                const entries = this.state.schedule[d]?.[t] || [];
                const missing = this.getMissingCoreForEntries(entries);
                const hasMRR = entries.some(e => e.isMRR);
                if (missing.length > 0 && !hasMRR) slotsNeedingMRR.push(`${d} ${t}`);
            }
        }

        const canUse = (person, slotId) => !person.unavail.includes(slotId) && !person.assignments.includes(slotId);

        for (const slotId of slotsNeedingMRR) {
            let placed = false;

            // 1) Use unassigned MRR capacity first
            const available = mrrStaff
                .filter(p => p.assigned < p.required && canUse(p, slotId))
                .sort((a, b) => (b.required - b.assigned) - (a.required - a.assigned));

            if (available.length) {
                this.assignToSlot(available[0], slotId);
                placed = true;
            }

            if (placed) continue;

            // 2) Move an existing MRR from a slot that doesn't need them
            let bestMove = null;
            for (const mrr of mrrStaff) {
                for (const fromSlot of mrr.assignments) {
                    if (fromSlot === slotId) continue;

                    const [fd, ft] = fromSlot.split(' ');
                    const entries = this.state.schedule[fd]?.[ft] || [];
                    const missing = this.getMissingCoreForEntries(entries);
                    const hasOtherMRR = entries.filter(e => e.isMRR).length > 1;

                    // Only move if the origin slot has no missing core courses OR has another MRR to cover
                    if (missing.length === 0 || hasOtherMRR) {
                        if (canUse(mrr, slotId)) {
                            bestMove = { mrr, fromSlot };
                            break;
                        }
                    }
                }
                if (bestMove) break;
            }

            if (bestMove) {
                this.unassignFromSlot(bestMove.mrr, bestMove.fromSlot);
                this.assignToSlot(bestMove.mrr, slotId);
            }
        }
    }

    // --- Data Processing (Merges instr.py && mrr.py logic) ---
    async processFiles(peopleData, mrrData, teachingData) {
        // 1. Process People Survey
        const peopleRecords = peopleData.map(row => {
            const nameParts = this.extractNameFromRow(row);
            const fullName = nameParts.full || `${nameParts.last}, ${nameParts.first}`.trim();

            // Robust preference detection
            let pref = "No preference";
            if (row && !Array.isArray(row)) {
                const prefCol = Object.keys(row).find(k => {
                    const key = k.toLowerCase();
                    return key.includes('prefer') || key.includes('b2b') || key.includes('back');
                });
                pref = this.normalizePref(prefCol ? row[prefCol] : "");
            }

            const constraints = new Set();
            if (row && !Array.isArray(row)) {
                Object.keys(row).forEach(col => {
                    const match = col.match(/- (\d+):(\d+)(am|pm)-\d+:\d+(am|pm) - (\w+)/);
                    if (match && String(row[col]).toLowerCase().trim() === 'x') {
                        let h = parseInt(match[1]);
                        const m = match[2];
                        const ampm = match[3];
                        const day = match[5].substring(0, 3);
                        if (ampm === 'pm' && h !== 12) h += 12;
                        constraints.add(`${day} ${h.toString().padStart(2, '0')}:${m}`);
                    }
                });
            }

            return {
                lastName: (nameParts.last || "").trim().toLowerCase(),
                parts: this.cleanNameParts(fullName),
                pref,
                constraints
            };
        });

        // 2. Process Teaching Data
        const instructorData = {};
        let currentCourse = "";
        teachingData.forEach(row => {
            // teachingData should be Array of Arrays if parsed with header: false
            const vals = Array.isArray(row) ? row : Object.values(row);

            const courseCell = vals.find(v => String(v || "").trim().match(/^MA\s*\d+/i));
            if (courseCell) currentCourse = String(courseCell).trim();

            const instrCell = vals.find(v => String(v || "").includes("(Instr)"));
            const timeCell = vals.find(v => /\d{1,2}:\d{2}\s*[ap]m?-\d{1,2}:\d{2}\s*[ap]m?/i.test(String(v || ""))) || vals[3];

            if (instrCell) {
                const name = String(instrCell).replace("(Instr)", "").trim();
                const times = [];
                if (timeCell) {
                    const parts = String(timeCell).trim().split(' ');
                    if (parts.length >= 2) {
                        const daysRaw = parts[0];
                        const tRange = parts[1];
                        const time24 = this.convert24h(tRange.split('-')[0]);
                        this.parseDays(daysRaw).forEach(d => times.push(`${d} ${time24}`));
                    }
                }
                if (!instructorData[name]) instructorData[name] = { course: currentCourse, sections: 0, teachingTimes: new Set() };
                instructorData[name].sections += 1;
                times.forEach(t => instructorData[name].teachingTimes.add(t));
            }
        });

        // 3. Match && Create Final Instructor List
        const finalInstructors = [];

        // Add Teaching Instructors
        Object.keys(instructorData).forEach(instName => {
            const data = instructorData[instName];
            const match = this.findBestMatch(instName, peopleRecords);
            const totalUnavail = new Set([...data.teachingTimes, ...(match ? match.constraints : [])]);

            finalInstructors.push({
                name: instName,
                course: data.course,
                sections: data.sections,
                unavail: Array.from(totalUnavail),
                isMRR: false,
                required: this.calculateRequired(data.course, data.sections),
                pref: match ? match.pref : "No preference",
                assignments: []
            });
        });

        // Add MRR Staff
        mrrData.forEach(row => {
            const first = this.getRowValue(row, ['first', 'given']) || (row && row.name_first) || (row && row.first) || "";
            const last = this.getRowValue(row, ['last', 'surname', 'family']) || (row && row.name_last) || (row && row.last) || "";
            let name = "";
            if (first || last) {
                name = `${last}${first ? ', ' + first : ''}`.trim();
            } else {
                const parsed = this.parseName(this.getRowValue(row, ['name']));
                name = parsed.full || "Unknown";
            }

            const hoursRaw =
                this.getRowValue(row, ['hours', 'mrr']) ||
                (row && row['Number of hours working in MRR']) ||
                (row && row.hours) ||
                (row && row.Hours) ||
                "";
            const hours = Math.max(0, parseInt(hoursRaw, 10) || 0);
            const match = this.findBestMatch(name, peopleRecords);

            finalInstructors.push({
                name: name,
                course: 'MRR',
                sections: hours,
                unavail: match ? Array.from(match.constraints) : [],
                isMRR: true,
                required: hours,
                pref: match ? match.pref : "No preference",
                assignments: []
            });
        });

        this.state.history = []; // Clear history on new generation
        this.state.instructors = finalInstructors;

        // Notify UI that data is ready for preview
        if (this.onPreview) this.onPreview(this.state);
        // this.runScheduler(); // Removed to allow preview first
    }

    findBestMatch(name, people) {
        if (!name) return null;
        const parts = this.cleanNameParts(name);
        let best = null;
        let maxIntersect = 0;

        for (const p of people) {
            const intersection = new Set([...parts].filter(x => p.parts.has(x)));
            if (intersection.size > maxIntersect) {
                maxIntersect = intersection.size;
                best = p;
            }
        }

        // Fallback to last name match
        if (maxIntersect < 2) {
            const lastName = name.split(',')[0].trim().toLowerCase();
            best = people.find(p => p.lastName === lastName) || best;
        }
        return best;
    }

    calculateRequired(course, sections) {
        const s = Number(sections);
        if (!Number.isFinite(s)) return 0;
        if (this.state.config.halfHourCourses.includes(course)) {
            return Math.floor(s * 0.5);
        }
        return Math.trunc(s);
    }

    // --- Scheduler Engine (scheduler2.py logic) ---
    async runScheduler() {
        const { days, slots } = this.state.config;
        const schedule = {};
        days.forEach(d => {
            schedule[d] = {};
            this.getSlotsForDay(d).forEach(t => {
                schedule[d][t] = [];
            });
        });

        // Initialize assignment tracking on the actual state objects
        this.state.instructors.forEach(inst => {
            inst.assigned = 0;
            inst.assignments = [];
        });

        this.state.schedule = schedule;
        this.computeCoreCourses();
        const staffQueue = [...this.state.instructors].sort((a, b) => b.required - a.required);

        const maxReq = Math.max(...staffQueue.map(s => s.required), 0);
        for (let round = 0; round < maxReq; round++) {
            for (const person of staffQueue) {
                if (person.assigned >= person.required) continue;

                const possible = [];
                Object.keys(schedule).forEach(d => {
                    Object.keys(schedule[d]).forEach(t => {
                        const slotId = `${d} ${t}`;
                        if (person.unavail.includes(slotId) || person.assignments.includes(slotId)) return;

                        let score = (schedule[d][t].length ** 2) * 25;

                        // Favor course variety in the room
                        if (!schedule[d][t].some(s => s.course === person.course)) score -= 80;

                        // Coverage bonus for core courses (prefer filling missing core coverage)
                        if (!person.isMRR) {
                            const missing = this.getMissingCoreForEntries(schedule[d][t] || []);
                            const hasMRR = (schedule[d][t] || []).some(s => s.isMRR);
                            const isCore = (this.state.config.coreCourses || []).some(core => {
                                const nc = this.normalizeCourse(core);
                                const np = this.normalizeCourse(person.course);
                                return np.includes(nc) || nc.includes(np);
                            });
                            if (isCore && missing.some(m => {
                                const nm = this.normalizeCourse(m);
                                const np = this.normalizeCourse(person.course);
                                return np.includes(nm) || nm.includes(np);
                            })) {
                                score -= hasMRR ? 40 : 120;
                            }
                        }

                        // NEW: Back-to-Back Preference logic
                        const slotsForDay = this.getSlotsForDay(d);
                        const tIdx = slotsForDay.indexOf(t);
                        const hasAdjacent = person.assignments.some(a => {
                            const [ad, at] = a.split(' ');
                            if (ad !== d) return false;
                            const atIdx = slotsForDay.indexOf(at);
                            return Math.abs(tIdx - atIdx) === 1;
                        });

                        if (person.pref === 'Yes' && hasAdjacent) {
                            score -= 100; // Strong priority to stick together
                        } else if (person.pref === 'No' && hasAdjacent) {
                            score += 150; // Strong penalty for back-to-back if they hate it
                        }

                        possible.push({ score, d, t });
                    });
                });

                if (possible.length > 0) {
                    possible.sort((a, b) => a.score - b.score);
                    const best = possible[0];
                    schedule[best.d][best.t].push({ name: person.name, course: person.course, isMRR: person.isMRR });
                    person.assigned++;
                    person.assignments.push(`${best.d} ${best.t}`);

                    // Progressive rendering with focus (Only in Full View)
                    const isFullView = document.body.classList.contains('full-view-mode');
                    if (isFullView) {
                        this.state.activeAssignment = { d: best.d, t: best.t, name: person.name };
                        this.render();
                        await new Promise(r => setTimeout(r, 60)); // "Eye candy" delay (slightly longer for focus)
                    }
                }
            }
        }

        // Ensure last highlight is visible before optimization
        if (document.body.classList.contains('full-view-mode')) {
            await new Promise(r => setTimeout(r, 400));
        }

        this.state.activeAssignment = null;
        this.state.optimizationCount = 0;

        this.ensureCoverageWithMRR();
        this.fillUnderAssigned();
        await this.optimizeSchedule();

        console.log("Detected Core Courses:", this.state.config.coreCourses);
        this.saveHistory(); // Save initial stable state
        this.state.optimizationCount = 0;
        this.state.activeAssignment = null;
        this.render();
    }

    saveHistory() {
        const snapshot = {
            schedule: JSON.parse(JSON.stringify(this.state.schedule)),
            instructors: this.state.instructors.map(i => ({
                name: i.name,
                assigned: i.assigned,
                assignments: [...i.assignments]
            }))
        };
        this.state.history.push(snapshot);
        if (this.state.history.length > 50) this.state.history.shift();
    }

    undo() {
        if (this.state.history.length <= 1) {
            console.log("No more history to undo");
            return;
        }

        this.state.history.pop(); // Remove current
        const prev = this.state.history[this.state.history.length - 1]; // Get previous

        this.state.schedule = JSON.parse(JSON.stringify(prev.schedule));

        // Restore each instructor's assignment list
        prev.instructors.forEach(saved => {
            const inst = this.state.instructors.find(i => i.name === saved.name);
            if (inst) {
                inst.assigned = saved.assigned;
                inst.assignments = [...saved.assignments];
            }
        });

        this.state.optimizationCount = 0;
        this.state.activeAssignment = null;
        this.render();
    }

    moveStaff(name, oldSlotId, newSlotId) {
        if (oldSlotId === newSlotId) return;

        const instructor = this.state.instructors.find(i => i.name === name);
        if (!instructor) return;

        // Ensure IDs are clean
        const cleanOldId = oldSlotId ? oldSlotId.trim() : null;
        const cleanNewId = newSlotId ? newSlotId.trim() : null;

        // Prevent double booking programmatically
        if (cleanNewId && instructor.assignments.includes(cleanNewId)) {
            return;
        }

        this.saveHistory(); // Save BEFORE moving

        // 1. Remove from old slot
        if (cleanOldId) {
            const [oldD, oldT] = cleanOldId.split(' ');
            if (this.state.schedule[oldD]?.[oldT]) {
                this.state.schedule[oldD][oldT] = this.state.schedule[oldD][oldT].filter(s => s.name !== name);
                instructor.assignments = instructor.assignments
                    .map(id => id.trim())
                    .filter(id => id !== cleanOldId);
                instructor.assigned = instructor.assignments.length;
            }
        }

        // 2. Add to new slot
        if (cleanNewId) {
            const [newD, newT] = cleanNewId.split(' ');
            if (this.state.schedule[newD]?.[newT]) {
                this.state.schedule[newD][newT].push({ name: instructor.name, course: instructor.course, isMRR: instructor.isMRR });
                instructor.assignments.push(cleanNewId);
                instructor.assigned = instructor.assignments.length;
            }
        }

        this.render();
    }

    updateInstructor(index, field, value) {
        const inst = this.state.instructors[index];
        if (!inst) return;
        if (field === 'required') {
            const num = Number(value);
            inst.required = Number.isFinite(num) ? Math.max(0, num) : 0;
            return;
        }
        if (field === 'course') {
            inst.course = value;
            const courseNorm = String(value || '').trim().toUpperCase();
            inst.isMRR = courseNorm === 'MRR' || courseNorm.startsWith('MRR/');
            return;
        }
        if (field === 'pref') {
            inst.pref = this.normalizePref(value);
            return;
        }
        inst[field] = value;
    }

    swapStaff(nameA, oldSlotId, nameB, newSlotId) {
        // Validation checks
        if (!nameA || !nameB || !oldSlotId || !newSlotId) return;
        if (oldSlotId === newSlotId) return; // Same slot

        const instA = this.state.instructors.find(i => i.name === nameA);
        const instB = this.state.instructors.find(i => i.name === nameB);
        if (!instA || !instB) return;

        const cleanOldId = oldSlotId.trim();
        const cleanNewId = newSlotId.trim();

        // 1. Save history before any changes
        this.saveHistory();

        // 2. Remove A from old slot && B from new slot
        const [oldD, oldT] = cleanOldId.split(' ');
        if (this.state.schedule[oldD]?.[oldT]) {
            this.state.schedule[oldD][oldT] = this.state.schedule[oldD][oldT].filter(s => s.name !== nameA);
            instA.assignments = instA.assignments.filter(id => id.trim() !== cleanOldId);
        }

        const [newD, newT] = cleanNewId.split(' ');
        if (this.state.schedule[newD]?.[newT]) {
            this.state.schedule[newD][newT] = this.state.schedule[newD][newT].filter(s => s.name !== nameB);
            instB.assignments = instB.assignments.filter(id => id.trim() !== cleanNewId);
        }

        // 3. Add A to new slot
        if (this.state.schedule[newD]?.[newT]) {
            this.state.schedule[newD][newT].push({ name: instA.name, course: instA.course, isMRR: instA.isMRR });
            instA.assignments.push(cleanNewId);
        }

        // 4. Add B to old slot
        if (this.state.schedule[oldD]?.[oldT]) {
            this.state.schedule[oldD][oldT].push({ name: instB.name, course: instB.course, isMRR: instB.isMRR });
            instB.assignments.push(cleanOldId);
        }

        // 5. Update assigned count for both
        instA.assigned = instA.assignments.length;
        instB.assigned = instB.assignments.length;

        this.state.optimizationCount = 0;
        this.state.activeAssignment = null;
        this.render();
    }

    addConstraint(index, slot) {
        const inst = this.state.instructors[index];
        if (inst && !inst.unavail.includes(slot)) {
            inst.unavail.push(slot);
        }
    }

    removeConstraint(index, slot) {
        const inst = this.state.instructors[index];
        if (inst) {
            inst.unavail = inst.unavail.filter(s => s !== slot);
        }
    }

    addInstructor() {
        this.state.instructors.push({
            name: "New Instructor",
            course: "MRR",
            sections: 1,
            unavail: [],
            isMRR: true,
            required: 1,
            pref: "No preference",
            assignments: []
        });
        if (this.onPreview) this.onPreview(this.state);
    }

    deleteInstructor(index) {
        if (this.state.instructors[index]) {
            this.state.instructors.splice(index, 1);
            if (this.onPreview) this.onPreview(this.state);
        }
    }

    // --- New Entry Point Logic ---

    async processSingleFile(data) {
        this.state.instructors = data.map(row => {
            const name = row.Instructor || row.Name || row.name || "";
            const course = row.Course || row.course || "";
            const sectionsNum = Number(row.Sections || row.sections || 0);
            const unavailRaw = row['Total Unavailability'] || row.unavailability || "";
            return {
                name: name,
                course: course,
                sections: Number.isFinite(sectionsNum) ? sectionsNum : 0,
                unavail: unavailRaw ? String(unavailRaw).split(',').map(s => s.trim()).filter(s => s) : [],
                isMRR: String(course || '').trim().toUpperCase().startsWith('MRR'),
                required: Number.isFinite(sectionsNum) ? sectionsNum : 0,
                pref: this.normalizePref(row['Back-to-Back Preference'] || row.pref || ""),
                assignments: []
            };
        });

        this.state.history = [];
        if (this.onPreview) this.onPreview(this.state);
    }

    startFromEmpty() {
        this.state.instructors = [];
        this.state.history = [];
        if (this.onPreview) this.onPreview(this.state);
    }

    generateCSV() {
        const headers = ["Instructor", "Course", "Sections", "Back-to-Back Preference", "Total Unavailability"];
        const rows = this.state.instructors.map(inst => [
            inst.name,
            inst.course,
            inst.required,
            inst.pref,
            (inst.unavail || []).join(', ')
        ]);

        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    // --- UI Rendering ---
    async optimizeSchedule() {
        const { slots } = this.state.config;
        const isFullView = document.body.classList.contains('full-view-mode');
        let improved = true;
        let iterations = 0;
        const maxIterations = 2; // Limit passes to prevent infinite loops || long waits
        let totalSwaps = 0;

        while (improved && iterations < maxIterations) {
            improved = false;
            iterations++;

            for (let i = 0; i < this.state.instructors.length; i++) {
                for (let j = i + 1; j < this.state.instructors.length; j++) {
                    const instA = this.state.instructors[i];
                    const instB = this.state.instructors[j];

                    for (let aIdx = 0; aIdx < instA.assignments.length; aIdx++) {
                        for (let bIdx = 0; bIdx < instB.assignments.length; bIdx++) {
                            const slotA = instA.assignments[aIdx];
                            const slotB = instB.assignments[bIdx];

                            if (slotA === slotB) continue;

                            const [dA, tA] = slotA.split(' ');
                            const [dB, tB] = slotB.split(' ');

                            // Check constraints
                            if (instA.unavail.includes(slotB) || instB.unavail.includes(slotA)) continue;
                            if (instA.assignments.includes(slotB) || instB.assignments.includes(slotA)) continue;

                            // Calculate scores
                            const scoreCurrent = this.getAssignmentQuality(instA, dA, tA) + this.getAssignmentQuality(instB, dB, tB);

                            // Temporary swap for scoring
                            const instA_assignments_orig = [...instA.assignments];
                            const instB_assignments_orig = [...instB.assignments];
                            instA.assignments[aIdx] = slotB;
                            instB.assignments[bIdx] = slotA;

                            // coverage guard: avoid creating gaps without MRR
                            const slotAEntries = this.state.schedule[dA][tA].filter(s => s.name !== instA.name).concat([{ name: instB.name, course: instB.course, isMRR: instB.isMRR }]);
                            const slotBEntries = this.state.schedule[dB][tB].filter(s => s.name !== instB.name).concat([{ name: instA.name, course: instA.course, isMRR: instA.isMRR }]);
                            const missingA = this.getMissingCoreForEntries(slotAEntries);
                            const missingB = this.getMissingCoreForEntries(slotBEntries);
                            const hasMRRA = slotAEntries.some(e => e.isMRR);
                            const hasMRRB = slotBEntries.some(e => e.isMRR);
                            const coverageOk = !(missingA.length > 0 && !hasMRRA) && !(missingB.length > 0 && !hasMRRB);

                            const scoreSwapped = this.getAssignmentQuality(instA, dB, tB) + this.getAssignmentQuality(instB, dA, tA);

                            if (coverageOk && scoreSwapped < scoreCurrent) {
                                // Keep swap - update state schedule array as well
                                this.state.schedule[dA][tA] = this.state.schedule[dA][tA].filter(s => s.name !== instA.name);
                                this.state.schedule[dA][tA].push({ name: instB.name, course: instB.course, isMRR: instB.isMRR });

                                this.state.schedule[dB][tB] = this.state.schedule[dB][tB].filter(s => s.name !== instB.name);
                                this.state.schedule[dB][tB].push({ name: instA.name, course: instA.course, isMRR: instA.isMRR });

                                improved = true;
                                totalSwaps++;

                                if (isFullView) {
                                    this.state.activeAssignment = { d: dB, t: tB, name: instA.name };
                                    this.state.optimizationCount = totalSwaps;
                                    this.render();
                                    await new Promise(r => setTimeout(r, 40));
                                }
                            } else {
                                // Revert
                                instA.assignments = instA_assignments_orig;
                                instB.assignments = instB_assignments_orig;
                            }
                        }
                    }
                }
            }
        }
        this.state.activeAssignment = null;
        this.state.optimizationCount = totalSwaps;
        this.render();
    }

    getAssignmentQuality(person, d, t) {
        const schedule = this.state.schedule;
        let score = (schedule[d][t].length ** 2) * 25;

        if (!schedule[d][t].some(s => s.name !== person.name && s.course === person.course)) score -= 80;

        const slotsForDay = this.getSlotsForDay(d);
        const tIdx = slotsForDay.indexOf(t);
        const hasAdjacent = person.assignments.some(a => {
            const [ad, at] = a.split(' ');
            if (ad !== d || at === t) return false;
            const atIdx = slotsForDay.indexOf(at);
            return Math.abs(tIdx - atIdx) === 1;
        });

        if (person.pref === 'Yes' && hasAdjacent) score -= 100;
        else if (person.pref === 'No' && hasAdjacent) score += 150;

        return score;
    }

    render() {
        // This will be overridden by the UI handler to update the DOM
        if (this.onRender) this.onRender(this.state);
    }
}

// Global instance
window.scheduler = new ShiftHappensScheduler();
