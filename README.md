# Milky Way 3D Atlas

An interactive 3D simulation of the Milky Way and the Solar System, built with **Next.js 16, TypeScript, three.js (React Three Fiber)**.
One continuous camera goes from Earth orbit out past the galaxy, about 15 orders of magnitude, with no scene switches.

## Run

```bash
npm install
npm run data     # downloads the open datasets → public/data, public/textures (already done; re-run to refresh)
npm run dev      # http://localhost:3000
# or production
npm run build && npm start
```

**Controls:** drag to rotate · right-drag / Shift-drag / two fingers to pan (frees the camera) · scroll or pinch to zoom · click any object to centre on it · `R` reset view · `D` details panel on/off · `Esc` up one level · `/` search · `Space` pause · `[` `]` time speed · `N` back to now.
`/` search · `Esc` up one level · `Space` pause · `[` `]` time speed.

## What's in it

| Scale | Content | Data |
|---|---|---|
| Galaxy | Bar, bulge, 5 spiral arms, dust lanes, haze, nebulae, clusters | Arm geometry from Reid et al. 2019 (maser parallaxes); R₀ = 8.178 kpc (GRAVITY 2019) |
| Neighbourhood | 32,686 real stars with true 3D positions, colours, brightness; distance rings | HYG v4.4 (Hipparcos + Yale + Gliese) |
| Exoplanets | 2,123 planetary systems; visiting a host star shows its planets orbiting (e.g. TRAPPIST-1) | NASA Exoplanet Archive (`pscomppars`) |
| Solar System | Sun, 8 planets + Pluto at their real positions for the simulated date, 15 major moons, Saturn's rings with planet shadow, asteroid & Kuiper belts, heliosphere, Oort cloud, Voyager 1/2 | JPL Keplerian elements (Standish), NASA Planetary Fact Sheet, IAU rotation models |
| Info panel | Facts, live distances / light-time, Wikipedia summary | Wikipedia REST API (fetched live) |

Accuracy notes:
- Planet positions come from the JPL element tables, which are accurate to arcminutes for 1800–2050. Earth's rotation follows the IAU model, so the day/night side matches real UTC.
- The Moon's position uses a low-precision lunar series, so its phase is correct.
- Other moons' orbital phases, exoplanet orbit orientations and Voyager positions are illustrative or extrapolated. The UI says so where it applies.
- Star brightness is recomputed from the camera position every frame: m = M + 5·log₁₀(d/10 pc). Luminosity and radius use a Teff-based bolometric correction.

## Architecture

```
scripts/build-data.mjs   OSINT pipeline: HYG + NASA exoplanets → binary star catalogue; textures → WebP
src/lib/                 units, coordinate frames (equatorial/ecliptic → galactic), Kepler solver,
                         ephemeris, galaxy model, body registry, info-panel builder, search
src/scene/               R3F scene: CameraRig, Galaxy, StarField, SolarSystem, FocusedStar, labels/picking
src/components/          UI shell (top bar, info panel, time bar, HUD) — no per-frame React renders
```

- **World unit = 1 light-year, with the Sun at the origin.** Solar-System coordinates are tiny numbers and keep full float precision, while galaxy coordinates are large ones. Objects far from the origin, such as exoplanet orbits, use local coordinates so their float32 vertices stay precise.
- **Log-space camera:** every scroll notch zooms by the same factor. Fly-to transitions follow a "powers of ten" arc: zoom out, travel, zoom in.
- All objects share the **galactic frame**, so the ecliptic sits at its real ~60° tilt to the galactic plane.

## Performance

- Each particle system (150k galaxy particles, 33k stars, belts, Oort cloud) is a single draw call with a GPU shader. Belt orbits are animated in the vertex shader.
- Objects too small to see are skipped (`visible = false`). Sphere detail drops for small on-screen planets.
- Planet textures are 1–2k WebP (~1 MB total). They load only when a body becomes a few pixels wide.
- An adaptive pixel ratio drops resolution when FPS falls below 40 and raises it again above 58. Galaxy particle count scales by device class.
- Labels are pooled DOM nodes moved with `transform`, with collision culling. The HUD and clock write directly to the DOM, so nothing in React re-renders per frame.
- The 3D scene is code-split from the statically prerendered UI shell. The star catalogue is a 638 KB `Float32Array`, preloaded, and metadata is fetched after first render.

## Data licences

HYG Database: CC BY-SA 4.0 · Solar System Scope textures: CC BY 4.0 · NASA/JPL data: public · Wikipedia text: CC BY-SA 4.0.
Full list in the in-app **Sources** dialog.
