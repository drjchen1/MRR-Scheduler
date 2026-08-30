/* Constraint analysis is intentionally separate from the UI and scheduling engine.
 * It provides user-facing feasibility explanations without making preferences hard blocks. */
(function attachConstraintTools(global) {
    function analyze(state, getSlotsForDay, normalizeCourse) {
        const issues = [];
        const days = state.config.days || [];
        const allSlotIds = days.flatMap(day => getSlotsForDay(day).map(time => `${day} ${time}`));
        const availableByInstructor = new Map();

        (state.instructors || []).forEach(instructor => {
            const available = allSlotIds.filter(slot => !(instructor.unavail || []).includes(slot));
            availableByInstructor.set(instructor.id, available);
            if (Number(instructor.required || 0) > available.length) {
                issues.push({
                    type: 'insufficient-availability',
                    instructorId: instructor.id,
                    name: instructor.name,
                    required: Number(instructor.required || 0),
                    available: available.length,
                    message: `${instructor.name} needs ${instructor.required} hours but is available for only ${available.length}.`
                });
            }
        });

        const coreCourses = state.config.coreCourses || [];
        coreCourses.forEach(course => {
            const normalizedCourse = normalizeCourse(course);
            const qualified = (state.instructors || []).filter(instructor =>
                instructor.isMRR || normalizeCourse(instructor.course).includes(normalizedCourse) || normalizedCourse.includes(normalizeCourse(instructor.course))
            );
            if (!qualified.length && allSlotIds.length) {
                issues.push({
                    type: 'unserviceable-core-course',
                    course,
                    message: `${course} is required for every slot, but no instructor or MRR staff can cover it.`
                });
            }
        });

        const hardBlocks = issues.filter(issue => issue.type === 'insufficient-availability' || issue.type === 'unserviceable-core-course');
        return {
            generatedAt: new Date().toISOString(),
            totalSlots: allSlotIds.length,
            feasible: hardBlocks.length === 0,
            issues,
            availableByInstructor
        };
    }

    global.ShiftHappensConstraints = { analyze };
})(window);
