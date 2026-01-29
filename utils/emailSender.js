import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// --- SMTP Configuration ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
  port: process.env.SMTP_PORT, // 587 or 465
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// --- HTML Template Design ---
const getOTPTemplate = (name, otp) => {
  return `
    <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <h2 style="color: #2563EB;">Password Reset Request</h2>
      </div>
      <div style="padding: 20px 0;">
        <p style="color: #333; font-size: 16px;">Hello <strong>${name}</strong>,</p>
        <p style="color: #555; line-height: 1.5;">
          We received a request to reset your password. Use the OTP below to proceed. 
          This code is valid for <strong>5 minutes</strong>.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1E40AF; background: #EFF6FF; padding: 10px 20px; border-radius: 8px; border: 1px dashed #2563EB;">
            ${otp}
          </span>
        </div>
        <p style="color: #777; font-size: 14px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <div style="border-top: 1px solid #eee; padding-top: 15px; text-align: center; color: #aaa; font-size: 12px;">
        &copy; ${new Date().getFullYear()} Your Company Name. All rights reserved.
      </div>
    </div>
  `;
};

export const sendOTPEmail = async (toEmail, name, otp) => {
  try {
    const mailOptions = {
      from: `"Support Team" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Your Password Reset OTP",
      html: getOTPTemplate(name, otp),
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Email send error:", error);
    return false;
  }
};