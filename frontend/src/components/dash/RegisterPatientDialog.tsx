import { useMemo, useState } from "react";
import {
  UserPlus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  FlaskConical,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useRegisterMulti, useServiceTypes } from "@/hooks/use-queue-data";
import { ApiError, type RegisterMultiResult, type ServiceType } from "@/lib/api";
import { useTheme } from "@/lib/theme";

// Header CTA + dialog that registers a patient against POST /api/queue/register-multi/.
// Services are split into two checkbox groups by ServiceType.kind:
//   CONSULTATION → "Doctor Consultation" (departments)
//   DIAGNOSTIC   → "Diagnostic Tests"
// One token is issued per selection; on success the issued tokens are listed,
// shortest-wait first, and the live queue views refresh via the mutation hook.
export function RegisterPatientDialog() {
  const { isLight } = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<RegisterMultiResult | null>(null);

  const { data: serviceTypes } = useServiceTypes();
  const register = useRegisterMulti();

  const { consultations, tests } = useMemo(() => {
    const all = serviceTypes ?? [];
    return {
      // Anything not explicitly DIAGNOSTIC is treated as a consultation
      // (the backend's ServiceType.kind defaults to CONSULTATION).
      consultations: all.filter((s) => s.kind !== "DIAGNOSTIC"),
      tests: all.filter((s) => s.kind === "DIAGNOSTIC"),
    };
  }, [serviceTypes]);

  const canSubmit =
    name.trim() !== "" &&
    phone.trim() !== "" &&
    selected.size > 0 &&
    consent &&
    !register.isPending;

  const errorMsg = useMemo(() => extractError(register.error), [register.error]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setName("");
    setPhone("");
    setNotes("");
    setSelected(new Set());
    setConsent(false);
    setResult(null);
    register.reset();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    register.mutate(
      {
        patient_name: name.trim(),
        phone_number: phone.trim(),
        service_type_ids: consultations
          .filter((s) => selected.has(s.id))
          .map((s) => s.id),
        test_ids: tests.filter((s) => selected.has(s.id)).map((s) => s.id),
        medical_notes: notes.trim(),
      },
      { onSuccess: (data) => setResult(data) },
    );
  };

  const orderedTokens = result
    ? [...result.tokens].sort((a, b) => a.queue_depth - b.queue_depth)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-xl px-3 text-base font-medium !text-white shadow-sm transition hover:opacity-90"
          style={{ background: "var(--gradient-violet)" }}
          aria-label="Register patient"
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Register Patient</span>
        </button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register patient</DialogTitle>
          <DialogDescription>
            Pick consultations and tests — one queue token is issued per selection.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2 text-[var(--emerald-glow)]">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">
                Registered · {orderedTokens.length}{" "}
                {orderedTokens.length === 1 ? "token" : "tokens"} issued
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Patient ID</span>
              <span className="font-mono text-lg font-bold tracking-wide text-foreground">{result.patient_id}</span>
            </div>
            <ul className="space-y-2">
              {orderedTokens.map((t) => (
                <li
                  key={t.token_number}
                  className="rounded-xl border border-border bg-muted/40 p-3 text-base"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.service_type_name}</span>
                    <span className="font-mono font-semibold">{t.token_number}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t.counter}</span>
                    <span>{waitLabel(t.queue_depth)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={reset}>
                Register another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rp-name">Patient name</Label>
                <Input
                  id="rp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-phone">Phone number</Label>
                <Input
                  id="rp-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <CheckboxGroup
                icon={<Stethoscope className="h-3.5 w-3.5" />}
                title="Doctor Consultation"
                items={consultations}
                selected={selected}
                onToggle={toggle}
              />
              <CheckboxGroup
                icon={<FlaskConical className="h-3.5 w-3.5" />}
                title="Diagnostic Tests"
                items={tests}
                selected={selected}
                onToggle={toggle}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rp-notes">Medical notes (optional)</Label>
              <Textarea
                id="rp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, referral, priority flags…"
                rows={2}
              />
            </div>

            {/* WhatsApp/SMS opt-in — required before we message the patient. */}
            <label
              htmlFor="rp-consent"
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
            >
              <Checkbox
                id="rp-consent"
                checked={consent}
                onCheckedChange={(c) => setConsent(c === true)}
                className="mt-0.5"
              />
              <span>
                The patient consents to receive queue updates and token
                notifications via <span className="font-medium text-foreground">WhatsApp/SMS</span> on
                this number.
              </span>
            </label>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-sm text-[var(--danger)]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <DialogFooter className="items-center gap-2 sm:gap-2">
              <span className="mr-auto text-sm text-muted-foreground">
                {selected.size} selected
              </span>
              <Button type="submit" disabled={!canSubmit}>
                {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {register.isPending ? "Registering…" : "Register patient"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckboxGroup({
  icon,
  title,
  items,
  selected,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  items: ServiceType[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
        {icon}
        {title}
        <span className="font-normal normal-case tracking-normal">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None available.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {items.map((s) => {
            const id = `svc-${s.id}`;
            const isChecked = selected.has(s.id);
            return (
              <label
                key={s.id}
                htmlFor={id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-base hover:bg-muted/50 ${
                  isChecked
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <Checkbox
                  id={id}
                  checked={isChecked}
                  onCheckedChange={() => onToggle(s.id)}
                />
                <span className="truncate">{s.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function waitLabel(depth: number): string {
  return depth <= 0 ? "no wait" : `${depth} waiting`;
}

// Surfaces backend errors: the duplicate-session guard returns { error }, while
// DRF validation returns { field: [msg] } or { non_field_errors: [msg] }.
function extractError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const body = error.body as Record<string, unknown>;
    if (typeof body.error === "string") return body.error;
    const firstKey = Object.keys(body)[0];
    if (firstKey) {
      const val = body[firstKey];
      const msg = Array.isArray(val) ? val[0] : val;
      if (typeof msg === "string") return msg;
    }
  }
  return error instanceof Error ? error.message : "Registration failed.";
}
