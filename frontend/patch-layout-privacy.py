"""Hide the Admin login button and add a Privacy link to the nav.

Target: frontend/src/components/Layout.jsx (Hush Music TV Network)
- Removes the logged-out header "Admin" button (data-testid="login-btn").
  Admin login stays reachable at /login by direct URL, and the logged-in
  user menu (Dashboard, Create Channel, Favorites, Logout) is untouched.
- Adds a "Privacy" entry to navItems, so it shows in the desktop header
  nav AND the mobile sidebar (both render from navItems), using the
  Shield icon from lucide-react. This gives the app the in-app privacy
  policy link Google Play requires, pointing at the existing /privacy
  page (which is already public and layout-free).
Idempotent: re-running skips sections already applied.
Run from /app in the Emergent terminal. Marker: LAYOUT_PRIVACY_OK
"""

PATH = "frontend/src/components/Layout.jsx"
MARKER = "LAYOUT_PRIVACY_OK"

with open(PATH, encoding="utf-8") as f:
    lines = f.read().splitlines(keepends=True)

notes = []

# --- 1. Remove the Admin <Button> block (scoped to the login-btn testid) ---
removed = 0
idx = 0
while idx < len(lines):
    if 'data-testid="login-btn"' in lines[idx]:
        start = idx
        while start >= 0 and not lines[start].lstrip().startswith("<Button"):
            start -= 1
        end = idx
        while end < len(lines) and lines[end].strip() != "</Button>":
            end += 1
        if start >= 0 and end < len(lines):
            del lines[start:end + 1]
            removed += 1
            idx = start
            continue
        notes.append("ADMIN_BLOCK_BOUNDS_MISSING")
        break
    idx += 1
notes.append("ADMIN_REMOVED_%d" % removed if removed else "ADMIN_ALREADY_GONE")

src = "".join(lines)

# --- 2. Shield icon import (only if the Privacy entry is not already there) ---
privacy_present = "path: '/privacy'" in src
if not privacy_present:
    if "Shield" not in src:
        anchor = "} from 'lucide-react';"
        if anchor in src:
            src = src.replace(anchor, "  Shield,\n" + anchor, 1)
            notes.append("SHIELD_IMPORTED")
        else:
            notes.append("SHIELD_ANCHOR_MISSING")
    else:
        notes.append("SHIELD_ALREADY_PRESENT")

    # --- 3. Privacy navItem (only if Shield is now available) ---
    if "Shield" in src and "path: '/privacy'" not in src:
        entry = """  { path: '/privacy', icon: Shield, label: 'Privacy' },
"""
        tv_anchor = "  { path: '/schedule', icon: Grid3X3, label: 'TV Guide' },\n"
        if tv_anchor in src:
            src = src.replace(tv_anchor, tv_anchor + entry, 1)
            notes.append("PRIVACY_NAV_ADDED")
        elif "const navItems = [" in src:
            src = src.replace("const navItems = [\n", "const navItems = [\n" + entry, 1)
            notes.append("PRIVACY_NAV_ADDED_FALLBACK")
        else:
            notes.append("NAVITEMS_ANCHOR_MISSING")
else:
    if "Shield" not in src:
        anchor = "} from 'lucide-react';"
        if anchor in src:
            src = src.replace(anchor, "  Shield,\n" + anchor, 1)
            notes.append("SHIELD_REPAIR_IMPORTED")
        else:
            notes.append("SHIELD_ANCHOR_MISSING")
    notes.append("PRIVACY_NAV_ALREADY_PRESENT")

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)

print(" | ".join(notes))
print(MARKER)
