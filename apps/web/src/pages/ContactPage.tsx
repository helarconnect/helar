import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Mail, MapPin, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AxiosError } from "axios";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { submitContactMessage, type ActionMessageResponse, type ContactMessagePayload } from "@/lib/api";

const contactSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(80, "Name is too long."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    subject: z.string().trim().min(2, "Enter a subject.").max(120, "Subject is too long."),
    message: z
      .string()
      .trim()
      .min(10, "Enter a message (at least 10 characters).")
      .max(2000, "Message is too long.")
  })
  .strict();

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactPage() {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      fullName: "",
      email: "",
      subject: "",
      message: ""
    }
  });

  const mutation = useMutation<ActionMessageResponse, AxiosError<{ error?: { message?: string } }>, ContactMessagePayload>({
    mutationFn: submitContactMessage,
    onSuccess: () => {
      form.reset();
    }
  });

  const activeError =
    mutation.error instanceof AxiosError
      ? (mutation.error as AxiosError<{ error?: { message?: string } }>).response?.data?.error?.message ??
        "We could not send your message right now."
      : "We could not send your message right now.";

  return (
    <div className="section-shell space-y-12 pb-24 pt-12">
      <div className="section-cream space-y-10">
        <SectionHeading
          align="center"
          body="Send us a note and the Helar team will get back to you via email. Use this form for enquiries, partnerships, and platform support."
          eyebrow="Contact"
          title="Talk to the Helar team"
        />

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="section-dark space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Office</p>
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <p className="font-heading text-xl text-white">Halleluyah Chambers</p>
                  <p className="text-sm leading-6 text-white/75">Okporo Road, Port Harcourt, Rivers State</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Email</p>
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Mail className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <a className="font-heading text-xl text-white underline underline-offset-4" href="mailto:support@helar.law">
                    support@helar.law
                  </a>
                  <p className="text-sm leading-6 text-white/75">We respond to messages in the order they arrive.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-6 text-white/78">
              Please include the name on your Helar account (if you already have one) and any relevant details so we can help quickly.
            </div>
          </aside>

          <section className="section-cream space-y-6">
            <div>
              <p className="eyebrow">Message form</p>
              <h2 className="font-heading text-2xl text-[color:var(--color-text)]">Send a message</h2>
              <p className="body-copy mt-3 max-w-xl">
                Messages submitted here are delivered to <span className="font-medium text-[color:var(--color-text)]">support@helar.law</span>.
              </p>
            </div>

            <form
              className="space-y-5"
              onSubmit={form.handleSubmit((values: ContactMessagePayload) => mutation.mutate(values))}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[color:var(--color-text)]" htmlFor="fullName">
                    Full name
                  </label>
                  <input className="input-field rounded-xl" id="fullName" type="text" {...form.register("fullName")} />
                  <p className="text-sm text-red-600">{form.formState.errors.fullName?.message}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[color:var(--color-text)]" htmlFor="email">
                    Email
                  </label>
                  <input className="input-field rounded-xl" id="email" type="email" {...form.register("email")} />
                  <p className="text-sm text-red-600">{form.formState.errors.email?.message}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[color:var(--color-text)]" htmlFor="subject">
                  Subject
                </label>
                <input className="input-field rounded-xl" id="subject" type="text" {...form.register("subject")} />
                <p className="text-sm text-red-600">{form.formState.errors.subject?.message}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[color:var(--color-text)]" htmlFor="message">
                  Message
                </label>
                <textarea
                  className="input-field min-h-[150px] resize-y rounded-xl"
                  id="message"
                  {...form.register("message")}
                />
                <p className="text-sm text-red-600">{form.formState.errors.message?.message}</p>
              </div>

              <button className="button-primary rounded-sm" disabled={mutation.isPending} type="submit">
                {mutation.isPending ? "Sending..." : "Send message"}
                <Send className="h-4 w-4" />
              </button>

              {mutation.isError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
                  {activeError}
                </div>
              ) : null}

              {mutation.isSuccess ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
                  {mutation.data.data.message}
                </div>
              ) : null}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
