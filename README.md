# FieldFocus

FieldFocus is a beautiful, high-performance interactive visualizer for multivariable calculus. It allows students and instructors to see, play with, and build deep intuition for vector fields, divergence, and curl.

Inspired by 3Blue1Brown's visual style and Anvaka's `fieldplay` engine, FieldFocus combines sleek design aesthetics (glassmorphism, dark overlays, smooth transitions, and glowing vector streamlines) with educational rigor.

## Features

- **Interactive Vector Field Sandbox**: Enter any mathematical expressions for $dx$ and $dy$ to instantly see the flow.
- **High-Performance Streamlines & Particles**: Render thousands of high-fps streamlines or particles moving through customizable flow dynamics.
- **Interactive Probes**: Click and drag probes anywhere on the canvas to measure local divergence, curl, and velocity vectors in real-time.
- **Guided Intuition Labs**: Walk through built-in interactive lessons that prompt students to make predictions, explore fields, and verify concepts.
- **Dr. Chaudri's Welcome**: A paginated overlay greeting that introduces the app and offers a mathematical spiral streamline explosion upon dismissal.

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite
- **Rendering**: Vanilla HTML5 Canvas with batched stroke rendering for 60fps performance
- **Styling**: Vanilla CSS for bespoke glassmorphic UI components
- **Icons**: Lucide React

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Build the production package:
   ```bash
   npm run build
   ```

## License

Created by Tycho Young and the design/review team. All rights reserved.
