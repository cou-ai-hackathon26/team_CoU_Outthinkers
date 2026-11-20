type OtpChannel = "email" | "sms";

import nodemailer from "nodemailer";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for OTP delivery`);
  return value;
}

async function sendEmailOtp(destination: string, code: string) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: required("SMTP_FROM_EMAIL"),
    to: destination,
    subject: "MaternaCare লগইন OTP",
    text: `আপনার MaternaCare লগইন OTP হলো: ${code}\nএই কোড ৫ মিনিটের মধ্যে ব্যবহার করুন।`,
  });
}

function createTransporter() {
  return nodemailer.createTransport({
    host: required("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: required("SMTP_USER"),
      pass: required("SMTP_PASSWORD"),
    },
  });
}

export async function deliverPasswordResetEmail(destination: string, resetUrl: string) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: required("SMTP_FROM_EMAIL"),
    to: destination,
    subject: "MaternaCare পাসওয়ার্ড পরিবর্তন",
    text: `আপনার পাসওয়ার্ড পরিবর্তন করতে নিচের লিংকটি ব্যবহার করুন:\n\n${resetUrl}\n\nএই লিংক ১ ঘণ্টা পর মেয়াদোত্তীর্ণ হবে। আপনি অনুরোধ না করলে এই email উপেক্ষা করুন।`,
  });
}

export async function deliverPatientOtp(channel: OtpChannel, destination: string, code: string) {
  if (process.env.OTP_DELIVERY_MODE !== "provider") {
    console.log(`[OTP console delivery] channel=${channel} code=${code} destination=${destination}`);
    return;
  }

  if (channel === "email") {
    await sendEmailOtp(destination, code);
    return;
  }

  throw new Error("No production SMS provider is configured");
}
