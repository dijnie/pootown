"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

export function AuthDialog({
  mode,
  onModeChange,
  onLogin,
  onRegister,
}: {
  readonly mode: Mode | null;
  readonly onModeChange: (mode: Mode | null) => void;
  readonly onLogin: (credentials: { readonly email: string; readonly password: string }) => Promise<void>;
  readonly onRegister: (credentials: { readonly email: string; readonly password: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
    setPassword("");
  }, [mode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const credentials = { email, password };
      if (mode === "login") await onLogin(credentials);
      else await onRegister(credentials);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onModeChange(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "register" ? "Create your account" : "Sign in to Pootown"}</DialogTitle>
          <DialogDescription>
            {mode === "register"
              ? "Use an email and a password of at least 12 characters."
              : "Enter the email and password for your Pootown account."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              className="normal-case"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="normal-case"
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error !== null && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}
          </Button>
        </form>
        <Button
          type="button"
          variant="neutral"
          disabled={submitting}
          onClick={() => onModeChange(mode === "register" ? "login" : "register")}
        >
          {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
