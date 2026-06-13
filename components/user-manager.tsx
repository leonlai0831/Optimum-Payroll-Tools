"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Eye, EyeOff, KeyRound, Plus, Search, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { ConfirmModal, Modal } from "@/components/modal";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { EmployeeCombobox } from "@/components/employee-combobox";
import { useToast } from "@/components/toast";
import { ROLE_LABELS, ROLES, canManageUserRole, type Role } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

type SortCol = "email" | "displayName" | "role" | "active";

export interface SafeUser {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  coachId: number | null;
  gymStaffId: number | null;
  active: boolean;
}
/** An employee a login can link to — a Swim coach or an Optimum Fit gym-staff member. */
export interface CoachOption {
  id: number;
  name: string;
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
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  // Display-name drafts keyed by user id; saved on blur when changed.
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
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
    busy: busyIds.has(u.id),
    name: nameDrafts[u.id] ?? u.displayName,
    onNameChange: (v: string) => setNameDrafts((m) => ({ ...m, [u.id]: v })),
    onNameBlur: (v: string) => {
      if (v.trim() !== u.displayName.trim()) void patchUser(u.id, { displayName: v.trim() });
    },
    onPatch: (body: Record<string, unknown>) => void patchUser(u.id, body),
    onResetPassword: () => setPwTarget(u),
    onDelete: () => setDeleteTarget(u),
  });

  return (
    <div className="space-y-4">
      {/* No assignable role below the actor's own → nothing they could create. */}
      {roleOptions.length > 0 && (
        <AddUser coaches={coaches} gymStaff={gymStaff} roleOptions={roleOptions} />
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
                <SortTh label="Name" col="displayName" sort={sort} onSort={toggleSort} />
                <SortTh label="Role" col="role" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-2 text-left">Linked employee</th>
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
  name,
  onNameChange,
  onNameBlur,
  onPatch,
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
  name: string;
  onNameChange: (value: string) => void;
  onNameBlur: (value: string) => void;
  onPatch: (body: Record<string, unknown>) => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const roleSelect = (className: string) => (
    <Select
      className={className}
      value={user.role}
      disabled={busy || readOnly}
      onChange={(e) => onPatch({ role: e.target.value })}
    >
      {roleOptions.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
      {/* A read-only row's role sits at the actor's own rank, outside roleOptions. */}
      {!roleOptions.includes(user.role) && (
        <option value={user.role}>{ROLE_LABELS[user.role]}</option>
      )}
    </Select>
  );
  const linkSelect = (className: string) => (
    <EmployeeCombobox
      className={className}
      coaches={coaches}
      gymStaff={gymStaff}
      value={linkToken(user)}
      disabled={busy || readOnly}
      onChange={(token) => onPatch(parseLinkToken(token))}
    />
  );
  const nameInput = (className: string) => (
    <Input
      className={className}
      value={name}
      disabled={busy || readOnly}
      placeholder="—"
      onChange={(e) => onNameChange(e.target.value)}
      onBlur={() => onNameBlur(name)}
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
      <div className={cn("p-4", busy && "opacity-60")}>
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
                checked={user.active}
                disabled={busy || readOnly}
                onChange={(e) => onPatch({ active: e.target.checked })}
              />
            </label>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-overline text-muted">Name</span>
            {nameInput("mt-1")}
          </label>
          <label className="block">
            <span className="text-overline text-muted">Role</span>
            {roleSelect("mt-1")}
          </label>
          <label className="block sm:col-span-2">
            <span className="text-overline text-muted">Linked employee</span>
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
    <tr className={busy ? "opacity-60" : undefined}>
      <td className="px-4 py-2 font-medium text-gray-800">
        {user.email}
        {isSelf && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
      </td>
      <td className="px-4 py-2">{nameInput("w-40 py-1 text-xs")}</td>
      <td className="px-4 py-2">{roleSelect("w-36 py-1 text-xs")}</td>
      <td className="px-4 py-2">{linkSelect("w-44 py-1 text-xs")}</td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-600"
          checked={user.active}
          disabled={busy || readOnly}
          onChange={(e) => onPatch({ active: e.target.checked })}
          title={user.active ? "Active" : "Inactive"}
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
          <Label htmlFor="u-coach">Linked employee</Label>
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
