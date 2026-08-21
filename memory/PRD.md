# MOVA — Accessible Public Transport Assistant

## Original Problem Statement
Build an application (name: **MOVA**) that helps users plan safer & more accessible journeys around KIIT / Bhubaneswar using buses, shared transport, and campus vehicles. Support users with disabilities, elderly, and late-night travellers. Modules: route/stop discovery, accessible route planning, crowding/delay reports, safety check-in, SOS with live location sharing, arrival/route-change notifications, driver/operator dashboard, offline routes, admin lock, bug report, dark mode with gradient, voice input.

## User Personas
- **Rider with disability** — wheelchair-friendly routes, high-contrast UI, voice input.
- **Late-night student** — night-safe routes, safety check-in, SOS to trusted contact + police.
- **Admin / operator** — live map of users, SOS alerts, bug/crowding reports.

## Core Requirements
- Dark mode + light mode with subtle gradients
- JWT auth (email/password), safety-contact captured at register
- Interactive Leaflet map (KIIT / Bhubaneswar), D1 & D2 planning, accessible route toggles
- SOS FAB: live coords, notifies alt contact + nearest police station
- Admin dashboard behind role-lock
- Bug report + offline "no satellite connection" screen
- Voice input via browser Web Speech API

## Architecture
- Backend: FastAPI + Motor + MongoDB, JWT (httpOnly cookie + Bearer fallback), bcrypt, admin seeded from `.env`
- Frontend: React 19 + Router + Tailwind + shadcn/ui + react-leaflet + Sonner

## Implemented (2026-02)
- Auth register/login/logout/me, admin seeding
- Home: map, D1/D2 route planning with polyline, voice, accessibility toggles, suggested routes
- Safety Check-in dialog (name + alt phone)
- SOS FAB with confirmation, live-location payload, nearest police lookup, admin real-time visibility
- Admin dashboard locked to role=admin: KPIs, live user map (10 s polling), SOS + bug tabs
- Bug/crowding/delay/accessibility report form
- Offline page ("no satellite connection") with cached routes
- Dark/light toggle with adaptive Sonner
- Fixed critical Leaflet z-index bug (dialogs were being clipped by map)

## Test Credentials
- Admin: `admin@mova.app` / `mova@admin123`
- Register new users via `/register`

## Backlog
- P1: Push/SMS arrival & route-change notifications (Twilio)
- P1: Driver operator dashboard with vehicle position stream
- P2: Real bus GPS ingest, brute-force lockout, CORS hardening, pagination
