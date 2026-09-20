import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<number>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      '"CraftHive" <no-reply@crafthive.ru>';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`📧 SMTP Transporter инициализирован (${host}:${port})`);
    } else {
      this.logger.warn(
        '⚠️ SMTP параметры не заданы (SMTP_HOST, SMTP_USER, SMTP_PASS). Письма будут логироваться в консоль.',
      );
    }
  }

  /**
   * Отправка 6-значного кода подтверждения регистрации
   */
  async sendVerificationCode(to: string, username: string, code: string): Promise<boolean> {
    const subject = `Код подтверждения регистрации в CraftHive: ${code}`;
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
          .logo span { color: #fed7aa; }
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
            <h1 class="logo">craft<span>Hive</span></h1>
          </div>
          <div class="content">
            <h2 class="title">Добро пожаловать, @${username}!</h2>
            <p class="text">Спасибо за регистрацию в онлайн-мессенджере CraftHive. Чтобы активировать ваш аккаунт и подтвердить email, введите этот 6-значный код:</p>
            <div class="code-box">
              <span class="code">${code}</span>
            </div>
            <p class="text">Срок действия кода — 15 минут. Если вы не регистрировались в CraftHive, просто проигнорируйте это письмо.</p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} CraftHive Messenger. Все права защищены.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail(to, subject, html);
  }

  /**
   * Отправка кода подтверждения при смене почты
   */
  async sendEmailChangeCode(to: string, username: string, code: string): Promise<boolean> {
    const subject = `Код подтверждения смены email в CraftHive: ${code}`;
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
          .logo span { color: #fed7aa; }
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
            <h1 class="logo">craft<span>Hive</span></h1>
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

    return this.sendMail(to, subject, html);
  }

  private async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `📬 [SIMULATED EMAIL] To: ${to} | Subject: "${subject}"`,
      );
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.log(`✅ Письмо успешно отправлено на ${to}`);
      return true;
    } catch (err: any) {
      this.logger.error(`❌ Ошибка отправки письма на ${to}:`, err);
      return false;
    }
  }
}
