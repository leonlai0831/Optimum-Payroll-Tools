"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/types";

export interface SafeUser {
  id: number;
  email: string;
  role: Role;
  coachId: number | null;
  active: boolean;
}
export interface CoachOption {
  id: number;
  name: string;
}

export function UserManager({
  users,
  coaches,
  actorId,
  actorIsSuperAdmin,
}: {
  users: SafeUser[];
  coaches: CoachOption[];
  actorId: number;
  actorIsSuperAdmin: boolean;
}) {
  const roleOptions = ROLES.filter((r) => r !== "super_admin" || actorIsSuperAdmin);
  return (
    <div className="space-y-4">
      <AddUser coaches={coaches} roleOptions={roleOptions} />
      <Card className="overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          User accounts · {users.length}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Email</th>
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

function AddUser({ coaches, roleOptions }: { coaches: CoachOption[]; roleOptions: Role[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [coachId, setCoachId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setEmail("");
    setPassword("");
    setRole("staff");
    setCoachId("");
    setError("");
  }

  async function submit() {
    if (!email.trim() || !password) {
      setError("Email and password required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role,
          coachId: coachId ? Number(coachId) : null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Create failed");
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
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
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
          >
            <option value="">— none —</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
  roleOptions,
  isSelf,
  actorIsSuperAdmin,
}: {
  user: SafeUser;
  coaches: CoachOption[];
  roleOptions: Role[];
  isSelf: boolean;
  actorIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A non-super admin cannot change the super_admin role on a row.
  const roleLocked = user.role === "super_admin" && !actorIsSuperAdmin;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
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
      setError(e instanceof Error ? e.message : "Update failed");
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
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Delete failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <tr className={busy ? "opacity-60" : undefined}>
      <td className="px-4 py-2 font-medium text-gray-800">
        {user.email}
        {isSelf && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
        {error && <div className="text-[11px] text-red-600">{error}</div>}
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
          value={user.coachId ?? ""}
          disabled={busy}
          onChange={(e) => patch({ coachId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">— none —</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
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
              onClick={remove}
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
