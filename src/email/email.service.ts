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
    const secure =
      this.configService.get<string>('SMTP_SECURE') === 'true' || port === 465;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      (user ? `"CraftHive" <${user}>` : '"CraftHive" <no-reply@crafthive.ru>');

    if (user && pass) {
      if (host === 'smtp.gmail.com' || (!host && user.endsWith('@gmail.com'))) {
        this.transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user, pass },
          family: 4,
          tls: {
            rejectUnauthorized: false,
          },
        } as nodemailer.TransportOptions);
        this.logger.log(`📧 Gmail SMTP (SSL 465, IPv4) Transporter инициализирован для ${user}`);
      } else if (host) {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
          family: 4,
          tls: {
            rejectUnauthorized: false,
          },
        } as nodemailer.TransportOptions);
        this.logger.log(`📧 SMTP Transporter инициализирован (${host}:${port}, secure=${secure}, IPv4) для ${user}`);
      }

      if (this.transporter) {
        this.transporter.verify((error) => {
          if (error) {
            this.logger.error(`❌ SMTP Verify Error (${user}): ${error.message}`);
          } else {
            this.logger.log(`✅ SMTP сервер успешно авторизован и готов к отправке писем!`);
          }
        });
      }
    } else {
      this.logger.warn(
        '⚠️ SMTP параметры не заданы (SMTP_USER, SMTP_PASS в .env). Письма будут логироваться в консоль.',
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

  /**
   * Диагностическая отправка тестового письма
   */
  async sendTestMail(to: string): Promise<{ success: boolean; message: string; details?: any }> {
    if (!this.transporter) {
      return {
        success: false,
        message: 'SMTP Transporter не инициализирован. Проверьте переменные SMTP_USER и SMTP_PASS в файле .env',
      };
    }

    const subject = `[CraftHive] Тестовое письмо SMTP (${new Date().toLocaleTimeString()})`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; background: #181a20; color: #fff; border-radius: 10px;">
        <h2 style="color: #f97316;">CraftHive SMTP Test ✅</h2>
        <p>Если вы видите это письмо, значит SMTP шлюз через Gmail работает корректно!</p>
        <p>Время отправки: <b>${new Date().toISOString()}</b></p>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.log(`✅ Тестовое письмо успешно отправлено на ${to}: messageId=${info.messageId}`);
      return {
        success: true,
        message: `Письмо успешно отправлено на ${to}`,
        details: { messageId: info.messageId, response: info.response },
      };
    } catch (err: any) {
      this.logger.error(`❌ Ошибка отправки тестового письма на ${to}:`, err);
      return {
        success: false,
        message: `Ошибка отправки письма: ${err.message}`,
        details: { code: err.code, response: err.response, command: err.command },
      };
    }
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
      this.logger.error(`❌ Ошибка отправки письма на ${to}: ${err.message}`, err.stack);
      return false;
    }
  }
}
