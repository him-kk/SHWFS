# AO-WFS · Adaptive Optics Wavefront Control System

A full-stack, closed-loop Adaptive Optics (AO) processing platform for Shack-Hartmann Wavefront Sensor (SH-WFS) data — covering preprocessing, centroiding, wavefront reconstruction, turbulence characterization, deformable mirror (DM) control, and real-time LQG control. The system combines a high-performance C/C++ (and WebAssembly) processing core with a modern TypeScript web application for configuration, monitoring, and result analysis.

![Landing page hero](./docs/hero-landing.png)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Processing Pipeline](#processing-pipeline)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Database](#database)
- [Native / WASM Core](#native--wasm-core)
- [API (tRPC) Overview](#api-trpc-overview)
- [Performance Targets](#performance-targets)
- [References](#references)
- [License](#license)

---

## Overview

Atmospheric turbulence distorts wavefronts arriving from distant astronomical sources, limiting angular resolution to roughly one arcsecond regardless of telescope aperture. **AO-WFS** closes the adaptive optics correction loop in real time by:

1. Preprocessing raw SH-WFS frames (dark/flat correction, bad-pixel masking)
2. Detecting spot centroids using a hybrid Center-of-Gravity + autocorrelation matched-filter algorithm
3. Reconstructing the wavefront via Modal (Zernike SVD) or Zonal (FRiM iterative) methods
4. Characterizing turbulence parameters (Fried parameter r₀, coherence time τ₀, wind speed, Cₙ²)
5. Mapping corrections onto a hysteresis-compensated deformable mirror actuator grid
6. Driving the loop with an adaptive LQG (Kalman filter) controller, with a Sophia-SPGD sensorless fallback

The result is diffraction-limited imaging, targeting Strehl ratios above 0.8 in the near-infrared with sub-3ms loop latency.

---

## Key Features

-  **End-to-end SH-WFS pipeline** — preprocessing, centroiding, reconstruction, turbulence estimation, DM control, and closed-loop LQG control
-  **Dual reconstruction modes** — Modal (Zernike SVD with adaptive Tikhonov regularization) and Zonal (FRiM iterative PCG, O(N) complexity)
-  **Deformable mirror modeling** — Fried geometry actuator mapping with Preisach hysteresis compensation
-  **Interactive dashboard** — live system status, quality metrics, and module health monitoring
-  **Results & history explorer** — per-run Strehl ratio, RMS wavefront error, r₀, and processing history
-  **Calibration workflow** — dark frame, flat field, bad-pixel map, influence matrix, Fried geometry, and hysteresis model steps
-  **High-performance core** — algorithm-critical code implemented in C/C++, compiled natively and to WebAssembly for in-browser simulation
-  **Algorithm registry** — curated set of techniques with TRL (Technology Readiness Level) ratings and literature references
-  **Type-safe full-stack API** — tRPC end-to-end type safety between the Hono backend and React frontend

---

## Screenshots

> Replace the placeholders below with your own images (see suggested paths).

### Landing Page

| Hero | Manifesto |
|---|---|
| ![Hero section](./docs/hero-landing.png) | ![Manifesto section](./docs/images/landing-manifesto.png) |

| Processing Modules | Research Archive |
|---|---|
| ![Modules section](./docs/images/landing-modules.png) | ![Archive vault](./docs/images/landing-archive.png) |

### Dashboard Application

| Dashboard | Processing Panel |
|---|---|
| ![Dashboard overview](./docs/Dashboard.png) | ![Processing panel](./docs/images/processing-panel.png) |

| Results Viewer | Calibration Workflow |
|---|---|
| ![Results viewer](./docs/images/results-viewer.png) | ![Calibration steps](./docs/images/calibration-steps.png) |

| Run History | Documentation |
|---|---|
| ![History table](./docs/images/history-table.png) | ![Documentation page](./docs/images/documentation-page.png) |

### Wavefront & DM Visualizations

| Wavefront Phase Map | Zernike Decomposition |
|---|---|
| ![Wavefront phase map](./docs/images/wavefront-phase-map.png) | ![Zernike decomposition](./docs/images/zernike-decomposition.png) |

| Turbulence Simulation | PSF: Before / After AO |
|---|---|
| ![Turbulence simulation](./docs/images/turbulence-simulation.png) | ![PSF comparison](./docs/images/psf-comparison.png) |

| DM Actuator Map |
|---|
| ![DM actuator map](./docs/images/dm-actuator-map.png) |

---

## Architecture

```
┌──────────────────────────────┐        ┌────────────────────────────┐
│        React Frontend        │  tRPC  │        Hono Backend        │
│  Vite + React Router + shadcn│◄──────►│   Node.js + tRPC Router    │
│  Recharts, GSAP, WASM bridge │        │   Drizzle ORM (MySQL)      │
└───────────────┬──────────────┘        └───────────────┬────────────┘
                │                                        │
                │  WebAssembly (in-browser sim)          │  Native build
                ▼                                        ▼
      ┌───────────────────┐                    ┌───────────────────────┐
      │  ao-pro (WASM)    │                    │  ao_pro_native (C/C++)│
      │  Compiled from C  │                    │  Compiled from C/C++  │
      │  AO core sources  │                    │  AO core sources      │
      └───────────────────┘                    └───────────────────────┘
```

The same C/C++ AO processing core (`cpp/src`) is compiled twice: once to a native static library for backend/offline processing, and once to WebAssembly (via `cpp/wasm`) so the browser can run wavefront simulations client-side without a round trip to the server.

---

## Tech Stack

**Frontend**
- React 19 + TypeScript + Vite 7
- React Router 7
- Tailwind CSS 3 + shadcn/ui component library (40+ components)
- TanStack Query + tRPC React client
- Recharts (data visualization), GSAP (animation)

**Backend**
- Hono (lightweight Node.js web framework)
- tRPC (end-to-end type-safe API)
- Drizzle ORM + MySQL
- Zod (schema validation)

**Processing Core**
- C / C++ for centroiding, reconstruction, turbulence, DM control, hysteresis, and pipeline orchestration
- CMake build system, compiled to a native static library and to WebAssembly

---

## Processing Pipeline

The system is organized into nine processing modules:

| Module | Description | Status |
|---|---|---|
| Preprocessing | Dark/flat correction, bad pixel masking | Active |
| Centroiding | Hybrid CoG + autocorrelation matched filter | Active |
| Modal Reconstruction | Zernike SVD with adaptive Tikhonov regularization | Active |
| Zonal Reconstruction | FRiM iterative PCG solver | Standby |
| Turbulence Characterization | r₀, τ₀ estimation | Active |
| DM Actuator Map | Fried geometry, actuator coupling, hysteresis | Active |
| LQG Control | Adaptive Kalman filter with correlation-locking | Active |
| Sensorless Backup | Sophia-SPGD stochastic optimization | Standby |
| Quality Metrics | Strehl ratio, RMS error, latency monitoring | Active |

---

## Project Structure

```
app/
├── api/                  # Hono server + tRPC routers
│   ├── boot.ts           # Server entry point
│   ├── router.ts         # Root tRPC router
│   └── routers/          # processing.ts, system.ts
├── contracts/            # Shared types & error contracts
├── cpp/                  # C/C++ AO processing core
│   ├── include/           # ao_core.h — shared data structures & API
│   ├── src/               # centroiding, reconstruction, turbulence, DM control...
│   └── wasm/               # WebAssembly bindings
├── db/                    # Drizzle schema, migrations, seed data
├── src/
│   ├── components/        # Reusable UI + visualization components
│   ├── pages/              # Dashboard, Processing, Results, History, Calibration, Docs
│   ├── sections/landing/    # Marketing/landing page sections
│   ├── providers/           # tRPC / React Query providers
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # AO simulation + WASM bridge utilities
│   └── config.ts              # Site content, modules, metrics, algorithm registry
└── public/                     # Static assets, WASM binaries, images, videos
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL database (local or hosted)
- (Optional) CMake + a C/C++ toolchain if rebuilding the native/WASM core

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd app

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# then edit .env with your database credentials

# Run database migrations
npm run db:push

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173` (Vite dev server).

### Production Build

```bash
npm run build
npm run start
```

---

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# ── Backend ─────────────────────────────────────────────
APP_ID=                   # Application ID
APP_SECRET=                # Application secret (used for JWT signing)

# ── Database ────────────────────────────────────────────
DATABASE_URL=               # MySQL connection string (mysql://user:pass@host:port/db)
```

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the frontend and bundle the backend server |
| `npm run start` | Run the production server (`dist/boot.js`) |
| `npm run preview` | Preview the production build locally |
| `npm run check` | Type-check the project with TypeScript |
| `npm run lint` | Lint the codebase with ESLint |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run the test suite with Vitest |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema changes directly to the database |

---

## Database

The database schema (via Drizzle ORM) tracks:

- **Processing Runs** — configuration used per run (centroid method, reconstruction method, control method, Zernike mode count, telescope diameter, wavelength, sample rate, DM parameters, sub-aperture grid, etc.)
- **Processing Results** — per-frame outputs (Strehl ratio, RMS error, latency, bandwidth, Fried parameter, coherence time, wind speed, Cₙ², wavefront/Zernike/DM/centroid/slope data)
- **System Status** — live loop state (open/closed, frame rate, current Strehl/RMS, estimated turbulence parameters, DM voltage RMS, SPGD sensorless status)

Migrations live in `db/migrations`; schema definitions live in `db/schema.ts`.

---

## Native / WASM Core

The performance-critical AO algorithms are implemented in C/C++ under `cpp/`:

- `preprocessing.c` — dark/flat correction, bad pixel handling
- `centroiding.c` — hybrid CoG + autocorrelation centroid detection
- `wavefront_recon.c` — modal (Zernike SVD) and zonal (FRiM) reconstruction
- `turbulence.c` — Fried parameter and coherence time estimation
- `dm_control.c` — deformable mirror actuator mapping
- `hysteresis.c` — Preisach hysteresis compensation model
- `control.c` — real-time LQG control loop
- `spgd_backup.c` — Sophia-SPGD sensorless optimization backup
- `pipeline.c` — end-to-end pipeline orchestration

This core is compiled twice:

```bash
# Native static library (backend / offline processing)
cd cpp && cmake -B build && cmake --build build

# WebAssembly build (in-browser simulation)
cd cpp && cmake -B wasm-build -DCMAKE_TOOLCHAIN_FILE=<emscripten-toolchain> && cmake --build wasm-build
```

The compiled `.wasm` artifacts are served from `public/` and loaded through `src/lib/ao-wasm-bridge.ts`.

---

## API (tRPC) Overview

The tRPC API exposes two routers under `api/routers/`:

**`processing`**
- `createRun` — create a new processing run with algorithm configuration
- `listRuns` / `getRun` — list or fetch runs
- `updateRunStatus` — mark a run running / completed / error
- `saveResult` — persist per-frame processing results
- `getResults` — fetch results for a run

**`system`**
- `getStatus` — fetch the latest live system status
- `updateStatus` — update loop state, live metrics, and SPGD sensorless status

---

## Performance Targets

| Metric | Definition | Target |
|---|---|---|
| Strehl Ratio (NIR) | S = exp(−σ²_WFE) | > 0.80 |
| Strehl Ratio (Visible) | S = exp(−σ²_WFE) | > 0.30 |
| RMS Wavefront Error | σ_WFE = √⟨φ²⟩ | < λ/10 |
| Centroid Precision | RMS error in spot position | < 0.1 pixel |
| Loop Bandwidth | Frequency where rejection = 0.5 | > 50 Hz |
| Total Latency | Readout → DM delay | < 3 ms |

---

## References

The algorithm registry implements techniques drawn from peer-reviewed adaptive optics literature, including:

- Thiebaut & Tallon, *"Fast minimum variance wavefront reconstruction for extremely large telescopes,"* JOSA A 27, 1046-1059 (2010)
- Dubra et al., *"Preisach classical and nonlinear modeling of hysteresis in piezoceramic deformable mirrors,"* Opt. Express 13, 9062-9070 (2005)
- Deo et al., *"A correlation-locking adaptive filtering technique for minimum variance integral control in adaptive optics,"* A&A (2021)
- Wang et al., *"A Method Used to Improve the Dynamic Range of Shack-Hartmann Wavefront Sensor,"* Sensors 22, 6270 (2022)
- Basden, *"The Durham adaptive optics real-time controller,"* Appl. Opt. 49, 6354-6363 (2010)

See the in-app **Documentation** page for the full reference list and TRL ratings.

---

## License

Add your license information here.