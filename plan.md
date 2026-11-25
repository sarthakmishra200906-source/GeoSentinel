# GeoSentinel Upgrade Plan: IMD-Style Forward Simulation & Zoom Earth-Style Live Cyclone Tracking

---

## Part A: IMD-Style Forward Cyclone Simulation (No Fixed End Point)

### Goal
Instead of requiring a fixed start-to-end route, allow selecting **a starting point on the map + initial atmospheric conditions** and project where the cyclone will move over **+6h, +12h, +24h, +48h**, along with its **Cone of Uncertainty**, **Wind Radii**, and **12-hour District/State Impact**.

### Architecture & Changes
1. **Simulation Mode & Parameters**
   - Update [simulationValidation.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/services/simulationValidation.js) and [simulation.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/routes/simulation.js) to support a new `mode: 'forward_forecast'` (while keeping `'fixed_route'` backward-compatible for existing saved runs).
   - **New Inputs:**
     - `startLatitude`, `startLongitude` (single map tap)
     - `headingDeg` (`0°–360°`, or `"auto"` to fetch live steering wind)
     - `forwardSpeedKmh` (translational speed, e.g., `12–30 km/h`)
     - `windSpeedKmh` (max sustained wind, e.g., `65–220 km/h`)
     - `centralPressureHpa` (e.g., `940–1004 hPa`)
     - `galeRadiusKm` (outer wind/impact radius, e.g., `120–350 km`)
     - `durationHours` (`12`, `24`, `36`, or `48` hours)

2. **Live Steering Wind Auto-Fetch (Optional "Auto-Steer" Button)**
   - Add a lightweight helper in [weather.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/routes/weather.js) or [simulation.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/routes/simulation.js) that queries **Open-Meteo** (`wind_speed_500hPa`, `wind_direction_500hPa`, `wind_speed_700hPa`, `wind_direction_700hPa`) at `(startLatitude, startLongitude)` so the simulation can automatically pick the real atmospheric steering direction and speed.

3. **Forward Track Physics, Landfall Decay & IMD Cone of Uncertainty**
   - Update [simulationEngine.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/services/simulationEngine.js):
     - Replace fixed-route interpolation when `mode === 'forward_forecast'` with hourly great-circle forward propagation (`destinationPoint(lat, lon, bearing, stepKm)`).
     - Apply Northern Hemisphere **Beta-drift** (slight poleward/westward deflection) and **landfall decay** (when the eye crosses onto Indian landmass, wind speed gradually weakens while heavy-rain flood risk increases).
     - Compute an **IMD-style Cone of Uncertainty** radius at each lead time (e.g. `±25 km` at +6h, `±45 km` at +12h, `±75 km` at +24h, `±120 km` at +48h) plus concentric wind-radii rings (`34 kt` Gale, `50 kt` Storm, `64 kt` Cyclone Core).
     - At **+12h** (and every step), calculate which Indian districts/states intersect the **Cone + Gale Radius** to output projected wind gusts, rainfall (`mm`), flood risk tier, and shelter/rescue capacity pressure.

4. **Simulation Map UI**
   - Update [SimulationWorkspace.jsx](file:///c:/Users/SARTHAK/GeoSentinel/Frontend/Resq-AI/src/component/SimulationWorkspace.jsx) and [App.css](file:///c:/Users/SARTHAK/GeoSentinel/Frontend/Resq-AI/src/App.css):
     - Add a **Mode Switch**: `Forward Forecast (IMD Style)` vs `Fixed Route`.
     - Single-click map picker for **Starting Eye**, heading compass slider (plus **"Auto-Fetch Steering Wind"** button), forward speed, pressure, and gale radius.
     - Render the **predicted track polyline**, **shaded IMD Cone of Uncertainty polygon**, **+12h / +24h milestone markers**, and a **+12h Impact Summary Card** showing affected districts, projected coordinates, wind speed, and range.

5. **Unit Tests**
   - Extend [simulation-validation.test.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/tests/simulation-validation.test.js) and [simulation-engine.test.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/tests/simulation-engine.test.js) to verify forward propagation, cone radii growth, landfall decay, and 12h impact calculations.

---

## Part B: Zoom Earth-Style Global Forming & Active Cyclone Tracking + Live Satellite

### Goal
Display **forming tropical systems ("Invests", depressions, low-pressure swirls)** and **active named cyclones worldwide** (not just post-threshold GDACS alerts in India), paired with real-time geostationary satellite cloud imagery.

### Architecture & Changes
1. **Multi-Source Global Cyclone & Forming-System Feed**
   - Upgrade [cycloneFeed.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/services/cycloneFeed.js):
     - Keep **GDACS** (`eventlist=TC`) as one source.
     - Add **NOAA NHC + JTWC Active Tropical Systems / ATCF** JSON/GeoJSON feed (public, free, no API key) which includes **early-stage forming "Invest" systems** (e.g., `90B` Bay of Bengal, `91A` Arabian Sea, Pacific Typhoons, Atlantic Hurricanes), tropical depressions, named cyclones, **forecast track points**, and **wind radii**.
     - Normalize and deduplicate storms across sources by storm ID / proximity + name.
     - Add a `scope` query option (`/api/weather/storms?scope=global` vs `scope=india`) instead of hard-dropping non-India storms on the server.

2. **Live Geostationary Satellite IR / Cloud Overlay (Free, No Key)**
   - Update [windy.html](file:///c:/Users/SARTHAK/GeoSentinel/Frontend/Resq-AI/public/windy.html) and [WindyMap.jsx](file:///c:/Users/SARTHAK/GeoSentinel/Frontend/Resq-AI/src/component/WindyMap.jsx):
     - Add a **Live Weather Satellite Clouds (IR / Visible)** layer using **NASA GIBS WMTS tiles** (`MODIS_Terra_CorrectedReflectance_TrueColor` / `VIIRS_SNPP_DayNightBand` / geostationary IR cloud bands — completely free, no API key required), so swirling cloud bands of forming depressions are visibly rendered on top of the map just like Zoom Earth.
     - Add an **India / Global Cyclone Scope** toggle in the Windy controls bar (`🌏 Global` / `🇮🇳 India`) and distinct visual badges for **Forming / Invest**, **Active Cyclone**, **Upcoming**, and **Recent**.
     - Plot **forecast track cones** when provided by JTWC/NHC feeds alongside the spinning cyclone eye marker.

3. **Unit Tests**
   - Extend [cyclone-feed.test.js](file:///c:/Users/SARTHAK/GeoSentinel/Backend/server/tests/cyclone-feed.test.js) to test merging GDACS + active Invest/global feeds, deduplication, and `scope=india` vs `scope=global`.

---

## Part C: Requirements Needed From Your Side (Before We Start)

### 1. API Keys & External Services
**Good news — ZERO new paid API keys are required for either feature:**
- **Open-Meteo** (steering winds `500hPa/700hPa`, weather, 5-day forecast): Free, no key required.
- **GDACS + NOAA NHC / JTWC Active Cyclone Feeds**: Free public feeds, no key required.
- **NASA GIBS Satellite Cloud Imagery**: Free public WMTS tiles, no key required.
- **Optional (only if you already have one):** If you want OpenWeatherMap precipitation/cloud tiles as an extra layer on Render, you can optionally set `OPENWEATHER_API_KEY` on Render — otherwise everything still works via Open-Meteo + RainViewer + NASA GIBS.

### 2. Environment & Hosting Checks (Verify First)
Before starting the new build, please confirm on your live hosted app (`https://geo-sentinel-rust.vercel.app`):
1. **Render & Vercel are both deployed cleanly** on the latest `main` (`f32a9bb`) with no CORS or 404 errors in the browser console.
2. **Existing Windy keys on Vercel** (`VITE_WINDY_MAP_FORECAST_KEY` and `VITE_WINDY_POINT_FORECAST_KEY`) have `geo-sentinel-rust.vercel.app` whitelisted in your Windy API dashboard.

### 3. Product Decisions Needed From You
Please reply with your preference on these 3 quick items (and say **"go ahead"** when ready):
1. **Simulation Modes:** Should we keep the old **Fixed Route** option as a toggle alongside the new **IMD Forward Forecast** mode, or replace Fixed Route completely? *(Recommended: Keep both via a mode toggle.)*
2. **Default Cyclone Map Scope:** Should the Windy map open showing **Global cyclones & forming systems** by default (like Zoom Earth), or **India-region** by default with a `Global / India` switch? *(Recommended: Global by default with a quick `India` filter button.)*
3. **Simulation Default Duration:** Would you like the forward simulation to default to **24 hours** (showing a highlighted **+12h milestone & range card**), or **48 hours**?
