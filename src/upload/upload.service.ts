import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName =
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') || 'dpbxhssv';
    const apiKey =
      this.configService.get<string>('CLOUDINARY_API_KEY') || '787173774415352';
    const apiSecret =
      this.configService.get<string>('CLOUDINARY_API_SECRET') ||
      'SzCcJOQTY6oFak6I1A8ptk234M8';

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    this.logger.log(`Cloudinary configured for cloud_name: ${cloudName}`);
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'crafthive',
  ): Promise<{
    url: string;
    publicId: string;
    width?: number;
    height?: number;
    format?: string;
  }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Файл не предоставлен');
    }

    // Проверка типа файла
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Неподдерживаемый формат изображения. Разрешены: JPEG, PNG, GIF, WEBP, SVG',
      );
    }

    // Ограничение размера: 10 МБ
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Размер изображения не должен превышать 10 МБ');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload error:', error);
            return reject(
              new BadRequestException(
                `Ошибка загрузки в Cloudinary: ${error?.message || 'Unknown error'}`,
              ),
            );
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }
}
