import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Request } from 'express';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user?: { id: number } },
  ) {
    if (!file) {
      throw new BadRequestException('Поле file обязательно для загрузки');
    }

    const folder = `crafthive/user_${req.user?.id || 'general'}`;
    const result = await this.uploadService.uploadFile(file, folder);

    return {
      success: true,
      url: result.url,
      publicId: result.publicId,
      fileName: result.fileName,
      fileSize: result.fileSize,
      fileType: result.fileType,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  }

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user?: { id: number } },
  ) {
    return this.uploadFile(file, req);
  }
}
