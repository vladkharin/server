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

  async uploadFile(
    file: Express.Multer.File,
    folder = 'crafthive',
  ): Promise<{
    url: string;
    publicId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    width?: number;
    height?: number;
    format?: string;
  }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Файл не предоставлен');
    }

    // Ограничение размера: 50 МБ для любых файлов
    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('Размер файла не должен превышать 50 МБ');
    }

    let fileType = 'document';
    if (file.mimetype.startsWith('image/')) fileType = 'image';
    else if (file.mimetype.startsWith('audio/')) fileType = 'audio';
    else if (file.mimetype.startsWith('video/')) fileType = 'video';

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
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
            fileName: file.originalname || 'file',
            fileSize: file.size,
            fileType,
            width: result.width,
            height: result.height,
            format: result.format,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'crafthive',
  ) {
    return this.uploadFile(file, folder);
  }
}
