// ===== ProfilePage =====
// User profile editing, password change, and MFA setup/management

import { useState, useCallback } from "react";
import { User, Lock, Shield, Key, Eye, EyeOff, Copy, Check, ArrowLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { authService } from "../../lib/api";
import { colors, Button, SubTabNav, Badge, Modal } from "../ui/design-system";

type ProfileTab = "profile" | "password" | "mfa";

interface ProfilePageProps {
  onBack: () => void;
}

export function ProfilePage({ onBack }: ProfilePageProps) {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phone: user?.phone || "",
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordConfirmation: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  // MFA state
  const [mfaStep, setMfaStep] = useState<"idle" | "setup" | "verify" | "backup" | "disable">("idle");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaQrUrl, setMfaQrUrl] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [copiedBackup, setCopiedBackup] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── Profile Save ──────────────────────────────────────────────────────

  const saveProfile = async () => {
    setProfileLoading(true);
    try {
      const res = await authService.updateProfile(profileForm);
      if (res.data) {
        updateUser(profileForm);
        showToast("Profile updated successfully", "success");
      }
    } catch {
      showToast("Failed to update profile", "error");
    }
    setProfileLoading(false);
  };

  // ─── Password Change ───────────────────────────────────────────────────

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.newPasswordConfirmation) {
      showToast("Passwords do not match", "error");
      return;
    }
    if (passwordForm.newPassword.length < 12) {
      showToast("Password must be at least 12 characters", "error");
      return;
    }
    setPasswordLoading(true);
    try {
      await authService.changePassword(passwordForm);
      showToast("Password changed successfully", "success");
      setPasswordForm({ currentPassword: "", newPassword: "", newPasswordConfirmation: "" });
    } catch {
      showToast("Failed to change password. Check your current password.", "error");
    }
    setPasswordLoading(false);
  };

  // ─── MFA Setup ─────────────────────────────────────────────────────────

  const startMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const res = await authService.setupMfa();
      if (res.data) {
        setMfaSecret(res.data.secret);
        setMfaQrUrl(res.data.qrCodeUrl);
        setMfaStep("verify");
      }
    } catch {
      showToast("Failed to initialize MFA setup", "error");
    }
    setMfaLoading(false);
  };

  const verifyMfaCode = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);
    try {
      const res = await authService.enableMfa({ code: mfaCode, secret: mfaSecret });
      if (res.data?.enabled) {
        setBackupCodes(res.data.backupCodes);
        setMfaStep("backup");
        updateUser({ mfaEnabled: true });
        showToast("MFA enabled successfully!", "success");
      }
    } catch {
      showToast("Invalid code. Try again.", "error");
    }
    setMfaLoading(false);
    setMfaCode("");
  };

  const disableMfa = async () => {
    setMfaLoading(true);
    try {
      await authService.disableMfa({ password: disablePassword });
      updateUser({ mfaEnabled: false });
      setMfaStep("idle");
      setDisablePassword("");
      showToast("MFA disabled", "success");
    } catch {
      showToast("Incorrect password", "error");
    }
    setMfaLoading(false);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  // ─── Password Strength ─────────────────────────────────────────────────

  const getPasswordStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return { score, label: "Weak", color: colors.red500 };
    if (score <= 4) return { score, label: "Fair", color: colors.amber500 };
    return { score, label: "Strong", color: colors.green500 };
  };

  const pwStrength = getPasswordStrength(passwordForm.newPassword);

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "password" as const, label: "Password", icon: Lock },
    { id: "mfa" as const, label: "Two-Factor Auth", icon: Shield },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium" style={{ backgroundColor: toast.type === "success" ? colors.green600 : colors.red600 }} role="alert">
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg transition-colors hover:bg-slate-100" aria-label="Go back">
          <ArrowLeft size={18} style={{ color: colors.slate500 }} />
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: colors.navy900 }}>Account Settings</h1>
          <p className="text-xs" style={{ color: colors.slate500 }}>{user?.email}</p>
        </div>
      </div>

      <SubTabNav tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as ProfileTab)} />

      {/* ─── Profile Tab ──────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="rounded-xl shadow-sm border p-6 space-y-5 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
          <div className="flex items-center gap-4 mb-2">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ backgroundColor: colors.teal500 }}>
              {(user?.firstName?.[0] || "")}{(user?.lastName?.[0] || "")}
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.navy900 }}>{user?.firstName} {user?.lastName}</h2>
              <Badge variant={user?.role === "practice_admin" ? "purple" : user?.role === "provider" ? "info" : "neutral"}>
                {user?.role?.replace("_", " ")}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>First Name</label>
              <input value={profileForm.firstName} onChange={(e) => setProfileForm(f => ({ ...f, firstName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Last Name</label>
              <input value={profileForm.lastName} onChange={(e) => setProfileForm(f => ({ ...f, lastName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Phone</label>
            <input value={profileForm.phone} onChange={(e) => setProfileForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} placeholder="(555) 123-4567" />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Email</label>
            <input value={user?.email || ""} disabled className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate200, backgroundColor: colors.slate50, color: colors.slate500 }} />
            <p className="text-xs mt-1" style={{ color: colors.slate400 }}>Contact support to change your email.</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveProfile} loading={profileLoading} disabled={!profileForm.firstName || !profileForm.lastName}>
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* ─── Password Tab ─────────────────────────────────────────────── */}
      {activeTab === "password" && (
        <div className="rounded-xl shadow-sm border p-6 space-y-5 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.amber50 }}>
              <Key size={18} style={{ color: colors.amber600 }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: colors.navy900 }}>Change Password</h2>
              <p className="text-xs" style={{ color: colors.slate500 }}>Use a strong password with at least 12 characters.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Current Password</label>
            <div className="relative">
              <input type={showPasswords ? "text" : "password"} value={passwordForm.currentPassword} onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} className="w-full px-3 py-2 pr-10 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />
              <button onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={showPasswords ? "Hide passwords" : "Show passwords"}>
                {showPasswords ? <EyeOff size={16} style={{ color: colors.slate400 }} /> : <Eye size={16} style={{ color: colors.slate400 }} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>New Password</label>
            <input type={showPasswords ? "text" : "password"} value={passwordForm.newPassword} onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />
            {passwordForm.newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: colors.slate200 }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(pwStrength.score / 6) * 100}%`, backgroundColor: pwStrength.color }} />
                </div>
                <span className="text-xs font-medium" style={{ color: pwStrength.color }}>{pwStrength.label}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Confirm New Password</label>
            <input type={showPasswords ? "text" : "password"} value={passwordForm.newPasswordConfirmation} onChange={(e) => setPasswordForm(f => ({ ...f, newPasswordConfirmation: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} />
            {passwordForm.newPasswordConfirmation && passwordForm.newPassword !== passwordForm.newPasswordConfirmation && (
              <p className="text-xs mt-1" style={{ color: colors.red500 }}>Passwords do not match.</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={changePassword} loading={passwordLoading} disabled={!passwordForm.currentPassword || !passwordForm.newPassword || passwordForm.newPassword !== passwordForm.newPasswordConfirmation}>
              Change Password
            </Button>
          </div>
        </div>
      )}

      {/* ─── MFA Tab ──────────────────────────────────────────────────── */}
      {activeTab === "mfa" && (
        <div className="rounded-xl shadow-sm border p-6 space-y-5 animate-fade-in-up" style={{ backgroundColor: colors.white, borderColor: colors.slate200 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: user?.mfaEnabled ? colors.green50 : colors.slate100 }}>
              <Shield size={18} style={{ color: user?.mfaEnabled ? colors.green600 : colors.slate400 }} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold" style={{ color: colors.navy900 }}>Two-Factor Authentication</h2>
              <p className="text-xs" style={{ color: colors.slate500 }}>Add an extra layer of security using an authenticator app.</p>
            </div>
            <Badge variant={user?.mfaEnabled ? "success" : "neutral"}>
              {user?.mfaEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          {/* MFA Not Enabled — Show setup button */}
          {!user?.mfaEnabled && mfaStep === "idle" && (
            <div className="rounded-lg p-5 text-center" style={{ backgroundColor: colors.slate50 }}>
              <Shield size={32} style={{ color: colors.slate300 }} className="mx-auto mb-3" />
              <p className="text-sm mb-4" style={{ color: colors.slate600 }}>Protect your account with time-based one-time passwords (TOTP).</p>
              <Button onClick={() => { setMfaStep("setup"); startMfaSetup(); }} loading={mfaLoading}>
                Set Up Two-Factor Auth
              </Button>
            </div>
          )}

          {/* Step: QR Code + Verify */}
          {mfaStep === "verify" && (
            <div className="space-y-4">
              <div className="rounded-lg p-4 text-center" style={{ backgroundColor: colors.slate50 }}>
                <p className="text-xs font-medium mb-3" style={{ color: colors.slate600 }}>
                  1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                {mfaQrUrl && <img src={mfaQrUrl} alt="MFA QR Code" className="mx-auto rounded-lg" style={{ width: 200, height: 200 }} />}
                <div className="mt-3">
                  <p className="text-xs" style={{ color: colors.slate400 }}>Or enter this key manually:</p>
                  <code className="text-xs font-mono px-2 py-1 rounded mt-1 inline-block" style={{ backgroundColor: colors.slate200, color: colors.navy900 }}>{mfaSecret}</code>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>
                  2. Enter the 6-digit code from your authenticator app
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-3 py-3 rounded-lg border text-center text-2xl font-mono tracking-widest"
                  style={{ borderColor: colors.slate300, letterSpacing: "0.5em" }}
                  placeholder="000000"
                  autoFocus
                />
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setMfaStep("idle")}>Cancel</Button>
                <Button onClick={verifyMfaCode} loading={mfaLoading} disabled={mfaCode.length !== 6}>
                  Verify & Enable
                </Button>
              </div>
            </div>
          )}

          {/* Step: Backup Codes */}
          {mfaStep === "backup" && (
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: colors.amber50, border: `1px solid ${colors.amber500}` }}>
                <p className="text-xs font-semibold" style={{ color: colors.amber600 }}>Save these backup recovery codes!</p>
                <p className="text-xs mt-1" style={{ color: colors.amber600 }}>
                  If you lose access to your authenticator app, use these codes to log in. Each code can only be used once.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4 rounded-lg" style={{ backgroundColor: colors.slate50 }}>
                {backupCodes.map((code, i) => (
                  <code key={i} className="text-sm font-mono text-center py-1.5 rounded" style={{ backgroundColor: colors.white, color: colors.navy900 }}>
                    {code}
                  </code>
                ))}
              </div>

              <div className="flex justify-between">
                <Button variant="secondary" onClick={copyBackupCodes} icon={copiedBackup ? <Check size={14} /> : <Copy size={14} />}>
                  {copiedBackup ? "Copied!" : "Copy Codes"}
                </Button>
                <Button onClick={() => setMfaStep("idle")}>Done</Button>
              </div>
            </div>
          )}

          {/* MFA Enabled — Show disable option */}
          {user?.mfaEnabled && mfaStep === "idle" && (
            <div className="rounded-lg p-4 flex items-center justify-between" style={{ backgroundColor: colors.green50 }}>
              <div>
                <p className="text-sm font-medium" style={{ color: colors.green600 }}>Two-factor authentication is active.</p>
                <p className="text-xs" style={{ color: colors.slate500 }}>Your account is protected with TOTP.</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setMfaStep("disable")}>Disable</Button>
            </div>
          )}

          {/* Disable MFA Confirmation */}
          <Modal
            open={mfaStep === "disable"}
            onClose={() => setMfaStep("idle")}
            title="Disable Two-Factor Auth"
            subtitle="Confirm your password to disable MFA"
            headerGradient="linear-gradient(135deg, #dc2626, #ef4444)"
            footer={
              <>
                <Button variant="secondary" onClick={() => { setMfaStep("idle"); setDisablePassword(""); }}>Cancel</Button>
                <Button variant="danger" onClick={disableMfa} loading={mfaLoading} disabled={!disablePassword}>Disable MFA</Button>
              </>
            }
          >
            <div className="p-5 space-y-4">
              <div className="rounded-lg p-3" style={{ backgroundColor: colors.red50 }}>
                <p className="text-xs" style={{ color: colors.red600 }}>
                  Disabling MFA will remove the extra layer of security from your account.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.slate600 }}>Enter your password to confirm</label>
                <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.slate300 }} autoFocus />
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
