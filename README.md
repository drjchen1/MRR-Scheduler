# 🗓️ Shift Happens

**Shift Happens** is an intelligent, dynamic web-based staffing and scheduling dashboard designed for clinical and academic rosters. It automatically transforms raw instructor availability, teaching sections, and coverage requirements into an optimized, conflict-free schedule with rich live-editing capabilities.

Built entirely with modern **HTML5**, **CSS3**, and **vanilla JavaScript (ES6+)**, Shift Happens runs **100% client-side** in your browser without requiring any backend server, database, or external setup.

---

## ✨ Key Features

### 🧠 Intelligent Optimization & Constraints
- 🛡️ **Conflict Armor**: Identifies overlaps and unavailability matrices from instructor data to ensure no staff member is ever double-booked or scheduled during blocked hours.
- 🎯 **Dynamic Course Coverage & MRR Engine**: Enforces required core course coverage (e.g., *MA 15300*, *MA 16100*, *STAT 30100*) in every slot. Missing primary courses are automatically covered by MRR staff with dynamic claim labels (e.g., `MRR / MA 15800, MA 16010`).
- 🔁 **Back-to-Back (B2B) Optimization**: Honors individual instructor preferences (`Yes`, `No`, or `No preference`) to either group consecutive teaching hours or spread them out across the week.
- 📊 **Real-Time Schedule Score**: Live composite dashboard metric evaluating **Coverage (40%)**, **Assignment Completeness (30%)**, **B2B Satisfaction (20%)**, and **Schedule Balance (10%)**.
- ⚠️ **Intelligent Warnings & Gap Tracking**: Real-time alerts highlighting uncovered required courses, incomplete staff assignments, and over-assigned hours.

### 🖱️ Interactive Live-Editing & Visual Tools
- 🖐️ **Drag-and-Drop Slot Editing**: Move staff between slots on the fly with real-time recalculation of schedule score, gaps, and hours.
- 🔄 **Direct & Modal Swapping**: Swap assignments by dragging one staff card directly onto another, or use the dedicated **Swap Staff** modal to trade assignments across distant days.
- 👥 **Interactive Staff Roster**: Collapsible sidebar listing all instructors with live assignment progress, B2B satisfaction badges, hover tooltips for scheduled slots and conflicts, and cross-highlighting on hover.
- 🔍 **Click-to-Locate**: Clicking any staff card in the schedule grid automatically scrolls to and highlights that instructor in the roster sidebar.
- 🌡️ **Availability Heatmap**: Visualize staffing depth and vulnerability per slot with a 5-tier color-coded heatmap.
- 🖥️ **Full View Mode**: One-click high-density fullscreen grid that fits the entire weekly schedule onto a single screen with compact badges.
- ⏪ **Infinite Undo**: Complete history stack allowing you to safely undo any manual move, swap, or optimization step.

### 🖨️ Printing, Saving & Exporting
- 📄 **Printer-Friendly Letter Layout**: Dedicated print engine formatted for standard **US Letter paper (landscape, 8.5" × 11")**, fitting the complete schedule onto a single page (or minimal pages) while keeping all instructor names and course badges completely visible without truncation.
- 💾 **Session Save & Restore (JSON)**: Save your active scheduling draft as a `.json` session file to resume editing anytime.
- 📤 **Standalone HTML Export**: Export the interactive schedule as a self-contained `.html` file with embedded styling, light/dark themes, and built-in print controls.
- 🌓 **Dark & Light Mode**: Seamless theme toggle with automatic system theme detection.

---

## 📁 4 Data Ingestion Modes

Shift Happens provides four flexible entry pathways:

| Mode | Description |
| :--- | :--- |
| **1. Upload 3 CSVs** *(Standard)* | Standard departmental ingestion using `people.csv` (unavailability & preferences), `teaching.csv` (course section assignments), and `mrr.csv` (MRR pool staff & hours). |
| **2. Single File Upload** | Upload a single consolidated CSV (`mrr_scheduler_input.csv`). Download a sample format directly from the landing page. |
| **3. Start from Scratch** | Begin with a clean slate to manually build your roster, courses, required hours, preferences, and slot constraints in the browser. |
| **4. Load Session** | Restore any previously saved `.json` session file to continue adjusting or reviewing a previous schedule. |

---

## ⚙️ Configurable Time Slots & Coverage

- **Per-Day Slot Customization**: Enable/disable specific days (Mon–Sun) and toggle individual time slots per day.
- **Editable Time Chips & Custom Slots**: Click any time chip to edit its time (HH:MM format) or insert custom time slots.
- **"Copy to All" Replicator**: Quickly replicate one day's time slot configuration across all other days with a single click.
- **Course Coverage Selection**: Select which detected or potential core courses require guaranteed coverage, or add custom course codes (e.g., `STAT 30100`).

---

## 🚀 Quick Start

Because Shift Happens runs entirely client-side, setup requires zero installation:

### Method 1: Double-Click
Simply open `index.html` in any modern web browser (Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge).

### Method 2: Local HTTP Server
```bash
# Clone the repository
git clone https://github.com/drjchen1/Shift-Happens.git
cd Shift-Happens

# Start a local static server (optional)
npx serve .
# or
python3 -m http.server 8000
```

---

## 📂 Project Structure

```
Shift-Happens/
├── index.html                  # Main application UI, modal stages, and controller
├── app.js                      # Core scheduling engine, data parsing, optimization algorithms
├── style.css                   # Responsive layout, light/dark themes, print media queries
├── Shift_Happens_Help.html     # Interactive handbook and operational documentation
├── package.json                # Test runner configuration
├── tests/
│   └── scheduler.smoke.test.js # Automated unit and regression test suite
└── sample-data/                # Sample input files
    ├── people.csv
    ├── teaching.csv
    ├── mrr.csv
    └── mrr_scheduler_input.csv
```

---

## ✅ Automated Testing

Run the Node.js test suite to verify core scheduler behavior and print stylesheets:

```bash
npm test
```

### Verified Test Coverage:
- ✔️ **Conflict Prevention**: No duplicate slot assignments per person and no blocked-slot assignments.
- ✔️ **Custom Day/Slot Preserving**: Custom day-slot configurations and `getAllSlots()` shapes preserved.
- ✔️ **Live Move & Swap Consistency**: Data integrity between instructor assignment lists and schedule grid state.
- ✔️ **Single-File CSV Parsing**: Auto-detection of required fields, section counts, and normalized B2B preferences.
- ✔️ **Session Serialization**: Correct export and import of `.json` session state.
- ✔️ **Fuzzy Name Matching**: Robust handling of spelling variations and middle-name parsing.
- ✔️ **Core Course Ingestion**: Automatic detection of core courses and calculation of required hours.
- ✔️ **Dynamic MRR Coverage**: Auto-filling missing core courses with MRR staff.
- ✔️ **Custom Required Courses**: User-selected custom courses enforced across all slots.
- ✔️ **Natural Numerical Sorting**: Missing core courses and MRR coverage lists sorted naturally.
- ✔️ **Letter Landscape Print Styles**: Dedicated `@media print` rules for letter landscape with non-clipped names.

---

## 📖 Help & Documentation

For a visual step-by-step walkthrough of all features, open **[`Shift_Happens_Help.html`](file:///Users/horsefarm/Downloads/Shift-Happens-main/Shift_Happens_Help.html)** in your browser.

---

## 📝 License

Open-source under the MIT License. Feel free to adapt and use it for your department or clinic!
