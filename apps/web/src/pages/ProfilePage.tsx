import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Building2, LockKeyhole, Mail, MapPin, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTheme } from "@/hooks/useTheme";
import { countries, statesByCountry, type Country } from "@/lib/countries";
import { nigerianInstitutionsByState, nigerianStates, type NigerianState } from "@/lib/nigeria-institutions";
import { type DemoProfilePayload, updateMyPassword, updateProfileDemo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const sexOptions = [
  { value: "", label: "Select sex" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" }
] as const;

type SexValue = (typeof sexOptions)[number]["value"];

type ProfileSection = "overview" | "details" | "institution" | "security";

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(80, "Full name is too long."),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s\-()]{7,20}$/, "Enter a valid phone number.")
    .or(z.literal("")),
  sex: z.union([z.literal("MALE"), z.literal("FEMALE"), z.literal("")]).optional(),
  addressLine1: z.string().trim().min(4, "Enter your street address.").max(120, "Address is too long."),
  addressLine2: z.string().trim().max(120, "Address is too long.").optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter your city.").max(80, "City is too long."),
  state: z.string().trim().min(2, "Enter your state.").max(80, "State is too long."),
  institutionState: z.string().trim().max(80).optional().or(z.literal("")),
  institutionName: z.string().trim().max(160, "Institution name is too long.").optional().or(z.literal("")),
  institutionOtherName: z.string().trim().max(160, "Institution name is too long.").optional().or(z.literal("")),
  postalCode: z.string().trim().min(3, "Enter a postal code.").max(20, "Postal code is too long."),
  country: z.enum(countries, { message: "Choose your country." })
});

const institutionUpdateSchema = z
  .object({
    institutionState: z.string().trim().min(1, "Choose the state where your institution is located."),
    institutionName: z.string().trim().max(160, "Institution name is too long.").optional().or(z.literal("")),
    institutionOtherName: z.string().trim().max(160, "Institution name is too long.").optional().or(z.literal(""))
  })
  .superRefine((values, context) => {
    if (!values.institutionName.trim() && !values.institutionOtherName.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose your institution or enter it in the other institution field.",
        path: ["institutionName"]
      })
    }
  })

const passwordSchema = z
  .object({
    currentPassword: z.string().trim().min(1, "Enter your current password."),
    password: z.string().trim().min(8, "Password must be at least 8 characters.").max(72, "Password is too long."),
    confirmPassword: z.string().trim().min(8, "Confirm your new password.")
  })
  .superRefine((values, context) => {
    if (values.password !== values.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"]
      });
    }
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof AxiosError) {
    return (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? fallbackMessage;
  }

  return fallbackMessage;
}

function sectionButtonClasses(isActive: boolean, isDark: boolean) {
  if (isActive) {
    return cn(
      "w-full rounded-[18px] border px-4 py-3 text-left text-sm font-medium",
      "border-[color:var(--color-accent-strong)]/35 bg-[color:var(--color-accent-strong)]/12 text-[color:var(--color-accent-strong)]"
    );
  }

  return cn(
    "w-full rounded-[18px] border px-4 py-3 text-left text-sm font-medium transition",
    isDark ? "border-slate-800 text-slate-200 hover:bg-slate-800/70" : "border-slate-200 text-slate-700 hover:bg-slate-50"
  );
}

export function ProfilePage() {
  const { isDark } = useTheme();
  const session = useAuthStore((state) => state.session);
  const updateSessionUser = useAuthStore((state) => state.updateSessionUser);
  const currentUser = session?.user;
  const isStudentUser = currentUser?.roleCodes.includes("student") ?? false;
  const [activeSection, setActiveSection] = useState<ProfileSection>("details");

  const roleLabel = currentUser?.roleCodes.includes("student")
    ? "Student account"
    : currentUser?.roleCodes.includes("lawyer")
      ? "Lawyer account"
      : "Member account";

  const resolvedCountry = (countries.includes(currentUser?.country as Country) ? (currentUser?.country as Country) : "Nigeria") as Country;

  const defaultProfileValues = useMemo<ProfileFormValues>(
    () => ({
      fullName: currentUser?.fullName ?? "",
      phoneNumber: currentUser?.phoneNumber ?? "",
      sex: (currentUser?.sex as SexValue | undefined) ?? "",
      addressLine1: currentUser?.addressLine1 ?? "",
      addressLine2: currentUser?.addressLine2 ?? "",
      city: currentUser?.city ?? "",
      state: currentUser?.state ?? "Lagos",
      institutionState: currentUser?.institutionState ?? "",
      institutionName: currentUser?.institutionName ?? "",
      institutionOtherName: currentUser?.institutionOtherName ?? "",
      postalCode: currentUser?.postalCode ?? "",
      country: resolvedCountry
    }),
    [currentUser, resolvedCountry]
  );

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaultProfileValues,
    values: defaultProfileValues
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      password: "",
      confirmPassword: ""
    }
  });

  const selectedInstitutionState = profileForm.watch("institutionState");
  const selectedCountry = profileForm.watch("country");
  const selectedStateOptions = useMemo(() => statesByCountry[selectedCountry] ?? [], [selectedCountry]);

  const selectedInstitutionOptions = useMemo(
    () =>
      selectedInstitutionState && selectedInstitutionState in nigerianInstitutionsByState
        ? nigerianInstitutionsByState[selectedInstitutionState as NigerianState]
        : [],
    [selectedInstitutionState]
  );

  useEffect(() => {
    const selectedInstitutionName = profileForm.getValues("institutionName");

    if (!selectedInstitutionName) {
      return;
    }

    if (!selectedInstitutionOptions.includes(selectedInstitutionName)) {
      profileForm.setValue("institutionName", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [profileForm, selectedInstitutionOptions]);

  useEffect(() => {
    const currentState = profileForm.getValues("state").trim();

    if (!selectedStateOptions.length) {
      return;
    }

    if (selectedStateOptions.includes(currentState)) {
      return;
    }

    profileForm.setValue("state", selectedStateOptions[0] ?? "", { shouldDirty: true, shouldValidate: true });
  }, [profileForm, selectedStateOptions]);

  const updateProfileMutation = useMutation({
    mutationFn: (payload: DemoProfilePayload) => updateProfileDemo(payload),
    onSuccess: (response) => {
      updateSessionUser(response.data.user);
    }
  });

  const updatePasswordMutation = useMutation({
    mutationFn: updateMyPassword,
    onSuccess: () => {
      passwordForm.reset();
    }
  });

  function onSubmitProfile(values: ProfileFormValues) {
    const parsedValues = profileSchema.parse(values);

    if (isStudentUser) {
      if (!parsedValues.institutionState.trim()) {
        profileForm.setError("institutionState", {
          message: "Choose the state where your institution is located."
        });
        return;
      }

      if (!parsedValues.institutionName.trim() && !parsedValues.institutionOtherName.trim()) {
        profileForm.setError("institutionName", {
          message: "Choose your institution or enter it in the other institution field."
        });
        return;
      }
    }

    updateProfileMutation.mutate({
      fullName: parsedValues.fullName,
      phoneNumber: parsedValues.phoneNumber,
      sex: parsedValues.sex,
      addressLine1: parsedValues.addressLine1,
      addressLine2: parsedValues.addressLine2,
      city: parsedValues.city,
      state: parsedValues.state,
      institutionState: parsedValues.institutionState,
      institutionName: parsedValues.institutionName,
      institutionOtherName: parsedValues.institutionOtherName,
      postalCode: parsedValues.postalCode,
      country: parsedValues.country
    } satisfies DemoProfilePayload);
  }

  function onSubmitInstitution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    profileForm.clearErrors(["institutionState", "institutionName", "institutionOtherName"])

    const result = institutionUpdateSchema.safeParse({
      institutionState: profileForm.getValues("institutionState"),
      institutionName: profileForm.getValues("institutionName"),
      institutionOtherName: profileForm.getValues("institutionOtherName")
    })

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors

      if (errors.institutionState?.[0]) {
        profileForm.setError("institutionState", { message: errors.institutionState[0] })
      }

      if (errors.institutionName?.[0]) {
        profileForm.setError("institutionName", { message: errors.institutionName[0] })
      }

      if (errors.institutionOtherName?.[0]) {
        profileForm.setError("institutionOtherName", { message: errors.institutionOtherName[0] })
      }

      return
    }

    updateProfileMutation.mutate({
      institutionState: result.data.institutionState,
      institutionName: result.data.institutionName,
      institutionOtherName: result.data.institutionOtherName
    })
  }

  function onSubmitPassword(values: PasswordFormValues) {
    const parsedValues = passwordSchema.parse(values);

    updatePasswordMutation.mutate({
      currentPassword: parsedValues.currentPassword,
      password: parsedValues.password,
      confirmPassword: parsedValues.confirmPassword
    });
  }

  const sidebarItems = useMemo(
    () =>
      [
        { key: "overview", label: "Account Overview" },
        { key: "details", label: "Account details" },
        { key: "institution", label: "Student's institution" },
        { key: "security", label: "Security" }
      ] as Array<{ key: ProfileSection; label: string }>,
    []
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#25112b_0%,#0f1f4d_55%,#112a5b_100%)] p-7 text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)] lg:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-white/45">Profile</p>
        <h2 className="mt-4 max-w-3xl font-heading text-3xl leading-tight text-white lg:text-[2.55rem]">Manage your account</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">Update personal details, student institution, and security settings.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className={cn(
            "rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
            isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
          )}
        >
          <div className={cn("rounded-[22px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-accent-strong)]/15 text-base font-semibold text-[color:var(--color-accent-strong)]">
                {(currentUser?.fullName?.[0] ?? "H").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{currentUser?.fullName ?? "Helar Member"}</p>
                <div className={cn("mt-1 flex items-center gap-2 text-xs", isDark ? "text-slate-400" : "text-slate-600")}>
                  <Mail className="h-4 w-4" />
                  <span className="truncate">{currentUser?.email ?? "profile@helar.test"}</span>
                </div>
                <span className="mt-3 inline-flex rounded-full bg-[color:var(--color-accent-strong)]/12 px-3 py-1 text-[11px] font-medium text-[color:var(--color-accent-strong)]">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {sidebarItems.map((item) => (
              <button
                className={sectionButtonClasses(activeSection === item.key, isDark)}
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          {activeSection === "overview" ? (
            <section
              className={cn(
                "rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950")}>
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Account overview</p>
                  <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>Account overview</h3>
                </div>
              </div>

              {isStudentUser ? (
                <div className={cn("mt-6 rounded-[22px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                  <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>Student institution</p>
                  <p className={cn("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                    {profileForm.watch("institutionOtherName")?.trim() ||
                      profileForm.watch("institutionName")?.trim() ||
                      "Not set"}
                  </p>
                  <p className={cn("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-500")}>
                    {profileForm.watch("institutionState")?.trim() || "Choose your institution state in Student's institution."}
                  </p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  { label: "Email", value: currentUser?.email ?? "" },
                  { label: "Phone", value: currentUser?.phoneNumber ?? "Not set" },
                  { label: "Country", value: profileForm.watch("country") ?? "Nigeria" },
                  { label: "State", value: profileForm.watch("state") ?? "" }
                ].map((item) => (
                  <div
                    className={cn("rounded-[22px] border px-4 py-4", isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}
                    key={item.label}
                  >
                    <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>{item.label}</p>
                    <p className={cn("mt-2 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{item.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {activeSection === "details" ? (
            <section
              className={cn(
                "rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950")}>
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Account details</p>
                  <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>Account details</h3>
                </div>
              </div>

              <form className="mt-6 space-y-5" onSubmit={profileForm.handleSubmit(onSubmitProfile)}>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="fullName">
                      Full name
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="fullName"
                      {...profileForm.register("fullName")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.fullName?.message}</p>
                  </div>

                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="email">
                      Email
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500")}
                      id="email"
                      readOnly
                      value={currentUser?.email ?? ""}
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="sex">
                      Sex
                    </label>
                    <select
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="sex"
                      {...profileForm.register("sex")}
                    >
                      {sexOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.sex?.message}</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="phoneNumber">
                      Phone number
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="phoneNumber"
                      {...profileForm.register("phoneNumber")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.phoneNumber?.message}</p>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="country">
                      Country
                    </label>
                    <select
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="country"
                      {...profileForm.register("country")}
                    >
                      {countries.map((countryName) => (
                        <option key={countryName} value={countryName}>
                          {countryName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.country?.message}</p>
                  </div>

                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="state">
                      State
                    </label>
                    <select
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="state"
                      {...profileForm.register("state")}
                    >
                      {selectedStateOptions.map((stateName) => (
                        <option key={stateName} value={stateName}>
                          {stateName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.state?.message}</p>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="city">
                      City
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="city"
                      {...profileForm.register("city")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.city?.message}</p>
                  </div>

                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="postalCode">
                      Postal code
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="postalCode"
                      {...profileForm.register("postalCode")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.postalCode?.message}</p>
                  </div>
                </div>

                <div>
                  <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="addressLine1">
                    Address line 1
                  </label>
                  <input
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                    id="addressLine1"
                    {...profileForm.register("addressLine1")}
                  />
                  <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.addressLine1?.message}</p>
                </div>

                <div>
                  <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="addressLine2">
                    Address line 2
                  </label>
                  <input
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                    id="addressLine2"
                    {...profileForm.register("addressLine2")}
                  />
                  <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.addressLine2?.message}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[color:var(--color-accent-strong)]/20 px-4 py-4">
                  <ShieldCheck className="h-5 w-5 text-[color:var(--color-accent-strong)]" />
                  <button className="button-primary !px-4 !py-3" disabled={updateProfileMutation.isPending} type="submit">
                    <Save className="h-4 w-4" />
                    {updateProfileMutation.isPending ? "Saving..." : "Save profile"}
                  </button>
                </div>

                {updateProfileMutation.isSuccess ? (
                  <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                    Profile updated successfully.
                  </div>
                ) : null}

                {updateProfileMutation.isError ? (
                  <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700")}>
                    {getErrorMessage(updateProfileMutation.error, "We could not update your profile right now. Please review the form and try again.")}
                  </div>
                ) : null}
              </form>
            </section>
          ) : null}

          {activeSection === "institution" ? (
            <section
              className={cn(
                "rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950")}>
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Student's institution</p>
                  <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>Student's institution</h3>
                </div>
              </div>

              {!isStudentUser ? (
                <div className={cn("mt-6 rounded-[22px] border px-4 py-4 text-sm", isDark ? "border-slate-800 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700")}>
                  This section is available for student accounts only.
                </div>
              ) : (
                <form className="mt-6 space-y-5" onSubmit={onSubmitInstitution}>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="institutionState">
                      State
                    </label>
                    <select
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="institutionState"
                      {...profileForm.register("institutionState")}
                    >
                      <option value="">Select state</option>
                      {nigerianStates.map((stateName) => (
                        <option key={stateName} value={stateName}>
                          {stateName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.institutionState?.message}</p>
                  </div>

                  {selectedInstitutionState ? (
                    <div>
                      <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="institutionName">
                        Institution
                      </label>
                      <select
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                        id="institutionName"
                        {...profileForm.register("institutionName")}
                      >
                        <option value="">Select institution</option>
                        {selectedInstitutionOptions.map((institutionName) => (
                          <option key={institutionName} value={institutionName}>
                            {institutionName}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.institutionName?.message}</p>
                    </div>
                  ) : null}
                </div>

                {selectedInstitutionState ? (
                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="institutionOtherName">
                      Other institution
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="institutionOtherName"
                      placeholder="Enter your institution if it is not listed"
                      {...profileForm.register("institutionOtherName")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{profileForm.formState.errors.institutionOtherName?.message}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[color:var(--color-accent-strong)]/20 px-4 py-4">
                  <ShieldCheck className="h-5 w-5 text-[color:var(--color-accent-strong)]" />
                  <button className="button-primary !px-4 !py-3" disabled={updateProfileMutation.isPending} type="submit">
                    <Save className="h-4 w-4" />
                    {updateProfileMutation.isPending ? "Saving..." : "Save profile"}
                  </button>
                </div>

                {updateProfileMutation.isSuccess ? (
                  <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                    Profile updated successfully.
                  </div>
                ) : null}

                {updateProfileMutation.isError ? (
                  <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700")}>
                    {getErrorMessage(updateProfileMutation.error, "We could not update your profile right now. Please review the form and try again.")}
                  </div>
                ) : null}
                </form>
              )}
            </section>
          ) : null}

          {activeSection === "security" ? (
            <section
              className={cn(
                "rounded-[28px] border p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]",
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-950")}>
                  <LockKeyhole className="h-5 w-5" />
                </span>
                <div>
                  <p className={cn("text-xs uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>Security</p>
                  <h3 className={cn("mt-1 font-heading text-2xl", isDark ? "text-white" : "text-slate-950")}>Security</h3>
                </div>
              </div>

              <form className="mt-6 space-y-5" onSubmit={passwordForm.handleSubmit(onSubmitPassword)}>
                <div className="grid gap-5 md:grid-cols-3">
                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="currentPassword">
                      Current password
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="currentPassword"
                      type="password"
                      {...passwordForm.register("currentPassword")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{passwordForm.formState.errors.currentPassword?.message}</p>
                  </div>

                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="password">
                      New password
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="password"
                      type="password"
                      {...passwordForm.register("password")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{passwordForm.formState.errors.password?.message}</p>
                  </div>

                  <div>
                    <label className={cn("text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")} htmlFor="confirmPassword">
                      Confirm new password
                    </label>
                    <input
                      className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition", isDark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950")}
                      id="confirmPassword"
                      type="password"
                      {...passwordForm.register("confirmPassword")}
                    />
                    <p className="mt-2 text-sm text-rose-400">{passwordForm.formState.errors.confirmPassword?.message}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[color:var(--color-accent-strong)]/20 px-4 py-4">
                  <ShieldCheck className="h-5 w-5 text-[color:var(--color-accent-strong)]" />
                  <button className="button-primary !px-4 !py-3" disabled={updatePasswordMutation.isPending} type="submit">
                    <Save className="h-4 w-4" />
                    {updatePasswordMutation.isPending ? "Updating..." : "Update password"}
                  </button>
                </div>

                {updatePasswordMutation.isSuccess ? (
                  <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                    {updatePasswordMutation.data.data.message}
                  </div>
                ) : null}

                {updatePasswordMutation.isError ? (
                  <div className={cn("rounded-[20px] border px-4 py-4 text-sm", isDark ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700")}>
                    {getErrorMessage(updatePasswordMutation.error, "We could not update your password right now. Please try again.")}
                  </div>
                ) : null}
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
