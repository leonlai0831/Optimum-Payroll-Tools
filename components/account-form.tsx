"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ROLE_LABELS, type Role } from "@/lib/auth/types";

export function AccountForm({
  email,
  role,
  displayName,
}: {
  email: string;
  role: Role;
  displayName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState(email);
  const [newDisplayName, setNewDisplayName] = useState(displayName);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const emailChanged = newEmail.trim().toLowerCase() !== email.toLowerCase();
  const nameChanged = newDisplayName.trim() !== displayName.trim();
  const passwordChanged = newPassword.length > 0;
  const dirty = emailChanged || nameChanged || passwordChanged;
  // Current password is only needed for the security-sensitive fields.
  const needsCurrentPassword = emailChanged || passwordChanged;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: needsCurrentPassword ? currentPassword : undefined,
          newEmail: emailChanged ? newEmail.trim() : undefined,
          newDisplayName: nameChanged ? newDisplayName.trim() : undefined,
          newPassword: newPassword || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      toast.success("Account updated.");
      setCurrentPassword("");
      setNewPassword("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <Card className="space-y-4 p-4">
        <div>
          <Label>Role</Label>
          {/* Role is admin-controlled — shown here read-only. */}
          <p className="mt-1 text-body text-gray-700">{ROLE_LABELS[role]}</p>
        </div>
        <div>
          <Label htmlFor="acc-nickname">Nickname</Label>
          <Input
            id="acc-nickname"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="Shown around the app (falls back to your email)"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="acc-email">Email</Label>
          <Input
            id="acc-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="mt-1"
            required
          />
        </div>
        <div>
          <Label htmlFor="acc-new-password">New password</Label>
          <Input
            id="acc-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            className="mt-1"
          />
        </div>
        {needsCurrentPassword && (
          <div className="border-t border-gray-100 pt-4">
            <Label htmlFor="acc-current-password">
              Current password (required to change email or password)
            </Label>
            <Input
              id="acc-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
              required
            />
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !dirty || (needsCurrentPassword && !currentPassword)}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
          </Button>
        </div>
      </Card>
    </form>
  );
}
