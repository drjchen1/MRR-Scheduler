/**
 * MRR Scheduler Core Logic
 * Unified implementation of legacy Python scripts
 */

class MRRScheduler {
    constructor() {
        this.state = {
            instructors: [], // Combined list of MRR and Primary instructors
            schedule: {},    // { day: { time: [staff] } }
            history: [],
            config: {
                halfHourCourses: ['MA 15800', 'MA 16010', 'MA 16020'],
                potentialCore: ['MA 15800', 'MA 16010', 'MA 16020', 'MA 16100', 'MA 16200', 'MA 26100', 'MA 16500', 'MA 16600'],
                coreCourses: [], // Filtered core courses found in data
                days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                slots: ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"]
            }
        };
        this.dayRank = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5 };
    }

    // --- Helpers ---
    cleanNameParts(name) {
        if (!name) return new Set();
        const clean = name.replace("(Instr)", "").replace(/[^a-zA-Z\s,]/g, ' ').toLowerCase().replace(/,/g, ' ');
        return new Set(clean.split(/\s+/).filter(p => p.length > 1));
    }

    normalizeCourse(c) {
        if (!c) return "";
        // Remove all spaces and special chars, convert to upper
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

    // --- Data Processing (Merges instr.py and mrr.py logic) ---
    async processFiles(peopleData, mrrData, teachingData) {
        // 1. Process People Survey
        const peopleRecords = peopleData.map(row => {
            const firstName = Object.values(row)[2]; // Adjust based on CSV structure
            const lastName = Object.values(row)[1];
            const fullName = `${lastName}, ${firstName}`;

            // Robust preference detection
            const prefCol = Object.keys(row).find(k => {
                const key = k.toLowerCase();
                return key.includes('prefer') || key.includes('b2b') || key.includes('back');
            });
            const pref = prefCol ? row[prefCol] : "No preference";

            const constraints = new Set();
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

            return {
                lastName: lastName.trim().toLowerCase(),
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
            const col0 = String(vals[0] || "").trim();
            const col2 = String(vals[2] || "").trim();
            const col3 = vals[3];

            // Core course header usually starts with MA and a number
            if (col0 && col0.match(/^MA\s*\d+/i)) {
                currentCourse = col0;
            }

            if (col2 && col2.includes("(Instr)")) {
                const name = col2.replace("(Instr)", "").trim();
                const times = [];
                if (col3) {
                    const parts = String(col3).split(' ');
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

        // 3. Match and Create Final Instructor List
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
            const name = `${row.name_last}, ${row.name_first}`;
            const match = this.findBestMatch(name, peopleRecords);

            finalInstructors.push({
                name: name,
                course: 'MRR',
                sections: row['Number of hours working in MRR'],
                unavail: match ? Array.from(match.constraints) : [],
                isMRR: true,
                required: parseInt(row['Number of hours working in MRR']),
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
        if (this.state.config.halfHourCourses.includes(course)) {
            return Math.floor(sections * 0.5);
        }
        return parseInt(sections);
    }

    // --- Scheduler Engine (scheduler2.py logic) ---
    runScheduler() {
        const { days, slots } = this.state.config;
        const schedule = {};
        days.forEach(d => {
            schedule[d] = {};
            slots.forEach(t => {
                if (d === 'Fri' && (parseInt(t) >= 13 && t !== "13:30")) return; // Skip Fri afternoons
                if (d === 'Fri' && t === "13:30") return; // Skip 1:30 Fri too
                schedule[d][t] = [];
            });
        });

        // Initialize assignment tracking on the actual state objects
        this.state.instructors.forEach(inst => {
            inst.assigned = 0;
            inst.assignments = [];
        });

        const staffQueue = [...this.state.instructors].sort((a, b) => b.required - a.required);

        const maxReq = Math.max(...staffQueue.map(s => s.required), 0);
        for (let round = 0; round < maxReq; round++) {
            staffQueue.forEach(person => {
                if (person.assigned >= person.required) return;

                const possible = [];
                Object.keys(schedule).forEach(d => {
                    Object.keys(schedule[d]).forEach(t => {
                        const slotId = `${d} ${t}`;
                        if (person.unavail.includes(slotId) || person.assignments.includes(slotId)) return;

                        let score = (schedule[d][t].length ** 2) * 25;

                        // Favor course variety in the room
                        if (!schedule[d][t].some(s => s.course === person.course)) score -= 80;

                        // NEW: Back-to-Back Preference logic
                        const tIdx = slots.indexOf(t);
                        const hasAdjacent = person.assignments.some(a => {
                            const [ad, at] = a.split(' ');
                            if (ad !== d) return false;
                            const atIdx = slots.indexOf(at);
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
                }
            });
        }

        this.state.schedule = schedule;

        // Match core courses properly with normalization
        const normalizedPotential = this.state.config.potentialCore.map(c => this.normalizeCourse(c));

        this.state.config.coreCourses = this.state.config.potentialCore.filter((core, idx) => {
            const normCore = normalizedPotential[idx];
            return this.state.instructors.some(inst => {
                const normInst = this.normalizeCourse(inst.course);
                return normInst.includes(normCore) || normCore.includes(normInst);
            });
        });

        console.log("Detected Core Courses:", this.state.config.coreCourses);
        this.saveHistory(); // Save initial stable state
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
        if (this.state.instructors[index]) {
            if (field === 'required') value = parseInt(value) || 0;
            this.state.instructors[index][field] = value;
        }
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

        // 2. Remove A from old slot and B from new slot
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
        this.state.instructors = data.map(row => ({
            name: row.Instructor,
            course: row.Course,
            sections: parseInt(row.Sections) || 0,
            unavail: row['Total Unavailability'] ? row['Total Unavailability'].split(',').map(s => s.trim()).filter(s => s) : [],
            isMRR: row.Course === 'MRR' || row.Course === 'MRR/Gen',
            required: parseInt(row.Sections) || 0,
            pref: row['Back-to-Back Preference'] || "No preference",
            assignments: []
        }));

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
    render() {
        // This will be overridden by the UI handler to update the DOM
        if (this.onRender) this.onRender(this.state);
    }
}

// Global instance
window.scheduler = new MRRScheduler();
