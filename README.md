# AR Indoor Navigation Platform

Production-ready, multi-store indoor AR navigation SaaS platform. Customers select a store and destination, then follow real-time 3D waypoints through augmented reality to navigate any indoor space.

Built with **Next.js 16** · **TypeScript (strict)** · **TailwindCSS v4** · **Three.js** · **WebXR** · **Supabase** · **Framer Motion** · **React Konva**

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Customer App (Mobile)                              │
│  ├─ Store & Section Selection                       │
│  ├─ WebXR immersive-ar (Android)                    │
│  ├─ Camera + DeviceOrientation fallback (iOS)       │
│  ├─ A* Pathfinding Engine                           │
│  ├─ QR Anchor Recalibration                         │
│  └─ Real-time 3D Waypoint Rendering                 │
├─────────────────────────────────────────────────────┤
│  Admin Dashboard (/admin)                           │
│  ├─ Store CRUD (measurement-based auto-generation)  │
│  ├─ Interactive Map Editor (React Konva)            │
│  ├─ Version Control (draft → publish → revert)      │
│  └─ 2D Path Simulation                             │
├─────────────────────────────────────────────────────┤
│  Backend                                            │
│  ├─ Supabase (Postgres + Auth + Storage)            │
│  ├─ Row Level Security                              │
│  ├─ Service-role admin API routes                   │
│  └─ Middleware auth for /admin                      │
└─────────────────────────────────────────────────────┘
```

---

## Setup Guide

### Prerequisites

- Node.js 18+
- npm or pnpm
- A Supabase project (free tier works)

### Step 1 — Install Dependencies

```bash
npm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials (Dashboard → Settings → API):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 3 — Set Up Database

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of `supabase-migration.sql`
3. Click **Run**

This creates all tables (users, stores, store_versions, floors, navigation_nodes, navigation_edges, sections), RLS policies, indexes, triggers, and the `is_admin()` helper function.

### Step 4 — Create Admin User

1. Go to **Authentication → Users**
2. Click **Add User**
3. Email: `Invinciblx777@gmail.com`
4. Set a strong password
5. Check **Auto Confirm**
6. Click **Create User**

Then run this SQL to assign admin role:

```sql
UPDATE users SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'invinciblx777@gmail.com'
  LIMIT 1
);
```

Verify:

```sql
SELECT u.id, au.email, u.role
FROM users u
JOIN auth.users au ON au.id = u.id
WHERE au.email = 'invinciblx777@gmail.com';
```

### Step 5 — Create Storage Bucket (Optional)

For floorplan image uploads:

1. Go to **Storage → New Bucket**
2. Name: `floorplans`, Public: `true`
3. Run the storage policies from the bottom of `supabase-migration.sql`

### Step 6 — Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Step 7 — Run with HTTPS (Required for AR)

WebXR and `getUserMedia` require HTTPS:

```bash
npx next dev --experimental-https
```

Accept the self-signed certificate warning.

---

## Admin Dashboard

Access at `/admin/login`. Sign in with your admin credentials.

### Store Creation

1. Click **Create Store**
2. Enter store name and measurements (length, width, aisle count, aisle width, corridor spacing)
3. The system auto-generates a walkable grid with navigation nodes, edges, and an entrance at (0,0)
4. 1 meter = 1 logical unit

### Map Editor

The interactive React Konva editor lets you:

- Add/delete nodes
- Connect/disconnect edges
- Mark nodes as entrance or section
- Create named sections
- Toggle snap-to-grid
- Toggle grid visibility

All changes persist to Supabase in real-time.

### Version Control

- Editing creates a **draft** version
- Click **Publish** to make it live (only one published version per store)
- **Clone** creates a new draft from any version
- **Revert** rolls back to a previous version
- AR system always uses the published version

### Path Simulation

- Select start node and target section
- System runs A* and highlights the route on the 2D canvas
- Uses the same pathfinding engine as the AR system

---

## AR Customer Experience

### Flow

1. Customer selects a store
2. Customer selects a destination section
3. Customer scans a QR code OR starts at the entrance
4. AR session begins

### Android (WebXR)

- Uses `navigator.xr.requestSession('immersive-ar')`
- Full 6DOF tracking with real-world anchoring
- Waypoint markers placed in world space
- Smooth arrow rotation interpolation toward next waypoint

### iOS (Fallback)

- `getUserMedia` rear camera feed
- `DeviceOrientationEvent` compass tracking
- Three.js scene overlaid on camera
- 3DOF orientation tracking
- Position updates via QR code scanning

### AR Features

- Cyan waypoint spheres along the path
- Pulsing active waypoint indicator
- Lead arrow pointing to next waypoint
- Progress bar showing navigation progress
- Automatic route recalculation if deviation > 1.5m
- QR code scanning for position recalibration
- Clean XR session cleanup on exit

---

## QR Anchor System

QR codes placed throughout the store contain a `node_id`. When scanned:

1. Camera feed is analyzed frame-by-frame using jsQR
2. QR data is parsed (JSON with `node_id` or raw string)
3. User position is set to the corresponding node
4. Coordinate origin is recalibrated
5. Path is recalculated from the new position

---

## Cross-Platform Support

| Platform | AR Mode | Tracking |
|---|---|---|
| Android Chrome 81+ | WebXR `immersive-ar` | 6DOF (full spatial) |
| iOS Safari 13+ | Camera + Orientation | 3DOF (compass heading) |
| iOS Chrome | Camera + Orientation | 3DOF (compass heading) |
| Desktop | Not supported | Shows warning |

---

## Deployment (Vercel)

### Option A — CLI

```bash
npm i -g vercel
vercel
```

### Option B — GitHub

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel Dashboard → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

HTTPS is enforced by default on Vercel.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (dark theme, fonts, viewport)
│   ├── page.tsx                      # Landing page (store + section selector)
│   ├── globals.css                   # Design system (glassmorphism, admin)
│   ├── ar/page.tsx                   # AR navigation page
│   ├── admin/
│   │   ├── login/page.tsx            # Admin login
│   │   ├── layout.tsx                # Admin shell (sidebar + topbar)
│   │   ├── dashboard/page.tsx        # Store management grid
│   │   ├── stores/[id]/page.tsx      # Store detail + versions
│   │   └── stores/[id]/versions/     # Map builder entry
│   └── api/
│       ├── admin/stores/route.ts     # Store CRUD + version operations
│       ├── admin/create-store/route.ts # Store creation + grid generation
│       └── check-admin/route.ts      # Admin role verification
├── ar/
│   ├── ARScene.ts                    # WebXR AR engine (Android)
│   ├── FallbackARScene.ts            # Camera AR engine (iOS)
│   ├── navigationEngine.ts           # A* pathfinding + state tracking
│   ├── pathfinding.ts                # A* algorithm + priority queue
│   ├── coordinateMapper.ts           # Map ↔ AR coordinate conversion
│   └── WaypointRenderer.ts           # Three.js 3D waypoint rendering
├── components/
│   ├── HeroSection.tsx               # Animated landing hero
│   ├── StoreSelector.tsx             # Multi-store dropdown
│   ├── SectionSelector.tsx           # Section/destination picker
│   ├── StartButton.tsx               # AR launch button
│   ├── FeatureCards.tsx              # Feature showcase
│   ├── ErrorOverlay.tsx              # Error/loading states
│   ├── DebugOverlay.tsx              # Dev debug canvas
│   ├── admin/                        # Admin UI components
│   └── map/                          # Map editor components
├── lib/
│   ├── mapData.ts                    # Navigation graph types + fetching
│   ├── sections.ts                   # Section data + store-specific fetching
│   ├── gridGenerator.ts              # Auto-grid from measurements
│   ├── versionManager.ts             # Version lifecycle management
│   ├── supabaseClient.ts             # Browser Supabase client
│   ├── supabaseAdmin.ts              # Server admin client (service role)
│   └── supabase/                     # SSR Supabase utilities
├── utils/
│   ├── detectARSupport.ts            # AR capability detection
│   ├── device.ts                     # Platform detection
│   ├── navigation.ts                 # Distance/angle math
│   └── qrScanner.ts                  # QR code scanner
└── middleware.ts                      # Admin route protection
```

---

## Security

- No hardcoded credentials anywhere in the codebase
- Supabase Auth for authentication
- Role-based access via `users.role` column
- `is_admin()` SECURITY DEFINER function prevents RLS recursion
- RLS policies on all tables (stores, store_versions, floors, navigation_nodes, navigation_edges, sections)
- Middleware protection for all `/admin` routes
- Server-side session validation via cookies
- Service role key used only in server-side API routes (never exposed to browser)
- Admin account created manually via Supabase dashboard (no automated setup endpoint)

---

## Testing Checklist

- [ ] Admin login with correct credentials → redirected to dashboard
- [ ] Admin login with wrong credentials → error shown
- [ ] Non-admin user → redirected away from /admin
- [ ] Create store with measurements → grid auto-generated
- [ ] Open map editor → nodes and edges visible
- [ ] Add/delete nodes in editor → changes persist
- [ ] Connect/disconnect edges → changes persist
- [ ] Create section on a node → section saved
- [ ] Publish version → `is_published = true`, others unpublished
- [ ] Clone version → new draft created with all data
- [ ] Revert to older version → creates new draft from that version
- [ ] Path simulation → A* route highlighted on canvas
- [ ] Customer selects store → sections load for that store
- [ ] Customer selects section → "Start AR" button enabled
- [ ] AR on Android → WebXR session starts, waypoints visible
- [ ] AR on iOS → Camera feed + compass-rotated waypoints
- [ ] QR scan during AR → position recalibrated, path updated
- [ ] Walk past waypoint → waypoint removed, progress updated
- [ ] Deviate > 1.5m → path automatically recalculated
- [ ] Exit AR → resources cleaned up, no memory leaks
- [ ] Desktop → "Mobile Device Required" message shown

---

## License

MIT
