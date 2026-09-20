import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;

  private readonly isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const secure =
      this.configService.get<string>('SMTP_SECURE') === 'true' || Number(port) === 465;

    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      (user ? `"CraftHive" <${user}>` : '"CraftHive" <no-reply@crafthive.ru>');

    if ((host || user) && user && pass) {
      try {
        const isGmail = host === 'smtp.gmail.com' || (user && user.includes('@gmail.com'));

        if (isGmail) {
          this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user,
              pass,
            },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 15000,
          });
          this.logger.log(`[EmailService] Gmail SMTP транспорт инициализирован (service: gmail) для ${user}`);
        } else {
          this.transporter = nodemailer.createTransport({
            host,
            port: Number(port) || 465,
            secure,
            auth: {
              user,
              pass,
            },
            tls: {
              rejectUnauthorized: false,
            },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 15000,
          });
          this.logger.log(`[EmailService] SMTP транспорт инициализирован: ${host}:${port} (${user})`);
        }
        this.isConfigured = true;
      } catch (err) {
        this.logger.error('[EmailService] Ошибка настройки SMTP транспорта:', err);
      }
    } else {
      this.logger.warn(
        '[EmailService] SMTP не настроен в .env (коды верификации будут логироваться в консоль сервера)',
      );
    }
  }

  /**
   * Отправка 6-значного кода подтверждения регистрации
   */
  async sendVerificationCode(to: string, username: string, code: string): Promise<boolean> {
    const subject = `Код подтверждения: ${code} — CraftHive`;
    const greeting = username ? `Добро пожаловать, @${username}!` : 'Добро пожаловать!';
    const text = `${greeting}\n\nСпасибо за регистрацию в онлайн-мессенджере CraftHive.\nВаш проверочный код: ${code}\n\nКод действителен 15 минут. Если вы не регистрировались, проигнорируйте это сообщение.`;

    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Подтверждение почты CraftHive</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0b0b0e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0b0e; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #141419; border: 1px solid #27272a; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <tr>
                  <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid #27272a; background: linear-gradient(180deg, rgba(249,115,22,0.15) 0%, rgba(20,20,25,0) 100%);">
                    <div style="display: inline-block; padding: 8px 16px; background-color: #f97316; border-radius: 12px; color: #ffffff; font-weight: 900; font-size: 16px; letter-spacing: -0.5px;">
                      CraftHive
                    </div>
                    <h1 style="margin: 20px 0 6px 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Подтверждение почты</h1>
                    <p style="margin: 0; font-size: 13px; color: #a1a1aa;">Онлайн-мессенджер CraftHive</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #e4e4e7;">
                      ${greeting}
                    </p>
                    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #a1a1aa;">
                      Спасибо за регистрацию на платформе CraftHive. Чтобы активировать ваш аккаунт и защитить данные, введите этот 6-значный проверочный код:
                    </p>
                    <div style="background-color: #09090b; border: 2px solid #f97316; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
                      <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #ffffff; text-shadow: 0 0 20px rgba(249,115,22,0.5);">
                        ${code}
                      </span>
                    </div>
                    <div style="background-color: rgba(234, 179, 8, 0.08); border-left: 3px solid #eab308; padding: 12px 16px; border-radius: 6px; margin: 24px 0 0 0;">
                      <p style="margin: 0; font-size: 12px; color: #fef08a; line-height: 1.4;">
                        ⏳ <strong>Важно:</strong> Код действителен в течение <strong>15 минут</strong>. Если вы не регистрировались на сайте, просто проигнорируйте это письмо.
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 32px; background-color: #0e0e12; border-top: 1px solid #27272a; text-align: center;">
                    <p style="margin: 0; font-size: 11px; color: #71717a;">
                      © ${new Date().getFullYear()} CraftHive • Все права защищены.<br>
                      Письмо отправлено автоматически, отвечать на него не нужно.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Логируем в консоль для разработки и мониторинга
    this.logger.log(`\n======================================================\n📧 [EMAIL VERIFICATION CODE]\n👤 To: ${to}\n🔢 CODE: ${code}\n⏳ Valid for 15 minutes\n======================================================\n`);

    return this.sendMail(to, subject, html, text);
  }

  /**
   * Отправка кода подтверждения при смене почты
   */
  async sendEmailChangeCode(to: string, username: string, code: string): Promise<boolean> {
    const subject = `Код подтверждения смены email: ${code} — CraftHive`;
    const text = `Здравствуйте, @${username}!\n\nВы запросили изменение адреса электронной почты в профиле CraftHive на этот email.\nВаш код подтверждения: ${code}\n\nСрок действия кода — 15 минут.`;

    const html = `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f1015; margin: 0; padding: 30px; color: #f1f5f9; }
          .container { max-width: 520px; margin: 0 auto; background: #181a20; border-radius: 16px; border: 1px solid #2a2e39; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #f97316, #ea580c); padding: 24px; text-align: center; }
          .logo { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; margin: 0; }
          .content { padding: 30px 24px; }
          .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
          .text { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
          .code-box { background: #0f1015; border: 2px dashed #f97316; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px; }
          .code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #f97316; font-family: monospace; }
          .footer { padding: 20px 24px; background: #131419; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #2a2e39; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo" style="color: #fff;">CraftHive</h1>
          </div>
          <div class="content">
            <h2 class="title">Смена email адреса</h2>
            <p class="text">Здравствуйте, @${username}! Вы запросили изменение адреса электронной почты в профиле CraftHive на этот email. Введите код подтверждения:</p>
            <div class="code-box">
              <span class="code">${code}</span>
            </div>
            <p class="text">Срок действия кода — 15 минут. Если вы не запрашивали смену почты, немедленно проверьте безопасность вашего аккаунта.</p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} CraftHive Messenger. Все права защищены.
          </div>
        </div>
      </body>
      </html>
    `;

    this.logger.log(`\n======================================================\n📧 [EMAIL CHANGE CODE]\n👤 To: ${to}\n🔢 CODE: ${code}\n⏳ Valid for 15 minutes\n======================================================\n`);

    return this.sendMail(to, subject, html, text);
  }

  /**
   * Диагностическая отправка тестового письма
   */
  async sendTestMail(to: string): Promise<{ success: boolean; message: string; details?: any }> {
    const subject = `[CraftHive] Тестовое письмо SMTP (${new Date().toLocaleTimeString()})`;
    const text = `CraftHive SMTP Test: если вы видите это письмо, значит отправка работает! Время: ${new Date().toISOString()}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; background: #181a20; color: #fff; border-radius: 10px;">
        <h2 style="color: #f97316;">CraftHive SMTP Test ✅</h2>
        <p>Если вы видите это письмо, значит SMTP шлюз через Gmail работает корректно!</p>
        <p>Время отправки: <b>${new Date().toISOString()}</b></p>
      </div>
    `;

    const success = await this.sendMail(to, subject, html, text);
    return {
      success,
      message: success ? `Письмо успешно отправлено на ${to}` : `Не удалось отправить письмо на ${to}`,
    };
  }

  private async sendMail(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<boolean> {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');

    // 1. Проверяем Resend API (HTTPS)
    if (resendApiKey) {
      const resendFrom =
        this.configService.get<string>('RESEND_FROM') || 'CraftHive <onboarding@resend.dev>';
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [to],
            subject,
            html,
            text,
          }),
        });

        if (res.ok) {
          this.logger.log(`[EmailService] Письмо успешно отправлено через Resend HTTPS API на ${to}`);
          return true;
        } else {
          const errData = await res.json().catch(() => ({}));
          this.logger.error(`[EmailService] Ошибка ответа Resend API:`, errData);
        }
      } catch (err) {
        this.logger.error(`[EmailService] Ошибка сетевого запроса Resend API:`, err);
      }
    }

    // 2. Отправка через Nodemailer SMTP
    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          text: text || '',
          html,
        });
        this.logger.log(`[EmailService] Письмо успешно отправлено на ${to} через SMTP`);
        return true;
      } catch (error: any) {
        this.logger.error(`[EmailService] Ошибка отправки письма через SMTP на ${to}:`, error?.message || error);
        return false;
      }
    }

    this.logger.warn(`[EmailService] SMTP не настроен. Код выведен в консоль.`);
    return true;
  }
}
