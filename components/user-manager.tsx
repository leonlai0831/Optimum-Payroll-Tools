"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Download, Eye, EyeOff, FileUp, KeyRound, Plus, Save, Search, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { ConfirmModal, Modal } from "@/components/modal";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { EmployeeCombobox } from "@/components/employee-combobox";
import { useToast } from "@/components/toast";
import { ROLE_LABELS, ROLES, canManageUserRole, type Role } from "@/lib/auth/types";
import { EMAIL_RE, countValid, rowsFromGrid, type ParsedUserRow } from "@/lib/users/bulk-parse";
import type { BulkMode } from "@/lib/users/bulk-plan";
import { cn } from "@/lib/utils";

type SortCol = "email" | "displayName" | "fullName" | "role" | "active";

/** The inline-editable fields of a user row — staged as drafts, saved on demand. */
type DraftFields = {
  displayName: string;
  fullName: string;
  role: Role;
  coachId: number | null;
  gymStaffId: number | null;
  active: boolean;
};

export interface SafeUser {
  id: number;
  email: string;
  displayName: string;
  fullName: string;
  role: Role;
  coachId: number | null;
  gymStaffId: number | null;
  active: boolean;
}
/** An employee a login can link to — a Swim coach or an Optimum Fit gym-staff member. */
export interface CoachOption {
  id: number;
  name: string;
  /** Sub-label shown in the picker to tell similar names apart (e.g. the center). */
  subtitle?: string;
}
export type GymStaffOption = CoachOption;

/** A user links to at most one employee record (coach OR gym staff). */
type EmployeeLink = { coachId: number | null; gymStaffId: number | null };

/** Encode a link as a <select> token: "" (none) | "coach:ID" | "gym:ID". */
function linkToken(link: EmployeeLink): string {
  if (link.coachId != null) return `coach:${link.coachId}`;
  if (link.gymStaffId != null) return `gym:${link.gymStaffId}`;
  return "";
}

/** Decode a <select> token into the {coachId, gymStaffId} pair the API expects. */
function parseLinkToken(token: string): EmployeeLink {
  if (token.startsWith("coach:")) return { coachId: Number(token.slice(6)), gymStaffId: null };
  if (token.startsWith("gym:")) return { coachId: null, gymStaffId: Number(token.slice(4)) };
  return { coachId: null, gymStaffId: null };
}

/**
 * Admin-set password field: masked by default (shoulder-surf safe) with a reveal
 * toggle, since the admin usually needs to read the temp password back to the
 * user. Shared by the create form and the reset-password modal.
 */
function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [show, setShow] = useState(false);
  // Layout classes (mt-1 etc.) go on the wrapper so the toggle stays aligned.
  return (
    <div className={cn("relative", className)}>
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** A sortable desktop column header. */
function SortTh({
  label,
  col,
  sort,
  onSort,
  center,
}: {
  label: string;
  col: SortCol;
  sort: { col: SortCol; dir: 1 | -1 };
  onSort: (col: SortCol) => void;
  center?: boolean;
}) {
  const active = sort.col === col;
  return (
    <th className={cn("px-4 py-2", center ? "text-center" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn("inline-flex items-center gap-1 hover:text-gray-700", active && "text-gray-900")}
        title={`Sort by ${label}`}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "text-indigo-500" : "text-gray-300")} />
      </button>
    </th>
  );
}

/**
 * All mutation state lives HERE (not in the per-user rows): each user renders
 * twice (mobile card + desktop row, per responsive-table.tsx), so row-local
 * state would fork between the two mounts. The delete confirm and the
 * password-reset modal are also hoisted so each opens exactly once.
 */
export function UserManager({
  users,
  coaches,
  gymStaff,
  actorId,
  actorRole,
}: {
  users: SafeUser[];
  coaches: CoachOption[];
  gymStaff: GymStaffOption[];
  actorId: number;
  actorRole: Role;
}) {
  const router = useRouter();
  const toast = useToast();
  // Hierarchy scope: only roles strictly below the actor are assignable
  // (super_admin assigns anything). Higher-ranked accounts never reach this
  // component — the page filters them out server-side.
  const roleOptions = ROLES.filter((r) => canManageUserRole(actorRole, r));
  // Lowercased emails already in the (hierarchy-filtered) table — drives the
  // bulk-add overwrite/skip prompt. The server re-checks authoritatively, so a
  // hidden higher-ranked account just falls through to a safe server-side skip.
  const existingEmails = useMemo(
    () => new Set(users.map((u) => u.email.trim().toLowerCase())),
    [users],
  );
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  // Every inline edit is STAGED per user id and committed together with the
  // Save button — nothing auto-saves on blur/change.
  const [drafts, setDrafts] = useState<Record<number, Partial<DraftFields>>>({});
  const [saving, setSaving] = useState(false);
  // Full (legal) name is admin-only to edit (the API enforces it too).
  const canEditFullName = actorRole === "admin" || actorRole === "super_admin";
  const [deleteTarget, setDeleteTarget] = useState<SafeUser | null>(null);
  const [pwTarget, setPwTarget] = useState<SafeUser | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "email", dir: 1 });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      : users;
    const { col, dir } = sort;
    return [...filtered].sort((a, b) => {
      const cmp =
        col === "active"
          ? Number(a.active) - Number(b.active)
          : String(a[col]).localeCompare(String(b[col]));
      return cmp !== 0 ? cmp * dir : a.email.localeCompare(b.email);
    });
  }, [users, search, sort]);

  function toggleSort(col: SortCol) {
    setSort((s) => (s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  }

  const [linking, setLinking] = useState(false);
  async function autoLink() {
    setLinking(true);
    try {
      const res = await fetch("/api/users/auto-link", { method: "POST" });
      const json = (await res.json()) as { error?: string; linked?: number };
      if (!res.ok) throw new Error(json.error ?? "Auto-link failed");
      toast.success(
        json.linked
          ? `Linked ${json.linked} account${json.linked === 1 ? "" : "s"} to a coach by name.`
          : "No new matches — already linked, or no confident name match.",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-link failed");
    } finally {
      setLinking(false);
    }
  }

  function setBusy(id: number, on: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** One-off immediate PATCH for non-staged actions (the password reset). */
  async function patchUser(id: number, body: Record<string, unknown>): Promise<boolean> {
    setBusy(id, true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Update failed");
      }
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      return false;
    } finally {
      setBusy(id, false);
    }
  }

  /** Effective value of each editable field = staged draft over the stored value. */
  function effective(u: SafeUser): DraftFields {
    const d = drafts[u.id] ?? {};
    return {
      displayName: "displayName" in d ? d.displayName! : u.displayName,
      fullName: "fullName" in d ? d.fullName! : u.fullName,
      role: "role" in d ? d.role! : u.role,
      coachId: "coachId" in d ? d.coachId! : u.coachId,
      gymStaffId: "gymStaffId" in d ? d.gymStaffId! : u.gymStaffId,
      active: "active" in d ? d.active! : u.active,
    };
  }
  function setField(id: number, patch: Partial<DraftFields>) {
    setDrafts((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  }
  /** The fields that differ from the stored row (the PATCH body), or null if clean. */
  function changedFields(u: SafeUser): Partial<DraftFields> | null {
    const e = effective(u);
    const out: Partial<DraftFields> = {};
    if (e.displayName.trim() !== u.displayName.trim()) out.displayName = e.displayName.trim();
    if (e.fullName.trim() !== u.fullName.trim()) out.fullName = e.fullName.trim();
    if (e.role !== u.role) out.role = e.role;
    if (e.coachId !== u.coachId || e.gymStaffId !== u.gymStaffId) {
      out.coachId = e.coachId;
      out.gymStaffId = e.gymStaffId;
    }
    if (e.active !== u.active) out.active = e.active;
    return Object.keys(out).length > 0 ? out : null;
  }

  // All rows with unsaved edits (recomputed each render — cheap for this list).
  const dirty = users
    .map((u) => ({ u, patch: changedFields(u) }))
    .filter((x): x is { u: SafeUser; patch: Partial<DraftFields> } => x.patch != null);

  /** Commit every staged row — one PATCH each; keep failures so they can be fixed. */
  async function saveAll() {
    if (dirty.length === 0 || saving) return;
    setSaving(true);
    const savedIds: number[] = [];
    const failures: string[] = [];
    for (const { u, patch } of dirty) {
      try {
        const res = await fetch(`/api/users/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error || "Update failed");
        }
        savedIds.push(u.id);
      } catch (e) {
        failures.push(`${u.email}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    if (savedIds.length > 0) {
      setDrafts((m) => {
        const next = { ...m };
        for (const id of savedIds) delete next[id];
        return next;
      });
    }
    setSaving(false);
    if (failures.length > 0) {
      toast.error(
        `Saved ${savedIds.length}, ${failures.length} failed — ${failures[0]}${failures.length > 1 ? " …" : ""}`,
      );
    } else {
      toast.success(`Saved ${savedIds.length} change${savedIds.length === 1 ? "" : "s"}.`);
    }
    if (savedIds.length > 0) router.refresh();
  }

  async function removeUser(user: SafeUser) {
    setDeleteTarget(null);
    setBusy(user.id, true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Delete failed");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(user.id, false);
    }
  }

  const entryProps = (u: SafeUser) => ({
    user: u,
    coaches,
    gymStaff,
    roleOptions,
    isSelf: u.id === actorId,
    // Same-rank accounts (incl. the actor's own) are view-only; only rows
    // ranked strictly below the actor are editable (super_admin edits all).
    readOnly: !canManageUserRole(actorRole, u.role),
    busy: busyIds.has(u.id) || saving,
    canEditFullName,
    // Effective (draft-over-stored) values + a single staging callback; rows
    // never PATCH on their own — the Save button commits them.
    values: effective(u),
    isDirty: changedFields(u) != null,
    onField: (patch: Partial<DraftFields>) => setField(u.id, patch),
    onResetPassword: () => setPwTarget(u),
    onDelete: () => setDeleteTarget(u),
  });

  return (
    <div className="space-y-4">
      {/* No assignable role below the actor's own → nothing they could create. */}
      {roleOptions.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          <AddUser coaches={coaches} gymStaff={gymStaff} roleOptions={roleOptions} />
          <BulkAddUsers roleOptions={roleOptions} existingEmails={existingEmails} />
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <span className="text-sm font-bold text-gray-900">
            User accounts ·{" "}
            {visible.length === users.length ? users.length : `${visible.length} / ${users.length}`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={autoLink}
              disabled={linking}
              title="Match unlinked accounts to a coach profile by name"
            >
              {linking ? <Spinner /> : <Sparkles className="h-4 w-4" />} AI auto-link
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or name…"
                className="w-56 max-w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
        <MobileCards>
          {visible.map((u) => (
            <UserEntry key={u.id} layout="card" {...entryProps(u)} />
          ))}
        </MobileCards>
        <DesktopTable>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <SortTh label="Email" col="email" sort={sort} onSort={toggleSort} />
                <SortTh label="Nickname" col="displayName" sort={sort} onSort={toggleSort} />
                <SortTh label="Full Name" col="fullName" sort={sort} onSort={toggleSort} />
                <SortTh label="Role" col="role" sort={sort} onSort={toggleSort} />
                {/* normal-case: a plain <th> inherits the thead's uppercase; the
                    SortTh columns don't (their label sits in a <button>). */}
                <th className="px-4 py-2 text-left normal-case">Linked Workforce</th>
                <SortTh label="Active" col="active" sort={sort} onSort={toggleSort} center />
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((u) => (
                <UserEntry key={u.id} layout="row" {...entryProps(u)} />
              ))}
            </tbody>
          </table>
        </DesktopTable>
      </Card>

      {/* Staged-edit Save bar — appears only with unsaved changes. Inline edits
          never auto-save; this commits them all (one PATCH per row). */}
      {dirty.length > 0 && (
        <div className="sticky bottom-2 z-30">
          <Card className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 shadow-lg">
            <span className="nums text-xs font-medium text-amber-700">
              {dirty.length} unsaved {dirty.length === 1 ? "change" : "changes"}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDrafts({})} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={saveAll} disabled={saving}>
                {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save {dirty.length}{" "}
                change{dirty.length === 1 ? "" : "s"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {pwTarget && (
        <ResetPasswordModal
          key={pwTarget.id}
          user={pwTarget}
          busy={busyIds.has(pwTarget.id)}
          onClose={() => setPwTarget(null)}
          onSubmit={async (pw) => {
            const ok = await patchUser(pwTarget.id, { password: pw });
            if (ok) setPwTarget(null);
          }}
        />
      )}
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && void removeUser(deleteTarget)}
        title={`Delete ${deleteTarget?.email ?? ""}?`}
        message="This cannot be undone. The account loses access immediately; any linked employee record stays."
        confirmLabel="Delete user"
        busy={deleteTarget !== null && busyIds.has(deleteTarget.id)}
      />
    </div>
  );
}

/** Small dialog replacing the old window.prompt() — same PATCH `{ password }`. */
function ResetPasswordModal({
  user,
  busy,
  onClose,
  onSubmit,
}: {
  user: SafeUser;
  busy: boolean;
  onClose: () => void;
  onSubmit: (pw: string) => void;
}) {
  const [pw, setPw] = useState("");
  function submit() {
    if (!pw) return;
    onSubmit(pw);
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Reset password"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !pw}>
            {busy ? <Spinner /> : <KeyRound className="h-4 w-4" />} Set password
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          Set a new password for <strong>{user.email}</strong>. They use it on their next login.
        </p>
        <div>
          <Label htmlFor="reset-pw">New password</Label>
          <PasswordInput
            id="reset-pw"
            className="mt-1"
            value={pw}
            disabled={busy}
            placeholder="New password"
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

/** Purely presentational — state and mutations live in UserManager. */
function UserEntry({
  user,
  layout,
  coaches,
  gymStaff,
  roleOptions,
  isSelf,
  readOnly,
  busy,
  values,
  isDirty,
  canEditFullName,
  onField,
  onResetPassword,
  onDelete,
}: {
  user: SafeUser;
  layout: "card" | "row";
  coaches: CoachOption[];
  gymStaff: GymStaffOption[];
  roleOptions: Role[];
  isSelf: boolean;
  /** Same-rank account: render every field disabled, no actions (API enforces too). */
  readOnly: boolean;
  busy: boolean;
  /** Effective (draft-over-stored) field values shown in the inputs. */
  values: DraftFields;
  /** This row has unsaved staged edits (subtle highlight). */
  isDirty: boolean;
  /** Full (legal) name is admin-only — non-admins see it read-only. */
  canEditFullName: boolean;
  /** Stage a field change (no network until Save). */
  onField: (patch: Partial<DraftFields>) => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const roleSelect = (className: string) => (
    <Select
      className={className}
      value={values.role}
      disabled={busy || readOnly}
      onChange={(e) => onField({ role: e.target.value as Role })}
    >
      {roleOptions.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
      {/* A read-only row's role sits at the actor's own rank, outside roleOptions. */}
      {!roleOptions.includes(values.role) && (
        <option value={values.role}>{ROLE_LABELS[values.role]}</option>
      )}
    </Select>
  );
  const linkSelect = (className: string) => (
    <EmployeeCombobox
      className={className}
      coaches={coaches}
      gymStaff={gymStaff}
      value={linkToken({ coachId: values.coachId, gymStaffId: values.gymStaffId })}
      disabled={busy || readOnly}
      onChange={(token) => onField(parseLinkToken(token))}
    />
  );
  const nameInput = (className: string) => (
    <Input
      className={className}
      value={values.displayName}
      disabled={busy || readOnly}
      placeholder="—"
      onChange={(e) => onField({ displayName: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
  const fullNameInput = (className: string) => (
    <Input
      className={className}
      value={values.fullName}
      disabled={busy || readOnly || !canEditFullName}
      placeholder={canEditFullName ? "Full name" : "—"}
      title={canEditFullName ? undefined : "Only an admin can edit the full name"}
      onChange={(e) => onField({ fullName: e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
  const viewOnlyBadge = (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
      View only
    </span>
  );

  if (layout === "card") {
    return (
      <div className={cn("p-4", busy && "opacity-60", isDirty && "bg-indigo-50/40")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 truncate font-medium text-gray-800">
            {user.email}
            {isSelf && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {readOnly && viewOnlyBadge}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              Active
              <input
                type="checkbox"
                className="h-5 w-5 accent-indigo-600"
                checked={values.active}
                disabled={busy || readOnly}
                onChange={(e) => onField({ active: e.target.checked })}
              />
            </label>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-overline text-muted">Nickname</span>
            {nameInput("mt-1")}
          </label>
          <label className="block">
            <span className="text-overline text-muted">Full name</span>
            {fullNameInput("mt-1")}
          </label>
          <label className="block">
            <span className="text-overline text-muted">Role</span>
            {roleSelect("mt-1")}
          </label>
          <label className="block sm:col-span-2">
            <span className="text-overline text-muted">Linked Workforce</span>
            {linkSelect("mt-1")}
          </label>
        </div>
        {!readOnly && (
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              onClick={onResetPassword}
              disabled={busy}
            >
              <KeyRound className="h-4 w-4" /> Reset password
            </Button>
            {!isSelf && (
              <Button
                variant="outline"
                className="min-h-11 flex-1 text-red-600"
                onClick={onDelete}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <tr className={cn(busy && "opacity-60", isDirty && "bg-indigo-50/40")}>
      <td className="px-4 py-2 font-medium text-gray-800">
        {user.email}
        {isSelf && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
      </td>
      {/* Widths net out to the pre-Full-Name layout that fit: Full Name gets the
          extra room it needed, clawed back from Nickname + Linked Workforce, so
          the table doesn't overflow its container (the action column stays in view). */}
      <td className="px-4 py-2">{nameInput("w-32 py-1 text-xs")}</td>
      <td className="px-4 py-2">{fullNameInput("w-48 py-1 text-xs")}</td>
      <td className="px-4 py-2">{roleSelect("w-36 py-1 text-xs")}</td>
      <td className="px-4 py-2">{linkSelect("w-40 py-1 text-xs")}</td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-600"
          checked={values.active}
          disabled={busy || readOnly}
          onChange={(e) => onField({ active: e.target.checked })}
          title={values.active ? "Active" : "Inactive"}
        />
      </td>
      <td className="px-4 py-2">
        {readOnly ? (
          <div className="flex justify-end">{viewOnlyBadge}</div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onResetPassword}
              disabled={busy}
              className="text-gray-400 transition hover:text-indigo-600 disabled:opacity-40"
              title="Reset password"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            {!isSelf && (
              <button
                onClick={onDelete}
                disabled={busy}
                className="text-gray-300 transition hover:text-red-500 disabled:opacity-40"
                title="Delete user"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function AddUser({
  coaches,
  gymStaff,
  roleOptions,
}: {
  coaches: CoachOption[];
  gymStaff: GymStaffOption[];
  roleOptions: Role[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setRole("staff");
    setLink("");
  }

  async function submit() {
    if (!email.trim() || !password) {
      toast.error("Email and password required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: name.trim(),
          password,
          role,
          ...parseLinkToken(link),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Create failed");
      }
      toast.success("User created.");
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add user
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <UserPlus className="h-4 w-4 text-indigo-500" /> Add user
        </h3>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-gray-400 hover:text-gray-600"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="u-email">Email</Label>
          <Input
            id="u-email"
            type="email"
            className="mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@optimumtrain.page"
          />
        </div>
        <div>
          <Label htmlFor="u-name">Name</Label>
          <Input
            id="u-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (optional)"
          />
        </div>
        <div>
          <Label htmlFor="u-pw">Initial password</Label>
          <PasswordInput
            id="u-pw"
            className="mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a password"
          />
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select
            id="u-role"
            className="mt-1"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="u-coach">Linked Workforce</Label>
          <EmployeeCombobox
            className="mt-1"
            coaches={coaches}
            gymStaff={gymStaff}
            value={link}
            onChange={setLink}
          />
        </div>
      </div>
      <div className="mt-3">
        <Button onClick={submit} disabled={busy || !email.trim() || !password}>
          {busy ? <Spinner /> : <Plus className="h-4 w-4" />} Create
        </Button>
      </div>
    </Card>
  );
}

/** Read an uploaded CSV or Excel file into a cell grid, then into user rows.
 *  CSV → PapaParse, Excel → ExcelJS (both lazy-loaded, as on the dashboard).
 *  Throws a human message on an unreadable file. */
async function parseUserFile(file: File): Promise<ParsedUserRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("The workbook has no sheets.");
    const grid: string[][] = [];
    ws.eachRow((row) => {
      // row.values is 1-indexed (index 0 is empty); flatten cell objects to text.
      const vals = (row.values as unknown[]).slice(1);
      grid.push(vals.map(excelCellText));
    });
    return rowsFromGrid(grid);
  }
  // CSV / plain text.
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (res.errors.length && res.data.length === 0) {
    throw new Error("Could not read the file as CSV.");
  }
  return rowsFromGrid(res.data);
}

/** Flatten an ExcelJS cell value (string | number | rich text | hyperlink |
 *  formula result | …) to plain text. */
function excelCellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text; // hyperlink cell
    if (Array.isArray(o.richText)) return o.richText.map((t) => String((t as { text?: string }).text ?? "")).join("");
    if ("result" in o) return o.result == null ? "" : String(o.result); // formula
    return "";
  }
  return String(v);
}

/** Bulk-create accounts from an uploaded CSV/Excel file — all one role + a
 *  shared initial password. When the upload overlaps existing emails, the
 *  operator is asked whether to overwrite those accounts or skip them. */
function BulkAddUsers({
  roleOptions,
  existingEmails,
}: {
  roleOptions: Role[];
  /** Lowercased emails already in the system — drives the overwrite/skip prompt. */
  existingEmails: ReadonlySet<string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedUserRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [role, setRole] = useState<Role>(roleOptions[roleOptions.length - 1] ?? "staff");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"parse" | "submit" | null>(null);
  // Set while the overwrite/skip dialog is open; the mode whose submit is
  // in-flight (for the button spinner).
  const [askExisting, setAskExisting] = useState(false);
  const [inFlight, setInFlight] = useState<BulkMode | null>(null);

  const validCount = countValid(parsed);
  // Valid emails in the upload that already exist (so we know to prompt).
  const existingCount = useMemo(
    () =>
      parsed.filter(
        (r) => EMAIL_RE.test(r.email) && existingEmails.has(r.email.trim().toLowerCase()),
      ).length,
    [parsed, existingEmails],
  );

  function reset() {
    setFilename("");
    setParsed([]);
    setParseError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File) {
    setBusy("parse");
    setParseError("");
    setParsed([]);
    setFilename(file.name);
    try {
      const rows = await parseUserFile(file);
      setParsed(rows);
      if (rows.length === 0) {
        setParseError("No email rows found — the file needs an email in the first column or an 'email' header.");
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setBusy(null);
    }
  }

  function downloadTemplate() {
    const csv = "email,full name\ndarren@example.com,Darren Lee\nevi@example.com,Evi Chow\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-users-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Clicking Create: ask first if the upload overlaps existing emails. */
  function onCreate() {
    if (existingCount > 0) setAskExisting(true);
    else void submit("skip");
  }

  async function submit(mode: BulkMode) {
    setBusy("submit");
    setInFlight(mode);
    try {
      const res = await fetch("/api/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: parsed, role, password, mode }),
      });
      const json = (await res.json()) as {
        error?: string;
        created?: number;
        updated?: number;
        skipped?: { email: string; reason: string }[];
      };
      if (!res.ok) throw new Error(json.error ?? "Bulk add failed");
      const created = json.created ?? 0;
      const updated = json.updated ?? 0;
      const skipped = (json.skipped ?? []).length;
      const parts = [`Created ${created}`];
      if (updated) parts.push(`overwrote ${updated}`);
      if (skipped) parts.push(`skipped ${skipped}`);
      toast.success(`${parts.join(", ")}.`);
      reset();
      setPassword("");
      setAskExisting(false);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk add failed");
    } finally {
      setBusy(null);
      setInFlight(null);
    }
  }

  function close() {
    reset();
    setAskExisting(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Bulk add
      </Button>
    );
  }

  return (
   <>
    <Modal
      open
      onClose={busy ? () => {} : close}
      title="Bulk add users"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy != null}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={busy != null || validCount === 0 || password.length < 6}>
            {busy === "submit" ? <Spinner /> : <Plus className="h-4 w-4" />} Create {validCount || ""}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Upload a <strong>CSV or Excel</strong> file with an <code className="rounded bg-gray-100 px-1">email</code>{" "}
          column (and an optional <code className="rounded bg-gray-100 px-1">full name</code>). All get the role +
          shared initial password below; if any emails already exist you&rsquo;ll be asked whether to overwrite or
          skip them. Link them to a coach afterwards with <strong>AI auto-link</strong>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bulk-role">Role</Label>
            <Select id="bulk-role" className="mt-1" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bulk-pw">Shared initial password</Label>
            <PasswordInput
              id="bulk-pw"
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="≥ 6 chars"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Accounts file</Label>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> CSV template
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <button
            type="button"
            disabled={busy != null}
            onClick={() => fileRef.current?.click()}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-medium text-gray-600 transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {busy === "parse" ? (
              <>
                <Spinner /> Reading {filename}…
              </>
            ) : (
              <>
                <FileUp className="h-5 w-5" />
                {filename ? `Replace file — ${filename}` : "Choose a CSV or Excel file"}
              </>
            )}
          </button>
          {parseError ? (
            <p className="mt-1 text-xs text-red-500">{parseError}</p>
          ) : filename && parsed.length > 0 ? (
            <p className="mt-1 text-xs text-gray-400">
              {`${validCount} valid email${validCount === 1 ? "" : "s"} detected${
                parsed.length !== validCount ? ` (${parsed.length - validCount} without a valid email)` : ""
              }.`}
              {existingCount > 0 && (
                <span className="font-semibold text-amber-600">
                  {" "}
                  {existingCount} already exist{existingCount === 1 ? "s" : ""} — you&rsquo;ll be asked.
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">
              First column is the email; a full-name column is optional.
            </p>
          )}
        </div>
      </div>
    </Modal>

    {askExisting && (
      <Modal
        open
        onClose={busy ? () => {} : () => setAskExisting(false)}
        title="Some emails already exist"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAskExisting(false)} disabled={busy != null}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void submit("skip")} disabled={busy != null}>
              {inFlight === "skip" ? <Spinner /> : null} Skip
            </Button>
            <Button onClick={() => void submit("overwrite")} disabled={busy != null}>
              {inFlight === "overwrite" ? <Spinner /> : null} Overwrite
            </Button>
          </>
        }
      >
        <p className="text-body text-gray-700">
          <strong>{existingCount}</strong> of these {validCount} email{validCount === 1 ? "" : "s"} already exist in
          the system.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>
            <strong>Overwrite</strong> resets those accounts to the chosen role + shared password (and full name when
            the file has one), then creates the rest.
          </li>
          <li>
            <strong>Skip</strong> leaves them untouched and only creates the new emails.
          </li>
        </ul>
        <p className="mt-2 text-xs text-gray-400">
          Your own account and accounts above your access are never overwritten.
        </p>
      </Modal>
    )}
   </>
  );
}
