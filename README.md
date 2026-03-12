# 🗓️ Shift Happens

Shift Happens is an intelligent, dynamic web-based staffing and scheduling dashboard designed to streamline clinical and academic rosters. It effortlessly combines multiple CSV datasets into a single, conflict-free, optimized schedule with an intuitive live-editing interface.

This project was built entirely using vanilla **HTML**, **CSS**, and **JavaScript**, making it incredibly lightweight and completely safe to run entirely within your modern browser without needing a backend server. 

## ✨ Key Features

- 🛡️ **Conflict Armor**: The algorithm automatically identifies overlaps between teaching duties and MRR assignments from your CSV data to ensure no staff member is ever double-booked.
- 🔁 **B2B Optimization**: Define and respect staff preferences (e.g., whether they love or hate teaching back-to-back classes) for maximum satisfaction.
- ⚠️ **Intelligent Warnings**: Never leave a required slot uncovered. The dashboard displays prominent top-bar alerts for course coverage gaps and flags under- or over-assigned staff immediately.
- 🖱️ **Live Drag & Drop**: Manual fine-tuning is simple. Drag any staff card to a new slot; the roster statistics, gap warnings, and hour constraints update in real-time.
- 🔄 **Seamless Swapping**: Need to trade assignments? Drag a staff card directly onto another to instantly swap them, or use the dedicated "**Swap Staff**" menu to easily trade distant slots.
- 🌡️ **Availability Heatmap**: Visualize your staffing depth. Instantly spot vulnerable slots and easily identify where resources are most needed with a color-coded heatmap grid.
- ⏪ **Infinite Undo**: Experiment with your schedule without fear. Every move is tracked and can be reverted instantly using the Undo button.
- 📤 **One-Click Export**: Save your final masterpiece (or working draft) as a standalone interactive HTML dashboard that looks identical to your working view.

## 🚀 Getting Started

Because Shift Happens is completely client-side, setup is instantaneous.

### Option 1: Live Demo (No installation required)
Simply clone the repository and open the `index.html` file in any modern web browser (Chrome, Firefox, Safari, Edge).

### Option 2: Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/drjchen1/Shift-Happens.git
   ```
2. Navigate to the project directory:
   ```bash
   cd Shift-Happens/app
   ```
3. Open `index.html` in your browser.

## 📁 Data Upload Modes

The scheduler supports three flexible entry options to fit your workflow:

1. **Upload 3 CSVs (Standard Mode)**
   - Requires three distinct files:
     - `people.csv`: Survey responses including B2B preferences and unavailability matrices.
     - `teaching.csv`: Required section assignments and times.
     - `mrr.csv`: Staff assigned to the MRR pool and their required hours.
2. **Single File Upload**
   - Upload a pre-formatted `input.csv` containing consolidated instructor data, preferences, and unavailability. (You can download a sample template directly from the app).
3. **Start from Scratch**
   - Provides a clean slate where you can manually add staff and their constraints one by one right in the browser.

## 🛠️ Technology Stack
- **HTML5** (Structure & Layout)
- **CSS3** (Styling, Dark Mode, Animations & Grids)
- **Vanilla JavaScript ES6+** (Scheduling Engine, CSV Parsing, Drag-and-Drop, UI State)
- **PapaParse** (Client-side CSV handling)
- **Lucide Icons** (UI Iconography)

## 📖 Help & Documentation
Detailed operational guides and explanations of the internal algorithm are available in the included `Shift_Happens_Help.html` file. 

## 📝 License
This project is open-source. Feel free to fork, modify, and use it to tame your own scheduling nightmares!
