"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { ConfirmModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/types";

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
  const roleOptions = ROLES.filter((r) => r !== "super_admin" || actorIsSuperAdmin);
  return (
    <div className="space-y-4">
      <AddUser coaches={coaches} gymStaff={gymStaff} roleOptions={roleOptions} />
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          User accounts · {users.length}
        </div>
        <div className="overflow-x-auto">
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
                <UserRow
                  key={u.id}
                  user={u}
                  coaches={coaches}
                  gymStaff={gymStaff}
                  roleOptions={roleOptions}
                  isSelf={u.id === actorId}
                  actorIsSuperAdmin={actorIsSuperAdmin}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
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

function UserRow({
  user,
  coaches,
  gymStaff,
  roleOptions,
  isSelf,
  actorIsSuperAdmin,
}: {
  user: SafeUser;
  coaches: CoachOption[];
  gymStaff: GymStaffOption[];
  roleOptions: Role[];
  isSelf: boolean;
  actorIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // A non-super admin cannot change the super_admin role on a row.
  const roleLocked = user.role === "super_admin" && !actorIsSuperAdmin;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Update failed");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const pw = window.prompt(`New password for ${user.email}:`);
    if (!pw) return;
    await patch({ password: pw });
  }

  async function remove() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Delete failed");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <tr className={busy ? "opacity-60" : undefined}>
      <td className="px-4 py-2 font-medium text-gray-800">
        {user.email}
        {isSelf && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
      </td>
      <td className="px-4 py-2">
        <NameCell
          initial={user.displayName}
          busy={busy}
          onSave={(v) => patch({ displayName: v })}
        />
      </td>
      <td className="px-4 py-2">
        <Select
          className="w-36 py-1 text-xs"
          value={user.role}
          disabled={busy || roleLocked}
          onChange={(e) => patch({ role: e.target.value })}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
          {roleLocked && <option value="super_admin">{ROLE_LABELS.super_admin}</option>}
        </Select>
      </td>
      <td className="px-4 py-2">
        <Select
          className="w-44 py-1 text-xs"
          value={linkToken(user)}
          disabled={busy}
          onChange={(e) => patch(parseLinkToken(e.target.value))}
        >
          <EmployeeLinkOptions coaches={coaches} gymStaff={gymStaff} />
        </Select>
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          className="h-4 w-4 accent-indigo-600"
          checked={user.active}
          disabled={busy}
          onChange={(e) => patch({ active: e.target.checked })}
          title={user.active ? "Active" : "Inactive"}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={resetPassword}
            disabled={busy}
            className="text-gray-400 transition hover:text-indigo-600 disabled:opacity-40"
            title="Reset password"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          {!isSelf && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="text-gray-300 transition hover:text-red-500 disabled:opacity-40"
              title="Delete user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete ${user.email}?`}
        message="This cannot be undone. The account loses access immediately; any linked employee record stays."
        confirmLabel="Delete user"
        busy={busy}
      />
    </tr>
  );
}

/** Inline editable display name — saves on blur (or Enter) only when it changed. */
function NameCell({
  initial,
  busy,
  onSave,
}: {
  initial: string;
  busy: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      className="w-40 py-1 text-xs"
      value={value}
      disabled={busy}
      placeholder="—"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() !== initial.trim()) onSave(value.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
