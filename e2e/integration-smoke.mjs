#!/usr/bin/env node
/**
 * HTTP-level critical-path smoke for the running app. No browser — verifies the
 * auth gate + the KPI save→history API path that the dashboard depends on.
 *
 * Run against a dev server (NODE_ENV=development, so the admin@local bootstrap +
 * PGlite fallback work with no setup):
 *   npm run dev &        # or: npm run test:smoke handles it in CI
 *   node e2e/integration-smoke.mjs
 *
 * BASE_URL overrides the target (default http://localhost:3000).
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@local";
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "swim123";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Pull the kpi_session cookie value out of a Set-Cookie header. */
function sessionCookie(res) {
  const raw = res.headers.get("set-cookie") || "";
  const m = raw.match(/kpi_session=([^;]+)/);
  return m ? `kpi_session=${m[1]}` : "";
}

async function main() {
  console.log(`Smoke target: ${BASE}`);

  // 1. The proxy gate redirects an unauthenticated protected route to /login.
  const gated = await fetch(`${BASE}/kpi`, { redirect: "manual" });
  check(
    "unauthenticated /kpi redirects to /login",
    gated.status === 307 && (gated.headers.get("location") || "").includes("/login"),
    `status ${gated.status}, location ${gated.headers.get("location")}`,
  );

  // 2. Login bootstraps + authenticates the dev super admin.
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = sessionCookie(login);
  check("login returns 200", login.status === 200, `status ${login.status}`);
  check("login sets a session cookie", cookie.length > "kpi_session=".length);

  const auth = { Cookie: cookie, "Content-Type": "application/json" };

  // 3. Config seeds the v11.1 defaults (6 personal metrics).
  const cfgRes = await fetch(`${BASE}/api/config`, { headers: { Cookie: cookie } });
  const cfg = await cfgRes.json();
  check("GET /api/config returns 200", cfgRes.status === 200);
  check(
    "config seeds 6 personal metrics",
    Array.isArray(cfg.personalKpi) && cfg.personalKpi.length === 6,
    `personalKpi length ${cfg.personalKpi?.length}`,
  );

  // 4. Save a KPI run, then confirm it appears in history.
  const periodLabel = `2099-${String(Math.floor(Math.random() * 90) + 10)}`;
  const save = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      periodLabel,
      filename: "smoke.csv",
      csvRows: [],
      configSnapshot: cfg,
      coachResults: [],
    }),
  });
  const saved = await save.json();
  check("POST /api/runs returns 200 + id", save.status === 200 && typeof saved.id === "number");

  const list = await fetch(`${BASE}/api/runs`, { headers: { Cookie: cookie } });
  const runs = await list.json();
  check(
    "saved run appears in history",
    Array.isArray(runs) && runs.some((r) => r.periodLabel === periodLabel),
  );

  // 5. Gym-staff module: create a member, confirm the Directory + profile render
  //    the new sections (search box, Details/Notes/Earnings), add an HR note and
  //    see it on the profile, then delete the member to keep the smoke idempotent.
  const tag = Math.floor(Math.random() * 1e6);
  const staffName = `Smoke Trainer ${tag}`;
  const createStaff = await fetch(`${BASE}/api/gym/staff`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: staffName,
      staffCode: `SMOKE${tag}`,
      position: "personal_trainer",
      employmentType: "full_time",
      email: "",
      phone: "",
      aliases: [],
      active: true,
    }),
  });
  const createdStaff = await createStaff.json();
  const staffId = createdStaff.id;
  check(
    "POST /api/gym/staff returns 200 + id",
    createStaff.status === 200 && typeof staffId === "number",
    `status ${createStaff.status}`,
  );

  // The Directory (search/filter/sort) only renders once the roster is non-empty.
  const dirHtml = await (await fetch(`${BASE}/commission/staff`, { headers: { Cookie: cookie } })).text();
  check(
    "staff Directory renders search box + new member",
    dirHtml.includes("Directory") && dirHtml.includes("Search name or code") && dirHtml.includes(staffName),
  );

  const profHtml = await (await fetch(`${BASE}/commission/staff/${staffId}`, { headers: { Cookie: cookie } })).text();
  check(
    "profile renders Details + Notes + Earnings sections",
    profHtml.includes("Details") && profHtml.includes("Notes") && profHtml.includes("Earnings"),
  );

  const addNote = await fetch(`${BASE}/api/gym/staff/${staffId}/notes`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ type: "coaching", title: "Smoke note", body: "", followUp: false }),
  });
  check("POST gym-staff note returns 200", addNote.status === 200, `status ${addNote.status}`);

  const profHtml2 = await (await fetch(`${BASE}/commission/staff/${staffId}`, { headers: { Cookie: cookie } })).text();
  check("the new note appears on the profile", profHtml2.includes("Smoke note"));

  // 5b. Phase 4 — link a login account + role to the gym-staff record, confirm
  //     the User-accounts API reports the link, then remove the login.
  const linkEmail = `smoke-link-${tag}@local`;
  const createLink = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ email: linkEmail, password: "smoke-pass", role: "staff", gymStaffId: staffId }),
  });
  const linkedUser = await createLink.json();
  check(
    "POST /api/users links a login to the gym-staff record",
    createLink.status === 200 && typeof linkedUser.id === "number",
    `status ${createLink.status}`,
  );

  const usersList = await (await fetch(`${BASE}/api/users`, { headers: { Cookie: cookie } })).json();
  const linkedRow = Array.isArray(usersList) && usersList.find((u) => u.id === linkedUser.id);
  check(
    "the linked login carries gymStaffId + role (and no coach link)",
    !!linkedRow && linkedRow.gymStaffId === staffId && linkedRow.coachId === null && linkedRow.role === "staff",
  );

  if (typeof linkedUser?.id === "number") {
    const delUser = await fetch(`${BASE}/api/users/${linkedUser.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    check("DELETE /api/users cleans up the linked login", delUser.status === 200, `status ${delUser.status}`);
  }

  const delStaff = await fetch(`${BASE}/api/gym/staff/${staffId}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  check("DELETE /api/gym/staff cleans up", delStaff.status === 200, `status ${delStaff.status}`);

  // 6. Logout returns 200 and clears the session cookie. (iron-session is
  //    stateless — logout drops the cookie client-side rather than revoking the
  //    encrypted token server-side, so we assert the clearing Set-Cookie.)
  const logout = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const cleared = logout.headers.get("set-cookie") || "";
  check("logout returns 200", logout.status === 200, `status ${logout.status}`);
  check(
    "logout clears the session cookie",
    /kpi_session=;/.test(cleared) ||
      /max-age=0/i.test(cleared) ||
      /expires=thu, 01 jan 1970/i.test(cleared),
    `set-cookie: ${cleared.slice(0, 120)}`,
  );

  console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke run crashed:", err);
  process.exit(1);
});
