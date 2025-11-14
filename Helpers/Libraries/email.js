const { Resend } = require("resend");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const { htmlToText } = require("html-to-text");
const pug = require("pug");

// new Email(user, Url)
module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.firstname;
    this.from = `${process.env.SITE_NAME} <onboarding@resend.dev>`;
    this.url = url;
    this.resend = new Resend(process.env.RESEND_API);
  }

  async send(template, subject, preheader = "") {
    try {
      // Render Pug template
      const html = pug.renderFile(
        `${__dirname}/../../views/email/${template}.pug`,
        {
          firstName: this.firstName || "user",
          url: this.url,
          subject,
          preheaderText: preheader,
        },
      );

      // Send email using Resend
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [this.to],
        subject,
        html: html,
        text: htmlToText(html),
      });

      if (error) {
        throw new Error(`Resend error: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("Email sending error:", error);
      throw error;
    }
  }

  async sendWelcome() {
    await this.send(
      "welcome",
      `Welcome to ${process.env.SITE_NAME}`,
      "Get started with your new journey at our platform!",
    );
  }

  async sendPasswordReset() {
    await this.send(
      "passwordReset",
      `${process.env.SITE_NAME}, Password reset email`,
      "You requested a password reset. Follow the link to set a new password.",
    );
  }

  async sendConfirmEmail() {
    await this.send(
      "confirmEmail",
      `${process.env.SITE_NAME}, Confirm your email`,
      "Please confirm your email to activate your account.",
    );
  }

  async sendUnUsualSignIn() {
    try {
      await this.send(
        "unUsualSignIn",
        `${process.env.SITE_NAME}, Unusual sign-in detected`,
        "We noticed a sign-in from an unrecognized device or location.",
      );
    } catch (error) {
      console.log(error);
    }
  }

  async sendverificationtoken() {
    await this.send(
      "verify",
      `Verify Your ${process.env.SITE_NAME} Account`,
      "Complete your account setup by verifying your email address.",
    );
  }
};
