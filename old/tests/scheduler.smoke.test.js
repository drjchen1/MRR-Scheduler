const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createScheduler() {
  const appJsPath = path.join(__dirname, '..', 'app.js');
  const source = fs.readFileSync(appJsPath, 'utf8');

  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {},
    document: {
      body: {
        classList: {
          contains: () => false
        }
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: appJsPath });
  return context.window.scheduler;
}

function slotId(day, time) {
  return `${day} ${time}`;
}

test('runScheduler smoke: no duplicate assignments and no blocked-slot assignments', async () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(
    ['Mon', 'Tue'],
    [],
    {
      Mon: ['09:30', '10:30'],
      Tue: ['09:30', '10:30']
    }
  );

  scheduler.state.instructors = [
    {
      name: 'Doe, Jane',
      course: 'MA 16100',
      sections: 2,
      unavail: [slotId('Mon', '09:30')],
      isMRR: false,
      required: 2,
      pref: 'No preference',
      assignments: []
    },
    {
      name: 'Smith, John',
      course: 'MA 16200',
      sections: 2,
      unavail: [slotId('Tue', '10:30')],
      isMRR: false,
      required: 2,
      pref: 'Yes',
      assignments: []
    },
    {
      name: 'Taylor, Alex',
      course: 'MRR',
      sections: 2,
      unavail: [],
      isMRR: true,
      required: 2,
      pref: 'No',
      assignments: []
    }
  ];

  await scheduler.runScheduler();

  scheduler.state.instructors.forEach((inst) => {
    const unique = new Set(inst.assignments);
    assert.equal(unique.size, inst.assignments.length, `${inst.name} has duplicate slot assignments`);
    inst.assignments.forEach((slot) => {
      assert.equal(inst.unavail.includes(slot), false, `${inst.name} assigned into blocked slot ${slot}`);
    });
  });
});

test('setScheduleConfig/getAllSlots: custom day-slot shape is preserved', () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(
    ['Mon', 'Wed', 'Fri'],
    [],
    {
      Mon: ['09:30', '11:30'],
      Wed: ['10:30'],
      Fri: ['08:30', '12:30']
    }
  );

  assert.deepEqual([...scheduler.state.config.days], ['Mon', 'Wed', 'Fri']);
  assert.deepEqual([...scheduler.getSlotsForDay('Mon')], ['09:30', '11:30']);
  assert.deepEqual([...scheduler.getSlotsForDay('Wed')], ['10:30']);
  assert.deepEqual([...scheduler.getSlotsForDay('Fri')], ['08:30', '12:30']);

  const allSlots = [...scheduler.getAllSlots()];
  assert.deepEqual(allSlots, ['08:30', '09:30', '10:30', '11:30', '12:30']);
});

test('moveStaff and swapStaff keep instructor assignments and schedule cells in sync', () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(
    ['Mon'],
    [],
    { Mon: ['09:30', '10:30'] }
  );

  scheduler.state.instructors = [
    {
      name: 'Alpha, Ann',
      course: 'MA 16100',
      sections: 1,
      unavail: [],
      isMRR: false,
      required: 1,
      pref: 'No preference',
      assignments: [slotId('Mon', '09:30')],
      assigned: 1
    },
    {
      name: 'Beta, Bob',
      course: 'MRR',
      sections: 1,
      unavail: [],
      isMRR: true,
      required: 1,
      pref: 'No preference',
      assignments: [slotId('Mon', '10:30')],
      assigned: 1
    }
  ];

  scheduler.state.schedule = {
    Mon: {
      '09:30': [{ name: 'Alpha, Ann', course: 'MA 16100', isMRR: false }],
      '10:30': [{ name: 'Beta, Bob', course: 'MRR', isMRR: true }]
    }
  };
  scheduler.saveHistory();

  scheduler.moveStaff('Alpha, Ann', slotId('Mon', '09:30'), slotId('Mon', '10:30'));
  const alpha = scheduler.state.instructors.find((i) => i.name === 'Alpha, Ann');
  assert(alpha.assignments.includes(slotId('Mon', '10:30')));
  assert.equal(alpha.assignments.includes(slotId('Mon', '09:30')), false);
  assert.equal(
    scheduler.state.schedule.Mon['10:30'].some((s) => s.name === 'Alpha, Ann'),
    true
  );

  // Reset to clean one-person-per-slot state for swap validation.
  alpha.assignments = [slotId('Mon', '09:30')];
  alpha.assigned = 1;
  const beta = scheduler.state.instructors.find((i) => i.name === 'Beta, Bob');
  beta.assignments = [slotId('Mon', '10:30')];
  beta.assigned = 1;
  scheduler.state.schedule = {
    Mon: {
      '09:30': [{ name: 'Alpha, Ann', course: 'MA 16100', isMRR: false }],
      '10:30': [{ name: 'Beta, Bob', course: 'MRR', isMRR: true }]
    }
  };

  scheduler.swapStaff('Alpha, Ann', slotId('Mon', '09:30'), 'Beta, Bob', slotId('Mon', '10:30'));
  assert.equal(
    scheduler.state.schedule.Mon['09:30'].some((s) => s.name === 'Alpha, Ann'),
    false
  );
  assert.equal(
    scheduler.state.schedule.Mon['10:30'].some((s) => s.name === 'Beta, Bob'),
    false
  );
  assert.equal(
    scheduler.state.schedule.Mon['09:30'].some((s) => s.name === 'Beta, Bob'),
    true
  );
  assert.equal(
    scheduler.state.schedule.Mon['10:30'].some((s) => s.name === 'Alpha, Ann'),
    true
  );
});

test('processSingleFile parses required fields and normalizes preferences', async () => {
  const scheduler = createScheduler();

  const rows = [
    {
      Instructor: 'Gamma, Gia',
      Course: 'MRR / MA 16100',
      Sections: '3',
      'Back-to-Back Preference': 'yes please',
      'Total Unavailability': 'Mon 09:30, Tue 10:30'
    },
    {
      Name: 'Delta, Dan',
      course: 'MA 16200',
      sections: '2',
      pref: 'No preference',
      unavailability: ''
    }
  ];

  await scheduler.processSingleFile(rows);

  assert.equal(scheduler.state.instructors.length, 2);
  assert.equal(scheduler.state.instructors[0].isMRR, true);
  assert.equal(scheduler.state.instructors[0].required, 3);
  assert.equal(scheduler.state.instructors[0].pref, 'Yes');
  assert.deepEqual([...scheduler.state.instructors[0].unavail], ['Mon 09:30', 'Tue 10:30']);

  assert.equal(scheduler.state.instructors[1].isMRR, false);
  assert.equal(scheduler.state.instructors[1].required, 2);
  assert.equal(scheduler.state.instructors[1].pref, 'No preference');
});

test('exportSessionJSON and importSessionJSON serialize and restore schedule state correctly', () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(
    ['Mon', 'Tue'],
    [],
    {
      Mon: ['09:30', '10:30'],
      Tue: ['09:30', '10:30']
    }
  );

  scheduler.state.instructors = [
    {
      name: 'Epsilon, Evan',
      course: 'MA 16100',
      sections: 1,
      unavail: ['Mon 09:30'],
      isMRR: false,
      required: 1,
      pref: 'Yes',
      assignments: ['Mon 10:30']
    }
  ];

  scheduler.state.schedule = {
    Mon: {
      '09:30': [],
      '10:30': [{ name: 'Epsilon, Evan', course: 'MA 16100', isMRR: false }]
    },
    Tue: {
      '09:30': [],
      '10:30': []
    }
  };

  const jsonString = scheduler.exportSessionJSON();
  const parsed = JSON.parse(jsonString);

  assert.equal(parsed.version, '1.0');
  assert.equal(parsed.instructors.length, 1);
  assert.equal(parsed.instructors[0].name, 'Epsilon, Evan');
  assert.equal(parsed.schedule.Mon['10:30'][0].name, 'Epsilon, Evan');

  // Clear state and import
  const scheduler2 = createScheduler();
  const success = scheduler2.importSessionJSON(jsonString);

  assert.equal(success, true);
  assert.equal(scheduler2.state.instructors.length, 1);
  assert.equal(scheduler2.state.instructors[0].name, 'Epsilon, Evan');
  assert.deepEqual([...scheduler2.state.instructors[0].assignments], ['Mon 10:30']);
  assert.equal(scheduler2.state.schedule.Mon['10:30'][0].name, 'Epsilon, Evan');
  assert.deepEqual([...scheduler2.state.config.days], ['Mon', 'Tue']);
});

test('findBestMatch handles fuzzy last name spelling variations and prevents false middle-name matches', () => {
  const scheduler = createScheduler();

  const people = [
    {
      fullName: 'Ashamallah, Kyle',
      lastName: 'ashamallah',
      firstName: 'kyle',
      parts: new Set(['ashamallah', 'kyle'])
    },
    {
      fullName: 'Yandell, Evan',
      lastName: 'yandell',
      firstName: 'evan',
      parts: new Set(['yandell', 'evan'])
    },
    {
      fullName: 'Rehwinkel, Philip F',
      lastName: 'rehwinkel',
      firstName: 'philip',
      parts: new Set(['rehwinkel', 'philip'])
    }
  ];

  // 1. Ashmallah (with 'm') should fuzzy-match Ashamallah (with 'a'), NOT Rehwinkel (who has 'Philip')
  const matchAshamallah = scheduler.findBestMatch('Ashmallah, Kyle Philip', people);
  assert.equal(matchAshamallah ? matchAshamallah.fullName : null, 'Ashamallah, Kyle');

  // 2. Corcoran, James Evan should NOT match Evan Yandell just because of the middle name 'Evan'
  const matchCorcoran = scheduler.findBestMatch('Corcoran, James Evan', people);
  assert.equal(matchCorcoran, null);
});

test('MA 15300 is included in potentialCore and assigns 1 hour per section', () => {
  const scheduler = createScheduler();

  assert(scheduler.state.config.potentialCore.includes('MA 15300'));
  assert.equal(scheduler.calculateRequired('MA 15300', 1), 1);
  assert.equal(scheduler.state.config.halfHourCourses.includes('MA 15300'), false);
});

test('MRR coverage algorithm covers slots missing MA 15300 with MRR staff', async () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(
    ['Mon'],
    [],
    { Mon: ['09:30', '10:30'] }
  );

  scheduler.state.instructors = [
    {
      name: 'Alpha, Alice',
      course: 'MA 15300',
      sections: 1,
      unavail: [slotId('Mon', '10:30')], // Blocked from 10:30, so must be at 09:30
      isMRR: false,
      required: 1,
      pref: 'No preference',
      assignments: []
    },
    {
      name: 'Beta, Bob',
      course: 'MRR',
      sections: 1,
      unavail: [slotId('Mon', '09:30')], // Available at 10:30
      isMRR: true,
      required: 1,
      pref: 'No preference',
      assignments: []
    }
  ];

  await scheduler.runScheduler();

  // Core courses should have detected MA 15300
  assert(scheduler.state.config.coreCourses.includes('MA 15300'));

  // Alice covers 09:30
  const alice = scheduler.state.instructors.find(i => i.name === 'Alpha, Alice');
  assert.deepEqual([...alice.assignments], [slotId('Mon', '09:30')]);

  // Bob (MRR) covers 10:30 (where MA 15300 is missing)
  const bob = scheduler.state.instructors.find(i => i.name === 'Beta, Bob');
  assert.deepEqual([...bob.assignments], [slotId('Mon', '10:30')]);

  // Check that slot 10:30 has Bob as MRR covering MA 15300
  const slot1030 = scheduler.state.schedule.Mon['10:30'];
  assert.equal(slot1030.some(s => s.isMRR), true);
});

test('User can select and add custom required courses to enforce MRR coverage even without primary instructors', async () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(
    ['Mon'],
    [],
    { Mon: ['09:30', '10:30'] }
  );

  // Instructors only teach MA 16100 and MRR (no MA 15300 or STAT 30100 primary instructor)
  scheduler.state.instructors = [
    {
      name: 'Teacher One',
      course: 'MA 16100',
      sections: 2,
      unavail: [],
      isMRR: false,
      required: 2,
      pref: 'No preference',
      assignments: []
    },
    {
      name: 'MRR Staff',
      course: 'MRR',
      sections: 2,
      unavail: [],
      isMRR: true,
      required: 2,
      pref: 'No preference',
      assignments: []
    }
  ];

  // Verify detected courses
  assert.deepEqual([...scheduler.getDetectedCourses()], ['MA 16100']);

  // User adds custom course and selects MA 15300
  scheduler.addRequiredCourse('STAT 30100');
  scheduler.toggleRequiredCourse('MA 15300', true);

  assert(scheduler.state.config.coreCourses.includes('STAT 30100'));
  assert(scheduler.state.config.coreCourses.includes('MA 15300'));

  await scheduler.runScheduler();

  // Primary instructor is in both slots for MA 16100
  // But slots are missing MA 15300 and STAT 30100
  // Scheduler must ensure MRR staff covers them
  const mrr = scheduler.state.instructors.find(i => i.name === 'MRR Staff');
  assert.equal(mrr.assigned, 2);

  // Check that missing core courses in Mon 09:30 includes MA 15300 and STAT 30100
  const entries0930 = scheduler.state.schedule.Mon['09:30'];
  const missing0930 = scheduler.getMissingCoreForEntries(entries0930);
  assert(missing0930.includes('MA 15300'));
  assert(missing0930.includes('STAT 30100'));

  // Test session export/import preserves custom and selected courses
  const sessionJson = scheduler.exportSessionJSON();
  const scheduler2 = createScheduler();
  scheduler2.importSessionJSON(sessionJson);

  assert(scheduler2.state.config.coreCourses.includes('MA 15300'));
  assert(scheduler2.state.config.coreCourses.includes('STAT 30100'));
  assert(scheduler2.state.config.customCoreCourses.includes('STAT 30100'));
});

test('Missing core courses and MRR coverage lists are sorted in natural numerical order', () => {
  const scheduler = createScheduler();
  scheduler.state.config.coreCourses = ['MA 26100', 'MA 15300', 'MA 16010', 'MA 15800', 'MA 16200'];

  const missing = scheduler.getMissingCoreForEntries([]);
  assert.deepEqual([...missing], ['MA 15300', 'MA 15800', 'MA 16010', 'MA 16200', 'MA 26100']);
});

test('style.css and index.html contain letter-sized landscape print stylesheet without name truncation', () => {
  const styleCssPath = path.join(__dirname, '..', 'style.css');
  const indexHtmlPath = path.join(__dirname, '..', 'index.html');
  const styleSource = fs.readFileSync(styleCssPath, 'utf8');
  const indexSource = fs.readFileSync(indexHtmlPath, 'utf8');

  // Verify @page configuration for letter landscape
  assert.match(styleSource, /size:\s*letter\s+landscape;/i, 'style.css missing letter landscape page size');
  assert.match(styleSource, /@media\s+print/i, 'style.css missing @media print');
  assert.match(styleSource, /\.staff-name\s*\{[^}]*white-space:\s*normal/i, 'style.css should prevent staff name clipping in print mode');

  // Verify index.html contains print button, print header, and print function
  assert.match(indexSource, /printSchedule\(\)/, 'index.html missing printSchedule handler call');
  assert.match(indexSource, /class="[^"]*print-header[^"]*"/, 'index.html missing print-header element');
  assert.match(indexSource, /function\s+printSchedule\s*\(/, 'index.html missing printSchedule function definition');
  assert.match(indexSource, /letter\s+landscape/, 'index.html exportHTML missing letter landscape page size');
});

test('setOptimizationPreset applies correct levels for each built-in preset', () => {
  const scheduler = createScheduler();

  // Balanced (default) preset
  scheduler.setOptimizationPreset('balanced');
  assert.equal(scheduler.state.config.weights.preset, 'balanced');
  assert.equal(scheduler.state.config.weights.backToBack, 'high');
  assert.equal(scheduler.state.config.weights.staffingBalance, 'medium');
  assert.equal(scheduler.state.config.weights.courseDiversity, 'medium');
  assert.equal(scheduler.state.config.weights.coreCoverage, 'high');

  // Staff Preference Focus
  scheduler.setOptimizationPreset('staff_preferences');
  assert.equal(scheduler.state.config.weights.backToBack, 'strict');
  assert.equal(scheduler.state.config.weights.staffingBalance, 'low');

  // Even Staffing
  scheduler.setOptimizationPreset('even_staffing');
  assert.equal(scheduler.state.config.weights.staffingBalance, 'high');
  assert.equal(scheduler.state.config.weights.backToBack, 'low');

  // Subject Coverage Focus
  scheduler.setOptimizationPreset('subject_coverage');
  assert.equal(scheduler.state.config.weights.coreCoverage, 'strict');
  assert.equal(scheduler.state.config.weights.courseDiversity, 'high');

  // Unknown preset returns false without modifying weights
  const prevPreset = scheduler.state.config.weights.preset;
  const prevB2B = scheduler.state.config.weights.backToBack;
  const result = scheduler.setOptimizationPreset('nonexistent');
  assert.equal(result, false);
  assert.equal(scheduler.state.config.weights.preset, prevPreset);
  assert.equal(scheduler.state.config.weights.backToBack, prevB2B);
});

test('setOptimizationWeights detects custom preset when combination does not match any named preset', () => {
  const scheduler = createScheduler();

  // Apply a mix that does not match any preset
  scheduler.setOptimizationWeights({ backToBack: 'strict', staffingBalance: 'high', courseDiversity: 'ignore', coreCoverage: 'low' });
  assert.equal(scheduler.state.config.weights.preset, 'custom');

  // Apply the exact balanced combination and verify it is detected
  scheduler.setOptimizationWeights({ backToBack: 'high', staffingBalance: 'medium', courseDiversity: 'medium', coreCoverage: 'high' });
  assert.equal(scheduler.state.config.weights.preset, 'balanced');
});

test('getComputedWeights returns correct numeric values for the balanced preset', () => {
  const scheduler = createScheduler();
  scheduler.setOptimizationPreset('balanced');
  const cw = scheduler.getComputedWeights();

  // Balanced: backToBack=high → yesBonus 100, noPenalty 150; staffingBalance=medium → multiplier 25;
  // courseDiversity=medium → bonus 80; coreCoverage=high → nonMRR 120, mrr 40
  assert.equal(cw.b2bYesBonus, 100);
  assert.equal(cw.b2bNoPenalty, 150);
  assert.equal(cw.balanceMultiplier, 25);
  assert.equal(cw.diversityBonus, 80);
  assert.equal(cw.coverageNonMRRBonus, 120);
  assert.equal(cw.coverageMRRBonus, 40);
});

test('getComputedWeights reflects strict b2b preset values for staff_preferences preset', () => {
  const scheduler = createScheduler();
  scheduler.setOptimizationPreset('staff_preferences');
  const cw = scheduler.getComputedWeights();

  // staff_preferences: backToBack=strict → yesBonus 250, noPenalty 350
  assert.equal(cw.b2bYesBonus, 250);
  assert.equal(cw.b2bNoPenalty, 350);
});

test('exportSessionJSON and importSessionJSON preserve custom optimization weights', () => {
  const scheduler = createScheduler();

  scheduler.setScheduleConfig(['Mon'], [], { Mon: ['09:30'] });
  scheduler.setOptimizationWeights({ backToBack: 'strict', staffingBalance: 'high', courseDiversity: 'ignore', coreCoverage: 'strict' });

  const json = scheduler.exportSessionJSON();
  const parsed = JSON.parse(json);

  // Exported JSON should contain the weights
  assert.ok(parsed.config.weights, 'exported config should have weights');
  assert.equal(parsed.config.weights.backToBack, 'strict');
  assert.equal(parsed.config.weights.coreCoverage, 'strict');

  // Importing into a fresh scheduler should restore the same weights
  const scheduler2 = createScheduler();
  scheduler2.importSessionJSON(json);
  assert.equal(scheduler2.state.config.weights.backToBack, 'strict');
  assert.equal(scheduler2.state.config.weights.staffingBalance, 'high');
  assert.equal(scheduler2.state.config.weights.courseDiversity, 'ignore');
  assert.equal(scheduler2.state.config.weights.coreCoverage, 'strict');
});

test('index.html contains optimization priority UI elements and JS functions', () => {
  const indexHtmlPath = path.join(__dirname, '..', 'index.html');
  const source = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(source, /id="optimization-priorities"/, 'missing optimization-priorities card');
  assert.match(source, /applyOptimizationPreset\(/, 'missing applyOptimizationPreset function');
  assert.match(source, /setOptWeight\(/, 'missing setOptWeight function');
  assert.match(source, /refreshOptimizationUI\(/, 'missing refreshOptimizationUI function');
  assert.match(source, /id="opt-preset-balanced"/, 'missing Balanced preset button');
  assert.match(source, /id="preview-priorities-summary"/, 'missing preview stage priorities summary');
});

