"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Save } from "lucide-react";
import { Button, Card, Input, Select, Spinner } from "@/components/ui";
import { DesktopTable, MobileCards } from "@/components/responsive-table";
import { useToast } from "@/components/toast";
import { MALAYSIAN_BANKS, bankCode } from "@/lib/freelancer/banks";

export interface PayeeRow {
  id: number;
  name: string;
  icNo: string;
  bankName: string;
  bankAccount: string;
}

type Draft = Pick<PayeeRow, "icNo" | "bankName" | "bankAccount">;

/**
 * Workforce → Payees: bulk entry for FREELANCER bank details (the rows the
 * monthly bank-transfer file pulls). One Save writes every edited row back to
 * the coach profiles — the same fields the Freelancer Payment calculator
 * prefills from.
 */
export function PayeeBulkEntry({ rows, canEdit }: { rows: PayeeRow[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState(false);

  const draftFor = (r: PayeeRow): Draft =>
    drafts[r.id] ?? { icNo: r.icNo, bankName: r.bankName, bankAccount: r.bankAccount };
  const setField = (r: PayeeRow, field: keyof Draft, value: string) =>
    setDrafts((m) => ({ ...m, [r.id]: { ...draftFor(r), [field]: value } }));

  const dirtyIds = useMemo(
    () =>
      rows
        .filter((r) => {
          const d = drafts[r.id];
          return (
            d &&
            (d.icNo.trim() !== r.icNo ||
              d.bankName.trim() !== r.bankName ||
              d.bankAccount.trim() !== r.bankAccount)
          );
        })
        .map((r) => r.id),
    [rows, drafts],
  );

  async function saveAll() {
    if (dirtyIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/coaches/payees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: dirtyIds.map((id) => ({ id, ...drafts[id] })),
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Save failed");
      }
      toast.success(`Saved ${dirtyIds.length} payee record(s).`);
      setDrafts({});
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const bankSelect = (r: PayeeRow, className: string) => (
    <Select
      className={className}
      value={draftFor(r).bankName}
      disabled={!canEdit || busy}
      onChange={(e) => setField(r, "bankName", e.target.value)}
    >
      <option value="">—</option>
      {MALAYSIAN_BANKS.map((b) => (
        <option key={b.code} value={b.name}>
          {b.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Bank details for the monthly transfer file — freelancers from the directory only.
        </p>
        {canEdit && (
          <Button onClick={saveAll} disabled={busy || dirtyIds.length === 0}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />}
            Save{dirtyIds.length > 0 ? ` ${dirtyIds.length} change(s)` : ""}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          <Landmark className="h-4 w-4 text-indigo-500" /> Payee details · {rows.length}{" "}
          freelancer(s)
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            No freelancers in the directory yet. Add one with “Add member” and set its type to
            Freelancer.
          </p>
        ) : (
          <>
            <MobileCards>
              {rows.map((r) => (
                <div key={r.id} className="space-y-3 p-4">
                  <div className="font-medium text-gray-800">{r.name}</div>
                  <label className="block">
                    <span className="text-overline text-muted">IC No</span>
                    <Input
                      className="mt-1"
                      value={draftFor(r).icNo}
                      disabled={!canEdit || busy}
                      placeholder="e.g. 900101-14-5678"
                      onChange={(e) => setField(r, "icNo", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-overline text-muted">Bank</span>
                    {bankSelect(r, "mt-1")}
                  </label>
                  <label className="block">
                    <span className="text-overline text-muted">Bank account</span>
                    <Input
                      className="mt-1"
                      value={draftFor(r).bankAccount}
                      disabled={!canEdit || busy}
                      onChange={(e) => setField(r, "bankAccount", e.target.value)}
                    />
                  </label>
                </div>
              ))}
            </MobileCards>
            <DesktopTable>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">IC No</th>
                    <th className="px-4 py-2 text-left">Bank</th>
                    <th className="px-4 py-2 text-left">Bank code</th>
                    <th className="px-4 py-2 text-left">Bank account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className={dirtyIds.includes(r.id) ? "bg-indigo-50/40" : undefined}>
                      <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                      <td className="px-4 py-2">
                        <Input
                          className="w-44 py-1 text-xs"
                          value={draftFor(r).icNo}
                          disabled={!canEdit || busy}
                          placeholder="e.g. 900101-14-5678"
                          onChange={(e) => setField(r, "icNo", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">{bankSelect(r, "w-52 py-1 text-xs")}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 nums">
                        {bankCode(draftFor(r).bankName) || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          className="w-44 py-1 text-xs nums"
                          value={draftFor(r).bankAccount}
                          disabled={!canEdit || busy}
                          onChange={(e) => setField(r, "bankAccount", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTable>
          </>
        )}
      </Card>
    </div>
  );
}
