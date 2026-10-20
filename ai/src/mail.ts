import nodemailer, { type Transporter } from "nodemailer";
import { loadRuntimeConfig } from "./config.js";

let transport: Transporter | undefined;

export interface AppointmentEmail {
  recipient: string;
  subject: string;
  text: string;
  transcript: string;
  replyTo?: string;
}

export async function sendAppointmentEmail(email: AppointmentEmail): Promise<void> {
  const config = loadRuntimeConfig();
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      ...(config.smtpUser && config.smtpPassword
        ? { auth: { user: config.smtpUser, pass: config.smtpPassword } }
        : {}),
      logger: false,
      debug: false,
    });
  }

  const result = await transport.sendMail({
    from: config.mailFrom,
    to: config.clinicEmail,
    subject: email.subject,
    text: email.text,
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    attachments: [{
      filename: "skinfit-chat-transcript.txt",
      content: email.transcript,
      contentType: "text/plain; charset=utf-8",
    }],
  });
  if ((result.accepted?.length ?? 0) === 0 || (result.rejected?.length ?? 0) > 0) {
    throw new Error("The clinic email provider did not accept the inquiry.");
  }
}
