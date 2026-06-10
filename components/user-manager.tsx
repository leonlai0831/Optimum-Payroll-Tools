"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { ConfirmModal, Modal } from "@/components/modal";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

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

/** Grouped <option>s shared by the add form and each row's link picker. */
function EmployeeLinkOptions({
  coaches,
  gymStaff,
}: {
  coaches: CoachOption[];
  gymStaff: GymStaffOption[];
}) {
  return (
    <>
      <option value="">— none —</option>
      {coaches.length > 0 && (
        <optgroup label="Swim School">
          {coaches.map((c) => (
            <option key={`coach:${c.id}`} value={`coach:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {gymStaff.length > 0 && (
        <optgroup label="Optimum Fit">
          {gymStaff.map((g) => (
            <option key={`gym:${g.id}`} value={`gym:${g.id}`}>
              {g.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
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
  actorIsSuperAdmin,
}: {
  users: SafeUser[];
  coaches: CoachOption[];
  gymStaff: GymStaffOption[];
  actorId: number;
  actorIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const roleOptions = ROLES.filter((r) => r !== "super_admin" || actorIsSuperAdmin);
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  // Display-name drafts keyed by user id; saved on blur when changed.
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<SafeUser | null>(null);
  const [pwTarget, setPwTarget] = useState<SafeUser | null>(null);

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
    // A non-super admin cannot change the super_admin role on a row.
    roleLocked: u.role === "super_admin" && !actorIsSuperAdmin,
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
      <AddUser coaches={coaches} gymStaff={gymStaff} roleOptions={roleOptions} />
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          User accounts · {users.length}
        </div>
        <MobileCards>
          {users.map((u) => (
            <UserEntry key={u.id} layout="card" {...entryProps(u)} />
          ))}
        </MobileCards>
        <DesktopTable>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Linked employee</th>
                <th className="px-4 py-2 text-center">Active</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
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
          <Input
            id="reset-pw"
            type="text"
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
  roleLocked,
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
  roleLocked: boolean;
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
      disabled={busy || roleLocked}
      onChange={(e) => onPatch({ role: e.target.value })}
    >
      {roleOptions.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
      {roleLocked && <option value="super_admin">{ROLE_LABELS.super_admin}</option>}
    </Select>
  );
  const linkSelect = (className: string) => (
    <Select
      className={className}
      value={linkToken(user)}
      disabled={busy}
      onChange={(e) => onPatch(parseLinkToken(e.target.value))}
    >
      <EmployeeLinkOptions coaches={coaches} gymStaff={gymStaff} />
    </Select>
  );
  const nameInput = (className: string) => (
    <Input
      className={className}
      value={name}
      disabled={busy}
      placeholder="—"
      onChange={(e) => onNameChange(e.target.value)}
      onBlur={() => onNameBlur(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );

  if (layout === "card") {
    return (
      <div className={cn("p-4", busy && "opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 truncate font-medium text-gray-800">
            {user.email}
            {isSelf && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-gray-600">
            Active
            <input
              type="checkbox"
              className="h-5 w-5 accent-indigo-600"
              checked={user.active}
              disabled={busy}
              onChange={(e) => onPatch({ active: e.target.checked })}
            />
          </label>
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
          disabled={busy}
          onChange={(e) => onPatch({ active: e.target.checked })}
          title={user.active ? "Active" : "Inactive"}
        />
      </td>
      <td className="px-4 py-2">
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
          <Input
            id="u-pw"
            type="text"
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
          <Select
            id="u-coach"
            className="mt-1"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          >
            <EmployeeLinkOptions coaches={coaches} gymStaff={gymStaff} />
          </Select>
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
